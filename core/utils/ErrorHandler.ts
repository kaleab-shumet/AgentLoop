import { AgentError, AgentErrorType } from './AgentError';
import { ErrorHandlingResult, RetryContext } from '../types/types';

/**
 * Centralized error handling utility for AgentLoop
 * Provides structured error analysis and decision making
 */
export class ErrorHandler {
  private readonly defaultMaxRetries: number;

  constructor(maxRetries: number = 3) {
    this.defaultMaxRetries = maxRetries;
  }

  /**
   * Handle errors with structured response indicating termination and feedback decisions
   * 
   * @param error - The error to handle (any type, will be converted to AgentError)
   * @param retryContext - Retry counters and limits for different error types (optional)
   * @returns Structured error handling result
   */
  handleError(error: unknown, retryContext?: RetryContext): ErrorHandlingResult {
    // Convert to AgentError if not already
    const agentError = error instanceof AgentError 
      ? error 
      : new AgentError((error as Error).message, AgentErrorType.UNKNOWN);

    // Use provided retry context or create default
    const context = retryContext || {
      connectionRetryCount: 0,
      connectionRetryLimit: this.defaultMaxRetries,
      toolExecutionRetryCount: 0,
      toolExecutionRetryLimit: this.defaultMaxRetries
    };

    // Create JSON string representation
    const errorString = JSON.stringify({
      type: agentError.type,
      message: agentError.message,
      userMessage: agentError.getMessage(),
      timestamp: agentError.timestamp.toISOString(),
      context: agentError.context,
      retryContext: context
    });

    // Determine termination and feedback based on error type
    const { shouldTerminate, feedbackToLLM } = this.getErrorPolicy(agentError, context);

    return {
      errorString,
      actualError: agentError,
      shouldTerminate,
      feedbackToLLM,
      retryContext: context
    };
  }

  /**
   * Get error handling policy based on error type and retry status
   * 5 Core Error Categories:
   * 1. Network/Provider errors - no feedback to LLM, retry then terminate
   * 2. Format/Validation errors - feedback to LLM to fix format
   * 3. Tool execution errors - feedback to LLM to fix usage
   * 4. Stagnation errors - feedback to LLM, then terminate if not fixed
   * 5. Max iterations - no feedback, terminate immediately
   */
  private getErrorPolicy(agentError: AgentError, retryContext: RetryContext): { shouldTerminate: boolean; feedbackToLLM: boolean } {
    switch (agentError.type) {
      // 1. Connection errors - terminate immediately, no LLM feedback
      case AgentErrorType.CONNECTION_ERROR:
        return { 
          shouldTerminate: true, 
          feedbackToLLM: false 
        };

      // Network/Provider errors - retry then terminate, no LLM feedback  
      case AgentErrorType.UNKNOWN: // Treat unknown as potential network/system issue
        return { 
          shouldTerminate: retryContext.connectionRetryCount >= retryContext.connectionRetryLimit, 
          feedbackToLLM: false 
        };

      // 2. Format/Validation errors - feedback to LLM to fix format, terminate after retries
      case AgentErrorType.INVALID_RESPONSE:
      case AgentErrorType.TOOL_NOT_FOUND:
      case AgentErrorType.INVALID_INPUT:
        return { 
          shouldTerminate: retryContext.connectionRetryCount >= retryContext.connectionRetryLimit, 
          feedbackToLLM: true 
        };

      // 3. Tool execution errors - feedback to LLM to fix usage
      case AgentErrorType.TOOL_EXECUTION_ERROR:
      case AgentErrorType.TOOL_TIMEOUT_ERROR:
        return { 
          shouldTerminate: retryContext.toolExecutionRetryCount >= retryContext.toolExecutionRetryLimit, 
          feedbackToLLM: true 
        };

      // 4. Stagnation errors - feedback to LLM, then terminate based on context
      case AgentErrorType.STAGNATION_ERROR:
        return { 
          shouldTerminate: agentError.context?.isLastChance || false, 
          feedbackToLLM: true 
        };

      // 5. Max iterations - no feedback, terminate immediately
      case AgentErrorType.MAX_ITERATIONS_REACHED:
        return { shouldTerminate: true, feedbackToLLM: false };

      // Configuration errors - terminate immediately, no LLM feedback
      case AgentErrorType.CONFIGURATION_ERROR:
      case AgentErrorType.DUPLICATE_TOOL_NAME:
      case AgentErrorType.INVALID_TOOL_NAME:
      case AgentErrorType.RESERVED_TOOL_NAME:
        return { shouldTerminate: true, feedbackToLLM: false };

      // Default - treat as network/system issue
      default:
        return { 
          shouldTerminate: retryContext.connectionRetryCount >= retryContext.connectionRetryLimit, 
          feedbackToLLM: false 
        };
    }
  }

  /**
   * Static convenience method for one-off error handling
   */
  static handle(error: unknown, retryContext?: RetryContext): ErrorHandlingResult {
    const handler = new ErrorHandler();
    return handler.handleError(error, retryContext);
  }
}