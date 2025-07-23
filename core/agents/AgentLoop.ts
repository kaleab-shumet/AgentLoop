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
  ToolCallReport,
  Interaction,
  AgentResponse,
  ToolCallContext,
  HandlerParams,
  UserPrompt
} from '../types/types';
import { AIProvider } from '../providers/AIProvider';
import { TurnState } from './TurnState';
import { PromptManager, PromptManagerConfig, FormatType } from '../prompt/PromptManager';




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

export type OutcomeRecord = { args: PendingToolCall, toolCall: ToolCall };

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

  protected temperature?: number;
  protected max_tokens?: number;

  private readonly FINAL_TOOL_NAME = 'final';
  private readonly REPORT_TOOL_NAME = 'report';
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
    this.maxIterations = options.maxIterations !== undefined ? options.maxIterations : 15;
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
      this.promptManager = new PromptManager(this.systemPrompt, this.getDefaultPromptManagerConfig(this.formatMode));
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
    let lastError: AgentError | null = null;
    let keepRetry = true;

    let connectionAndParsingRetryCount = 0;
    let toolExecRetryCount = 0;


    const taskId = nanoid();
    const userPromptInteraction: UserPrompt = {
      taskId,
      timestamp: Date.now().toString(),
      type: "user_prompt",
      context: userPrompt
    }

    currentInteractionHistory.push(userPromptInteraction)

    try {
      this.initializePromptManager();
      this.initializeFinalTool();
      this.initializeReportTool();
      for (let i = 0; i < this.maxIterations; i++) {

        try {


          let prompt = this.constructPrompt(userPrompt, context, currentInteractionHistory, input.prevInteractionHistory, lastError, keepRetry);
          prompt = await this.hooks.onPromptCreate?.(prompt) ?? prompt;
          const aiResponse = await this.getAIResponseWithRetry(prompt);
          const parsedToolCalls = this.aiDataHandler.parseAndValidate(aiResponse, this.tools);
          connectionAndParsingRetryCount = 0; // Reset retries on successful LLM response

          // executeToolCalls now directly adds results to toolCallHistory
          const iterationResults = await this.executeToolCalls(taskId, parsedToolCalls, turnState);

          // Handle report creation for both regular tools and final tool
          const reportResult = iterationResults.find(r => r.context.toolName === this.REPORT_TOOL_NAME);
          const finalResult = iterationResults.find(r => r.context.toolName === this.FINAL_TOOL_NAME);
          
          if (reportResult && reportResult.context.success) {
            // Regular tool execution with report tool
            const reportText = reportResult.context.report || "";

            console.log(reportText)
            
            // Get other tool calls executed in this iteration (excluding report and final)
            const otherToolResults = iterationResults.filter(r => 
              r.context.toolName !== this.REPORT_TOOL_NAME && 
              r.context.toolName !== this.FINAL_TOOL_NAME
            );
            
            // Determine overall success and error
            const overallSuccess = otherToolResults.every(r => r.context.success);
            const errors = otherToolResults.filter(r => !r.context.success).map(r => r.context.error).filter(Boolean);
            const error = errors.length > 0 ? errors.join('; ') : undefined;

            // Create ToolCallReport and add to interaction history
            const toolCallReport: ToolCallReport = {
              report: reportText,
              overallSuccess,
              toolCalls: otherToolResults,
              error
            };
            
            currentInteractionHistory.push(toolCallReport);
          } else if (finalResult && finalResult.context.success) {
            // Final tool execution - manually set "Task completed" report
            const toolCallReport: ToolCallReport = {
              report: "Task completed",
              overallSuccess: true,
              toolCalls: [finalResult],
              error: undefined
            };
            
            currentInteractionHistory.push(toolCallReport);
          }


          // Apply failure handling mode
          const failedTools = iterationResults.filter(r => !r.context.success);

          if (failedTools.length > 0) {
            const errorMessage = failedTools.map(f => `Tool: ${f.context.toolName}\n  Error: ${f.context?.error ?? 'Unknown error'}`).join('\n');
            const failedToolsError = new AgentError(errorMessage, AgentErrorType.TOOL_EXECUTION_ERROR, { userPrompt, failedTools });

            throw failedToolsError;

          } else {
            toolExecRetryCount = 0
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

          }


        } catch (error) {
          const err = error instanceof AgentError ? error : new AgentError((error as Error).message, AgentErrorType.UNKNOWN);
          lastError = err;
          if (err.type === AgentErrorType.TOOL_EXECUTION_ERROR) {
            i = i - 1;
            toolExecRetryCount++
            if (toolExecRetryCount >= this.retryAttempts) {
              throw new AgentError(`Maximum tool execution retry attempts: ${err.getUserMessage()}`, AgentErrorType.STAGNATION_ERROR, { userPrompt, error: err });
            }

          }
          else {
            connectionAndParsingRetryCount++;
            if (connectionAndParsingRetryCount >= this.retryAttempts) {
              throw new AgentError(`Maximum retry attempts for response error: ${err.getUserMessage()}`, AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt, error: err });
            }
          }
        }

        await this.sleep(this.sleepBetweenIterationsMs);
      }

      throw new AgentError("Maximum iterations reached", AgentErrorType.MAX_ITERATIONS_REACHED, { userPrompt });
    } catch (error) {
      const err = error instanceof AgentError ? error : new AgentError((error as Error).message, AgentErrorType.UNKNOWN);
      await this.hooks.onError?.(err);

      // Use the lastError if available, otherwise use caught error
      const finalError = lastError || err;

      const agentResponse: AgentResponse = {
        taskId,
        timestamp: Date.now().toString(),
        type: "agent_response",
        context: undefined,
        error: finalError.getUserMessage()
      };

      currentInteractionHistory.push(agentResponse);

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

        // Apply failure handling mode for sequential execution
        if (!result.context.success && this.failureHandlingMode === FailureHandlingMode.FAIL_FAST) {
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
        const results = await Promise.all(callsForTool.map(call => this._executeTool(taskId, tool, call, turnState)));

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




  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async _executeTool(taskId: string, tool: Tool<ZodTypeAny>, call: PendingToolCall, turnState: TurnState): Promise<ToolCall> {
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

  private initializeReportTool(): void {
    if (!this.tools.some(t => t.name === this.REPORT_TOOL_NAME)) {
      this.defineTool((z) => ({
        name: this.REPORT_TOOL_NAME,
        description: `Report which tools you called in this iteration and why. Format: "I have called tools [tool1], [tool2], and [tool3] because I need to [reason]". Always explicitly list the tool names you executed alongside this report.`,
        argsSchema: z.object({
          report: z.string().describe("State which specific tools you called in this iteration and the reason why. Format: 'I have called tools X, Y, and Z because I need to [accomplish this goal]'.")
        }),
        handler: async ({ name, args, turnState }: HandlerParams<ZodTypeAny>): Promise<ToolCallContext> => {
          return {
            toolName: name,
            success: true,
            report: args.report,
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