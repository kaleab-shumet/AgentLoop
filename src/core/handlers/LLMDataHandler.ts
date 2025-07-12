import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, ExecutionMode, ResponseHandler } from "../types/types";
import { ResponseHandlerFactory } from "./ResponseHandlerFactory";

/**
 * Enhanced LLMDataHandler that supports multiple response formats
 */
export class LLMDataHandler {
  private executionMode: ExecutionMode;
  private responseHandler: ResponseHandler;

  constructor(executionMode: ExecutionMode = ExecutionMode.XML) {
    this.executionMode = executionMode;
    this.responseHandler = ResponseHandlerFactory.getHandler(executionMode);
  }

  /**
   * Set the execution mode and update the response handler
   */
  setExecutionMode(mode: ExecutionMode): void {
    this.executionMode = mode;
    this.responseHandler = ResponseHandlerFactory.getHandler(mode);
  }

  /**
   * Get the current execution mode
   */
  getExecutionMode(): ExecutionMode {
    return this.executionMode;
  }

  /**
   * Parse and validate LLM response using the appropriate handler
   */
  parseAndValidate(llmResponse: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
    return this.responseHandler.parseResponse(llmResponse, tools);
  }

  /**
   * Get formatting instructions for the current execution mode
   * Note: This is now handled by PromptManager with templates
   */
  getFormatInstructions(tools: Tool<ZodTypeAny>[], finalToolName: string, parallelExecution: boolean): string {
    // Return execution mode type so PromptManager can use the appropriate template
    if (this.executionMode === ExecutionMode.XML) {
      return 'XML_FORMAT';
    } else if (this.executionMode === ExecutionMode.FUNCTION_CALLING) {
      return 'FUNCTION_FORMAT';
    }
    
    // Fallback
    return 'XML_FORMAT';
  }

  /**
   * Format tool definitions for the current execution mode
   */
  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    return this.responseHandler.formatToolDefinitions(tools);
  }
}

