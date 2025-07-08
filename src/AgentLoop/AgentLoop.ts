// AgentLoop.ts

import z, { ZodTypeAny, ZodObject } from 'zod';
import { AgentError, AgentErrorType } from './AgentError';
import { LLMDataHandler } from './LLMDataHandler';
import { Logger } from './Logger';
import { ChatEntry, ToolChainData, ToolResult, Tool, PendingToolCall } from './types';
import zodToJsonSchema from 'zod-to-json-schema';
import { convertJsonSchemaToXsd } from './JsonToXsd';

export interface AgentLoopOptions {
  logger?: Logger;
  maxIterations?: number;
  toolTimeoutMs?: number;
  apiKey?: string;
  model?: string;
  service?: string;
  temperature?: number;
  maxTokens?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface AgentConfig {
  apiKey: string;
  model?: string;
  service?: string;
  temperature?: number;
  maxTokens?: number;
}

export abstract class AgentLoop {
  protected logger: Logger;
  protected maxIterations: number;
  protected toolTimeoutMs: number;
  protected retryAttempts: number;
  protected retryDelay: number;

  protected toolCallHistory: ToolResult[] = [];
  protected conversationHistory: ChatEntry[] = [];
  protected abstract systemPrompt: string;
  public tools: Tool<ZodTypeAny>[] = [];
  protected llmDataHandler: LLMDataHandler;
  protected config: AgentConfig;

  private readonly FINAL_TOOL_NAME = 'final';

  constructor(config: AgentConfig, options: AgentLoopOptions = {}) {
    this.config = config;
    this.llmDataHandler = new LLMDataHandler(config);
    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations || 10;
    this.toolTimeoutMs = options.toolTimeoutMs || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // Initialize conversation history
    this.conversationHistory = [];
  }

  /**
   * Helper method to add tools with better error handling
   */
  protected defineTool(fn: (schema: typeof z) => any): void {
    const dfTool = fn(z);
    this.addTool(dfTool);
  }

  /**
   * Helper method to create simple tools with validation
   */
  protected createTool<T extends ZodTypeAny>(
    name: string,
    description: string,
    schema: T,
    handler: (name: string, args: z.infer<T>, toolChainData: ToolChainData) => ToolResult | Promise<ToolResult>
  ): Tool<T> {
    return {
      name,
      description,
      responseSchema: schema,
      handler
    };
  }

