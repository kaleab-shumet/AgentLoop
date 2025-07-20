// AgentLoop.ts
import z, { ZodTypeAny, ZodObject } from 'zod';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { AIDataHandler } from '../handlers/AIDataHandler';
import { Logger } from '../utils/Logger';
import {
  Tool, PendingToolCall,
  AgentRunInput, AgentRunOutput, FormatMode,
  FunctionCallTool,
  ToolCall,
  Interaction,
  AgentResponse,
  ToolCallContext,
  HandlerParams,
  UserPrompt
} from '../types/types';
import { AIProvider } from '../providers/AIProvider';
import { TurnState } from './TurnState';
import { PromptManager, PromptManagerConfig, FormatType } from '../prompt/PromptManager';
import { StagnationDetector, StagnationDetectorConfig } from '../utils/StagnationDetector';




/**
 * Defines the signature for all lifecycle hooks available in the AgentLoop.
 * These hooks allow for observing and interacting with the agent's execution process.
 */
export interface AgentLifecycleHooks {
  onRunStart?: (input: AgentRunInput) => Promise<void>;
  onRunEnd?: (output: AgentRunOutput) => Promise<void>;
  onPromptCreate?: (prompt: string) => Promise<string>; // Can modify the prompt
  onAIRequestStart?: (prompt: string) => Promise<void>;
  onAIRequestEnd?: (response: string) => Promise<void>;
  onToolCallStart?: (call: PendingToolCall) => Promise<void>;
  onToolCallEnd?: (result: ToolCall) => Promise<void>; // Replaces onToolCallSuccess and onToolCallFail
  onAgentFinalResponse?: (result: AgentResponse) => Promise<void>;
  onError?: (error: AgentError) => Promise<void>;
}

export type OutcomeRecord = {args: PendingToolCall, toolCall: ToolCall};

export enum FailureHandlingMode {
  FAIL_FAST = 'fail_fast',           // Stop on first failure (current sequential behavior)
  FAIL_AT_END = 'fail_at_end',       // Execute all, then fail if any failed (current parallel behavior)
  CONTINUE_ON_FAILURE = 'continue',   // Continue execution, report failures but don't throw
  PARTIAL_SUCCESS = 'partial'         // Allow some failures based on tolerance threshold
}

export interface AgentLoopOptions {
  parallelExecution?: boolean;
  failureHandlingMode?: FailureHandlingMode;
  failureTolerance?: number;          // 0.0-1.0, percentage of tools that can fail in partial mode
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
  protected logger!: Logger;
  protected maxIterations!: number;
  protected toolTimeoutMs!: number;
  protected retryAttempts!: number;
  protected retryDelay!: number;
  protected parallelExecution!: boolean;
  protected failureHandlingMode!: FailureHandlingMode;
  protected failureTolerance!: number;
  protected hooks!: AgentLifecycleHooks;
  protected sleepBetweenIterationsMs!: number;

  protected abstract systemPrompt: string;
  public tools: Tool<ZodTypeAny>[] = [];
  protected aiProvider: AIProvider;
  protected aiDataHandler: AIDataHandler;
  protected promptManager!: PromptManager;
  protected stagnationDetector!: StagnationDetector;

  protected temperature?: number;
  protected max_tokens?: number;

  private readonly FINAL_TOOL_NAME = 'final';
  formatMode!: FormatMode;


  constructor(provider: AIProvider, options: AgentLoopOptions = {}) {
    this.aiProvider = provider;
    this.aiDataHandler = new AIDataHandler(options.formatMode || FormatMode.FUNCTION_CALLING);
    // Use the setter to initialize all options and defaults
    this.setAgentLoopOptions(options);
  }

