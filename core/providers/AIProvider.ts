import { FunctionCallTool, AICompletionResponse } from "../types";

export interface AIProvider {
    getCompletion(prompt: string, tools?: FunctionCallTool[], options?: object): Promise<AICompletionResponse> | AICompletionResponse | undefined;
}