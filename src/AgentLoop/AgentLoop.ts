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

  private _keepRetry = true;
  private parallelExecution = false;

  constructor(config: AgentConfig, options: AgentLoopOptions = {}) {
    this.config = config;
    this.llmDataHandler = new LLMDataHandler(config);
    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations || 10;
    this.toolTimeoutMs = options.toolTimeoutMs || 30000;
    this.retryAttempts = options.retryAttempts || 3;
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

    this.toolCallHistory = [];
    const stagnationTracker: string[] = [];
    let lastError: AgentError | null = null;

    let numRetries = 0;

    this._keepRetry = true;

    try {
      // Add user message to conversation history
      this.conversationHistory.push({
        sender: 'user',
        message: userPrompt
      });

      let tempStore: { [key: string]: any } = {};



      this.addFinalTool();
      this.logger.info(`[AgentLoop.run] Starting run for prompt: "${userPrompt}"`);

      for (let i = 0; i < this.maxIterations; i++) {
        this.logger.info(`[AgentLoop.run] Iteration ${i + 1}/${this.maxIterations}`);

        console.log("this.toolCallHistory: ", this.toolCallHistory)
        console.log("this.toolCallHistory.length: ", this.toolCallHistory.length)

        try {



          const prompt = this.constructPrompt(userPrompt, context, lastError);
          const llmResponse = await this.getLLMResponseWithRetry(prompt);


          const parsedToolCalls = this.llmDataHandler.parseAndValidate(llmResponse, this.tools);


          numRetries = 0
          // Execute tool calls with better error handling
          const results = await this.executeToolCalls(parsedToolCalls, tempStore);


          const failedTools = results.filter(r => r.success === false);

          if (failedTools.length > 0) {
            const errorMessage = failedTools
              .map(f => `Tool: ${f.toolname}\n  Error: ${f.error ?? 'Unknown error'}`)
              .join('\n\n');

            throw new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });

          }

          lastError = null

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
          console.log(error)
          if (error instanceof AgentError) {
            lastError = error
            this.logger.error(`[AgentLoop.run] Agent error: ${error.message}`);

            if (error.type === AgentErrorType.TOOL_EXECUTION_ERROR) {
              
              stagnationTracker.push(error.message)



              const toolRetryAmount = stagnationTracker.filter(st => st == error.message).length
              
              if (toolRetryAmount > this.retryAttempts - 1) {
                this._keepRetry = false;
              }

              if (toolRetryAmount > this.retryAttempts) {
                throw new AgentError("Maximum retry attempted for error: " + error.getUserMessage, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error });
              }
            }

            else {
              this.toolCallHistory.push(this.onToolCallFail(error));

              if (numRetries >= this.retryAttempts) {
                throw new AgentError("Maximum retry attempted for error: " + error.getUserMessage, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error });
              }

              numRetries++;
            }
          }
          else
            throw error
        }
      }

      throw new AgentError("Maximum iteration reached", AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt });

    } catch (error) {
      if (error instanceof AgentError) {
        return this.onToolCallFail(error);
      } else {
        // Wrap unknown errors in an AgentError before handling
        const agentError = new AgentError(
          error instanceof Error ? error.message : String(error),
          AgentErrorType.UNKNOWN,
          { originalError: error, userPrompt }
        );
        return this.onToolCallFail(agentError);
      }
    }
  }



  /**
   * Execute multiple tool calls with dependency management and parallel execution
   */
  private async executeToolCalls(
    toolCalls: PendingToolCall[],
    tempStore: { [key: string]: any }
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    // If parallel execution is disabled, execute sequentially
    if (!this.parallelExecution) {
      for (const call of toolCalls) {
        this.logger.info(`[AgentLoop.run] Executing tool: ${call.name}`);

        const tool = this.tools.find(t => t.name === call.name);
        if (!tool) {
          throw new AgentError(
            `Tool '${call.name}' not found.`,
            AgentErrorType.TOOL_NOT_FOUND,
            { toolname: call.name }
          );

        }

        const result = await this._executeTool(tool, call, tempStore);
        results.push(result);
        if (!result.success) break;
      }
      return results;
    }

    // Parallel execution with dependency management
    return await this.executeToolCallsWithDependencies(toolCalls, tempStore);
  }

  /**
   * Execute tool calls with dependency management for parallel execution
   */
  private async executeToolCallsWithDependencies(
    toolCalls: PendingToolCall[],
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
        { circularDependencies: circularDeps, toolCalls: validToolCalls }
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
    const executeTool = async (toolname: string): Promise<void> => {
      running.add(toolname);
      this.logger.info(`[AgentLoop.executeToolCallsWithDependencies] Executing tool: ${toolname}`);

      const calls = validToolCalls.filter(t => t.name === toolname)!;
      const tool = this.tools.find(t => t.name === toolname)!;



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
        running.delete(toolname);

        // Notify dependents that this tool has completed
        const toolDependents = dependents.get(toolname) || [];
        for (const dependent of toolDependents) {
          const dependentPending = pending.get(dependent);
          if (dependentPending) {
            dependentPending.delete(toolname);

            // If all dependencies are satisfied, execute the dependent
            if (dependentPending.size === 0) {
              executeTool(dependent);
            }
          }
        }
      }
    };

    // Start execution of all ready tools
    const initialPromises = ready.map(toolname => executeTool(toolname));
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

    const dfs = (toolname: string): boolean => {
      if (recursionStack.has(toolname)) {
        // Found a cycle, return the path from where the cycle starts
        const cycleStart = path.indexOf(toolname);
        return true;
      }

      if (visited.has(toolname)) {
        return false;
      }

      visited.add(toolname);
      recursionStack.add(toolname);
      path.push(toolname);

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

      recursionStack.delete(toolname);
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

    // Final throw after all retries failed
    throw lastError ?? new Error("LLM call failed after all retry attempts.");
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


    const retryMessage = this._keepRetry ? "You have more chance, keep retrying to resolve the error." : "Maximum retry reached, You must stop retrying, and present what you already have and tell the user you could not able to do morethan this."

    const errorRecoverySection = lastError
      ? `
      \n# ERROR RECOVERY\nThe last operation failed with: ${lastError.message}.\n
      ${retryMessage}` : "";

    const executionStrategyPrompt = this.parallelExecution ? (
      "Your tools can execute concurrently") : (
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
- note: ${executionStrategyPrompt}


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
        { toolname: tool.name, timeout: toolTimeout }
      )), toolTimeout)
    );

    try {
      // Validate tool arguments before execution
      const validation = tool.responseSchema.safeParse(call);
      if (!validation.success) {
        throw new AgentError(
          `Invalid arguments for tool '${tool.name}': ${validation.error.message}`,
          AgentErrorType.TOOL_EXECUTION_ERROR,
          { toolname: tool.name, validationError: validation.error }
        );
      }

      const result = await Promise.race([
        Promise.resolve(tool.handler(tool.name, validation.data, tempStore)).catch(err => {
          const errorMsg = `Error on execution of the tool ${tool.name}: ${err instanceof Error ? err.message : String(err)}`;
          throw new AgentError(errorMsg, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: tool.name, call });
        }),
        timeoutPromise,
      ]);

      const toolcallResult = this.onToolCallSuccess(result)

      this.toolCallHistory.push(toolcallResult)
      return toolcallResult;
    } catch (error: any) {
      if (!(error instanceof AgentError)) {
        throw new AgentError(
          `An unexpected error occurred in tool '${tool.name}': ${error.message}`,
          AgentErrorType.TOOL_EXECUTION_ERROR,
          { toolname: tool.name, originalError: error, call }
        );
      }

      const toolcallError = this.onToolCallFail(error)
      this.toolCallHistory.push(toolcallError)
      throw error
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
    //     { toolname: tool.name }
    //   );
    // }

    if (this.tools.some(t => t.name === tool.name)) {
      throw new AgentError(
        `A tool with the name '${tool.name}' is already defined.`,
        AgentErrorType.DUPLICATE_TOOL_NAME,
        { toolname: tool.name }
      );
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) {
      throw new AgentError(
        `Tool name '${tool.name}' must start with a letter and contain only letters, numbers, and underscores.`,
        AgentErrorType.INVALID_TOOL_NAME,
        { toolname: tool.name }
      );
    }

    // Validate dependencies exist (if any)
    if (tool.dependencies && tool.dependencies.length > 0) {
      for (const dep of tool.dependencies) {
        if (!this.tools.some(t => t.name === dep)) {
          throw new AgentError(
            `Tool '${tool.name}' depends on '${dep}' which is not defined. Define dependencies before dependent tools.`,
            AgentErrorType.TOOL_EXECUTION_ERROR,
            { toolname: tool.name, missingDependency: dep }
          );
        }
      }
    }

    // Validate timeout if provided
    if (tool.timeout !== undefined && (tool.timeout <= 0 || !Number.isInteger(tool.timeout))) {
      throw new AgentError(
        `Tool '${tool.name}' timeout must be a positive integer (milliseconds).`,
        AgentErrorType.TOOL_EXECUTION_ERROR,
        { toolname: tool.name, timeout: tool.timeout }
      );
    }

    // --- FIX START ---
    // Ensure the schema is an object to allow for property injection.
    if (!(tool.responseSchema instanceof ZodObject)) {
      throw new AgentError(
        `The responseSchema for tool '${tool.name}' must be a Zod object (created with z.object({})).`,
        AgentErrorType.TOOL_EXECUTION_ERROR, // Re-using an existing error type
        { toolname: tool.name }
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