  /**
   * Enhanced method to run the agent with better error handling and recovery
   */
  public async run(userPrompt: string, context: Record<string, any> = {}): Promise<ToolResult> {
    // Add user message to conversation history
    this.conversationHistory.push({
      sender: 'user',
      message: userPrompt
    });

    this.toolCallHistory = [];
    const stagnationTracker: string[] = [];
    let consecutiveInvalidResponses = 0;
    let lastError: AgentError | null = null;

    this.addFinalTool();
    this.logger.info(`[AgentLoop.run] Starting run for prompt: "${userPrompt}"`);

    for (let i = 0; i < this.maxIterations; i++) {
      this.logger.info(`[AgentLoop.run] Iteration ${i + 1}/${this.maxIterations}`);

      try {
        // Stagnation detection with better logic
        if (this.detectStagnation(stagnationTracker)) {
          throw new AgentError(
            'Agent is stuck in a loop. Attempting recovery...',
            AgentErrorType.STAGNATION_ERROR,
            { history: this.toolCallHistory.slice(-5) }
          );
        }

        const prompt = this.constructPrompt(userPrompt, context, lastError);
        const llmResponse = await this.getLLMResponseWithRetry(prompt);

        if (!llmResponse) {
          consecutiveInvalidResponses++;
          const error = new AgentError('LLM returned an empty response.', AgentErrorType.INVALID_RESPONSE);
          this.toolCallHistory.push(this.onToolCallFail(error));
          lastError = error;
          continue;
        }

        const parsedToolCalls = this.llmDataHandler.parseAndValidate(llmResponse, this.tools);
        
        if (parsedToolCalls.length === 0) {
          consecutiveInvalidResponses++;
          if (consecutiveInvalidResponses >= 3) {
            throw new AgentError(
              'LLM failed to produce valid tool calls for 3 consecutive turns.',
              AgentErrorType.INVALID_RESPONSE,
              { lastResponse: llmResponse }
            );
          }
          const error = new AgentError(
            'LLM response did not contain any valid tool calls.',
            AgentErrorType.INVALID_RESPONSE,
            { llmResponse }
          );
          this.toolCallHistory.push(this.onToolCallFail(error));
          lastError = error;
          continue;
        }

        consecutiveInvalidResponses = 0;
        lastError = null;

        // Execute tool calls with better error handling
        const results = await this.executeToolCalls(parsedToolCalls, stagnationTracker);
        
        // Check if any tool call was the final tool
        for (const result of results) {
          if (result.toolname === this.FINAL_TOOL_NAME) {
            this.conversationHistory.push({
              sender: 'ai',
              message: result.output?.value || 'Task completed.'
            });
            this.logger.info(`[AgentLoop.run] '${this.FINAL_TOOL_NAME}' tool executed. Run complete.`);
            return result;
          }
        }

      } catch (error) {
        if (error instanceof AgentError) {
          // Handle specific agent errors with potential recovery
          this.logger.error(`[AgentLoop.run] Agent error: ${error.message}`);
          
          if (error.type === AgentErrorType.STAGNATION_ERROR) {
            // Try to break stagnation by modifying the prompt
            this.toolCallHistory.push(this.onToolCallFail(error));
            lastError = error;
            continue;
          }
          
          throw error;
        }
        
        // Handle unexpected errors
        throw new AgentError(
          `Unexpected error in agent loop: ${error}`,
          AgentErrorType.TOOL_EXECUTION_ERROR,
          { originalError: error }
        );
      }
    }

    throw new AgentError('Agent exceeded maximum iterations.', AgentErrorType.MAX_ITERATIONS_REACHED);
  }

  /**
   * Execute multiple tool calls with better error handling
   */
  private async executeToolCalls(
    toolCalls: PendingToolCall[],
    stagnationTracker: string[]
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of toolCalls) {
      this.logger.info(`[AgentLoop.run] Executing tool: ${call.name}`);
      stagnationTracker.push(JSON.stringify(call));

      const tool = this.tools.find(t => t.name === call.name);
      if (!tool) {
        const error = new AgentError(
          `Tool '${call.name}' not found.`,
          AgentErrorType.TOOL_NOT_FOUND,
          { toolName: call.name }
        );
        const result = this.onToolCallFail(error);
        this.toolCallHistory.push(result);
        results.push(result);
        continue;
      }

      const result = await this.executeTool(tool, call, {});
      this.toolCallHistory.push(result);
      results.push(result);
    }

    return results;
  }

  /**
   * Enhanced stagnation detection
   */
  private detectStagnation(stagnationTracker: string[]): boolean {
    if (stagnationTracker.length < 6) return false;
    
    // Check if last 3 calls are identical
    const lastThree = stagnationTracker.slice(-3);
    if (new Set(lastThree).size === 1) return true;
    
    // Check if there's a pattern in the last 6 calls
    const lastSix = stagnationTracker.slice(-6);
    const pattern = lastSix.slice(0, 3).join('|');
    const repeat = lastSix.slice(3).join('|');
    
    return pattern === repeat;
  }

