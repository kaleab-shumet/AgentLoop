import { FunctionCallingTool } from "../types";

export interface AIProvider {
    getCompletion(prompt: string, tools?: FunctionCallingTool[], options?: object): Promise<string> | string | undefined;
}