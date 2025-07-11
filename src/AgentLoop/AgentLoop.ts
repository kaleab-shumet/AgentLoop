// AgentLoop.ts
import z, { ZodTypeAny, ZodObject } from 'zod';
import { AgentError, AgentErrorType } from './AgentError';
import { LLMDataHandler } from './LLMDataHandler';
import { Logger } from './Logger';
import {
  ChatEntry, ToolChainData, ToolResult, Tool, PendingToolCall,
  AgentRunInput, AgentRunOutput
} from './types'; // Assuming these are defined as we discussed
import zodToJsonSchema from 'zod-to-json-schema';
import { convertJsonSchemaToXsd } from './JsonToXsd';
import { AIProvider } from './AIProvider';

export interface AgentLoopOptions {
  parallelExecution?: boolean;
  logger?: Logger;
  maxIterations?: number;
  toolTimeoutMs?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * An abstract class for creating a stateless, tool-using AI agent.
 * The AgentLoop is designed to be a reusable, stateless engine. It does not
 * store conversation history internally. Instead, all state (conversation
 * and tool history) is passed in with each `run` call and returned in the output.
 * This makes the agent scalable and easy to integrate into any production environment.
 */
export abstract class AgentLoop {
  protected logger: Logger;
  protected maxIterations: number;
  protected toolTimeoutMs: number;
  protected retryAttempts: number;
  protected retryDelay: number;
  protected parallelExecution: boolean;

  protected abstract systemPrompt: string;
  public tools: Tool<ZodTypeAny>[] = [];

  protected aiProvider: AIProvider;
  protected llmDataHandler: LLMDataHandler; // For parsing, not calling

  protected temperature?: number;
  protected maxTokens?: number;

  private readonly FINAL_TOOL_NAME = 'final';

  constructor(provider: AIProvider, options: AgentLoopOptions = {}) {
    this.aiProvider = provider;
    this.llmDataHandler = new LLMDataHandler(); // Now just a parser

    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations || 10;
    this.toolTimeoutMs = options.toolTimeoutMs || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.parallelExecution = options.parallelExecution || false;

  }

  /**
   * Defines a tool for the agent to use.
   * @param fn A function that returns a tool definition object.
   */
  protected defineTool(fn: (schema: typeof z) => any): void {
    const dfTool = fn(z);
    this._addTool(dfTool);
  }

  /**
   * Runs a single turn of the agent's reasoning loop.
   * This method is stateless. It accepts the current state and returns the new state.
   *
   * @param input The current state of the conversation.
   * @returns A promise that resolves to the new state after the turn is complete.
   */
  public async run(input: AgentRunInput): Promise<AgentRunOutput> {
    let conversationHistory: ChatEntry[] = [...input.conversationHistory];
    let toolCallHistory: ToolResult[] = [...input.toolCallHistory];

    const { userPrompt, context = {} } = input;
    const stagnationTracker: string[] = [];
    let lastError: AgentError | null = null;
    let numRetries = 0;
    let keepRetry = true;

    let results: ToolResult[] = []

    try {
      conversationHistory.push({ sender: 'user', message: userPrompt });
      const tempStore: ToolChainData = {};

      this.addFinalTool();
      this.logger.info(`[AgentLoop.run] Starting run for prompt: "${userPrompt}"`);

      for (let i = 0; i < this.maxIterations; i++) {
        this.logger.info(`[AgentLoop.run] Iteration ${i + 1}/${this.maxIterations}`);

        try {
          const prompt = this.constructPrompt(userPrompt, context, lastError, conversationHistory, toolCallHistory, keepRetry);
          const llmResponse = await this.getLLMResponseWithRetry(prompt);
          const parsedToolCalls = this.llmDataHandler.parseAndValidate(llmResponse, this.tools);

          numRetries = 0;

          results = await this.executeToolCalls(parsedToolCalls, tempStore);
          toolCallHistory.push(...results);

          const failedTools = results.filter(r => !r.success);
          if (failedTools.length > 0) {
            const errorMessage = failedTools.map(f => `Tool: ${f.toolname}\n  Error: ${f.error ?? 'Unknown error'}`).join('\n');
            throw new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });
          }

          lastError = null;

          const finalResult = results.find(r => r.toolname === this.FINAL_TOOL_NAME);
          if (finalResult) {
            conversationHistory.push({ sender: 'ai', message: finalResult.output?.value || 'Task completed.' });
            this.logger.info(`[AgentLoop.run] '${this.FINAL_TOOL_NAME}' tool executed. Run complete.`);
            return { results: results, conversationHistory, toolCallHistory, finalAnswer: finalResult };
          }

        } catch (error) {
          if (error instanceof AgentError) {
            lastError = error;
            this.logger.error(`[AgentLoop.run] Agent error in iteration: ${error.message}`);

            if (error.type === AgentErrorType.TOOL_EXECUTION_ERROR) {
              stagnationTracker.push(error.message);
              const toolRetryAmount = stagnationTracker.filter(st => st === error.message).length;
              if (toolRetryAmount > this.retryAttempts - 1) keepRetry = false;
              if (toolRetryAmount >= this.retryAttempts) {
                throw new AgentError(`Maximum retry attempts for the same tool error: ${error.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error });
              }
            } else {
              toolCallHistory.push(this.onToolCallFail(error));
              if (numRetries >= this.retryAttempts) {
                throw new AgentError(`Maximum retry attempts for LLM response error: ${error.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error });
              }
              numRetries++;
            }
          } else {
            throw error;
          }
        }
      }