  /**
   * Get LLM response with retry logic
   */
  private async getLLMResponseWithRetry(prompt: string): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.llmDataHandler.getCompletion(prompt);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`[AgentLoop] LLM call attempt ${attempt + 1} failed: ${error}`);
        
        if (attempt < this.retryAttempts - 1) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }
    
    throw new AgentError(
      `LLM call failed after ${this.retryAttempts} attempts: ${lastError?.message}`,
      AgentErrorType.INVALID_RESPONSE,
      { originalError: lastError }
    );
  }

  /**
   * Enhanced prompt construction with error recovery
   */
  private constructPrompt(
    userPrompt: string,
    context: Record<string, any>,
    lastError?: AgentError | null
  ): string {
    const toolSchemas = this.tools
      .map(tool => {
        const jsonSchema = zodToJsonSchema(tool.responseSchema, "Tool");
        const xsdSchema = convertJsonSchemaToXsd(jsonSchema as any, { rootElementName: 'tool' });
        return `<!-- Schema for ${tool.name} -->\n${xsdSchema}`;
      })
      .join('\n\n');

    const historyLog = this.toolCallHistory.length > 0
      ? JSON.stringify(this.toolCallHistory.slice(-10), null, 2) // Only show last 10 for brevity
      : 'No tool calls have been made yet.';

    const contextLog = Object.keys(context).length > 0
      ? Object.entries(context).map(([key, value]) => `**${key}**:\n${JSON.stringify(value)}`).join('\n\n')
      : 'No background context provided.';

    const errorRecoverySection = lastError
      ? `\n# ERROR RECOVERY\nThe last operation failed with: ${lastError.message}. Please try a different approach or use available tools more effectively.\n`
      : '';

    const conversationSection = this.conversationHistory.length > 0
      ? `\n# CONVERSATION HISTORY\n${JSON.stringify(this.conversationHistory, null, 2)}\n`
      : '';

    const template = `${this.systemPrompt}

# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS
${this.getFormattingInstructions()}

# AVAILABLE TOOLS
You have the following tools. You must use the provided XML schemas to construct your tool calls.
${toolSchemas}

# CONTEXT
Here is some background information for your task:
${contextLog}
${conversationSection}
# TOOL CALL HISTORY
This is the history of the tools you have called so far and their results.
${historyLog}
${errorRecoverySection}
# CURRENT TASK
Based on all the information above, use your tools to respond to this user request:
"${userPrompt}"

Remember: If you have enough information to provide a complete answer, you MUST call the 'final' tool.
`;

    this.logger.debug('[AgentLoop.constructPrompt] Generated prompt.', { length: template.length });
    return template;
  }

  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhanced tool execution with better error handling
   */
  private async executeTool(tool: Tool<ZodTypeAny>, call: PendingToolCall, toolChainData: ToolChainData): Promise<ToolResult> {
    const timeoutPromise = new Promise<ToolResult>((_, reject) =>
      setTimeout(() => reject(new AgentError(
        `Tool '${tool.name}' exceeded timeout of ${this.toolTimeoutMs}ms.`,
        AgentErrorType.TOOL_TIMEOUT_ERROR,
        { toolName: tool.name }
      )), this.toolTimeoutMs)
    );

    try {
      // Validate tool arguments before execution
      const validation = tool.responseSchema.safeParse(call);
      if (!validation.success) {
        throw new AgentError(
          `Invalid arguments for tool '${tool.name}': ${validation.error.message}`,
          AgentErrorType.TOOL_EXECUTION_ERROR,
          { toolName: tool.name, validationError: validation.error }
        );
      }

      const result = await Promise.race([
        tool.handler(tool.name, validation.data, toolChainData),
        timeoutPromise,
      ]);
      
      return this.onToolCallSuccess(result);
    } catch (error: any) {
      if (error instanceof AgentError) {
        return this.onToolCallFail(error);
      }
      const executionError = new AgentError(
        `An unexpected error occurred in tool '${tool.name}': ${error.message}`,
        AgentErrorType.TOOL_EXECUTION_ERROR,
        { toolName: tool.name, originalError: error }
      );
      return this.onToolCallFail(executionError);
    }
  }

  /**
   * Enhanced formatting instructions
   */
  private getFormattingInstructions(): string {
    return `
You must respond by calling one or more tools. Your entire output must be a single, valid XML block enclosed in \`\`\`xml ... \`\`\`.
All tool calls must be children under a single <root> XML tag. Do not use attributes on any XML tags; use nested elements for all data.

Example of a valid response:
\`\`\`xml
<root>
  <tool>
    <name>commandline</name>
    <value>echo "hello world"</value>
  </tool>
  <tool>
    <name>websearch</name>
    <query>latest AI news</query>
  </tool>
</root>
\`\`\`

IMPORTANT RULES:
1. Always review the tool call history before making new calls
2. If you have gathered enough information to provide a complete answer, you MUST call the '${this.FINAL_TOOL_NAME}' tool
3. Don't repeat the same tool call with the same parameters
4. If a tool call fails, try a different approach or different parameters
5. Be strategic about which tools to use and in what order
`;
  }

  /**
   * Enhanced tool definition with validation and automatic 'name' property injection.
   */
  public addTool<T extends ZodTypeAny>(tool: Tool<T>): void {
    if (tool.name === this.FINAL_TOOL_NAME) {
      throw new AgentError(
        `Tool name '${this.FINAL_TOOL_NAME}' is reserved.`,
        AgentErrorType.RESERVED_TOOL_NAME,
        { toolName: tool.name }
      );
    }
    
    if (this.tools.some(t => t.name === tool.name)) {
      throw new AgentError(
        `A tool with the name '${tool.name}' is already defined.`,
        AgentErrorType.DUPLICATE_TOOL_NAME,
        { toolName: tool.name }
      );
    }
    
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) {
      throw new AgentError(
        `Tool name '${tool.name}' must start with a letter and contain only letters, numbers, and underscores.`,
        AgentErrorType.INVALID_TOOL_NAME,
        { toolName: tool.name }
      );
    }
    
    // --- FIX START ---
    // Ensure the schema is an object to allow for property injection.
    if (!(tool.responseSchema instanceof ZodObject)) {
        throw new AgentError(
            `The responseSchema for tool '${tool.name}' must be a Zod object (created with z.object({})).`,
            AgentErrorType.TOOL_EXECUTION_ERROR, // Re-using an existing error type
            { toolName: tool.name }
        );
    }

    // Automatically add/overwrite the 'name' property to the schema for consistency.
    const enhancedSchema = tool.responseSchema.extend({
        name: z.string().describe("The name of the tool."),
    });

    const enhancedTool = {
        ...tool,
        responseSchema: enhancedSchema,
    };
    
    this.tools.push(enhancedTool as unknown as Tool<ZodTypeAny>);
    // --- FIX END ---

    this.logger.debug(`[AgentLoop.addTool] Tool '${tool.name}' defined successfully.`);
  }
  /**
   * Get available tool names
   */
  public getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

  /**
   * Clear conversation history
   */
  public clearHistory(): void {
    this.conversationHistory = [];
    this.toolCallHistory = [];
  }

  /**
   * Get conversation history
   */
  public getConversationHistory(): ChatEntry[] {
    return [...this.conversationHistory];
  }

  /**
   * Enhanced final tool addition
   */
  private addFinalTool(): void {
    if (!this.tools.some(t => t.name === this.FINAL_TOOL_NAME)) {
      this.tools.push({
        name: this.FINAL_TOOL_NAME,
        description: `Call this tool ONLY when you have the complete answer for the user's request. The input should be a concluding, natural language response.`,
        responseSchema: z.object({
          name: z.string().describe("The name of the tool."),
          value: z.string().describe("The final, complete answer to the user's request."),
        }),
        handler: (name, args) => ({
          toolname: name,
          success: true,
          output: args,
        }),
      });
    }
  }

  // Abstract methods for subclasses to implement
  public abstract onToolCallFail(error: AgentError): ToolResult;
  public abstract onToolCallSuccess(toolResult: ToolResult): ToolResult;
}