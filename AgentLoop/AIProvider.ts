export interface AIProvider {
    getCompletion(prompt: string): Promise<string>|string | undefined;
}