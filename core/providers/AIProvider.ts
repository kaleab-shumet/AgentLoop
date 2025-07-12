export interface LLMConfig {
    apiKey: string;
    model?: string;
    service?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface CompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface AIProvider {
    getCompletion(prompt: string, options?: CompletionOptions): Promise<string> | string | undefined;
}