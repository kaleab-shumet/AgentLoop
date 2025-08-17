import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatMode, FormatHandler, FunctionCallTool } from "../types/types";
import { FormatHandlerFactory } from "./FormatHandlerFactory";

/**
 * AIDataHandler that processes AI responses and tool definitions
 */
export class AIDataHandler {
  private formatHandler: FormatHandler;

  constructor(formatMode: FormatMode = FormatMode.LITERAL_JS) {
    this.formatHandler = FormatHandlerFactory.getHandler(formatMode);
  }

  async parseAndValidate(aiResponse: string, tools: Tool<ZodTypeAny>[]): Promise<PendingToolCall[]> {
    return await this.formatHandler.parseResponse(aiResponse, tools);
  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]){
    return this.formatHandler.formatToolDefinitions(tools)
  }

}

