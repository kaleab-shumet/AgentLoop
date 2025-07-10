import z, { ZodTypeAny, ZodObject } from 'zod';
import { AgentError, AgentErrorType } from './AgentError';
import { LLMDataHandler } from './LLMDataHandler';
import { Logger } from './Logger';
import { ChatEntry, ToolChainData, ToolResult, Tool, PendingToolCall } from './types';
import zodToJsonSchema from 'zod-to-json-schema';
import { convertJsonSchemaToXsd } from './JsonToXsd';

export interface AgentLoopOptions {
  parallelExecution?: boolean;
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

  private parallelExecution = false;

  constructor(config: AgentConfig, options: AgentLoopOptions = {}) {
    this.config = config;
    this.llmDataHandler = new LLMDataHandler(config);
    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations || 10;
    this.toolTimeoutMs = options.toolTimeoutMs || 30000;
    this.retryAttempts = options.retryAttempts || 1;
    this.retryDelay = options.retryDelay || 1000;

    this.parallelExecution = options.parallelExecution || false;

    // Initialize conversation history
    this.conversationHistory = [];
  }

  /**
   * Protected method to define tools with better error handling
   */
  protected defineTool(fn: (schema: typeof z) => any): void {
    const dfTool = fn(z);
    this._addTool(dfTool);
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

    let tempStore: { [key: string]: any } = {};

    this.toolCallHistory = [];
    const stagnationTracker: string[] = [];
    let consecutiveInvalidResponses = 0;
    let lastError: AgentError | null = null;

    this.addFinalTool();
    this.logger.info(`[AgentLoop.run] Starting run for prompt: "${userPrompt}"`);

    for (let i = 0; i < this.maxIterations; i++) {
      this.logger.info(`[AgentLoop.run] Iteration ${i + 1}/${this.maxIterations}`);

      console.log("this.toolCallHistory: ", this.toolCallHistory)
      console.log("this.toolCallHistory.length: ", this.toolCallHistory.length)

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
        const results = await this.executeToolCalls(parsedToolCalls, stagnationTracker, tempStore);

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
   * Execute multiple tool calls with dependency management and parallel execution
   */
  private async executeToolCalls(
    toolCalls: PendingToolCall[],
    stagnationTracker: string[],
    tempStore: { [key: string]: any }
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    // If parallel execution is disabled, execute sequentially
    if (!this.parallelExecution) {
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

        const result = await this._executeTool(tool, call, tempStore);
        this.toolCallHistory.push(result);
        results.push(result);
        if (!result.success) break;
      }
      return results;
    }

    // Parallel execution with dependency management
    return await this.executeToolCallsWithDependencies(toolCalls, stagnationTracker, tempStore);
  }

  /**
   * Execute tool calls with dependency management for parallel execution
   */
  private async executeToolCallsWithDependencies(
    toolCalls: PendingToolCall[],
    stagnationTracker: string[],
    tempStore: { [key: string]: any }
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const resultStore: ToolResult[] = [];


    const validToolCalls: PendingToolCall[] = []

    for (const tCall of toolCalls) {
      const foundCall = this.tools.find(t => t.name == tCall.name);
      if (!foundCall) {
        const error = new AgentError(
          `Tool '${tCall.name}' not found.`,
          AgentErrorType.TOOL_NOT_FOUND,
          { toolname: tCall.name }
        );
        const result = this.onToolCallFail(error);
        this.toolCallHistory.push(result);
        results.push(result);
        continue;
      }

      validToolCalls.push(tCall)
    }




    if (validToolCalls.length === 0) {
      return results;
    }

    // Initialize dependency tracking
    const pending = new Map<string, Set<string>>();
    const dependents = new Map<string, string[]>();
    const running = new Set<string>();

    validToolCalls.forEach(call => {
      const tool = this.tools.find(t => t.name == call.name);
      const dependencies: string[] = tool?.dependencies || [];

      // Filter dependencies to only include those that exist in current tool calls
      // If a dependency doesn't exist in current calls, assume it's already executed

      const currentCallNames = new Set(validToolCalls.map(call => call.name));
      const validDependencies = dependencies.filter(dep => currentCallNames.has(dep));


      pending.set(call.name, new Set(validDependencies));

      validDependencies.forEach(dep => {
        if (!dependents.has(dep)) {
          dependents.set(dep, []);
        }
        dependents.get(dep)!.push(call.name);
      });
    });

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(validToolCalls, this.tools);
    if (circularDeps.length > 0) {
      const error = new AgentError(
        `Circular dependencies detected: ${circularDeps.join(' -> ')}`,
        AgentErrorType.TOOL_EXECUTION_ERROR,
        { circularDependencies: circularDeps }
      );
      const result = this.onToolCallFail(error);
      this.toolCallHistory.push(result);
      results.push(result);
      return results;
    }

    // Find tools that are ready to execute (no pending dependencies)
    const ready = validToolCalls
      .filter(call => {
        const pendingDeps = pending.get(call.name);
        return !pendingDeps || pendingDeps.size === 0;
      })
      .map(call => call.name);

    // Execute a single tool and handle completion
    const executeTool = async (toolName: string): Promise<void> => {
      running.add(toolName);
      this.logger.info(`[AgentLoop.executeToolCallsWithDependencies] Executing tool: ${toolName}`);

      const calls = validToolCalls.filter(t => t.name === toolName)!;
      const tool = this.tools.find(t => t.name === toolName)!;

      calls.forEach(call => stagnationTracker.push(JSON.stringify(call)))


      try {
        const resultsPromises = calls.map(call => this._executeTool(tool, call, tempStore));
        const result = await Promise.all(resultsPromises);
        resultStore.push(...result);
        this.toolCallHistory.push(...result);
        results.push(...result);
      } catch (error) {
        const errorResult = this.onToolCallFail(error as AgentError);
        resultStore.push(errorResult);
        this.toolCallHistory.push(errorResult);
        results.push(errorResult);
      } finally {
        running.delete(toolName);

        // Notify dependents that this tool has completed
        const toolDependents = dependents.get(toolName) || [];
        for (const dependent of toolDependents) {
          const dependentPending = pending.get(dependent);
          if (dependentPending) {
            dependentPending.delete(toolName);

            // If all dependencies are satisfied, execute the dependent
            if (dependentPending.size === 0) {
              executeTool(dependent);
            }
          }
        }
      }
    };

    // Start execution of all ready tools
    const initialPromises = ready.map(toolName => executeTool(toolName));
    await Promise.all(initialPromises);

    // Wait for all remaining tools to finish
    while (running.size > 0) {
      await this.sleep(10);
    }

    return results;
  }

  /**
   * Detect circular dependencies using DFS (only considers tools in current batch)
   */
  private detectCircularDependencies(
    toolCalls: PendingToolCall[],
    toolList: Tool<ZodTypeAny>[]
  ): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];
    const callNames = new Set(toolCalls.map(call => call.name));

