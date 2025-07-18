import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatMode, FormatHandler, FunctionCallingTool } from "../types/types";
import { FormatHandlerFactory } from "./FormatHandlerFactory";

/**
 * LLMDataHandler that uses function calling format
 */
export class LLMDataHandler {
  private formatHandler: FormatHandler;

  constructor(formatMode: FormatMode = FormatMode.FUNCTION_CALLING) {
    this.formatHandler = FormatHandlerFactory.getHandler(formatMode);
  }

  parseAndValidate(llmResponse: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
    return this.formatHandler.parseResponse(llmResponse, tools);
  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]){
    return this.formatHandler.formatToolDefinitions(tools)
  }

}