  /**
   * Updates the AgentLoop's options after construction.
   * Only provided options will be updated; others remain unchanged.
   */
  public setAgentLoopOptions(options: AgentLoopOptions): void {
    this.logger = options.logger || console;
    this.maxIterations = options.maxIterations !== undefined ? options.maxIterations : 100;
    this.toolTimeoutMs = options.toolTimeoutMs !== undefined ? options.toolTimeoutMs : 30000;
    this.retryAttempts = options.retryAttempts !== undefined ? options.retryAttempts : 3;
    this.retryDelay = options.retryDelay !== undefined ? options.retryDelay : 1000;
    this.parallelExecution = options.parallelExecution !== undefined ? options.parallelExecution : true;
    this.failureHandlingMode = options.failureHandlingMode || (this.parallelExecution ? FailureHandlingMode.FAIL_AT_END : FailureHandlingMode.FAIL_FAST);
    this.failureTolerance = options.failureTolerance !== undefined ? options.failureTolerance : 0.0;
    this.hooks = options.hooks || {};
    this.formatMode = options.formatMode || FormatMode.FUNCTION_CALLING;
    this.sleepBetweenIterationsMs = options.sleepBetweenIterationsMs !== undefined ? options.sleepBetweenIterationsMs : 2000;

    // Update promptManager if provided, or update config if promptManagerConfig/formatMode changes
    if (options.promptManager) {
      this.promptManager = options.promptManager;
    } else if (options.promptManagerConfig || options.formatMode) {
      const config = options.promptManagerConfig || this.getDefaultPromptManagerConfig(options.formatMode || this.formatMode);
      this.promptManager = new PromptManager(this.systemPrompt, config);
    } else if (!this.promptManager) {
      // If promptManager is still not set, set a default
      this.promptManager = new PromptManager('', this.getDefaultPromptManagerConfig(this.formatMode));
    }

    // Update stagnationDetector if config provided
    if (options.stagnationDetector) {
      this.stagnationDetector = new StagnationDetector(options.stagnationDetector);
    } else if (!this.stagnationDetector) {
      this.stagnationDetector = new StagnationDetector();
    }
  }

  /**
   * Get default prompt manager configuration based on execution mode
   */
  private getDefaultPromptManagerConfig(formatMode?: FormatMode): PromptManagerConfig {
    const responseFormat = formatMode === FormatMode.YAML
      ? FormatType.YAML
      : FormatType.FUNCTION_CALLING;

    return {
      responseFormat,
      promptOptions: {
        includeContext: true,
        includePreviousTaskHistory: true,
        maxPreviousTaskEntries: 50,
        parallelExecution: this.parallelExecution
      }
    };
  }

