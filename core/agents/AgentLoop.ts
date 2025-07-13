// AgentLoop.ts
import z, { ZodTypeAny, ZodObject } from 'zod';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { LLMDataHandler } from '../handlers/LLMDataHandler';
import { Logger } from '../utils/Logger';
import {
  ChatEntry, ToolResult, Tool, PendingToolCall,
  AgentRunInput, AgentRunOutput, ExecutionMode
} from '../types/types';
import { AIProvider } from '../providers/AIProvider';
import { TurnState } from './TurnState';
import { PromptManager, PromptManagerConfig, ResponseFormat } from '../prompt/PromptManager';
import { StagnationDetector, StagnationDetectorConfig } from '../utils/StagnationDetector';




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
  executionMode?: ExecutionMode;
  promptManager?: PromptManager;
  promptManagerConfig?: PromptManagerConfig;
  stagnationDetector?: StagnationDetectorConfig;
  sleepBetweenIterationsMs?: number;
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
  protected sleepBetweenIterationsMs: number;

  protected abstract systemPrompt: string;
  public tools: Tool<ZodTypeAny>[] = [];
  protected aiProvider: AIProvider;
  protected llmDataHandler: LLMDataHandler;
  protected promptManager: PromptManager;
  protected stagnationDetector: StagnationDetector;

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
    this.parallelExecution = options.parallelExecution ?? true;
    this.hooks = options.hooks || {};
    this.sleepBetweenIterationsMs = options.sleepBetweenIterationsMs || 2000;

    // Initialize prompt manager - will be properly set up in initializePromptManager
    this.promptManager = options.promptManager || new PromptManager(
      '',
      options.promptManagerConfig || this.getDefaultPromptManagerConfig(options.executionMode)
    );

    // Initialize stagnation detector
    this.stagnationDetector = new StagnationDetector(options.stagnationDetector);
  }

  /**
   * Get default prompt manager configuration based on execution mode
   */
  private getDefaultPromptManagerConfig(executionMode?: ExecutionMode): PromptManagerConfig {
    const responseFormat = executionMode === ExecutionMode.FUNCTION_CALLING
      ? ResponseFormat.FUNCTION_CALLING
      : ResponseFormat.XML;

    return {
      responseFormat,
      promptOptions: {
        includeContext: true,
        includeConversationHistory: true,
        includeToolHistory: true,
        maxHistoryEntries: 10,
        parallelExecution: this.parallelExecution,
        includeExecutionStrategy: true
      }
    };
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
   * Set a custom prompt manager
   */
  public setPromptManager(promptManager: PromptManager): void {
    this.promptManager = promptManager;
  }

  /**
   * Get the current prompt manager
   */
  public getPromptManager(): PromptManager {
    return this.promptManager;
  }

  /**
   * Initialize the prompt manager with the system prompt if not already set
   */
  protected initializePromptManager(): void {
    // If promptManager was not provided in options or needs system prompt, create new one
    if (!this.promptManager || this.systemPrompt) {
      // Get the execution mode from the LLM data handler
      const executionMode = this.llmDataHandler.getExecutionMode();
      const config = this.getDefaultPromptManagerConfig(executionMode);
      this.promptManager = new PromptManager(this.systemPrompt, config);
    }
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
      this.initializePromptManager();
      this.addFinalTool();
      //this.logger.info(`[AgentLoop] Run started`);

      for (let i = 0; i < this.maxIterations; i++) {
        await this.hooks.onIterationStart?.(i + 1, this.maxIterations);


        try {
          let prompt = this.constructPrompt(userPrompt, context, lastError, conversationHistory, toolCallHistory, keepRetry);
          prompt = await this.hooks.onPromptCreate?.(prompt) ?? prompt;

          const llmResponse = await this.getLLMResponseWithRetry(prompt);
          const parsedToolCalls = this.llmDataHandler.parseAndValidate(llmResponse, this.tools);

          numRetries = 0; // Reset retries on successful LLM response

          // Check for stagnation before executing tools
          if (parsedToolCalls.length > 0) {
            for (const call of parsedToolCalls) {
              const stagnationResult = this.stagnationDetector.isStagnant(call, toolCallHistory, i + 1);
              if (stagnationResult.isStagnant && stagnationResult.confidence > 0.7) {
                this.logger.warn(`[AgentLoop] Stagnation detected (${stagnationResult.confidence.toFixed(2)}): ${stagnationResult.reason}`);

                keepRetry = false;

                // Create stagnation warning result
                const stagnationWarning: ToolResult = {
                  toolName: 'stagnation-detector',
                  success: false,
                  error: `Stagnation detected: ${stagnationResult.reason}. ${stagnationResult.confidence >= 0.90 ? 'Forcing termination.' : 'Consider using the final tool.'}`,
                  context: {
                    stagnationReason: stagnationResult.reason,
                    confidence: stagnationResult.confidence,
                    iteration: i + 1,
                    diagnostics: this.stagnationDetector.getDiagnostics(toolCallHistory)
                  }
                };
                toolCallHistory.push(stagnationWarning);

                // For very high confidence stagnation (>=90%), force termination
                if (stagnationResult.confidence >= 0.90) {
                  this.logger.error(`[AgentLoop] Critical stagnation detected. Forcing termination with final tool.`);

                  const forcedTermination: ToolResult = {
                    toolName: this.FINAL_TOOL_NAME,
                    success: true,
                    output: {
                      value: `Task terminated due to critical stagnation: ${stagnationResult.reason}. The agent was repeating the same actions without making progress. Based on the work completed so far: ${this.summarizeProgress(toolCallHistory)}`
                    }
                  };

                  toolCallHistory.push(forcedTermination);
                  await this.hooks.onFinalAnswer?.(forcedTermination);

                  const output: AgentRunOutput = { toolCallHistory, finalAnswer: forcedTermination };
                  await this.hooks.onRunEnd?.(output);
                  return output;
                }

                // For high confidence stagnation (70-89%), set error context but continue
                lastError = new AgentError(
                  `Stagnation detected: ${stagnationResult.reason}. Consider completing the task to avoid loops.`,
                  AgentErrorType.TOOL_EXECUTION_ERROR,
                  { stagnation: stagnationResult }
                );
                break; // Only warn once per iteration
              }
            }
          }

          // executeToolCalls now directly adds results to toolCallHistory
          const iterationResults = await this.executeToolCalls(parsedToolCalls, turnState);

          toolCallHistory.push(...iterationResults)

          const failedTools = iterationResults.filter(r => !r.success);
          if (failedTools.length > 0) {
            const errorMessage = failedTools.map(f => `Tool: ${f.toolName}\n  Error: ${f.error ?? 'Unknown error'}`).join('\n');
            throw new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });
          }

          lastError = null;
          const finalResult = iterationResults.find(r => r.toolName === this.FINAL_TOOL_NAME);
          if (finalResult) {
            await this.hooks.onFinalAnswer?.(finalResult);
            //this.logger.info(`[AgentLoop] Run complete. Final answer: ${finalResult.output?.value?.substring(0, 120)}`);
            const output: AgentRunOutput = { toolCallHistory: toolCallHistory, finalAnswer: finalResult };
            await this.hooks.onRunEnd?.(output);
            return output;
          }

        } catch (error) {
          const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { originalError: error });
          await this.hooks.onError?.(agentError);
          lastError = agentError;
          this.logger.error(`[AgentLoop] Iteration error: ${agentError.getUserMessage()}`);
          if (agentError.type === AgentErrorType.TOOL_EXECUTION_ERROR) {
            // Add failed tool results to history so agent can see them
            if (agentError.context?.failedTools) {
              toolCallHistory.push(...agentError.context.failedTools);
            } else {
              toolCallHistory.push(this.createFailureResult(agentError));
            }

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

          // Add small delay between iterations to prevent rate limiting
          if (i < this.maxIterations - 1) { // Don't wait after the last iteration
            await this.sleep(this.sleepBetweenIterationsMs);
          }
        }
      }

      throw new AgentError("Maximum iterations reached", AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt });
    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { originalError: error, userPrompt });
      await this.hooks.onError?.(agentError);
      const failureResult: ToolResult = {
        toolName: agentError.context?.toolName || 'run-failure',
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
        //this.logger.info(`[AgentLoop] Executing tool: ${call.name}`);
        const tool = this.tools.find(t => t.name === call.name);
        if (!tool) {
          const err = new AgentError(`Tool '${call.name}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolName: call.name });
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
        const error = new AgentError(`Tool '${call.name}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolName: call.name });
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
        if (chain.includes(dependentName) || iterationResults.some(r => r.toolName === dependentName)) continue;
        const result = this.createFailureResult(new AgentError(`Skipped due to failure in dependency: '${failedToolName}'`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: dependentName, failedDependency: failedToolName }));
        iterationResults.push(result);
        propagateFailure(dependentName, [...chain, dependentName]);
      }
    };

    const execute = async (toolName: string): Promise<void> => {
      //this.logger.info(`[AgentLoop] Executing tool: ${toolName}`);
      const tool = this.tools.find(t => t.name === toolName)!;
      const callsForTool = validToolCalls.filter(t => t.name === toolName);

      try {
        // Execute all calls for this specific tool concurrently
        const results = await Promise.all(callsForTool.map(call => this._executeTool(tool, call, turnState)));
        iterationResults.push(...results); // Add results to the iteration's collection
        if (results.some(r => !r.success)) throw new Error(`One or more executions of tool '${toolName}' failed.`);
      } catch (error) {
        const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { toolName });
        // If results haven't been pushed by _executeTool (e.g., if Promise.all failed early)
        if (!iterationResults.some(r => r.toolName === toolName)) {
          const failureResult = this.createFailureResult(agentError);
          iterationResults.push(failureResult);
        }
        propagateFailure(toolName, [toolName]);
      } finally {
        const nextTools = dependents.get(toolName) || [];
        for (const next of nextTools) {
          pending.get(next)?.delete(toolName);
          if (pending.get(next)?.size === 0) executed.set(next, execute(next));
        }
      }
    };

    for (const toolName of ready) executed.set(toolName, execute(toolName));
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

    const dfs = (toolName: string, path: string[]): string[] | null => {
      visited.add(toolName);
      recursionStack.add(toolName);
      path.push(toolName);
      const neighbors = adjList.get(toolName) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor, path);
          if (cycle) return cycle;
        } else if (recursionStack.has(neighbor)) {
          return [...path.slice(path.indexOf(neighbor)), neighbor];
        }
      }
      recursionStack.delete(toolName);
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
        this.logger.warn(`[AgentLoop] LLM retry ${attempt + 1}: ${lastError.message}`);
        if (attempt < this.retryAttempts - 1) await this.sleep(this.retryDelay * Math.pow(2, attempt));
      }
    }
    throw lastError ?? new AgentError("LLM call failed after all retry attempts.", AgentErrorType.UNKNOWN);
  }

  private constructPrompt(userPrompt: string, context: Record<string, any>, lastError: AgentError | null, conversationHistory: ChatEntry[], toolCallHistory: ToolResult[], keepRetry: boolean): string {
    const toolDefinitions = this.llmDataHandler.formatToolDefinitions(this.tools);

    // Build the prompt using the clean PromptManager API
    let prompt = this.promptManager.buildPrompt(
      userPrompt,
      context,
      lastError,
      conversationHistory,
      toolCallHistory,
      keepRetry,
      this.FINAL_TOOL_NAME,
      toolDefinitions
    );

    return prompt;
  }

  /**
   * Summarizes the progress made so far for forced termination scenarios
   */
  private summarizeProgress(toolCallHistory: ToolResult[]): string {
    const successfulCalls = toolCallHistory.filter(r => r.success && r.toolName !== this.FINAL_TOOL_NAME && r.toolName !== 'stagnation-detector');
    const failedCalls = toolCallHistory.filter(r => !r.success && r.toolName !== 'stagnation-detector' && r.toolName !== 'run-failure');

    if (successfulCalls.length === 0 && failedCalls.length === 0) {
      return "No significant progress was made.";
    }

    const summary = [];
    if (successfulCalls.length > 0) {
      const toolCounts = new Map<string, number>();
      successfulCalls.forEach(call => {
        toolCounts.set(call.toolName, (toolCounts.get(call.toolName) || 0) + 1);
      });
      const toolSummary = Array.from(toolCounts.entries())
        .map(([tool, count]) => `${tool}(${count}x)`)
        .join(', ');
      summary.push(`Successfully executed: ${toolSummary}`);
    }

    if (failedCalls.length > 0) {
      summary.push(`Encountered ${failedCalls.length} failed operation(s)`);
    }

    return summary.join('. ') + '.';
  }

  /**
   * Detects if the agent may have completed the user's request and should consider termination
   */
  private detectPotentialCompletion(toolCallHistory: ToolResult[], userPrompt: string): boolean {
    if (toolCallHistory.length === 0) return false;

    // Check for recent operations (both successful and failed)
    const recentCalls = toolCallHistory.slice(-5); // Look at last 5 calls
    const recentSuccessfulCalls = recentCalls.filter(call => call.success && call.toolName !== this.FINAL_TOOL_NAME);
    const recentFailedCalls = recentCalls.filter(call => !call.success && call.toolName !== 'run-failure');

    // Check for repeated tool calls (success or failure - both indicate potential loops)
    const allToolNameCounts = new Map<string, number>();
    recentCalls.forEach(call => {
      if (call.toolName !== this.FINAL_TOOL_NAME && call.toolName !== 'run-failure') {
        allToolNameCounts.set(call.toolName, (allToolNameCounts.get(call.toolName) || 0) + 1);
      }
    });

    // If any tool was called more than twice recently (success or failure), suggest termination
    const hasRepeatedCalls = Array.from(allToolNameCounts.values()).some(count => count > 2);

    // If we have multiple failed attempts of the same tool, suggest termination
    const failedToolCounts = new Map<string, number>();
    recentFailedCalls.forEach(call => {
      failedToolCounts.set(call.toolName, (failedToolCounts.get(call.toolName) || 0) + 1);
    });
    const hasRepeatedFailures = Array.from(failedToolCounts.values()).some(count => count >= 2);

    // If we have multiple successful operations in recent history, suggest considering termination
    const hasMultipleSuccesses = recentSuccessfulCalls.length >= 2;

    // Check if we've used most available tools (indicating thorough work)
    const usedToolNames = new Set(toolCallHistory.filter(call => call.success).map(call => call.toolName));
    const availableToolNames = this.tools.filter(tool => tool.name !== this.FINAL_TOOL_NAME).map(tool => tool.name);
    const toolUsageRatio = usedToolNames.size / Math.max(availableToolNames.length, 1);
    const hasUsedMostTools = toolUsageRatio > 0.6; // Used more than 60% of tools

    return hasRepeatedCalls || hasRepeatedFailures || (hasMultipleSuccesses && hasUsedMostTools);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async _executeTool(tool: Tool<ZodTypeAny>, call: PendingToolCall, turnState: TurnState): Promise<ToolResult> {
    await this.hooks.onToolCallStart?.(call);
    const toolTimeout = tool.timeout || this.toolTimeoutMs;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AgentError(`Tool '${tool.name}' exceeded timeout of ${toolTimeout}ms.`, AgentErrorType.TOOL_TIMEOUT_ERROR, { toolName: tool.name, timeout: toolTimeout })), toolTimeout)
    );
    let result: ToolResult;
    try {
      const validation = tool.argsSchema.safeParse(call);
      if (!validation.success) {
        throw new AgentError(`Invalid arguments for tool '${tool.name}': ${validation.error.message}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: tool.name, validationError: validation.error });
      }
      // The handler now returns the full ToolResult object directly.
      result = await Promise.race([
        tool.handler(tool.name, validation.data, turnState),
        timeoutPromise,
      ]);
    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(`An unexpected error occurred in tool '${tool.name}': ${String(error)}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: tool.name, originalError: error, call });
      result = this.createFailureResult(agentError);
    }

    await this.hooks.onToolCallEnd?.(result);
    return result;
  }


  private _addTool<T extends ZodTypeAny>(tool: Tool<T>): void {
    if (this.tools.some(t => t.name === tool.name)) throw new AgentError(`A tool with the name '${tool.name}' is already defined.`, AgentErrorType.DUPLICATE_TOOL_NAME, { toolName: tool.name });
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.name)) throw new AgentError(`Tool name '${tool.name}' must start with a letter or underscore and contain only letters, numbers, and underscores.`, AgentErrorType.INVALID_TOOL_NAME, { toolName: tool.name });
    if (!(tool.argsSchema instanceof ZodObject)) throw new AgentError(`The argsSchema for tool '${tool.name}' must be a Zod object (e.g., z.object({})).`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: tool.name });

    // Set default timeout if not provided
    const toolWithDefaults = {
      ...tool,
      timeout: tool.timeout || this.toolTimeoutMs,
      dependencies: tool.dependencies || []
    };

    this.tools.push(toolWithDefaults);
  }

  private addFinalTool(): void {
    if (!this.tools.some(t => t.name === this.FINAL_TOOL_NAME)) {
      this.defineTool((z) => ({
        name: this.FINAL_TOOL_NAME,
        description: `⚠️ CRITICAL: Call this tool to TERMINATE the execution and provide your final answer. Use when: (1) You have completed the user's request, (2) All necessary operations are done, (3) You can provide a complete response. (4) When something is beyond your capacity or unclear, seek additional clarification but do so carefully to avoid making the user feel burdened or frustrated. This tool ENDS the conversation - only call it when finished. NEVER call other tools after this one.`,
        argsSchema: z.object({
          value: z.string().describe("The final, complete answer summarizing what was accomplished and any results.")
        }),
        handler: async (name: string, args: { value: string; }, turnState: TurnState): Promise<ToolResult> => {
          return {
            toolName: name,
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
    this.logger.error(`[AgentLoop] Tool '${error.context?.toolName || 'unknown'}' failed: ${error.getUserMessage()}`);
    return {
      toolName: error.context?.toolName || 'unknown-tool-error',
      success: false,
      error: error.getUserMessage(),
      context: { errorType: error.type, originalError: error.message, ...error.context }
    };
  }
}