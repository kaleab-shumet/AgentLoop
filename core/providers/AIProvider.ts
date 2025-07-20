import { FunctionCallTool } from "../types";

export interface AIProvider {
    getCompletion(prompt: string, tools?: FunctionCallTool[], options?: object): Promise<string> | string | undefined;
}