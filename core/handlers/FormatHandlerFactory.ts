import { ExecutionMode, FormatHandler } from "../types/types";
import { FunctionCallingFormatHandler } from "./FunctionCallingFormatHandler";
import { YamlFormatHandler } from "./YamlFormatHandler";
import { AgentError, AgentErrorType } from "../utils/AgentError";

/**
 * Factory for creating response handlers - function calling and YAML mode are supported
 */
export class FormatHandlerFactory {
  private static handlers: Map<ExecutionMode, FormatHandler> = new Map();

  /**
   * Get response handler for the specified execution mode
   */
  static getHandler(mode: ExecutionMode): FormatHandler {
    if (!this.handlers.has(mode)) {
      switch (mode) {
        case ExecutionMode.FUNCTION_CALLING:
          this.handlers.set(mode, new FunctionCallingFormatHandler());
          break;
        case ExecutionMode.YAML_MODE:
          this.handlers.set(mode, new YamlFormatHandler());
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
  static registerHandler(mode: ExecutionMode, handler: FormatHandler): void {
    this.handlers.set(mode, handler);
  }

  /**
   * Clear all registered handlers (useful for testing)
   */
  static clearHandlers(): void {
    this.handlers.clear();
  }
}