import { ZodTypeAny } from "zod";
import { PendingToolCall } from "../types";
import { Tool } from "../types";

export interface ParserResult {
    pendingToolCalls: PendingToolCall[];
    [key: string]: any;
}

export abstract class BaseParser {
    abstract parseLLMResponse(llmResponse: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[];
}