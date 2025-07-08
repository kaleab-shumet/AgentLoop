import z, { ZodTypeAny } from 'zod';
import { AgentError, AgentErrorType } from './AgentError';
import { LLMDataHandler } from './LLMDataHandler';
import { Logger } from './Logger';
import { BaseParser, ParserResult } from './parsers/BaseParser';
import { ChatEntry, ToolChainData, ToolResult, Tool } from './types';
import zodToJsonSchema from 'zod-to-json-schema';
import { convertJsonSchemaToXsd } from '../JsonToXsd';

export interface AgentLoopOptions {
  logger?: Logger;
  maxIterations?: number;
}

export abstract class AgentLoop {


  protected logger: Logger;
  protected maxIterations: number;

  protected agent: AgentLoop = this;

  protected toolCallHistory: ToolResult[] = [];

  protected abstract systemPrompt: string;

  public tools: Tool<ZodTypeAny>[] = [];


  llmDataHandler: LLMDataHandler;





  // Flexible addTool method that accepts any pending tool type


  constructor(llmDataHandler: LLMDataHandler, options: AgentLoopOptions) {
    this.llmDataHandler = llmDataHandler;
    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations || 10;


  }

  /**
   * Runs the agent's conversational loop.
   * @param userPrompt The specific, immediate request from the user.
   * @param history The turn-by-turn memory of previous tool calls and results.
   * @param context A key-value object containing background information for the agent.
   * @returns A promise that resolves to the final result of the agent's work.
   */
  public async run(
    userPrompt: string,
    context: Record<string, any> = {}
  ): Promise<ToolResult> {

    let toolChainData = {};

    // Checking if "final" tool is there
    const finalToolExist = this.tools.find((tool => tool.name === "final"));
    if (!finalToolExist) {

      this.defineTool({
        name: 'final',
        description: 'Call this tool ONLY when you have the complete answer for the user. The input should be a concluding, natural language sentence.',
        responseSchema: z.object({
          value: z.string().describe("Set the description here"),
        }),
        handler: (name, args, toolChainData) => ({
          toolname: name,
          success: true
        })
      });

    }





    this.logger.info(`[AgentLoop.run] Starting run for prompt: "${userPrompt}"`);


    for (let i = 0; i < this.maxIterations; i++) {
      this.logger.info(`[AgentLoop.run] Iteration ${i + 1}/${this.maxIterations}`);


      const prompt = this.constructPrompt(userPrompt, this.tools, this.toolCallHistory, this.getConversationHistory(), context);



      const llmResponse = await this.llmDataHandler.getCompletion(prompt);

      if (!llmResponse) {
        const errorMsg = 'LLM returned an empty or invalid response.';

        this.logger.error(`[AgentLoop.run] ${errorMsg}`);
        this.toolCallHistory.push(this.onToolCallFail(new AgentError(errorMsg, AgentErrorType.INVALID_RESPONSE, 'unknown', 'unknown')));
        continue;
      }
      const parsingResult = this.llmDataHandler.parseLLMResponse(llmResponse, this.tools);
      //const pendingToolCalls = this.onPendingToolCallReady(parsingResult);

      this.logger.info(parsingResult)
      if (parsingResult.length === 0) {
        const errorMsg = 'LLM response did not contain any valid tool calls.';
        this.logger.warn(`[AgentLoop.run] ${errorMsg}`);
        this.toolCallHistory.push(this.onToolCallFail(new AgentError(errorMsg, AgentErrorType.INVALID_TOOL_FOUND, 'unkown', 'unkown')));
        continue;
      }


      // Fallback to sequential execution for the non-parallel case.
      for (const call of parsingResult) {
        this.logger.info(`[AgentLoop.run] Executing tool: ${call.name}`);
        const tool = this.tools.find(t => t.name === call.name);

        if (!tool) {
          const errorMsg = `LLM requested a non-existent tool: '${call.name}'.`;
          this.logger.error(`[AgentLoop.run] ${errorMsg}`);
          this.toolCallHistory.push(this.onToolCallFail(new AgentError(errorMsg, AgentErrorType.TOOL_NOT_FOUND, call.name, call.id)));
          continue;
        }

        const result: ToolResult = await tool.handler(tool.name, call, toolChainData);

        // Update the history with the result.
        this.toolCallHistory.push(
          this.onToolCallSuccess(result)
        );

        if (tool.name === 'final') {
          this.logger.info('[AgentLoop.run] "final" tool executed. Run complete.');
          this.logger.info('[AgentLoop.run] currentHistory: ', this.toolCallHistory);
          return result
        }
      }


    }

    const finalError = 'Agent exceeded maximum iterations.';
    this.logger.error(`[AgentLoop.run] ${finalError}`);

    throw new AgentError(finalError, AgentErrorType.MAX_ITERATIONS_REACHED);
  }

  constructPrompt(
    userPrompt: string,
    tools: Tool<ZodTypeAny>[],
    toolCallHistory: ToolResult[],
    conversationHistory: ChatEntry[],
    context: Record<string, any>
  ): string {
    const toolDescriptions = tools
      .map(tool => {
        // Fix: Pass the tool's responseSchema, not the tool itself, to zodToJsonSchema
        const toolSchema = zodToJsonSchema(tool.responseSchema, "Tool");

        const parameters = toolSchema.definitions?.Tool
        const callTool = {
          name: tool.name,
          description: tool.description,
          parameters
        }

        const toolXmlSchema = convertJsonSchemaToXsd(toolSchema as any, { rootElementName: 'tool' })

        return `### Tool:\n${tool.name}:\n${tool.description}\nSchema: ${toolXmlSchema}`
      })
      .join('\n\n');

    const historyLog = "### History:\n" + JSON.stringify(toolCallHistory)


    const contextLog = Object.entries(context)
      .map(([key, value]) => `**${key}**:\n${value}`)
      .join('\n\n');



    const template = `
${this.systemPrompt}

# CONTEXT
Here is some background information for your task:
${contextLog}

# CONVERSATION HISTORY
  ${JSON.stringify(conversationHistory)}

# AVAILABLE TOOLS
You have the following tools.
${toolDescriptions}

# TOOL CALL HISTORY
${historyLog}

## Review the tool call history. If any tools have returned successful results, provide the user with an appropriate answer based on those results. After doing so, you must call the tool named 'final'.

# CURRENT TASK
Based on all the information above, use your tools to respond to this user request:
${userPrompt}
`;
    this.logger.debug('[AgentLoop._constructPrompt] Generated prompt.', { length: template.length });
    return template;
  }


  abstract onToolCallFail(error: AgentError): ToolResult;
  abstract onToolCallSuccess(toolResult: ToolResult): ToolResult;

  clearToolHistory() {
    this.toolCallHistory.length = 0;
  }

  setToolHistory(toolCallHistory: ToolResult[]) {
    this.toolCallHistory = toolCallHistory
  }

  abstract getConversationHistory(): ChatEntry[]

  onPendingToolCallReady(parserResult: ParserResult) {

    const { pendingToolCalls, isParallel } = parserResult;
    return {
      pendingToolCalls,
      isParallel
    }
  }

  public defineTool<T extends ZodTypeAny>(tool: {

    name: string,
    description: string,
    responseSchema: T,
    handler: (name: string, pendingToolCall: z.infer<T>, toolChainData: ToolChainData) => ToolResult | Promise<ToolResult>

  }
  ): void {
    this.tools.push(tool);
  }

}