// AgentLoop.ts
import z, { ZodTypeAny, ZodObject, date } from 'zod';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { LLMDataHandler } from '../handlers/LLMDataHandler';
import { Logger } from '../utils/Logger';
import {
  ChatEntry, Tool, PendingToolCall,
  AgentRunInput, AgentRunOutput, FormatMode,
  FunctionCallingTool,
  ToolCall,
  Interaction,
  AgentResponse,
  ToolCallContext
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
  onPromptCreate?: (prompt: string) => Promise<string>; // Can modify the prompt
  onLLMStart?: (prompt: string) => Promise<void>;
  onLLMEnd?: (response: string) => Promise<void>;
  onToolCallStart?: (call: PendingToolCall) => Promise<void>;
  onToolCallEnd?: (result: ToolCall) => Promise<void>; // Replaces onToolCallSuccess and onToolCallFail
  onFinalAnswer?: (result: AgentResponse) => Promise<void>;
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
  formatMode?: FormatMode;
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
  protected max_tokens?: number;

  private readonly FINAL_TOOL_NAME = 'final';
  formatMode: FormatMode;


  constructor(provider: AIProvider, options: AgentLoopOptions = {}) {
    this.aiProvider = provider;
    this.llmDataHandler = new LLMDataHandler(options.formatMode || FormatMode.FUNCTION_CALLING);
    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations || 10;
    this.toolTimeoutMs = options.toolTimeoutMs || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.parallelExecution = options.parallelExecution ?? true;
    this.hooks = options.hooks || {};
    this.formatMode = options.formatMode || FormatMode.FUNCTION_CALLING;
    this.sleepBetweenIterationsMs = options.sleepBetweenIterationsMs || 2000;

    // Initialize prompt manager - will be properly set up in initializePromptManager
    this.promptManager = options.promptManager || new PromptManager(
      '',
      options.promptManagerConfig || this.getDefaultPromptManagerConfig(options.formatMode)
    );

    // Initialize stagnation detector
    this.stagnationDetector = new StagnationDetector(options.stagnationDetector);
  }

  /**
   * Get default prompt manager configuration based on execution mode
   */
  private getDefaultPromptManagerConfig(formatMode?: FormatMode): PromptManagerConfig {
    const responseFormat = formatMode === FormatMode.YAML_MODE
      ? ResponseFormat.YAML_MODE
      : ResponseFormat.FUNCTION_CALLING;

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
      const config = this.getDefaultPromptManagerConfig(this.formatMode);
      this.promptManager = new PromptManager(this.systemPrompt, config);
    }
  }

  /**
   * Runs a single turn of the agent's reasoning loop.
   * This method is stateless. It accepts the current state and returns the new state.
   */
  public async run(input: AgentRunInput): Promise<AgentRunOutput> {
    await this.hooks.onRunStart?.(input);

    const { userPrompt, context = {} } = input;



    const oldTasksInteractionHistory: Interaction[] = input.interactionHistory;
    const currentTaskInteractionList: Interaction[] = []


    const turnState = new TurnState();



    const stagnationTracker: string[] = [];
    let lastError: AgentError | null = null;
    let numRetries = 0;
    let keepRetry = true;

    const taskId = "my-task-id";

    try {
      this.initializePromptManager();
      this.addFinalTool();
      //this.logger.info(`[AgentLoop] Run started`);

      for (let i = 0; i < this.maxIterations; i++) {


        try {
          let prompt = this.constructPrompt(userPrompt, context, currentTaskInteractionList, oldTasksInteractionHistory, lastError, keepRetry);
          prompt = await this.hooks.onPromptCreate?.(prompt) ?? prompt;



          const llmResponse = await this.getLLMResponseWithRetry(prompt);
          const parsedToolCalls = this.llmDataHandler.parseAndValidate(llmResponse, this.tools);

          numRetries = 0; // Reset retries on successful LLM response

          // Check for stagnation before executing tools
          if (parsedToolCalls.length > 0) {
            for (const call of parsedToolCalls) {
              const stagnationResult = this.stagnationDetector.isStagnant(call, oldTasksInteractionHistory, i + 1);
              if (stagnationResult.isStagnant && stagnationResult.confidence > 0.7) {
                this.logger.warn(`[AgentLoop] Stagnation detected (${stagnationResult.confidence.toFixed(2)}): ${stagnationResult.reason}`);

                keepRetry = false;

                // Create stagnation warning result
                const stagnationWarning: ToolCall = {
                  taskId,
                  timestamp: Date.now().toString(),
                  type: 'tool_call',
                  context: {
                    //stagnationReason: stagnationResult.reason,
                    toolName: call.toolName,
                    error: `Stagnation detected: ${stagnationResult.reason}. ${stagnationResult.confidence >= 0.90 ? 'Forcing termination.' : 'Consider using the final tool.'}`,
                    success: false,
                    confidence: stagnationResult.confidence,
                    iteration: i + 1,
                    diagnostics: this.stagnationDetector.getDiagnostics(currentTaskInteractionList)
                  },
                };
                currentTaskInteractionList.push(stagnationWarning);

                // For very high confidence stagnation (>=90%), force termination
                if (stagnationResult.confidence >= 0.90) {
                  this.logger.error(`[AgentLoop] Critical stagnation detected. Forcing termination with final tool.`);

                  const forcedTermination: AgentResponse = {
                    taskId,
                    timestamp: Date.now().toString(),
                    context: {
                      success: true,
                      toolName: this.FINAL_TOOL_NAME,
                      value: `Task terminated due to critical stagnation: ${stagnationResult.reason}. The agent was repeating the same actions without making progress. Based on the work completed so far: ${this.summarizeProgress(oldTasksInteractionHistory)}`
                    },
                    type: 'agent_response'
                  };

                  currentTaskInteractionList.push(forcedTermination);
                  await this.hooks.onFinalAnswer?.(forcedTermination);

                  const output: AgentRunOutput = { interactionList: currentTaskInteractionList, finalAnswer: forcedTermination };
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
          const iterationResults = await this.executeToolCalls(taskId, parsedToolCalls, turnState);

          oldTasksInteractionHistory.push(...iterationResults)

          const failedTools = iterationResults.filter(r => !r.context.success);
          if (failedTools.length > 0) {
            const errorMessage = failedTools.map(f => `Tool: ${f.context.toolName}\n  Error: ${f.context?.error ?? 'Unknown error'}`).join('\n');
            throw new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });
          }

          lastError = null;
          const finalResult = iterationResults.find(r => r.context.toolName === this.FINAL_TOOL_NAME);
          if (finalResult) {

            const agentResponse: AgentResponse = {
              taskId,
              timestamp: finalResult.timestamp,
              type: "agent_response",
              context: finalResult.context

            }

            await this.hooks.onFinalAnswer?.(agentResponse);
            //this.logger.info(`[AgentLoop] Run complete. Final answer: ${finalResult.output?.value?.substring(0, 120)}`);
            const output: AgentRunOutput = { interactionList: oldTasksInteractionHistory, finalAnswer: agentResponse };
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
              currentTaskInteractionList.push(...agentError.context.failedTools);
            } else {
              const errResult = this.createFailureToolCallContext("unkown-error", agentError);
              currentTaskInteractionList.push({
                taskId,
                timestamp: Date.now().toString(),
                context: errResult,
                type: "tool_call"
              });
            }

            stagnationTracker.push(agentError.message);
            const toolRetryAmount = stagnationTracker.filter(st => st === agentError.message).length;
            if (toolRetryAmount > this.retryAttempts - 1) keepRetry = false;
            if (toolRetryAmount >= this.retryAttempts) {
              throw new AgentError(`Maximum retry attempts for the same tool error: ${agentError.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error: agentError });
            }
          } else {
            const errResult = this.createFailureToolCallContext(agentError.context.name ?? "unkown-tool", agentError);

            currentTaskInteractionList.push({
              taskId,
              timestamp: Date.now().toString(),
              context: errResult,
              type: "tool_call"
            })
            // Handle LLM or parsing errors
            if (numRetries >= this.retryAttempts) {
              throw new AgentError(`Maximum retry attempts for LLM response error: ${agentError.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error: agentError });
            }
            numRetries++;
          }
        } finally {
          if (i < this.maxIterations - 1) { // Don't wait after the last iteration
            await this.sleep(this.sleepBetweenIterationsMs);
          }
        }
      }

      throw new AgentError("Maximum iterations reached", AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt });
    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { originalError: error, userPrompt });
      await this.hooks.onError?.(agentError);
      const failureResult: ToolCall = {
        taskId,
        type: "tool_call",
        timestamp: Date.now().toString(),
        context: {
          toolName: agentError.context?.toolName || 'run-failure',
          success: false,
          error: agentError.getUserMessage(),
          errorType: agentError.type, originalError: agentError.message, ...agentError.context
        }
      };
      currentTaskInteractionList.push(failureResult); // Ensure final failure is logged
      const output: AgentRunOutput = { interactionList: currentTaskInteractionList, finalAnswer: undefined };
      await this.hooks.onRunEnd?.(output);
      return output;
    }

  }

  private async executeToolCalls(taskId: string, toolCalls: PendingToolCall[], turnState: TurnState): Promise<ToolCall[]> {
    const iterationResults: ToolCall[] = []; // Collect results for this iteration to return

    if (this.parallelExecution) {
      const results = await this.executeToolCallsWithDependencies(taskId, toolCalls, turnState);
      iterationResults.push(...results);
    } else {
      // Sequential execution
      for (const call of toolCalls) {
        //this.logger.info(`[AgentLoop] Executing tool: ${call.name}`);
        const tool = this.tools.find(t => t.name === call.toolName);
        if (!tool) {
          const err = new AgentError(`Tool '${call.toolName}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolName: call.toolName });
          const result = this.createFailureToolCallContext(call.toolName, err);
          const resultToolCall: ToolCall = {
            type: "tool_call",
            taskId,
            timestamp: Date.now().toString(),
            context: result
          }

          iterationResults.push(resultToolCall);
          await this.hooks.onToolCallEnd?.(resultToolCall);
          break;
        }
        const result = await this._executeTool(taskId, tool, call, turnState);
        iterationResults.push(result);
        if (!result.context.success) break; // Stop on first failure in sequential mode
      }
    }
    return iterationResults;
  }



  private async executeToolCallsWithDependencies(taskId: string, toolCalls: PendingToolCall[], turnState: TurnState): Promise<ToolCall[]> {
    const iterationResults: ToolCall[] = []; // Collect results for this iteration to return

    const validToolCalls = toolCalls.filter(call => {
      if (!this.tools.some(t => t.name === call.toolName)) {
        const error = new AgentError(`Tool '${call.toolName}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolName: call.toolName });
        const result = this.createFailureToolCallContext(call.toolName, error);
        iterationResults.push({
          timestamp: Date.now().toString(),
          taskId,
          type: "tool_call",
          context: result
        });
        return false;
      }
      return true;
    });

    if (validToolCalls.length === 0) return iterationResults;

    const circularDeps = this.detectCircularDependencies(validToolCalls, this.tools);
    if (circularDeps.length > 0) {
      const error = new AgentError(`Circular dependencies detected: ${circularDeps.join(' -> ')}`, AgentErrorType.TOOL_EXECUTION_ERROR, { circularDependencies: circularDeps });
      const result = this.createFailureToolCallContext("unkown-tool", error);
      iterationResults.push({
        taskId,
        timestamp: Date.now().toString(),
        type: "tool_call",
        context: result
      });
      return iterationResults;
    }

    const { pending, dependents, ready } = this.buildDependencyGraph(validToolCalls);
    const executed = new Map<string, Promise<void>>();

    const propagateFailure = (failedToolName: string, chain: string[]) => {
      const directDependents = dependents.get(failedToolName) || [];
      for (const dependentName of directDependents) {
        if (chain.includes(dependentName) || iterationResults.some(r => r.context.toolName === dependentName)) continue;
        const result = this.createFailureToolCallContext(failedToolName, new AgentError(`Skipped due to failure in dependency: '${failedToolName}'`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: dependentName, failedDependency: failedToolName }));
        iterationResults.push({
          taskId,
          timestamp: Date.now().toString(),
          context: result,
          type: "tool_call"
        });
        propagateFailure(dependentName, [...chain, dependentName]);
      }
    };

    const execute = async (toolName: string): Promise<void> => {
      //this.logger.info(`[AgentLoop] Executing tool: ${toolName}`);
      const tool = this.tools.find(t => t.name === toolName)!;
      const callsForTool = validToolCalls.filter(t => t.toolName === toolName);

      try {
        // Execute all calls for this specific tool concurrently
        const results = await Promise.all(callsForTool.map(call => this._executeTool(taskId, tool, call, turnState)));
        iterationResults.push(...results); // Add results to the iteration's collection
        if (results.some(r => !r.context.success)) throw new Error(`One or more executions of tool '${toolName}' failed.`);
      } catch (error) {
        const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { toolName });
        // If results haven't been pushed by _executeTool (e.g., if Promise.all failed early)
        if (!iterationResults.some(r => r.context.toolName === toolName)) {
          const failureResult = this.createFailureToolCallContext(toolName, agentError);
          iterationResults.push({
            taskId,
            timestamp: Date.now().toString(),
            context: failureResult,
            type: 'tool_call'
          });
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
    const callNames = new Set(toolCalls.map(c => c.toolName));
    toolCalls.forEach(call => {
      const tool = this.tools.find(t => t.name === call.toolName)!;
      const validDeps = (tool.dependencies || []).filter(dep => callNames.has(dep));
      pending.set(call.toolName, new Set(validDeps));
      validDeps.forEach(dep => {
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(call.toolName);
      });
    });
    const ready = toolCalls.map(c => c.toolName).filter(name => (pending.get(name)?.size || 0) === 0);
    return { pending, dependents, ready: [...new Set(ready)] };
  }

  private detectCircularDependencies(toolCalls: PendingToolCall[], toolList: Tool<ZodTypeAny>[]): string[] {
    const callNames = new Set(toolCalls.map(call => call.toolName));
    const adjList = new Map<string, string[]>();

    for (const call of toolCalls) {
      const tool = toolList.find(t => t.name === call.toolName);
      const deps = (tool?.dependencies || []).filter(dep => callNames.has(dep));
      adjList.set(call.toolName, deps);
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
      if (!visited.has(call.toolName)) {
        const cycle = dfs(call.toolName, []);
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

        let functionTools: FunctionCallingTool[] | undefined = undefined;
        if (this.formatMode === FormatMode.FUNCTION_CALLING) {
          functionTools = this.llmDataHandler.formatToolDefinitions(this.tools) as FunctionCallingTool[];
        }

        const response = await this.aiProvider.getCompletion(prompt, functionTools, options);
        if (typeof response !== "string") {
          throw new AgentError(
            "LLM provider returned undefined or non-string response.",
            AgentErrorType.INVALID_RESPONSE,
            { responseType: typeof response, expectedType: 'string' }
          );
        }
        await this.hooks.onLLMEnd?.(response);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`[AgentLoop] LLM retry ${attempt + 1}: ${lastError.message}`);
        if (attempt < this.retryAttempts - 1) await this.sleep(this.retryDelay * Math.pow(2, attempt));
      }
    }
    throw lastError ?? new AgentError(
      "LLM call failed after all retry attempts.",
      AgentErrorType.UNKNOWN,
      { retryAttempts: this.retryAttempts }
    );
  }


  private constructPrompt(userPrompt: string, context: Record<string, any>, oldTasksinteractionHistory: Interaction[], currentTaskInteractionHistory: Interaction[], lastError: AgentError | null, keepRetry: boolean): string {
    const toolDefinitions = this.llmDataHandler.formatToolDefinitions(this.tools);

    const toolDef = typeof toolDefinitions === "string" ? toolDefinitions : this.tools.map(e => (`## ToolName: ${e.name}\n## ToolDescription: ${e.description}`)).join('\n\n')
    // Build the prompt using the clean PromptManager API

    let prompt = this.promptManager.buildPrompt(
      userPrompt,
      context,
      oldTasksinteractionHistory,
      currentTaskInteractionHistory,
      lastError,
      keepRetry,
      this.FINAL_TOOL_NAME,
      toolDef
    );

    return prompt;
  }

  /**
   * Summarizes the progress made so far for forced termination scenarios
   */
  private summarizeProgress(currentTaskInteractionList: Interaction[]): string {
    const successfulCalls = currentTaskInteractionList.filter(r => r.context.success && r.context.toolName !== this.FINAL_TOOL_NAME && r.context.toolName !== 'stagnation-detector');
    const failedCalls = currentTaskInteractionList.filter(r => !r.context.success && r.context.toolName !== 'stagnation-detector' && r.context.toolName !== 'run-failure');

    if (successfulCalls.length === 0 && failedCalls.length === 0) {
      return "No significant progress was made.";
    }

    const summary = [];
    if (successfulCalls.length > 0) {
      const toolCounts = new Map<string, number>();
      successfulCalls.forEach(call => {
        toolCounts.set(call.context.toolName, (toolCounts.get(call.context.toolName) || 0) + 1);
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


  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async _executeTool(taskId: string, tool: Tool<ZodTypeAny>, call: PendingToolCall, turnState: TurnState): Promise<ToolCall> {
    await this.hooks.onToolCallStart?.(call);
    const toolTimeout = tool.timeout || this.toolTimeoutMs;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AgentError(`Tool '${tool.name}' exceeded timeout of ${toolTimeout}ms.`, AgentErrorType.TOOL_TIMEOUT_ERROR, { toolName: tool.name, timeout: toolTimeout })), toolTimeout)
    );
    let result: ToolCall;
    try {
      const validation = tool.argsSchema.safeParse(call);
      if (!validation.success) {
        throw new AgentError(`Invalid arguments for tool '${tool.name}': ${validation.error.message}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: tool.name, validationError: validation.error });
      }
      // The handler now returns the full ToolResult object directly.
      const toolCallContext = await Promise.race([
        tool.handler(tool.name, validation.data, turnState),
        timeoutPromise,
      ]);


      result = {
        type: "tool_call",
        taskId,
        timestamp: Date.now().toString(),
        context: toolCallContext
      }

    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(`An unexpected error occurred in tool '${tool.name}': ${String(error)}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: tool.name, originalError: error, call });
      const errCtx = this.createFailureToolCallContext(tool.name, agentError);
      result = {
        type: "tool_call",
        taskId,
        timestamp: Date.now().toString(),
        context: errCtx
      }
    }

    await this.hooks.onToolCallEnd?.(result);
    return result;
  }


  private _addTool<T extends ZodTypeAny>(tool: Tool<T>): void {
    if (this.tools.some(t => t.name === tool.name)) {
      throw new AgentError(
        `A tool with the name '${tool.name}' is already defined.`,
        AgentErrorType.DUPLICATE_TOOL_NAME,
        { toolName: tool.name, existingTools: this.tools.map(t => t.name) }
      );
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.name)) {
      throw new AgentError(
        `Tool name '${tool.name}' must start with a letter or underscore and contain only letters, numbers, and underscores.`,
        AgentErrorType.INVALID_TOOL_NAME,
        { toolName: tool.name, validPattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' }
      );
    }
    if (!(tool.argsSchema instanceof ZodObject)) {
      throw new AgentError(
        `The argsSchema for tool '${tool.name}' must be a Zod object (e.g., z.object({})).`,
        AgentErrorType.CONFIGURATION_ERROR,
        { toolName: tool.name, receivedSchemaType: typeof tool.argsSchema }
      );
    }

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
        handler: async (name: string, args: { value: string; }, turnState: TurnState): Promise<ToolCallContext> => {
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
  private createFailureToolCallContext(toolName: string, error: AgentError): ToolCallContext {
    this.logger.error(`[AgentLoop] Tool '${error.context?.toolName || 'unknown'}' failed: ${error.getUserMessage()}`);
    return {
      toolName: toolName,
      success: false,
      error: error.getUserMessage(),
      context: { errorType: error.type, originalError: error.message, ...error.context }
    };
  }
}