import { FormatMode, FormatHandler } from "../types/types";
import { XRJsonFormatHandler } from "./XRJsonFormatHandler";
import { AgentError, AgentErrorType } from "../utils/AgentError";

/**
 * Factory for creating response handlers - only XRJSON mode is supported
 */
export class FormatHandlerFactory {
  private static handlers: Map<FormatMode, FormatHandler> = new Map();

  /**
   * Get response handler for the specified format mode
   */
  static getHandler(mode: FormatMode): FormatHandler {
    if (!this.handlers.has(mode)) {
      switch (mode) {
        case FormatMode.XRJSON:
          this.handlers.set(mode, new XRJsonFormatHandler());
          break;
        default:
          throw new AgentError(
            `[ResponseHandlerFactory] Unsupported format mode: ${mode}`,
            AgentErrorType.INVALID_RESPONSE
          );
      }
    }
    return this.handlers.get(mode)!;
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