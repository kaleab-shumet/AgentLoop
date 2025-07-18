import { AgentError, AgentErrorType } from "../utils/AgentError";
import { AIProvider, LLMConfig } from "./AIProvider";
import LLM from "@themaximalist/llm.js"

export class GeminiAIProvider implements AIProvider{
   
    private config: LLMConfig;
   

    

    constructor(config: LLMConfig) {
        this.config = {
            model: "gemini-1.5-flash",
            service: "google",
            temperature: 0.7,
            maxTokens: 4000,
            ...config
        };
    }


     /**
     * Enhanced completion with better error handling and configuration
     */
     async getCompletion(prompt: string, options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<string> {

        try {
            if (!this.config.apiKey || this.config.apiKey === "YOUR_API_KEY_HERE") {
                throw new AgentError(
                    "API key not configured. Please set the apiKey in your agent configuration.",
                    AgentErrorType.INVALID_RESPONSE
                );
            }

            let res = "";
            const response = await LLM(prompt, {
                model: options?.model || this.config.model,
                service: this.config.service,
                apiKey: this.config.apiKey,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
            });

            for await (const message of response) {
                res += message;
            }


            return res;
        } catch (error: any) {

            throw error;
        }
    }




    
}