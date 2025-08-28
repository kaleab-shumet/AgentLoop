import { FormatMode, FormatHandler, JsExecutionMode } from "../types/types";
import { LiteralJSFormatHandler } from "./LiteralJSFormatHandler";
import { AgentError, AgentErrorType } from "../utils/AgentError";

/**
 * Factory for creating response handlers - only LiteralJS mode is supported
 */
export class FormatHandlerFactory {
  private static handlers: Map<string, FormatHandler> = new Map();

  /**
   * Get response handler for the specified format mode and execution mode
   */
  static getHandler(mode: FormatMode, jsExecutionMode: JsExecutionMode = 'ses'): FormatHandler {
    // For LiteralJS mode, create handler with execution mode
    if (mode === FormatMode.LITERAL_JS) {
      const key = `${mode}-${jsExecutionMode}`;
      
      if (!this.handlers.has(key)) {
        this.handlers.set(key, new LiteralJSFormatHandler());
      }
      const handler = this.handlers.get(key);
      if (!handler) {
        throw new AgentError(
          `[ResponseHandlerFactory] Failed to retrieve handler for mode: ${mode}`,
          AgentErrorType.CONFIGURATION_ERROR
        );
      }
      return handler;
    }
    
    // For other modes, ignore jsExecutionMode
    if (!this.handlers.has(mode)) {
      switch (mode) {
        default:
          throw new AgentError(
            `[ResponseHandlerFactory] Unsupported format mode: ${mode}`,
            AgentErrorType.INVALID_RESPONSE
          );
      }
    }
    const handler = this.handlers.get(mode);
    if (!handler) {
      throw new AgentError(
        `[ResponseHandlerFactory] Failed to retrieve handler for mode: ${mode}`,
        AgentErrorType.CONFIGURATION_ERROR
      );
    }
    return handler;
  }

  /**
   * Register a custom response handler for a specific format mode
   */
  static registerHandler(mode: FormatMode, handler: FormatHandler): void {
    this.handlers.set(mode, handler);
  }

  /**
   * Clear all registered handlers (useful for testing)
   */
  static clearHandlers(): void {
    this.handlers.clear();
  }
}