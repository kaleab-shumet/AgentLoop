import { ExecutionMode, ResponseHandler } from "../types/types";
import { XmlResponseHandler } from "./XmlResponseHandler";
import { FunctionCallingResponseHandler } from "./FunctionCallingResponseHandler";
import { AgentError, AgentErrorType } from "../utils/AgentError";

/**
 * Factory for creating response handlers based on execution mode
 */
export class ResponseHandlerFactory {
  private static handlers: Map<ExecutionMode, ResponseHandler> = new Map();

  /**
   * Get response handler for the specified execution mode
   */
  static getHandler(mode: ExecutionMode): ResponseHandler {
    if (!this.handlers.has(mode)) {
      switch (mode) {
        case ExecutionMode.XML:
          this.handlers.set(mode, new XmlResponseHandler());
          break;
        case ExecutionMode.FUNCTION_CALLING:
          this.handlers.set(mode, new FunctionCallingResponseHandler());
          break;
        default:
          throw new AgentError(
            `[ResponseHandlerFactory] Unsupported execution mode: ${mode}`,
            AgentErrorType.INVALID_RESPONSE
          );
      }
    }
    return this.handlers.get(mode)!;
  }

  /**
   * Register a custom response handler for a specific execution mode
   */
  static registerHandler(mode: ExecutionMode, handler: ResponseHandler): void {
    this.handlers.set(mode, handler);
  }

  /**
   * Clear all registered handlers (useful for testing)
   */
  static clearHandlers(): void {
    this.handlers.clear();
  }
}