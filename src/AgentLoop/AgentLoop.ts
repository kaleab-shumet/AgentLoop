// AgentLoop.ts
import z, { ZodTypeAny, ZodObject } from 'zod';
import { AgentError, AgentErrorType } from './AgentError';
import { LLMDataHandler } from './LLMDataHandler';
import { Logger } from './Logger';
import {
  ChatEntry, ToolResult, Tool, PendingToolCall,
  AgentRunInput, AgentRunOutput, ExecutionMode
} from './types';
import { AIProvider } from './AIProvider';
import { TurnState } from './TurnState';




/**
 * Defines the signature for all lifecycle hooks available in the AgentLoop.
 * These hooks allow for observing and interacting with the agent's execution process.
 */
export interface AgentLifecycleHooks {
  onRunStart?: (input: AgentRunInput) => Promise<void>;
  onRunEnd?: (output: AgentRunOutput) => Promise<void>;
  onIterationStart?: (iteration: number, maxIterations: number) => Promise<void>;
  onIterationEnd?: (iteration: number, results: ToolResult[]) => Promise<void>;
  onPromptCreate?: (prompt: string) => Promise<string>; // Can modify the prompt
  onLLMStart?: (prompt: string) => Promise<void>;
  onLLMEnd?: (response: string) => Promise<void>;
  onToolCallStart?: (call: PendingToolCall) => Promise<void>;
  onToolCallEnd?: (result: ToolResult) => Promise<void>; // Replaces onToolCallSuccess and onToolCallFail
  onFinalAnswer?: (result: ToolResult) => Promise<void>;
  onError?: (error: AgentError) => Promise<void>;
}

export interface AgentLoopOptions {
  parallelExecution?: boolean;
  logger?: Logger;
  maxIterations?: number;
  toolTimeoutMs?: number;
  retryAttempts?: number;
  retryDelay?: number;
  hooks?: AgentLifecycleHooks;
  executionMode?: ExecutionMode; // Add execution mode option
}

/**
 * An abstract class for creating a stateless, tool-using AI agent.
 * The AgentLoop is a reusable, stateless engine. It does not store conversation
 * history internally. All state is passed in with each `run` call and returned
 * in the output, making it scalable and easy to integrate.
 */
export abstract class AgentLoop {
  protected logger: Logger;
  protected maxIterations: number;
  protected toolTimeoutMs: number;
  protected retryAttempts: number;
  protected retryDelay: number;
  protected parallelExecution: boolean;
  protected hooks: AgentLifecycleHooks;

  protected abstract systemPrompt: string;
  public tools: Tool<ZodTypeAny>[] = [];
  protected aiProvider: AIProvider;
  protected llmDataHandler: LLMDataHandler;

  protected temperature?: number;
  protected maxTokens?: number;

  private readonly FINAL_TOOL_NAME = 'final';