  /**
   * Defines a tool for the agent to use.
   * @param fn A function that returns a tool definition object.
   */
  protected defineTool(fn: (schema: typeof z) => any): void {
    const toolDefinition = fn(z);
    this._addTool(toolDefinition);
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



    const currentInteractionHistory: Interaction[] = []

    const turnState = new TurnState();



    const errorTracker = new Map<string, { count: number, lastSeen: number, errorHash: string }>();
    let lastError: AgentError | null = null;
    let numRetries = 0;
    let keepRetry = true;

    const taskId = nanoid();

    const userPromptInteraction: UserPrompt = {
      taskId,
      timestamp: Date.now().toString(),
      type: "user_prompt",
      context: userPrompt
    }

    currentInteractionHistory.push(userPromptInteraction)

    const stagnationTracker: OutcomeRecord[] = []

    const saveStagnationRecord = (outcomeRecord: OutcomeRecord) => stagnationTracker.push(outcomeRecord)

    try {
      this.initializePromptManager();
      this.initializeFinalTool();
      //this.logger.info(`[AgentLoop] Run started`);

      for (let i = 0; i < this.maxIterations; i++) {


        try {
          let prompt = this.constructPrompt(userPrompt, context, currentInteractionHistory, input.prevInteractionHistory, lastError, keepRetry);
          prompt = await this.hooks.onPromptCreate?.(prompt) ?? prompt;



          const aiResponse = await this.getAIResponseWithRetry(prompt);
          const parsedToolCalls = this.aiDataHandler.parseAndValidate(aiResponse, this.tools);

          numRetries = 0; // Reset retries on successful LLM response

          // executeToolCalls now directly adds results to toolCallHistory
          const iterationResults = await this.executeToolCalls(taskId, parsedToolCalls, turnState, saveStagnationRecord);

          currentInteractionHistory.push(...iterationResults.filter(r => (r.context.toolName !== this.FINAL_TOOL_NAME)))


          // Enhanced stagnation detection using outcome data
          if (stagnationTracker.length > 0) {
            const stagnationResult = this.stagnationDetector.detectStagnationFromOutcomes(stagnationTracker, i + 1);
            if (stagnationResult.isStagnant && stagnationResult.confidence > 0.7) {
              this.logger.warn(`[AgentLoop] Stagnation detected (${stagnationResult.confidence.toFixed(2)}): ${stagnationResult.reason}`);
              
              if (stagnationResult.patterns && stagnationResult.patterns.length > 1) {
                this.logger.warn(`[AgentLoop] Multiple stagnation patterns: ${stagnationResult.patterns.join('; ')}`);
              }

              keepRetry = false;

              // Create enhanced stagnation warning result
              const stagnationWarning: ToolCall = {
                taskId,
                timestamp: Date.now().toString(),
                type: 'tool_call',
                context: {
                  stagnationReason: stagnationResult.reason,
                  toolName: 'stagnation-detector',
                  error: `Stagnation detected: ${stagnationResult.reason}. ${stagnationResult.confidence >= 0.90 ? 'Forcing termination.' : 'Consider using the final tool.'}`,
                  success: false,
                  confidence: stagnationResult.confidence,
                  iteration: i + 1,
                  patterns: stagnationResult.patterns,
                  diagnostics: this.stagnationDetector.getDiagnostics(currentInteractionHistory),
                  outcomeCount: stagnationTracker.length
                },
              };
              currentInteractionHistory.push(stagnationWarning);

              // For very high confidence stagnation (>=90%), force termination
              if (stagnationResult.confidence >= 0.90) {
                this.logger.error(`[AgentLoop] Critical stagnation detected. Forcing termination with final tool.`);

                const forcedTermination: AgentResponse = {
                  taskId,
                  timestamp: Date.now().toString(),
                  context: {
                    success: true,
                    toolName: this.FINAL_TOOL_NAME,
                    output: `Task terminated due to critical stagnation: ${stagnationResult.reason}. The agent was repeating the same actions without making progress. Based on the work completed so far: ${this.summarizeProgress(currentInteractionHistory)}`
                  },
                  type: 'agent_response'
                };

                currentInteractionHistory.push(forcedTermination);
                await this.hooks.onAgentFinalResponse?.(forcedTermination);

                const output: AgentRunOutput = { interactionHistory: currentInteractionHistory, agentResponse: forcedTermination };
                await this.hooks.onRunEnd?.(output);
                return output;
              }

              // For high confidence stagnation (70-89%), set error context but continue
              lastError = new AgentError(
                `Stagnation detected: ${stagnationResult.reason}. Consider using an alternative approach to complete the task and avoid potential loops.`,
                AgentErrorType.TOOL_EXECUTION_ERROR,
                { stagnation: stagnationResult, patterns: stagnationResult.patterns }
              );
            }
          }

          // Apply failure handling mode
          const failedTools = iterationResults.filter(r => !r.context.success);
          const shouldThrowError = this.shouldThrowForFailures(failedTools, iterationResults);

          if (shouldThrowError) {
            const errorMessage = failedTools.map(f => `Tool: ${f.context.toolName}\n  Error: ${f.context?.error ?? 'Unknown error'}`).join('\n');
            throw new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });
          } else if (failedTools.length > 0) {
            // Log failures but continue execution
            this.logger.warn(`[AgentLoop] ${failedTools.length} tool(s) failed but continuing due to failure handling mode: ${this.failureHandlingMode}`);
          }

          lastError = null;
          const finalResult: ToolCall | undefined = iterationResults.find(r => r.context.toolName === this.FINAL_TOOL_NAME);
          if (finalResult) {

            const agentResponse: AgentResponse = {
              taskId,
              timestamp: finalResult.timestamp,
              type: "agent_response",
              context: finalResult.context

            }

            currentInteractionHistory.push(agentResponse)

            await this.hooks.onAgentFinalResponse?.(agentResponse);
            //this.logger.info(`[AgentLoop] Run complete. Final answer: ${finalResult.output?.value?.substring(0, 120)}`);
            const output: AgentRunOutput = { interactionHistory: currentInteractionHistory, agentResponse };
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
              currentInteractionHistory.push(...agentError.context.failedTools);
            } else {
              const errResult = this.createFailureToolCallContext("unknown-error", agentError);
              currentInteractionHistory.push({
                taskId,
                timestamp: Date.now().toString(),
                context: errResult,
                type: "tool_call"
              });
            }

            // Create unique error identifier including tool name and error type
            const errorKey = `${agentError.context?.toolName || 'unknown'}:${agentError.type}:${agentError.message}`;
            const errorHash = createHash('md5').update(errorKey).digest('hex').substring(0, 8);

            const now = Date.now();
            const existing = errorTracker.get(errorHash);

            if (existing) {
              existing.count++;
              existing.lastSeen = now;
            } else {
              errorTracker.set(errorHash, { count: 1, lastSeen: now, errorHash });
            }

            const retryCount = existing ? existing.count : 1;

            // Clean up old error tracking (errors older than 5 minutes)
            const fiveMinutesAgo = now - 5 * 60 * 1000;
            for (const [hash, tracker] of errorTracker.entries()) {
              if (tracker.lastSeen < fiveMinutesAgo) {
                errorTracker.delete(hash);
              }
            }

            if (retryCount > this.retryAttempts - 1) keepRetry = false;
            if (retryCount >= this.retryAttempts) {
              throw new AgentError(`Maximum retry attempts (${this.retryAttempts}) reached for error: ${agentError.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error: agentError, retryCount });
            }
          } else {
            const errResult = this.createFailureToolCallContext(agentError.context?.toolName ?? "unknown-tool", agentError);

            currentInteractionHistory.push({
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
          errorType: agentError.type,
          originalError: agentError.message,
          ...(agentError.context || {})
        }
      };
      currentInteractionHistory.push(failureResult); // Ensure final failure is logged

      // Create a final answer for error cases
      const agentResponse: AgentResponse = {
        taskId,
        type: "agent_response",
        timestamp: Date.now().toString(),
        context: {
          success: false,
          error: agentError.getUserMessage(),
          errorType: agentError.type
        }
      };

      const output: AgentRunOutput = { interactionHistory: currentInteractionHistory, agentResponse: agentResponse };
      await this.hooks.onRunEnd?.(output);
      return output;
    }

  }

  private async executeToolCalls(taskId: string, toolCalls: PendingToolCall[], turnState: TurnState, saveStagnationRecord: (outcomeRecord: OutcomeRecord) => void): Promise<ToolCall[]> {
    const iterationResults: ToolCall[] = []; // Collect results for this iteration to return

    if (this.parallelExecution) {
      const results = await this.executeToolCallsWithDependencies(taskId, toolCalls, turnState, saveStagnationRecord);
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
        const result = await this._executeTool(taskId, tool, call, turnState, saveStagnationRecord);
        iterationResults.push(result);

        // Apply failure handling mode for sequential execution
        if (!result.context.success && this.failureHandlingMode === FailureHandlingMode.FAIL_FAST) {
          break; // Stop on first failure only in FAIL_FAST mode
        }
      }
    }
    return iterationResults;
  }



  private async executeToolCallsWithDependencies(taskId: string, toolCalls: PendingToolCall[], turnState: TurnState, saveStagnationRecord: (outcomeRecord: OutcomeRecord) => void): Promise<ToolCall[]> {
    const iterationResults: ToolCall[] = []; // Collect results for this iteration to return
    const executionLock = new Map<string, boolean>(); // Prevent race conditions in dependency triggering

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

    const triggerDependents = (toolName: string) => {
      const nextTools = dependents.get(toolName) || [];
      for (const next of nextTools) {
        pending.get(next)?.delete(toolName);
        if (pending.get(next)?.size === 0 && !executionLock.get(next) && !executed.has(next)) {
          executionLock.set(next, true);
          executed.set(next, execute(next));
        }
      }
    };

    const execute = async (toolName: string): Promise<void> => {
      //this.logger.info(`[AgentLoop] Executing tool: ${toolName}`);
      const tool = this.tools.find(t => t.name === toolName)!;
      const callsForTool = validToolCalls.filter(t => t.toolName === toolName);

      try {
        // Execute all calls for this specific tool concurrently
        const results = await Promise.all(callsForTool.map(call => this._executeTool(taskId, tool, call, turnState, saveStagnationRecord)));

        // Thread-safe result addition - push each result individually to avoid race conditions
        for (const result of results) {
          iterationResults.push(result);
        }

        if (results.some(r => !r.context.success)) throw new Error(`One or more executions of tool '${toolName}' failed.`);
      } catch (error) {
        const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { toolName });

        // Check if any results were already added before the error
        const existingResults = iterationResults.filter(r => r.context.toolName === toolName);
        if (existingResults.length === 0) {
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
        // Use synchronized dependency triggering to prevent race conditions
        triggerDependents(toolName);
      }
    };

    // Initialize execution locks
    for (const call of validToolCalls) {
      executionLock.set(call.toolName, false);
    }

    for (const toolName of ready) {
      executionLock.set(toolName, true);
      executed.set(toolName, execute(toolName));
    }
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
    return { pending, dependents, ready: Array.from(new Set(ready)) };
  }

  public detectCircularDependencies(tools: Tool<ZodTypeAny>[]): string[] {
    const adjList = new Map<string, string[]>();

    // Build adjacency list from tool dependencies
    for (const tool of tools) {
      const deps = tool.dependencies || [];
      adjList.set(tool.name, deps);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (toolName: string, path: string[]): string[] | null => {
      visited.add(toolName);
      recursionStack.add(toolName);
      path.push(toolName);
      const neighbors = adjList.get(toolName) || [];
      for (const neighbor of neighbors) {
        // Only check dependencies that exist in the tool list
        if (!adjList.has(neighbor)) continue;
        
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

    for (const tool of tools) {
      if (!visited.has(tool.name)) {
        const cycle = dfs(tool.name, []);
        if (cycle) return cycle;
      }
    }
    return [];
  }


  private async getAIResponseWithRetry(prompt: string, options = {}): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        await this.hooks.onAIRequestStart?.(prompt);

        let functionTools: FunctionCallTool[] | undefined = undefined;
        if (this.formatMode === FormatMode.FUNCTION_CALLING) {
          functionTools = this.aiDataHandler.formatToolDefinitions(this.tools) as FunctionCallTool[];
        }

        const response = await this.aiProvider.getCompletion(prompt, functionTools, options);
        if (typeof response !== "string") {
          throw new AgentError(
            "AI provider returned undefined or non-string response.",
            AgentErrorType.INVALID_RESPONSE,
            { responseType: typeof response, expectedType: 'string' }
          );
        }
        await this.hooks.onAIRequestEnd?.(response);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`[AgentLoop] AI retry ${attempt + 1}: ${lastError.message}`);
        if (attempt < this.retryAttempts - 1) await this.sleep(this.retryDelay * Math.pow(2, attempt));
      }
    }
    throw lastError ?? new AgentError(
      "LLM call failed after all retry attempts.",
      AgentErrorType.UNKNOWN,
      { retryAttempts: this.retryAttempts }
    );
  }


  private constructPrompt(userPrompt: string, context: Record<string, any>, currentInteractionHistory: Interaction[], previousTaskHistory: Interaction[], lastError: AgentError | null, keepRetry: boolean): string {
    const toolDefinitions = this.aiDataHandler.formatToolDefinitions(this.tools);

    const toolDef = typeof toolDefinitions === "string" ? toolDefinitions : this.tools.map(e => (`## ToolName: ${e.name}\n## ToolDescription: ${e.description}`)).join('\n\n')
    // Build the prompt using the clean PromptManager API

    let prompt = this.promptManager.buildPrompt(
      userPrompt,
      context,
      currentInteractionHistory,
      previousTaskHistory,
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
  private summarizeProgress(currentInteractionHistory: Interaction[]): string {
    const successfulCalls = currentInteractionHistory.filter(r => r.context.success && r.context.toolName !== this.FINAL_TOOL_NAME && r.context.toolName !== 'stagnation-detector');
    const failedCalls = currentInteractionHistory.filter(r => !r.context.success && r.context.toolName !== 'stagnation-detector' && r.context.toolName !== 'run-failure');

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

  private async _executeTool(taskId: string, tool: Tool<ZodTypeAny>, call: PendingToolCall, turnState: TurnState, saveStagnationRecord: (outcomeRecord: OutcomeRecord) => void): Promise<ToolCall> {
    await this.hooks.onToolCallStart?.(call);
    const toolTimeout = tool.timeout || this.toolTimeoutMs;

    // Create cancellable timeout
    let timeoutId;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() =>
        reject(new AgentError(`Tool '${tool.name}' exceeded timeout of ${toolTimeout}ms.`, AgentErrorType.TOOL_TIMEOUT_ERROR, { toolName: tool.name, timeout: toolTimeout })),
        toolTimeout
      );
    });

    let result: ToolCall;
    try {
      // The handler now returns the full ToolResult object directly.
      const toolCallContext = await Promise.race([
        tool.handler({ name: tool.name, args: call, turnState }),
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
    } finally {
      // Clean up timeout to prevent memory leaks
      if (timeoutId!) {
        clearTimeout(timeoutId);
      }
    }

    saveStagnationRecord({args: call, toolCall: result})

    await this.hooks.onToolCallEnd?.(result);
    return result;
  }


  /**
   * Validates a tool definition for correctness and checks for circular dependencies
   */
  public validateToolDefinition(tool: Tool<ZodTypeAny>): { isValid: boolean; errors: string[]; circularDependencies: string[] } {
    const errors: string[] = [];
    let circularDependencies: string[] = [];

    // Check for duplicate tool names
    if (this.tools.some(t => t.name === tool.name)) {
      errors.push(`A tool with the name '${tool.name}' is already defined.`);
    }

    // Validate tool name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.name)) {
      errors.push(`Tool name '${tool.name}' must start with a letter or underscore and contain only letters, numbers, and underscores.`);
    }

    // Validate schema type
    if (!(tool.argsSchema instanceof ZodObject)) {
      errors.push(`The argsSchema for tool '${tool.name}' must be a Zod object (e.g., z.object({})).`);
    }

    // Validate timeout
    const toolTimeout = tool.timeout || this.toolTimeoutMs;
    if (toolTimeout > this.toolTimeoutMs) {
      errors.push(`Tool '${tool.name}' timeout (${toolTimeout}ms) exceeds global timeout (${this.toolTimeoutMs}ms).`);
    }

    // Check for circular dependencies by creating a temporary tool list with the new tool
    const tempTools = [...this.tools, tool];
    circularDependencies = this.detectCircularDependencies(tempTools);

    return {
      isValid: errors.length === 0 && circularDependencies.length === 0,
      errors,
      circularDependencies
    };
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

    // Validate timeout - tool timeout cannot exceed global timeout
    const toolTimeout = tool.timeout || this.toolTimeoutMs;
    if (toolTimeout > this.toolTimeoutMs) {
      this.logger.warn(`[AgentLoop] Tool '${tool.name}' timeout (${toolTimeout}ms) exceeds global timeout (${this.toolTimeoutMs}ms). Using global timeout.`);
    }

    // Set default timeout if not provided and ensure it doesn't exceed global timeout
    const toolWithDefaults = {
      ...tool,
      timeout: Math.min(toolTimeout, this.toolTimeoutMs),
      dependencies: tool.dependencies || []
    };

    this.tools.push(toolWithDefaults);
  }

  private initializeFinalTool(): void {
    if (!this.tools.some(t => t.name === this.FINAL_TOOL_NAME)) {
      this.defineTool((z) => ({
        name: this.FINAL_TOOL_NAME,
        description: `Call this tool to provide your final answer when the task is complete. Use when: (1) You have completed the user's request, (2) All necessary operations are done, (3) You can provide a complete response, or (4) You need to explain why the task cannot be completed. This tool ends the conversation.`,
        argsSchema: z.object({
          value: z.string().describe("The final, complete answer summarizing what was accomplished and any results.")
        }),
        handler: async ({ name, args, turnState }: HandlerParams<ZodTypeAny>): Promise<ToolCallContext> => {
          return {
            toolName: name,
            success: true,
            ...args,
          };
        },
      }));
    }
  }

  public getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

  /**
   * Determines if execution should throw an error based on failure handling mode
   */
  private shouldThrowForFailures(failedTools: ToolCall[], allResults: ToolCall[]): boolean {
    if (failedTools.length === 0) return false;

    switch (this.failureHandlingMode) {
      case FailureHandlingMode.FAIL_FAST:
        return true; // Always throw on any failure

      case FailureHandlingMode.FAIL_AT_END:
        return true; // Always throw if any failures (current parallel behavior)

      case FailureHandlingMode.CONTINUE_ON_FAILURE:
        return false; // Never throw, just log and continue

      case FailureHandlingMode.PARTIAL_SUCCESS:
        const failureRate = failedTools.length / allResults.length;
        return failureRate > this.failureTolerance; // Throw only if failure rate exceeds tolerance

      default:
        return true; // Default to safe behavior
    }
  }

  /**
   * Creates a standardized failure result object from an AgentError.
   * @param error The AgentError that occurred.
   * @returns A ToolResult object representing the failure.
   */
  private createFailureToolCallContext(toolName: string, error: AgentError): ToolCallContext {
    this.logger.error(`[AgentLoop] Tool '${toolName}' failed: ${error.getUserMessage()}`);
    return {
      toolName: toolName,
      success: false,
      error: error.getUserMessage(),
      errorType: error.type,
      originalError: error.message,
      timestamp: new Date().toISOString(),
      ...(error.context || {})
    };
  }
}