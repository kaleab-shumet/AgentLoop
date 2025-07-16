import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, ExecutionMode, FormatHandler } from "../types/types";
import { FormatHandlerFactory } from "./FormatHandlerFactory";

/**
 * LLMDataHandler that uses function calling format
 */
export class LLMDataHandler {
  private formatHandler: FormatHandler;

  constructor(executionMode: ExecutionMode = ExecutionMode.FUNCTION_CALLING) {
    this.formatHandler = FormatHandlerFactory.getHandler(executionMode);
  }

  parseAndValidate(llmResponse: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
    return this.formatHandler.parseResponse(llmResponse, tools);
  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]){
    return this.formatHandler.formatToolDefinitions(tools)
  }


}