  constructor(provider: AIProvider, options: AgentLoopOptions = {}) {
    this.aiProvider = provider;
    this.llmDataHandler = new LLMDataHandler(options.executionMode || ExecutionMode.XML);
    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations || 10;
    this.toolTimeoutMs = options.toolTimeoutMs || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.parallelExecution = options.parallelExecution ?? false;
    this.hooks = options.hooks || {};
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
   * Set the execution mode for the agent
   */
  public setExecutionMode(mode: ExecutionMode): void {
    this.llmDataHandler.setExecutionMode(mode);
  }

  /**
   * Get the current execution mode
   */
  public getExecutionMode(): ExecutionMode {
    return this.llmDataHandler.getExecutionMode();
  }

  /**
   * Runs a single turn of the agent's reasoning loop.
   * This method is stateless. It accepts the current state and returns the new state.
   */
  public async run(input: AgentRunInput): Promise<AgentRunOutput> {
    await this.hooks.onRunStart?.(input);
    let conversationHistory: ChatEntry[] = [...input.conversationHistory];
    const { userPrompt, context = {} } = input;



    const toolCallHistory = [...input.toolCallHistory];
    const turnState = new TurnState();



    const stagnationTracker: string[] = [];
    let lastError: AgentError | null = null;
    let numRetries = 0;
    let keepRetry = true;

    try {

      this.addFinalTool();
      this.logger.info(`[AgentLoop.run] Starting run for prompt: "${userPrompt}"`);

      for (let i = 0; i < this.maxIterations; i++) {
        await this.hooks.onIterationStart?.(i + 1, this.maxIterations);
        this.logger.info(`[AgentLoop.run] Iteration ${i + 1}/${this.maxIterations}`);


        try {
          let prompt = this.constructPrompt(userPrompt, context, lastError, conversationHistory, toolCallHistory, keepRetry);
          prompt = await this.hooks.onPromptCreate?.(prompt) ?? prompt;

          const llmResponse = await this.getLLMResponseWithRetry(prompt);
          const parsedToolCalls = this.llmDataHandler.parseAndValidate(llmResponse, this.tools);

          numRetries = 0; // Reset retries on successful LLM response



          // executeToolCalls now directly adds results to toolCallHistory
          const iterationResults = await this.executeToolCalls(parsedToolCalls, turnState);

          toolCallHistory.push(...iterationResults)

          const failedTools = iterationResults.filter(r => !r.success);
          if (failedTools.length > 0) {
            const errorMessage = failedTools.map(f => `Tool: ${f.toolname}\n  Error: ${f.error ?? 'Unknown error'}`).join('\n');
            throw new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });
          }

          lastError = null;
          const finalResult = iterationResults.find(r => r.toolname === this.FINAL_TOOL_NAME);
          if (finalResult) {
            await this.hooks.onFinalAnswer?.(finalResult);
            this.logger.info(`[AgentLoop.run] '${this.FINAL_TOOL_NAME}' tool executed. Run complete.`);
            const output: AgentRunOutput = { toolCallHistory: toolCallHistory, finalAnswer: finalResult };
            await this.hooks.onRunEnd?.(output);
            return output;
          }

        } catch (error) {
          const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { originalError: error });
          await this.hooks.onError?.(agentError);
          lastError = agentError;
          this.logger.error(`[AgentLoop.run] Agent error in iteration: ${agentError.message}`);
          if (agentError.type === AgentErrorType.TOOL_EXECUTION_ERROR) {
            stagnationTracker.push(agentError.message);
            const toolRetryAmount = stagnationTracker.filter(st => st === agentError.message).length;
            if (toolRetryAmount > this.retryAttempts - 1) keepRetry = false;
            if (toolRetryAmount >= this.retryAttempts) {
              throw new AgentError(`Maximum retry attempts for the same tool error: ${agentError.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error: agentError });
            }
          } else {
            toolCallHistory.push(this.createFailureResult(agentError))
            // Handle LLM or parsing errors
            if (numRetries >= this.retryAttempts) {
              throw new AgentError(`Maximum retry attempts for LLM response error: ${agentError.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error: agentError });
            }
            numRetries++;
          }
        } finally {
          await this.hooks.onIterationEnd?.(i + 1, toolCallHistory);
        }
      }

