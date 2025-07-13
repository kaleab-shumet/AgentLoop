import { FunctionCallingTool, LLMConfig, ServiceName } from "../types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { AIProvider } from "./AIProvider";
import LLM from "@themaximalist/llm.js";

/**
 * DefaultAIProvider - Simple, stateless AI provider using llm.js
 * 
 * Features:
 * - Supports OpenAI, Google, Anthropic, Groq, Ollama
 * - Stateless design - no internal state or chat history
 * - Simple text in, text out interface
 * - Manual configuration required
 */
export class DefaultAIProvider implements AIProvider {
    private config: LLMConfig;

    constructor(config: LLMConfig) {

        // Validate required configuration
        if (!config.apiKey) {
            throw new AgentError(
                'API key is required. Please provide apiKey in the configuration.',
                AgentErrorType.INVALID_RESPONSE
            );
        }

        if (!config.service) {
            throw new AgentError(
                'Service is required. Please specify one of: openai, google, anthropic, groq, ollama',
                AgentErrorType.INVALID_RESPONSE
            );
        }

        this.config = config;
    }


    /**
     * Get completion - stateless operation
     */
    async getCompletion(prompt: string, tools: FunctionCallingTool[] = [], options = {}): Promise<string> {
        try {


            const newConfig = tools.length > 0 ? { ...this.config, tools } : this.config
            const response = await LLM(prompt, newConfig);

            // Handle streaming or string response safely
            if (typeof response === 'string') {
                return response;
            } else if (typeof response === 'object' && response !== null && Symbol.asyncIterator in response) {
                let result = '';
                for await (const chunk of response as AsyncIterable<string>) {
                    result += chunk;
                }
                return result;
            } else {
                throw new AgentError(
                    'Unexpected response type from LLM provider.',
                    AgentErrorType.INVALID_RESPONSE
                );
            }

        } catch (error: any) {
            // Enhanced error handling with provider-specific guidance
            if (error.message?.includes('API key')) {
                throw new AgentError(
                    `API authentication failed for ${this.config.service}. Please check your API key.`,
                    AgentErrorType.INVALID_RESPONSE
                );
            }

            if (error.message?.includes('model')) {
                throw new AgentError(
                    `Model "${this.config.model}" not available for ${this.config.service}. Try a different model.`,
                    AgentErrorType.INVALID_RESPONSE
                );
            }

            throw new AgentError(
                `AI provider error: ${error.message}`,
                AgentErrorType.INVALID_RESPONSE
            );
        }
    }

    /**
     * Get current configuration (read-only)
     */
    getConfig(): Readonly<LLMConfig> {
        return { ...this.config };
    }

    /**
     * Get supported providers
     */
    static getSupportedProviders(): ServiceName[] {
        return ['openai', 'google', 'anthropic', 'groq', 'ollama'];
    }


}