      throw new AgentError("Maximum iterations reached", AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt });

    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(error instanceof Error ? error.message : String(error), AgentErrorType.UNKNOWN, { originalError: error, userPrompt });
      const failureResult = this.onToolCallFail(agentError);
      toolCallHistory.push(failureResult);
      results.push(failureResult)
      return { results: results, conversationHistory, toolCallHistory, finalAnswer: failureResult };
    }
  }

  private async executeToolCalls(toolCalls: PendingToolCall[], tempStore: ToolChainData): Promise<ToolResult[]> {
    if (!this.parallelExecution) {
      const results: ToolResult[] = [];
      for (const call of toolCalls) {
        this.logger.info(`[AgentLoop.executeToolCalls] Sequentially executing tool: ${call.name}`);
        const tool = this.tools.find(t => t.name === call.name);
        if (!tool) {
          const err = new AgentError(`Tool '${call.name}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolname: call.name });
          results.push(this.onToolCallFail(err));
          continue;
        }
        const result = await this._executeTool(tool, call, tempStore);
        results.push(result);
        if (!result.success) break;
      }
      return results;
    }
    return this.executeToolCallsWithDependencies(toolCalls, tempStore);
  }

  private async executeToolCallsWithDependencies(toolCalls: PendingToolCall[], tempStore: ToolChainData): Promise<ToolResult[]> {
    const allResults: ToolResult[] = [];
    const validToolCalls = toolCalls.filter(call => {
      if (!this.tools.some(t => t.name === call.name)) {
        const error = new AgentError(`Tool '${call.name}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolname: call.name });
        allResults.push(this.onToolCallFail(error));
        return false;
      }
      return true;
    });

    if (validToolCalls.length === 0) return allResults;

    const circularDeps = this.detectCircularDependencies(validToolCalls, this.tools);
    if (circularDeps.length > 0) {
      const error = new AgentError(`Circular dependencies detected: ${circularDeps.join(' -> ')}`, AgentErrorType.TOOL_EXECUTION_ERROR, { circularDependencies: circularDeps });
      allResults.push(this.onToolCallFail(error));
      return allResults;
    }

    const { pending, dependents, ready } = this.buildDependencyGraph(validToolCalls);
    const executed = new Map<string, Promise<void>>();

    const propagateFailure = (failedToolName: string, chain: string[]) => {
      const directDependents = dependents.get(failedToolName) || [];
      for (const dependentName of directDependents) {
        if (chain.includes(dependentName) || allResults.some(r => r.toolname === dependentName)) continue;
        const result = this.onToolCallFail(new AgentError(`Skipped due to failure in dependency: '${failedToolName}'`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: dependentName, failedDependency: failedToolName }));
        allResults.push(result);
        propagateFailure(dependentName, [...chain, dependentName]);
      }
    };

    const execute = async (toolname: string): Promise<void> => {
      this.logger.info(`[AgentLoop.executeToolCallsWithDependencies] Executing tool: ${toolname}`);
      const tool = this.tools.find(t => t.name === toolname)!;
      const callsForTool = validToolCalls.filter(t => t.name === toolname);

      try {
        const results = await Promise.all(callsForTool.map(call => this._executeTool(tool, call, tempStore)));
        allResults.push(...results);
        if (results.some(r => !r.success)) throw new Error(`One or more executions of tool '${toolname}' failed.`);
      } catch (error) {
        const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { toolname });
        if (!allResults.some(r => r.toolname === toolname)) allResults.push(this.onToolCallFail(agentError));
        propagateFailure(toolname, [toolname]);
      } finally {
        const nextTools = dependents.get(toolname) || [];
        for (const next of nextTools) {
          pending.get(next)?.delete(toolname);
          if (pending.get(next)?.size === 0) executed.set(next, execute(next));
        }
      }
    };

    for (const toolname of ready) executed.set(toolname, execute(toolname));
    await Promise.all(executed.values());
    return allResults;
  }

  private buildDependencyGraph(toolCalls: PendingToolCall[]) {
    const pending = new Map<string, Set<string>>();
    const dependents = new Map<string, string[]>();
    const callNames = new Set(toolCalls.map(c => c.name));

    toolCalls.forEach(call => {
      const tool = this.tools.find(t => t.name === call.name)!;
      const validDeps = (tool.dependencies || []).filter(dep => callNames.has(dep));
      pending.set(call.name, new Set(validDeps));
      validDeps.forEach(dep => {
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(call.name);
      });
    });

    const ready = toolCalls.map(c => c.name).filter(name => (pending.get(name)?.size || 0) === 0);
    return { pending, dependents, ready: [...new Set(ready)] };
  }

  private detectCircularDependencies(toolCalls: PendingToolCall[], toolList: Tool<ZodTypeAny>[]): string[] {
    const callNames = new Set(toolCalls.map(call => call.name));
    const adjList = new Map<string, string[]>();

    for (const call of toolCalls) {
      const tool = toolList.find(t => t.name === call.name);
      const deps = (tool?.dependencies || []).filter(dep => callNames.has(dep));
      adjList.set(call.name, deps);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (toolname: string, path: string[]): string[] | null => {
      visited.add(toolname);
      recursionStack.add(toolname);
      path.push(toolname);
      const neighbors = adjList.get(toolname) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor, path);
          if (cycle) return cycle;
        } else if (recursionStack.has(neighbor)) {
          return [...path.slice(path.indexOf(neighbor)), neighbor];
        }
      }
      recursionStack.delete(toolname);
      path.pop();
      return null;
    };

    for (const call of toolCalls) {
      if (!visited.has(call.name)) {
        const cycle = dfs(call.name, []);
        if (cycle) return cycle;
      }
    }
    return [];
  }

  private async getLLMResponseWithRetry(prompt: string, options = {}): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.aiProvider.getCompletion(prompt, options);
        if (typeof response !== "string") {
          throw new AgentError("LLM provider returned undefined or non-string response.", AgentErrorType.UNKNOWN);
        }
        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`[AgentLoop] LLM call attempt ${attempt + 1} failed: ${lastError.message}`);
        if (attempt < this.retryAttempts - 1) await this.sleep(this.retryDelay * Math.pow(2, attempt));
      }
    }
    throw lastError ?? new AgentError("LLM call failed after all retry attempts.", AgentErrorType.UNKNOWN);
  }

  private constructPrompt(userPrompt: string, context: Record<string, any>, lastError: AgentError | null, conversationHistory: ChatEntry[], toolCallHistory: ToolResult[], keepRetry: boolean): string {
    const toolSchemas = this.tools.map(tool => {
      const jsonSchema = zodToJsonSchema(tool.responseSchema, tool.name);
      const xsdSchema = convertJsonSchemaToXsd(jsonSchema as any, { rootElementName: 'tool' });
      return `<!-- Schema for ${tool.name} -->\n${xsdSchema}`;
    }).join('\n\n');
    const historyLog = toolCallHistory.length > 0 ? JSON.stringify(toolCallHistory.slice(-10), null, 2) : 'No tool calls have been made yet.';
    const contextLog = Object.keys(context).length > 0 ? Object.entries(context).map(([key, value]) => `**${key}**:\n${JSON.stringify(value)}`).join('\n\n') : 'No background context provided.';
    const retryInstruction = keepRetry ? "You have more attempts. Analyze the error and history, then retry with a corrected approach." : "You have reached the maximum retry limit. You MUST stop and use the 'final' tool to report what you have accomplished and explain the failure.";
    const errorRecoverySection = lastError ? `\n# ERROR RECOVERY\n- **Error:** ${lastError.message}\n- **Instruction:** ${retryInstruction}` : "";
    const executionStrategyPrompt = this.parallelExecution ? "Your tools can execute concurrently. You should call all necessary tools for a task in a single turn." : "Your tools execute sequentially. If one tool fails, you must retry and fix it before continuing.";
    const conversationSection = conversationHistory.length > 0 ? `\n# CONVERSATION HISTORY\n${JSON.stringify(conversationHistory, null, 2)}\n` : '';

    const template = `${this.systemPrompt}
# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS
${this.getFormattingInstructions()}
# AVAILABLE TOOLS
${toolSchemas}
- **Execution Strategy:** ${executionStrategyPrompt}
# CONTEXT
${contextLog}
${conversationSection}
# TOOL CALL HISTORY
${historyLog}
${errorRecoverySection}
# CURRENT TASK
Based on all the information above, use your tools to respond to this user request:
"${userPrompt}"
Remember: Think step-by-step. If you have enough information to provide a complete answer, you MUST call the '${this.FINAL_TOOL_NAME}' tool by itself.`;
    this.logger.debug('[AgentLoop.constructPrompt] Generated prompt.', { length: template.length });
    return template;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async _executeTool(tool: Tool<ZodTypeAny>, call: PendingToolCall, tempStore: ToolChainData): Promise<ToolResult> {
    const toolTimeout = tool.timeout || this.toolTimeoutMs;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AgentError(`Tool '${tool.name}' exceeded timeout of ${toolTimeout}ms.`, AgentErrorType.TOOL_TIMEOUT_ERROR, { toolname: tool.name, timeout: toolTimeout })), toolTimeout)
    );

    try {
      const validation = tool.responseSchema.safeParse(call);
      if (!validation.success) throw new AgentError(`Invalid arguments for tool '${tool.name}': ${validation.error.message}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: tool.name, validationError: validation.error });
      const result = await Promise.race([
        Promise.resolve(tool.handler(tool.name, validation.data, tempStore)).catch(err => {
          throw new AgentError(`Error on execution of the tool ${tool.name}: ${err instanceof Error ? err.message : String(err)}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: tool.name, call });
        }),
        timeoutPromise,
      ]);
      return this.onToolCallSuccess(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const agentError = error instanceof AgentError
        ? error
        : new AgentError(
          `An unexpected error occurred in tool '${tool.name}': ${message}`,
          AgentErrorType.TOOL_EXECUTION_ERROR,
          { toolname: tool.name, originalError: error, call }
        );
      return this.onToolCallFail(agentError);
    }
  }

  private getFormattingInstructions(): string {
    return `You MUST respond by calling one or more tools. Your entire output must be a single, valid XML block enclosed in \`\`\`xml ... \`\`\`.
All tool calls must be children under a single <root> XML tag.
**IMPORTANT RULES:**
1.  **CALL MULTIPLE TOOLS:** If a request requires multiple actions, you MUST call all necessary tools in a single response.
2.  **USE THE '${this.FINAL_TOOL_NAME}' TOOL TO FINISH:** When you have a complete and final answer, you MUST call the '${this.FINAL_TOOL_NAME}' tool. This tool MUST be the ONLY one in your response.
3.  **REVIEW HISTORY:** Always review the tool call history to avoid repeating work.
**Example of a parallel tool call:**
\`\`\`xml
<root>
  <get_weather><name>get_weather</name><city>Paris</city></get_weather>
  <web_search><name>web_search</name><query>latest news about AI</query></web_search>
</root>
\`\`\`
**Example of a final answer:**
\`\`\`xml
<root>
  <${this.FINAL_TOOL_NAME}><name>${this.FINAL_TOOL_NAME}</name><value>The weather in Paris is sunny, and the latest AI news is about a new model release from OpenAI.</value></${this.FINAL_TOOL_NAME}>
</root>
\`\`\``;
  }

  private _addTool<T extends ZodTypeAny>(tool: Tool<T>): void {
    if (this.tools.some(t => t.name === tool.name)) throw new AgentError(`A tool with the name '${tool.name}' is already defined.`, AgentErrorType.DUPLICATE_TOOL_NAME, { toolname: tool.name });
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.name)) throw new AgentError(`Tool name '${tool.name}' must start with a letter or underscore and contain only letters, numbers, and underscores.`, AgentErrorType.INVALID_TOOL_NAME, { toolname: tool.name });
    if (!(tool.responseSchema instanceof ZodObject)) throw new AgentError(`The responseSchema for tool '${tool.name}' must be a Zod object (e.g., z.object({})).`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: tool.name });
    const enhancedSchema = tool.responseSchema.extend({ name: z.string().describe("The name of the tool, which must match the tool's key.") });
    this.tools.push({ ...tool, responseSchema: enhancedSchema } as unknown as Tool<ZodTypeAny>);
    this.logger.debug(`[AgentLoop._addTool] Tool '${tool.name}' defined successfully.`);
  }

  private addFinalTool(): void {
    if (!this.tools.some(t => t.name === this.FINAL_TOOL_NAME)) {
      this.defineTool((z) => ({
        name: this.FINAL_TOOL_NAME,
        description: `Call this tool ONLY when you have the complete answer for the user's request.`,
        responseSchema: z.object({ value: z.string().describe("The final, complete answer to the user's request.") }),
        handler: (name: string, args: { value: string; }) => ({ toolname: name, success: true, output: args }),
      }));
    }
  }

  public getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

  public onToolCallSuccess(toolResult: ToolResult): ToolResult {
    this.logger.info(`[AgentLoop.onToolCallSuccess] Tool '${toolResult.toolname}' executed successfully`);
    return toolResult;
  }

  public onToolCallFail(error: AgentError): ToolResult {
    this.logger.error(`[AgentLoop.onToolCallFail] Tool execution failed: ${error.message}`, { errorType: error.type, context: error.context });
    return {
      toolname: error.context?.toolname || 'unknown',
      success: false,
      error: error.getUserMessage(),
      context: { errorType: error.type, originalError: error.message, ...error.context }
    };
  }
}