      throw new AgentError("Maximum iterations reached", AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt });
    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { originalError: error, userPrompt });
      await this.hooks.onError?.(agentError);
      const failureResult: ToolResult = {
        toolname: agentError.context?.toolname || 'run-failure',
        success: false,
        error: agentError.getUserMessage(),
        context: { errorType: agentError.type, originalError: agentError.message, ...agentError.context }
      };
      toolCallHistory.push(failureResult); // Ensure final failure is logged
      const output: AgentRunOutput = { toolCallHistory, finalAnswer: failureResult };
      await this.hooks.onRunEnd?.(output);
      return output;
    }

  }

  private async executeToolCalls(toolCalls: PendingToolCall[], turnState: TurnState): Promise<ToolResult[]> {
    const iterationResults: ToolResult[] = []; // Collect results for this iteration to return

    if (this.parallelExecution) {
      const results = await this.executeToolCallsWithDependencies(toolCalls, turnState);
      iterationResults.push(...results);
    } else {
      // Sequential execution
      for (const call of toolCalls) {
        this.logger.info(`[AgentLoop.executeToolCalls] Sequentially executing tool: ${call.name}`);
        const tool = this.tools.find(t => t.name === call.name);
        if (!tool) {
          const err = new AgentError(`Tool '${call.name}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolname: call.name });
          const result = this.createFailureResult(err);
          iterationResults.push(result);
          await this.hooks.onToolCallEnd?.(result);
          break;
        }
        const result = await this._executeTool(tool, call, turnState);
        iterationResults.push(result);
        if (!result.success) break; // Stop on first failure in sequential mode
      }
    }
    return iterationResults;
  }



  private async executeToolCallsWithDependencies(toolCalls: PendingToolCall[], turnState: TurnState): Promise<ToolResult[]> {
    const iterationResults: ToolResult[] = []; // Collect results for this iteration to return

    const validToolCalls = toolCalls.filter(call => {
      if (!this.tools.some(t => t.name === call.name)) {
        const error = new AgentError(`Tool '${call.name}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolname: call.name });
        const result = this.createFailureResult(error);
        iterationResults.push(result);
        return false;
      }
      return true;
    });

    if (validToolCalls.length === 0) return iterationResults;

    const circularDeps = this.detectCircularDependencies(validToolCalls, this.tools);
    if (circularDeps.length > 0) {
      const error = new AgentError(`Circular dependencies detected: ${circularDeps.join(' -> ')}`, AgentErrorType.TOOL_EXECUTION_ERROR, { circularDependencies: circularDeps });
      const result = this.createFailureResult(error);
      iterationResults.push(result);
      return iterationResults;
    }

    const { pending, dependents, ready } = this.buildDependencyGraph(validToolCalls);
    const executed = new Map<string, Promise<void>>();

    const propagateFailure = (failedToolName: string, chain: string[]) => {
      const directDependents = dependents.get(failedToolName) || [];
      for (const dependentName of directDependents) {
        if (chain.includes(dependentName) || iterationResults.some(r => r.toolname === dependentName)) continue;
        const result = this.createFailureResult(new AgentError(`Skipped due to failure in dependency: '${failedToolName}'`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: dependentName, failedDependency: failedToolName }));
        iterationResults.push(result);
        propagateFailure(dependentName, [...chain, dependentName]);
      }
    };

    const execute = async (toolname: string): Promise<void> => {
      this.logger.info(`[AgentLoop.executeToolCallsWithDependencies] Executing tool: ${toolname}`);
      const tool = this.tools.find(t => t.name === toolname)!;
      const callsForTool = validToolCalls.filter(t => t.name === toolname);

      try {
        // Execute all calls for this specific tool concurrently
        const results = await Promise.all(callsForTool.map(call => this._executeTool(tool, call, turnState)));
        iterationResults.push(...results); // Add results to the iteration's collection
        if (results.some(r => !r.success)) throw new Error(`One or more executions of tool '${toolname}' failed.`);
      } catch (error) {
        const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { toolname });
        // If results haven't been pushed by _executeTool (e.g., if Promise.all failed early)
        if (!iterationResults.some(r => r.toolname === toolname)) {
          const failureResult = this.createFailureResult(agentError);
          iterationResults.push(failureResult);
        }
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

    return iterationResults;
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
        await this.hooks.onLLMStart?.(prompt);
        const response = await this.aiProvider.getCompletion(prompt, options);
        if (typeof response !== "string") {
          throw new AgentError("LLM provider returned undefined or non-string response.", AgentErrorType.UNKNOWN);
        }
        await this.hooks.onLLMEnd?.(response);
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
    const toolDefinitions = this.llmDataHandler.formatToolDefinitions(this.tools);
    const formatInstructions = this.llmDataHandler.getFormatInstructions(this.tools, this.FINAL_TOOL_NAME, this.parallelExecution);
    
    const historyLog = toolCallHistory.length > 0 ? JSON.stringify(toolCallHistory.slice(-10), null, 2) : 'No tool calls have been made yet.';
    const contextLog = Object.keys(context).length > 0 ? Object.entries(context).map(([key, value]) => `**${key}**:\n${JSON.stringify(value)}`).join('\n\n') : 'No background context provided.';
    const retryInstruction = keepRetry ? "You have more attempts. Analyze the error and history, then retry with a corrected approach." : "You have reached the maximum retry limit. You MUST stop and use the 'final' tool to report what you have accomplished and explain the failure.";
    const errorRecoverySection = lastError ? `\n# ERROR RECOVERY\n- **Error:** ${lastError.message}\n- **Instruction:** ${retryInstruction}` : "";
    const conversationSection = conversationHistory.length > 0 ? `\n# CONVERSATION HISTORY\n${JSON.stringify(conversationHistory, null, 2)}\n` : '';
    
    const template = `${this.systemPrompt}
# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS
${formatInstructions}
# AVAILABLE TOOLS
${toolDefinitions}
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

  private async _executeTool(tool: Tool<ZodTypeAny>, call: PendingToolCall, turnState: TurnState): Promise<ToolResult> {
    await this.hooks.onToolCallStart?.(call);
    const toolTimeout = tool.timeout || this.toolTimeoutMs;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AgentError(`Tool '${tool.name}' exceeded timeout of ${toolTimeout}ms.`, AgentErrorType.TOOL_TIMEOUT_ERROR, { toolname: tool.name, timeout: toolTimeout })), toolTimeout)
    );
    let result: ToolResult;
    try {
      const validation = tool.responseSchema.safeParse(call);
      if (!validation.success) {
        throw new AgentError(`Invalid arguments for tool '${tool.name}': ${validation.error.message}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: tool.name, validationError: validation.error });
      }
      // The handler now returns the full ToolResult object directly.
      result = await Promise.race([
        tool.handler(tool.name, validation.data, turnState),
        timeoutPromise,
      ]);
    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(`An unexpected error occurred in tool '${tool.name}': ${String(error)}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: tool.name, originalError: error, call });
      result = this.createFailureResult(agentError);
    }

    await this.hooks.onToolCallEnd?.(result);
    return result;
  }


  private _addTool<T extends ZodTypeAny>(tool: Tool<T>): void {
    if (this.tools.some(t => t.name === tool.name)) throw new AgentError(`A tool with the name '${tool.name}' is already defined.`, AgentErrorType.DUPLICATE_TOOL_NAME, { toolname: tool.name });
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.name)) throw new AgentError(`Tool name '${tool.name}' must start with a letter or underscore and contain only letters, numbers, and underscores.`, AgentErrorType.INVALID_TOOL_NAME, { toolname: tool.name });
    if (!(tool.responseSchema instanceof ZodObject)) throw new AgentError(`The responseSchema for tool '${tool.name}' must be a Zod object (e.g., z.object({})).`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolname: tool.name });
    
    // Set default timeout if not provided
    const toolWithDefaults = {
      ...tool,
      timeout: tool.timeout || this.toolTimeoutMs,
      dependencies: tool.dependencies || []
    };
    
    const enhancedSchema = tool.responseSchema.extend({ name: z.string().describe("The name of the tool, which must match the tool's key.") });
    this.tools.push({ ...toolWithDefaults, responseSchema: enhancedSchema } as unknown as Tool<ZodTypeAny>);
    this.logger.debug(`[AgentLoop._addTool] Tool '${tool.name}' defined successfully.`);
  }

  private addFinalTool(): void {
    if (!this.tools.some(t => t.name === this.FINAL_TOOL_NAME)) {
      this.defineTool((z) => ({
        name: this.FINAL_TOOL_NAME,
        description: `Call this tool ONLY when you have the complete answer for the user's request.`,
        responseSchema: z.object({ value: z.string().describe("The final, complete answer to the user's request.") }),
        handler: async (name: string, args: { value: string; }, turnState: TurnState): Promise<ToolResult> => {
          return {
            toolname: name,
            success: true,
            output: args,
          };
        },
      }));
    }
  }

  public getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

  /**
   * Creates a standardized failure result object from an AgentError.
   * @param error The AgentError that occurred.
   * @returns A ToolResult object representing the failure.
   */
  private createFailureResult(error: AgentError): ToolResult {
    this.logger.error(`[AgentLoop] Tool execution failed: ${error.message}`, { errorType: error.type, context: error.context });
    return {
      toolname: error.context?.toolname || 'unknown-tool-error',
      success: false,
      error: error.getUserMessage(),
      context: { errorType: error.type, originalError: error.message, ...error.context }
    };
  }
}