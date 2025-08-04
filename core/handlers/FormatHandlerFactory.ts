import { FormatMode, FormatHandler } from "../types/types";
import { FunctionCallingFormatHandler } from "./FunctionCallingFormatHandler";
import { TomlFormatHandler } from "./TomlFormatHandler";
import { JSObjectFormatHandler } from "./JSObjectFormatHandler";
import { AgentError, AgentErrorType } from "../utils/AgentError";

/**
 * Factory for creating response handlers - function calling, TOML, and JSObject modes are supported
 */
export class FormatHandlerFactory {
  private static handlers: Map<FormatMode, FormatHandler> = new Map();

  /**
   * Get response handler for the specified format mode
   */
  static getHandler(mode: FormatMode): FormatHandler {
    if (!this.handlers.has(mode)) {
      switch (mode) {
        case FormatMode.FUNCTION_CALLING:
          this.handlers.set(mode, new FunctionCallingFormatHandler());
          break;
        case FormatMode.TOML:
          this.handlers.set(mode, new TomlFormatHandler());
          break;
        case FormatMode.JSOBJECT:
          this.handlers.set(mode, new JSObjectFormatHandler());
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