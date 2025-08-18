import { AICompletionResponse } from "../types";

export interface AIProvider {
    getCompletion(prompt: string, options?: object): Promise<AICompletionResponse> | AICompletionResponse | undefined;
}