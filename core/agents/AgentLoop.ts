// AgentLoop.ts
import z, { ZodTypeAny, ZodObject } from 'zod';
import { nanoid } from 'nanoid';
import SparkMD5 from 'spark-md5';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { ErrorHandler } from '../utils/ErrorHandler';
import { AIDataHandler } from '../handlers/AIDataHandler';
import { Logger } from '../utils/Logger';
import {
  Tool, PendingToolCall,
  AgentRunInput, AgentRunOutput, FormatMode,
  ToolCall,
  ToolCallReport,
  Interaction,
  AgentResponse,
  HandlerParams,
  UserPrompt,
  BuildPromptParams,
  TokenUsage,
  JsExecutionMode
} from '../types/types';
import { AIProvider } from '../providers/AIProvider';
import { TurnState } from './TurnState';
import { PromptManager, PromptManagerConfig } from '../prompt/PromptManager';




/**
 * Defines the signature for all lifecycle hooks available in the AgentLoop.
 * These hooks allow for observing and interacting with the agent's execution process.
 */
export interface AgentLifecycleHooks {
  onRunStart?: (input: AgentRunInput) => Promise<void>;
  onRunEnd?: (output: AgentRunOutput) => Promise<void>;
  onIterationStart?: (iteration: number) => Promise<void>;
  onIterationEnd?: (iteration: number, results: ToolCall[]) => Promise<void>;
  onPromptCreate?: (prompt: string) => Promise<string>; // Can modify the prompt
  onAIRequestStart?: (prompt: string) => Promise<void>;
  onAIRequestEnd?: (response: string) => Promise<void>;
  onToolCallStart?: (call: PendingToolCall) => Promise<void>;
  onToolCallEnd?: (result: ToolCall) => Promise<void>; // Replaces onToolCallSuccess and onToolCallFail
  onReportData?: (report: string | null, nextTasks: string | null, goal: string | null, iteration: number) => Promise<void>;
  onStagnationDetected?: (reportText: string, iteration: number) => Promise<void>;
  onAgentFinalResponse?: (result: AgentResponse) => Promise<void>;
  onError?: (error: AgentError) => Promise<void>;
}