    const dfs = (toolName: string): boolean => {
      if (recursionStack.has(toolName)) {
        // Found a cycle, return the path from where the cycle starts
        const cycleStart = path.indexOf(toolName);
        return true;
      }

      if (visited.has(toolName)) {
        return false;
      }

      visited.add(toolName);
      recursionStack.add(toolName);
      path.push(toolName);

      for (const tool of toolList) {
        if (tool && tool.dependencies) {
          // Only check dependencies that exist in current tool calls
          for (const dep of tool.dependencies) {
            if (callNames.has(dep) && dfs(dep)) {
              return true;
            }
          }
        }
      }

      recursionStack.delete(toolName);
      path.pop();
      return false;
    };

    for (const call of toolCalls) {
      if (!visited.has(call.name)) {
        if (dfs(call.name)) {
          return [...path];
        }
      }
    }

    return [];
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
        const jsonSchema = zodToJsonSchema(tool.responseSchema, tool.name);
        const xsdSchema = convertJsonSchemaToXsd(jsonSchema as any, { rootElementName: 'tool' });
        return `<!-- Schema for ${tool.name} -->\n${xsdSchema}`;
      })
      .join('\n\n');

    const toolCallHistory = this.toolCallHistory.length > 0
      ? JSON.stringify(this.toolCallHistory.slice(-10), null, 2) // Only show last 10 for brevity
      : 'No tool calls have been made yet.';

    const contextLog = Object.keys(context).length > 0
      ? Object.entries(context).map(([key, value]) => `**${key}**:\n${JSON.stringify(value)}`).join('\n\n')
      : 'No background context provided.';

    const errorRecoverySection = lastError
      ? `\n# ERROR RECOVERY\nThe last operation failed with: ${lastError.message}. Please try a different approach or use available tools more effectively.\n`
      : '';

    const promptExecutionStrategy = this.parallelExecution? (
      "Your tools can execute concurrently"):(
        "Your tools execute sequentially then If one tool fails, you must retry and fix it before continuing with the other tools."
    )

    const conversationSection = this.conversationHistory.length > 0
      ? `\n# CONVERSATION HISTORY\n${JSON.stringify(this.conversationHistory, null, 2)}\n`
      : '';

    const template = `${this.systemPrompt}

# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS
${this.getFormattingInstructions()}

# AVAILABLE TOOLS
You have the following tools available. You can and SHOULD call multiple tools in parallel in a single turn if the user's request requires multiple actions.
${toolSchemas}
- note: You should always call the ${this.FINAL_TOOL_NAME} tool alone
- note: ${promptExecutionStrategy}


# CONTEXT
Here is some background information for your task:
${contextLog}
${conversationSection}
# TOOL CALL HISTORY
This is the history of the tools you have called so far and their results.
${toolCallHistory}
${errorRecoverySection}
# CURRENT TASK
Based on all the information above, use your tools to respond to this user request:
"${userPrompt}"

Remember: Think step-by-step. If the task requires gathering different pieces of information (e.g., getting a user's profile AND their recent orders), call the necessary tools in one go. If you have enough information to provide a complete answer, you MUST call the '${this.FINAL_TOOL_NAME}' tool by itself.
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
   * Enhanced tool execution with better error handling and individual timeout support
   */
  private async _executeTool(tool: Tool<ZodTypeAny>, call: PendingToolCall, tempStore: ToolChainData): Promise<ToolResult> {
    // Use tool-specific timeout if defined, otherwise use global timeout
    const toolTimeout = tool.timeout || this.toolTimeoutMs;

    const timeoutPromise = new Promise<ToolResult>((_, reject) =>
      setTimeout(() => reject(new AgentError(
        `Tool '${tool.name}' exceeded timeout of ${toolTimeout}ms.`,
        AgentErrorType.TOOL_TIMEOUT_ERROR,
        { toolName: tool.name, timeout: toolTimeout }
      )), toolTimeout)
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
        tool.handler(tool.name, validation.data, tempStore),
        timeoutPromise,
      ]);

      if (!result.success) {
        throw result?.error || new AgentError(`Error on execution of the tool ${tool.name}`, AgentErrorType.TOOL_EXECUTION_ERROR)
      }

      return this.onToolCallSuccess(result);
    } catch (error: any) {
      if (error instanceof AgentError) {
        return this.onToolCallFail(error);
      }
      const executionError = new AgentError(
        `An unexpected error occurred in tool '${tool.name}': ${error.message}`,
        AgentErrorType.TOOL_EXECUTION_ERROR,
        { toolname: tool.name, originalError: error }
      );
      return this.onToolCallFail(executionError);
    }
  }

  /**
   * Enhanced formatting instructions
   */
  private getFormattingInstructions(): string {

    return `
    You MUST respond by calling one or more tools. To solve complex tasks, you should call multiple tools in a single turn. Your entire output must be a single, valid XML block enclosed in \`\`\`xml ... \`\`\`.
    
    All tool calls must be children under a single <root> XML tag.
    
    **IMPORTANT RULES FOR TOOL CALLING:**
    
    1.  **CALL MULTIPLE TOOLS:** For any request that requires more than one piece of information, you MUST call all the necessary tools in parallel in a single response. Do not call them one by one in separate turns.
    2.  **THE '{${this.FINAL_TOOL_NAME}}' TOOL IS EXCLUSIVE:** If you have gathered enough information to provide a complete answer, you MUST call the '${this.FINAL_TOOL_NAME}' tool. When you call '${this.FINAL_TOOL_NAME}', it MUST be the ONLY tool inside the <root> tag.
    3.  **REVIEW HISTORY:** Always review the tool call history before making new calls to avoid repeating work.
    4.  **BE STRATEGIC:** If a tool fails, try a different approach or different parameters.
    
    **Example of a good, parallel response for "What is the weather in Paris and what is the latest news about AI?":**
    
    \`\`\`xml
    <root>
      <get_weather>
        <name>get_weather</name>
        <city>Paris</city>
      </get_weather>
      <web_search>
        <name>web_search</name>
        <query>latest news about AI</query>
      </web_search>
    </root>
    \`\`\`
    
    **Example of a final answer:**
    
    \`\`\`xml
    <root>
      <${this.FINAL_TOOL_NAME}>
        <name>${this.FINAL_TOOL_NAME}</name>
        <value>The weather in Paris is sunny, and the latest AI news is about a new model release from OpenAI.</value>
      </${this.FINAL_TOOL_NAME}>
    </root>
    \`\`\`
    `;
  }

  /**
   * Private method for tool definition with validation and automatic 'name' property injection.
   */
  private _addTool<T extends ZodTypeAny>(tool: Tool<T>): void {
    // if (tool.name === this.FINAL_TOOL_NAME) {
    //   throw new AgentError(
    //     `Tool name '${this.FINAL_TOOL_NAME}' is reserved.`,
    //     AgentErrorType.RESERVED_TOOL_NAME,
    //     { toolName: tool.name }
    //   );
    // }

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

    // Validate dependencies exist (if any)
    if (tool.dependencies && tool.dependencies.length > 0) {
      for (const dep of tool.dependencies) {
        if (!this.tools.some(t => t.name === dep)) {
          throw new AgentError(
            `Tool '${tool.name}' depends on '${dep}' which is not defined. Define dependencies before dependent tools.`,
            AgentErrorType.TOOL_EXECUTION_ERROR,
            { toolName: tool.name, missingDependency: dep }
          );
        }
      }
    }

    // Validate timeout if provided
    if (tool.timeout !== undefined && (tool.timeout <= 0 || !Number.isInteger(tool.timeout))) {
      throw new AgentError(
        `Tool '${tool.name}' timeout must be a positive integer (milliseconds).`,
        AgentErrorType.TOOL_EXECUTION_ERROR,
        { toolName: tool.name, timeout: tool.timeout }
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

    this.logger.debug(`[AgentLoop._addTool] Tool '${tool.name}' defined successfully.`);
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

      this.defineTool((z) => ({
        name: this.FINAL_TOOL_NAME,
        description: `Call this tool ONLY when you have the complete answer for the user's request. The input should be a concluding, natural language response.`,
        responseSchema: z.object({
          name: z.string().describe("The name of the tool."),
          value: z.string().describe("The final, complete answer to the user's request."),
        }),
        handler: (name: string, args: any) => ({
          toolname: name,
          success: true,
          output: args,
        }),
        dependencies: []
      }))

    }
  }

  // Abstract methods for subclasses to implement
  public abstract onToolCallFail(error: AgentError): ToolResult;
  public abstract onToolCallSuccess(toolResult: ToolResult): ToolResult;
}