export interface OutcomeRecord { args: PendingToolCall, toolCall: ToolCall }

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
  globalToolTimeoutMs?: number;              // Global timeout in ms for all tools (default: -1, disabled. Use negative value to disable timeout)
  toolExecutionRetryAttempts?: number;  // Retry attempts for tool execution errors
  connectionRetryAttempts?: number;     // Retry attempts for connection/parsing errors
  retryDelay?: number;
  hooks?: AgentLifecycleHooks;
  formatMode?: FormatMode;
  jsExecutionMode?: JsExecutionMode;   // JavaScript execution mode for tool calling (SES is the only mode)
  promptManager?: PromptManager;
  promptManagerConfig?: PromptManagerConfig;
  sleepBetweenIterationsMs?: number;
  batchMode?: boolean;                // Whether to process multiple requests in a single turn
  stagnationTerminationThreshold?: number; // Number of similar reasoning attempts before forced termination (default: 3)
  maxInteractionHistoryCharsLimit?: number; // Maximum character count for interaction history (default: 100000, negative = no limit)
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
  protected toolExecutionRetryAttempts!: number;
  protected connectionRetryAttempts!: number;
  protected retryDelay!: number;
  protected parallelExecution!: boolean;
  protected failureHandlingMode!: FailureHandlingMode;
  protected failureTolerance!: number;
  protected hooks!: AgentLifecycleHooks;
  protected sleepBetweenIterationsMs!: number;
  protected batchMode!: boolean;
  protected stagnationTerminationThreshold!: number;
  protected maxInteractionHistoryCharsLimit!: number;

  protected abstract systemPrompt: string;
  public tools: Tool<ZodTypeAny>[] = [];
  protected aiProvider: AIProvider;
  protected aiDataHandler: AIDataHandler;
  protected promptManager!: PromptManager;
  protected errorHandler!: ErrorHandler;

  protected temperature?: number;
  protected max_tokens?: number;

  private readonly FINAL_TOOL_NAME = 'final_tool';
  public readonly SELF_REASONING_TOOL = 'self_reasoning_tool';
  formatMode!: FormatMode;



  constructor(provider: AIProvider, options: AgentLoopOptions = {}) {
    this.aiProvider = provider;
    this.aiDataHandler = new AIDataHandler(
      options.formatMode ?? FormatMode.LITERAL_JS,
      options.jsExecutionMode ?? 'ses'
    );
    // Use the setter to initialize all options and defaults
    this.setAgentLoopOptions(options);
  }

  /**
   * Updates the AgentLoop's options after construction.
   * Only provided options will be updated; others remain unchanged.
   */
  public setAgentLoopOptions(options: AgentLoopOptions): void {
    this.logger = options.logger ?? console;
    this.maxIterations = options.maxIterations ?? 100;
    this.toolTimeoutMs = options.globalToolTimeoutMs ?? -1;
    this.toolExecutionRetryAttempts = options.toolExecutionRetryAttempts ?? 5;
    this.connectionRetryAttempts = options.connectionRetryAttempts ?? 5;
    this.retryDelay = options.retryDelay ?? 1000;
    this.parallelExecution = options.parallelExecution ?? true;
    this.failureHandlingMode = options.failureHandlingMode ?? (this.parallelExecution ? FailureHandlingMode.FAIL_AT_END : FailureHandlingMode.FAIL_FAST);
    this.failureTolerance = options.failureTolerance ?? 0.0;
    this.hooks = options.hooks ?? {};
    this.formatMode = options.formatMode ?? FormatMode.LITERAL_JS;
    this.sleepBetweenIterationsMs = options.sleepBetweenIterationsMs ?? 2000;
    this.batchMode = options.batchMode ?? false;
    this.stagnationTerminationThreshold = options.stagnationTerminationThreshold ?? 3;
    this.maxInteractionHistoryCharsLimit = options.maxInteractionHistoryCharsLimit ?? 100000;

    // Update AIDataHandler when format mode or execution mode changes
    if (options.formatMode || options.jsExecutionMode) {
      this.aiDataHandler = new AIDataHandler(
        this.formatMode,
        options.jsExecutionMode ?? 'ses'
      );
    }

    // Initialize ErrorHandler
    this.errorHandler = new ErrorHandler(this.toolExecutionRetryAttempts);

    // Update promptManager if provided, or update config if promptManagerConfig/formatMode changes
    if (options.promptManager) {
      this.promptManager = options.promptManager;
    } else if (options.promptManagerConfig || options.formatMode) {
      const config = options.promptManagerConfig ?? this.getDefaultPromptManagerConfig();
      this.promptManager = new PromptManager(this.systemPrompt, config);
    } else if (!this.promptManager) {
      // If promptManager is still not set, set a default
      this.promptManager = new PromptManager(this.systemPrompt, this.getDefaultPromptManagerConfig());
    }

  }



  /**
   * Track stagnation in a stateless way by checking self_reasoning_tool progress summary similarity
   * Returns null if no stagnation, or AgentError if stagnation detected
   */
  private trackStagnation(
    progressText: string,
    progressHashes: Map<string, { text: string, count: number }>,
    terminationThreshold: number
  ): AgentError | null {
    // Hash only the self-reasoning progress summary text
    const currentHash = SparkMD5.hash(progressText);

    // Check for stagnation (exact hash matches)
    for (const [existingHash, existingData] of progressHashes) {
      // If exact hash match, consider it stagnation
      if (currentHash === existingHash) {
        // Increment counter for existing hash
        existingData.count++;

        // Check if this is the last chance before termination
        const isLastChance = existingData.count === terminationThreshold;

        return new AgentError(
          `Stagnation detected: Identical reasoning pattern (#${existingData.count})${isLastChance ? ' - Final warning!' : ''}`,
          AgentErrorType.STAGNATION_ERROR,
          {
            currentHash: currentHash,
            matchingHash: existingHash,
            currentText: progressText,
            similarText: existingData.text,
            occurrenceCount: existingData.count,
            isLastChance: isLastChance,
            terminationThreshold: terminationThreshold,
            previousHashes: Array.from(progressHashes.keys())
          }
        );
      }
    }

    // Track this progress summary hash with initial count of 1
    progressHashes.set(currentHash, { text: progressText, count: 1 });

    return null; // No stagnation detected
  }


  /**
   * Add interaction to history and limit size
   */
  private pushInteractionAndLimit(history: Interaction[], interaction: Interaction, maxChars?: number): Interaction[] {
    // Use provided maxChars or fall back to the configured limit
    const charLimit = maxChars ?? this.maxInteractionHistoryCharsLimit;

    // Create new history with the new interaction added
    const newHistory = [...history, interaction];

    // If charLimit is negative, skip all limiting (no limit)
    if (charLimit < 0) {
      return newHistory;
    }

    // Calculate total characters
    let totalChars = 0;
    for (const item of newHistory) {
      totalChars += JSON.stringify(item).length;
    }

    // If over limit, remove from the beginning until under limit
    while (totalChars > charLimit && newHistory.length > 1) {
      const removed = newHistory.shift();
      if (!removed) break;
      totalChars -= JSON.stringify(removed).length;
    }

    return newHistory;
  }

  /**
   * Get default prompt manager configuration based on execution mode
   */
  private getDefaultPromptManagerConfig(): PromptManagerConfig {
    // Only LITERAL_JS format is supported
    const responseFormat = FormatMode.LITERAL_JS;

    return {
      responseFormat,
      promptOptions: {
        includeContext: true,
        includePreviousTaskHistory: true,
        maxPreviousTaskEntries: 50,
        batchMode: this.parallelExecution ?? this.batchMode
      }
    };
  }

  /**
   * Defines a tool for the agent to use.
   * @param fn A function that returns a tool definition object.
   */
  protected defineTool(fn: (schema: typeof z) => Tool<ZodTypeAny>): void {
    const toolDefinition = fn(z);

    // Check for reserved tool names in public API
    if (toolDefinition.name === this.SELF_REASONING_TOOL) {
      throw new AgentError(
        `Tool name '${toolDefinition.name}' is reserved and cannot be overridden. Reserved tools: [${this.SELF_REASONING_TOOL}]`,
        AgentErrorType.RESERVED_TOOL_NAME,
        {
          toolName: toolDefinition.name,
          reservedTools: [this.SELF_REASONING_TOOL],
          attemptedOverride: true
        }
      );
    }

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
      const config = this.getDefaultPromptManagerConfig();
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

    // Token usage tracking for this run only
    const runTokenUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };
    let currentInteractionHistory: Interaction[] = []
    const turnState = new TurnState();
    let lastError: AgentError | null = null;
    const keepRetry = true;
    let goal: string | null = null; // Track goal from self_reasoning_tool for continuity
    let stagnationWarning: string | null = null; // Track stagnation warning

    // Stagnation tracking for this run only
    const progressHashes = new Map<string, { text: string, count: number }>();

    let connectionRetryCount = 0;
    let toolExecutionRetryCount = 0;


    const taskId = nanoid();
    const userPromptInteraction: UserPrompt = {
      taskId,
      timestamp: Date.now().toString(),
      type: "user_prompt",
      message: userPrompt
    }

    currentInteractionHistory = this.pushInteractionAndLimit(currentInteractionHistory, userPromptInteraction);

    try {
      this.initializePromptManager();
      this.initializeFinalTool();
      this.initializeSelfReasoningTool();
      for (let i = 0; i < this.maxIterations; i++) {
        let iterationResults: ToolCall[] = [];

        // Call iteration start hook
        if (this.hooks.onIterationStart) {
          await this.hooks.onIterationStart(i + 1);
        }

        try {

          let prompt = this.constructPrompt(userPrompt, context, currentInteractionHistory, lastError, keepRetry, goal, stagnationWarning);
          prompt = await this.hooks.onPromptCreate?.(prompt) ?? prompt;
          const aiResponse = await this.getAIResponse(prompt, input.completionOptions, runTokenUsage);
          const parsedToolCalls = await this.aiDataHandler.parseAndValidate(aiResponse.text, this.tools);

          // Validation: If final tool is not included, report tool is required
          const hasReportTool = parsedToolCalls.some(call => call.toolName === this.SELF_REASONING_TOOL);

          if (!hasReportTool) {
            const toolsList = parsedToolCalls.map(call => call.toolName).join(', ');
            throw new AgentError(
              `Missing required '${this.SELF_REASONING_TOOL}' tool. Called: [${toolsList}]`,
              AgentErrorType.TOOL_NOT_FOUND,
              {
                requiredTool: this.SELF_REASONING_TOOL,
                parsedTools: parsedToolCalls.map(call => call.toolName),
                missingToolType: this.SELF_REASONING_TOOL,
                instruction: `Add the '${this.SELF_REASONING_TOOL}' tool to your response`
              }
            );
          }

          // Validation: Reject if only report tool is present
          if (hasReportTool && parsedToolCalls.length < 2) {
            throw new AgentError(
              `Cannot call '${this.SELF_REASONING_TOOL}' tool alone. Use with other tools.`,
              AgentErrorType.TOOL_NOT_FOUND,
              {
                rejectedPattern: 'report_tool_only',
                parsedTools: parsedToolCalls.map(call => call.toolName),
                instruction: `Call other tools alongside '${this.SELF_REASONING_TOOL}'`
              }
            );
          }

          connectionRetryCount = 0; // Reset retries on successful LLM response

          // executeToolCalls now directly adds results to toolCallHistory
          iterationResults = await this.executeToolCalls(taskId, parsedToolCalls, turnState);

          // Extract goal from latest self_reasoning_tool call for continuity
          const reportResults = iterationResults.filter(result =>
            result.toolName === this.SELF_REASONING_TOOL && result.success
          );
          if (reportResults.length > 0) {
            const latestReport = reportResults[reportResults.length - 1];
            const args = latestReport.args as Record<string, unknown>;
            goal = typeof args?.goal === 'string' ? args.goal : null;
            const pending_action = typeof args?.pending_action === 'string' ? args.pending_action : null;
            const progress_summary = typeof args?.progress_summary === 'string' ? args.progress_summary : null;
            
            console.log("---------------------------------------");
            console.log("goal: ", goal);
            console.log("pending_action: ", pending_action);
            console.log("progress_summary: ", progress_summary);
            console.log("---------------------------------------");
          }

          // Call hook with goal data
          if (this.hooks.onReportData) {
            await this.hooks.onReportData(null, null, goal, i + 1);
          }

          // Handle report creation for both regular tools and final tool
          const reportResult = iterationResults.find(r => r.toolName === this.SELF_REASONING_TOOL);

          if (reportResult?.success) {
            // Regular tool execution with self_reasoning_tool
            const args = reportResult.args as Record<string, unknown>;
            const progressText: string = typeof args?.pending_action === "string"
              ? args.pending_action
              : JSON.stringify(args?.pending_action ?? "");

            // Get other tool calls executed in this iteration (excluding self_reasoning and final)
            const otherToolResults = iterationResults.filter(r =>
              r.toolName !== this.SELF_REASONING_TOOL &&
              r.toolName !== this.FINAL_TOOL_NAME
            );

            // Check for stagnation using progress summary text
            const stagnationError = this.trackStagnation(
              progressText,
              progressHashes,
              this.stagnationTerminationThreshold
            );

            // Update stagnation warning for prompt template
            if (stagnationError) {
              // Call stagnation hook 
              if (this.hooks.onStagnationDetected) {
                await this.hooks.onStagnationDetected(progressText, i + 1);
              }
              // Create warning message instead of throwing immediately
              stagnationWarning = `⚠️ STAGNATION DETECTED: You have already done this "${progressText}". You MUST proceed with the next step and cannot repeat this action again.`;
            } else {
              // Clear stagnation warning if no stagnation detected
              stagnationWarning = null;
            }


            // Determine overall success and error
            const overallSuccess = otherToolResults.every(r => r.success);
            const errors = otherToolResults.filter(r => !r.success).map(r => r.error).filter(Boolean);
            const error = errors.length > 0 ? errors.join('; ') : undefined;

            // Create ToolCallReport and add to interaction history
            const toolCallReport: ToolCallReport = {
              report: typeof progressText === "string" ? progressText : JSON.stringify(progressText ?? ""),
              overallSuccess,
              toolCalls: iterationResults, // Include ALL tool calls including self_reasoning_tool
              error
            };

            currentInteractionHistory = this.pushInteractionAndLimit(currentInteractionHistory, toolCallReport);
          }





          // Apply failure handling mode
          const failedTools = iterationResults.filter(r => !r.success);

          if (failedTools.length > 0) {
            // IMPORTANT: Add ALL tool calls (both successful and failed) to interaction history 
            // so AI can see what failed and what succeeded in this iteration
            const allToolCallReport: ToolCallReport = {
              report: `Tool execution with failures: ${failedTools.map(f => f.toolName).join(', ')} failed`,
              overallSuccess: false,
              toolCalls: iterationResults, // Include both successful and failed tools
              error: undefined
            };
            currentInteractionHistory = this.pushInteractionAndLimit(currentInteractionHistory, allToolCallReport);

            const errorMessage = failedTools.map(f => `Tool: ${f.toolName}\n  Error: ${f.error ?? 'Unknown error'}`).join('\n');
            const failedToolsError = new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });

            throw failedToolsError;

          } else {
            toolExecutionRetryCount = 0
            lastError = null;

            const finalResult: ToolCall | undefined = iterationResults.find(r => r.toolName === this.FINAL_TOOL_NAME);
            if (finalResult?.success) {
              // Final tool execution - manually set "Task completed" report
              const toolCallReport: ToolCallReport = {
                report: "Task completed",
                overallSuccess: true,
                toolCalls: [finalResult],
                error: undefined
              };

              currentInteractionHistory = this.pushInteractionAndLimit(currentInteractionHistory, toolCallReport);
            }

            if (finalResult) {


              const agentResponse: AgentResponse = {
                taskId,
                timestamp: finalResult.timestamp,
                type: "assistant",
                args: finalResult.args,
                tokenUsage: runTokenUsage
              }

              currentInteractionHistory = this.pushInteractionAndLimit(currentInteractionHistory, agentResponse);

              await this.hooks.onAgentFinalResponse?.(agentResponse);
              //this.logger.info(`[AgentLoop] Run complete. Final answer: ${finalResult.output?.value?.substring(0, 120)}`);
              const output: AgentRunOutput = { interactionHistory: currentInteractionHistory, agentResponse };
              await this.hooks.onRunEnd?.(output);
              return output;
            }

          }


        } catch (error) {
          const retryContext = {
            connectionRetryCount,
            connectionRetryLimit: this.connectionRetryAttempts,
            toolExecutionRetryCount,
            toolExecutionRetryLimit: this.toolExecutionRetryAttempts
          };
          const errorResult = this.errorHandler.handleError(error, retryContext);


          // Set appropriate lastError and nextTasks based on feedback type
          if (errorResult.feedbackToLLM) {
            lastError = errorResult.actualError;

            // Error will be handled by buildTaskSection in DefaultPromptTemplate
            // Keep nextTasks as is - error takes priority in immediate task section
          } else {
            // For system errors (feedbackToLLM = false), don't set lastError - will use history-based recovery
          }

          // Handle stagnation termination specially
          if (errorResult.actualError.type === AgentErrorType.STAGNATION_ERROR && errorResult.shouldTerminate) {
            const agentResponse: AgentResponse = {
              taskId,
              timestamp: Date.now().toString(),
              type: "assistant",
              args: {},
              error: `I apologize, but I've encountered a stagnation loop and cannot make further progress. After ${errorResult.actualError.context?.occurrenceCount} similar attempts with tool "${errorResult.actualError.context?.toolInfo}", I must terminate to prevent infinite loops. The task could not be completed due to repeated unsuccessful reasoning patterns.`,
              tokenUsage: runTokenUsage
            };

            currentInteractionHistory = this.pushInteractionAndLimit(currentInteractionHistory, agentResponse);
            const output: AgentRunOutput = { interactionHistory: currentInteractionHistory, agentResponse };
            await this.hooks.onRunEnd?.(output);
            return output;
          }

          // Increment appropriate retry counter based on error type
          if (errorResult.actualError.type === AgentErrorType.TOOL_EXECUTION_ERROR) {
            i = i - 1; // Don't count this iteration
            toolExecutionRetryCount++;
          } else if (errorResult.actualError.type !== AgentErrorType.STAGNATION_ERROR) {
            connectionRetryCount++;
          }

          // Terminate if handler says so
          if (errorResult.shouldTerminate) {
            throw errorResult.actualError;
          }

          // Log error details for debugging (only if feedback to LLM is enabled)
          if (errorResult.feedbackToLLM) {
            this.logger.warn(`[AgentLoop] Error for LLM feedback: ${errorResult.actualError.getMessage()}`);
          } else {
            this.logger.error(`[AgentLoop] System error: ${errorResult.errorString}`);
          }
        }

        // Call iteration end hook
        if (this.hooks.onIterationEnd) {
          await this.hooks.onIterationEnd(i + 1, iterationResults);
        }

        await this.sleep(this.sleepBetweenIterationsMs);
      }

      throw new AgentError("Maximum iterations reached", AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt });
    } catch (error) {
      // Final error handling - use current retry context
      const retryContext = {
        connectionRetryCount,
        connectionRetryLimit: this.connectionRetryAttempts,
        toolExecutionRetryCount,
        toolExecutionRetryLimit: this.toolExecutionRetryAttempts
      };
      const errorResult = this.errorHandler.handleError(error, retryContext);
      const finalError = lastError ?? errorResult.actualError;

      await this.hooks.onError?.(finalError);

      const agentResponse: AgentResponse = {
        taskId,
        timestamp: Date.now().toString(),
        type: "assistant",
        args: {},
        error: finalError.getMessage(),
        tokenUsage: runTokenUsage
      };

      currentInteractionHistory = this.pushInteractionAndLimit(currentInteractionHistory, agentResponse);

      const output: AgentRunOutput = {
        interactionHistory: currentInteractionHistory,
        agentResponse
      };

      await this.hooks.onRunEnd?.(output);
      return output;
    }
  }

  private async executeToolCalls(taskId: string, toolCalls: PendingToolCall[], turnState: TurnState): Promise<ToolCall[]> {
    const iterationResults: ToolCall[] = []; // Collect results for this iteration to return

    // Reorder tools to ensure self_reasoning_tool executes first
    const selfReasoningCall = toolCalls.find(call => call.toolName === this.SELF_REASONING_TOOL);
    const otherCalls = toolCalls.filter(call => call.toolName !== this.SELF_REASONING_TOOL);
    const orderedCalls = selfReasoningCall ? [selfReasoningCall, ...otherCalls] : toolCalls;

    if (this.parallelExecution) {
      const results = await this.executeToolCallsWithDependencies(taskId, orderedCalls, turnState);
      iterationResults.push(...results);
    } else {
      // Sequential execution
      for (const call of orderedCalls) {
        //this.logger.info(`[AgentLoop] Executing tool: ${call.name}`);
        const tool = this.tools.find(t => t.name === call.toolName);
        if (!tool) {
          const err = new AgentError(`Tool '${call.toolName}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolName: call.toolName });
          const result = this.createFailureToolCallContext(call.toolName, err);
          const { toolName, success, error, ...args } = result;
          const resultToolCall: ToolCall = {
            type: "tool_call",
            taskId,
            timestamp: Date.now().toString(),
            toolName: String(toolName),
            success: Boolean(success),
            error: error ? String(error) : undefined,
            args
          }

          iterationResults.push(resultToolCall);
          await this.hooks.onToolCallEnd?.(resultToolCall);
          break;
        }
        const result = await this._executeTool(taskId, tool, call, turnState);
        iterationResults.push(result);

        // Apply failure handling mode for sequential execution
        if (!result.success && this.failureHandlingMode === FailureHandlingMode.FAIL_FAST) {
          break; // Stop on first failure only in FAIL_FAST mode
        }
      }
    }
    return iterationResults;
  }



  private async executeToolCallsWithDependencies(taskId: string, toolCalls: PendingToolCall[], turnState: TurnState): Promise<ToolCall[]> {
    const iterationResults: ToolCall[] = []; // Collect results for this iteration to return
    const executionLock = new Map<string, boolean>(); // Prevent race conditions in dependency triggering

    const validToolCalls = toolCalls.filter(call => {
      if (!this.tools.some(t => t.name === call.toolName)) {
        const error = new AgentError(`Tool '${call.toolName}' not found.`, AgentErrorType.TOOL_NOT_FOUND, { toolName: call.toolName });
        const result = this.createFailureToolCallContext(call.toolName, error);
        const { toolName, success, error: errorMsg, ...args } = result;
        iterationResults.push({
          timestamp: Date.now().toString(),
          taskId,
          type: "tool_call",
          toolName: String(toolName),
          success: Boolean(success),
          error: errorMsg ? String(errorMsg) : undefined,
          args
        });
        return false;
      }
      return true;
    });

    if (validToolCalls.length === 0) return iterationResults;

    const { pending, dependents, ready } = this.buildDependencyGraph(validToolCalls);
    const executed = new Map<string, Promise<void>>();

    const propagateFailure = (failedToolName: string, chain: string[]) => {
      const directDependents = dependents.get(failedToolName) ?? [];
      for (const dependentName of directDependents) {
        if (chain.includes(dependentName) || iterationResults.some(r => r.toolName === dependentName)) continue;
        const result = this.createFailureToolCallContext(failedToolName, new AgentError(`Skipped due to failure in dependency: '${failedToolName}'`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: dependentName, failedDependency: failedToolName }));
        const { toolName, success, error: errorMsg, ...args } = result;
        iterationResults.push({
          taskId,
          timestamp: Date.now().toString(),
          toolName: String(toolName),
          success: Boolean(success),
          error: errorMsg ? String(errorMsg) : undefined,
          args,
          type: "tool_call"
        });
        propagateFailure(dependentName, [...chain, dependentName]);
      }
    };

    const triggerDependents = (toolName: string) => {
      const nextTools = dependents.get(toolName) ?? [];
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
      const tool = this.tools.find(t => t.name === toolName);
      if (!tool) {
        throw new AgentError(`Tool '${toolName}' not found during execution`, AgentErrorType.TOOL_NOT_FOUND, { toolName });
      }
      const callsForTool = validToolCalls.filter(t => t.toolName === toolName);

      try {
        // Execute all calls for this specific tool concurrently
        const results = await Promise.all(callsForTool.map(call => this._executeTool(taskId, tool, call, turnState)));

        // Thread-safe result addition - push each result individually to avoid race conditions
        for (const result of results) {
          iterationResults.push(result);
        }

        if (results.some(r => !r.success)) throw new Error(`One or more executions of tool '${toolName}' failed.`);
      } catch (error) {
        const agentError = error instanceof AgentError ? error : new AgentError(String(error), AgentErrorType.UNKNOWN, { toolName });

        // Check if any results were already added before the error
        const existingResults = iterationResults.filter(r => r.toolName === toolName);
        if (existingResults.length === 0) {
          const failureResult = this.createFailureToolCallContext(toolName, agentError);
          const { toolName: fToolName, success, error: errorMsg, ...args } = failureResult;
          iterationResults.push({
            taskId,
            timestamp: Date.now().toString(),
            toolName: String(fToolName),
            success: Boolean(success),
            error: errorMsg ? String(errorMsg) : undefined,
            args,
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
    for (const call of toolCalls) {
      const tool = this.tools.find(t => t.name === call.toolName);
      if (!tool) continue;
      const validDeps = (tool.dependencies ?? []).filter(dep => callNames.has(dep));
      pending.set(call.toolName, new Set(validDeps));
      validDeps.forEach(dep => {
        if (!dependents.has(dep)) dependents.set(dep, []);
        const depList = dependents.get(dep);
        if (depList) depList.push(call.toolName);
      });
    }
    const ready = toolCalls.map(c => c.toolName).filter(name => (pending.get(name)?.size ?? 0) === 0);
    return { pending, dependents, ready: Array.from(new Set(ready)) };
  }

  public detectCircularDependencies(tools: Tool<ZodTypeAny>[]): string[] {
    const adjList = new Map<string, string[]>();

    // Build adjacency list from tool dependencies
    for (const tool of tools) {
      const deps = tool.dependencies ?? [];
      adjList.set(tool.name, deps);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (toolName: string, path: string[]): string[] | null => {
      visited.add(toolName);
      recursionStack.add(toolName);
      path.push(toolName);
      const neighbors = adjList.get(toolName) ?? [];
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


  private async getAIResponse(prompt: string, options = {}, runTokenUsage: TokenUsage): Promise<{ text: string; usage?: import('../types/types').TokenUsage }> {
    for (let attempt = 0; attempt < this.connectionRetryAttempts; attempt++) {
      try {
        await this.hooks.onAIRequestStart?.(prompt);

        const response = await this.aiProvider.getCompletion(prompt, options);
        if (!response || typeof response !== "object" || typeof response.text !== "string") {
          throw new AgentError(
            "AI provider returned invalid response format.",
            AgentErrorType.INVALID_RESPONSE,
            { responseType: typeof response, expectedType: 'AICompletionResponse' }
          );
        }

        // Display token usage if available and accumulate for run total
        if (response.usage) {
          this.logger.info(`[AgentLoop] Token Usage - Prompt: ${response.usage.promptTokens}, Completion: ${response.usage.completionTokens}, Total: ${response.usage.totalTokens}`);

          // Accumulate tokens for the current run
          runTokenUsage.promptTokens += response.usage.promptTokens;
          runTokenUsage.completionTokens += response.usage.completionTokens;
          runTokenUsage.totalTokens += response.usage.totalTokens;
        }

        await this.hooks.onAIRequestEnd?.(response.text);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AgentLoop] AI retry ${attempt + 1}: ${errorMessage}`);
        if (attempt < this.connectionRetryAttempts - 1) await this.sleep(this.retryDelay * Math.pow(2, attempt));
      }
    }
    throw new AgentError(
      "LLM call failed after all retry attempts.",
      AgentErrorType.CONNECTION_ERROR,
      { retryAttempts: this.connectionRetryAttempts }
    );
  }


  private constructPrompt(userPrompt: string, context: Record<string, unknown>, currentInteractionHistory: Interaction[], lastError: AgentError | null, keepRetry: boolean, goal: string | null = null, stagnationWarning: string | null = null): string {
    const toolDefinitions = this.aiDataHandler.formatToolDefinitions(this.tools);

    const toolDef = typeof toolDefinitions === "string" ? toolDefinitions : this.tools.map(e => (`## ToolName: ${e.name}\n## ToolDescription: ${e.description}`)).join('\n\n')


    // Build the prompt using the clean PromptManager API
    const promptParams: BuildPromptParams = {
      systemPrompt: this.systemPrompt,
      userPrompt,
      context: Object.fromEntries(Object.entries(context).map(([k, v]) => [k, String(v)])),
      currentInteractionHistory,
      lastError,
      keepRetry,
      finalToolName: this.FINAL_TOOL_NAME,
      reportToolName: this.SELF_REASONING_TOOL,
      toolDefinitions: toolDef,
      goal: goal,
      stagnationWarning: stagnationWarning
    };

    const prompt = this.promptManager.buildPrompt(promptParams);

    return prompt;
  }




  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  private async _executeTool(taskId: string, tool: Tool<ZodTypeAny>, call: PendingToolCall, turnState: TurnState): Promise<ToolCall> {
    await this.hooks.onToolCallStart?.(call);
    const toolTimeout = tool.timeout ?? this.toolTimeoutMs;

    let result: ToolCall;
    try {
      let toolCallContext;

      // If timeout is negative, disable timeout by running without Promise.race
      if (toolTimeout < 0) {
        toolCallContext = await tool.handler({ name: tool.name, args: call, turnState });
      } else {
        // Create cancellable timeout
        let timeoutId;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() =>
            reject(new AgentError(`Tool '${tool.name}' exceeded timeout of ${toolTimeout}ms.`, AgentErrorType.TOOL_TIMEOUT_ERROR, { toolName: tool.name, timeout: toolTimeout })),
            toolTimeout
          );
        });

        // The handler now returns the full ToolResult object directly.
        toolCallContext = await Promise.race([
          tool.handler({ name: tool.name, args: call, turnState }),
          timeoutPromise,
        ]);

        // Clean up timeout to prevent memory leaks
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }

      // Extract metadata and args from toolCallContext
      const contextData = toolCallContext as Record<string, unknown>;
      const { toolName, success, error, ...args } = contextData ?? {};
      result = {
        type: "tool_call",
        taskId,
        timestamp: Date.now().toString(),
        toolName: String(toolName),
        success: Boolean(success),
        error: error ? String(error) : undefined,
        args
      }

    } catch (error) {
      const agentError = error instanceof AgentError ? error : new AgentError(`An unexpected error occurred in tool '${tool.name}': ${String(error)}`, AgentErrorType.TOOL_EXECUTION_ERROR, { toolName: tool.name, originalError: error, call });
      const errCtx = this.createFailureToolCallContext(tool.name, agentError);
      const { toolName, success, error: errorMsg, ...args } = errCtx;
      result = {
        type: "tool_call",
        taskId,
        timestamp: Date.now().toString(),
        toolName: String(toolName),
        success: Boolean(success),
        error: errorMsg ? String(errorMsg) : undefined,
        args
      }
    }

    await this.hooks.onToolCallEnd?.(result);
    return result;
  }


  /**
   * Validates a tool definition for correctness and checks for circular dependencies
   */
  public validateToolDefinition(tool: Tool<ZodTypeAny>): { isValid: boolean; errors: string[]; circularDependencies: string[] } {
    const errors: string[] = [];
    let circularDependencies: string[] = [];

    // Check for reserved tool names
    if (tool.name === this.SELF_REASONING_TOOL) {
      errors.push(`Tool name '${tool.name}' is reserved and cannot be overridden. Reserved tools: [${this.SELF_REASONING_TOOL}]`);
    }

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

    // Validate timeout - negative values disable timeout, positive values must not exceed global timeout
    const toolTimeout = tool.timeout ?? this.toolTimeoutMs;
    if (toolTimeout > 0 && this.toolTimeoutMs > 0 && toolTimeout > this.toolTimeoutMs) {
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

    // Validate timeout - negative values disable timeout, positive values cannot exceed global timeout
    const toolTimeout = tool.timeout ?? this.toolTimeoutMs;
    if (toolTimeout > 0 && this.toolTimeoutMs > 0 && toolTimeout > this.toolTimeoutMs) {
      this.logger.warn(`[AgentLoop] Tool '${tool.name}' timeout (${toolTimeout}ms) exceeds global timeout (${this.toolTimeoutMs}ms). Using global timeout.`);
    }

    // Set default timeout if not provided, handle negative timeouts (disable), and ensure positive timeouts don't exceed global timeout
    let finalTimeout: number;
    if (toolTimeout < 0) {
      finalTimeout = toolTimeout; // Keep negative value to disable timeout
    } else if (this.toolTimeoutMs < 0) {
      finalTimeout = this.toolTimeoutMs; // Use global disabled timeout
    } else {
      finalTimeout = Math.min(toolTimeout, this.toolTimeoutMs); // Enforce global limit for positive timeouts
    }

    const toolWithDefaults = {
      ...tool,
      timeout: finalTimeout,
      dependencies: tool.dependencies ?? []
    };

    this.tools.push(toolWithDefaults);
  }

  private initializeFinalTool(): void {
    if (!this.tools.some(t => t.name === this.FINAL_TOOL_NAME)) {
      this.defineTool((z) => ({
        name: this.FINAL_TOOL_NAME,
        description: `Use this tool to talk with the user and give your final answer. Use when: (1) You want to reply to the user, (2) The task is complete, (3) All steps are done, or (4) You need to explain why the task cannot be completed. Calling this tool finalizes the task or conversation.`,
        argsSchema: z.object({
          value: z.string().describe("The final reply to the user, summarizing the result or explanation.")
        }),
        handler: ({ name, args }: HandlerParams<ZodTypeAny>): { [key: string]: unknown; } => {
          return {
            toolName: name,
            success: true,
            ...args,
          };
        },
      }));
    }

  }

  private initializeSelfReasoningTool(): void {
    if (!this.tools.some(t => t.name === this.SELF_REASONING_TOOL)) {
      const reportTool = {
        name: this.SELF_REASONING_TOOL,
        description: `Self-reasoning tool for immediate thought process and next action planning.`,
        argsSchema: z.object({
          goal: z.string().describe("A brief, one-sentence summary of the user's ultimate goal. This should remain consistent across turns."),
          goal_status: z.enum(["pending", "success", "failed"]).default("pending").describe("Status of the goal: pending (still working), success (goal achieved - use final_tool to respond to user, no further action needed), failed (goal cannot be achieved - use final_tool to explain why, no further action needed)"),
          pending_action: z.string().describe("What action is currently being executed and waiting for result. Describe exactly what you are doing right now."),
          progress_summary: z.string().describe("Numbered list of completed actions in past tense with results. DO NOT include any future plans, pending actions, or what you will do next - ONLY what has been finished.")
        }),
        handler: ({ name, args }: HandlerParams<ZodTypeAny>): { [key: string]: unknown; } => {
          return {
            toolName: name,
            success: true,
            goal: args.goal,
            goal_status: args.goal_status,
            pending_action: args.pending_action,
            progress_summary: args.progress_summary,
          };
        },
      };
      this._addTool(reportTool);
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
  private createFailureToolCallContext(toolName: string, error: AgentError): { [key: string]: unknown; } {
    this.logger.error(`[AgentLoop] Tool '${toolName}' failed: ${error.getMessage()}`);
    return {
      toolName: toolName,
      success: false,
      error: error.getMessage(),
      errorType: error.type,
      originalError: error.message,
      timestamp: new Date().toISOString(),
      ...(error.context ?? {})
    };
  }
}