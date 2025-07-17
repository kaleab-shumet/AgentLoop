import { FunctionCallingTool, LLMConfig, ServiceName } from "../types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { AIProvider } from "./AIProvider";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * DefaultAIProvider - Simple, stateless AI provider using AI-SDK
 * 
 * Features:
 * - Supports OpenAI, Google, Anthropic via AI-SDK
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
                'Service is required. Please specify one of: openai, google, anthropic',
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
            const model = this.getModel();
            
            // Convert tools to AI-SDK format
            const aiTools = tools.length > 0 ? tools.reduce((acc, tool) => {
                acc[tool.function.name] = {
                    description: tool.function.description,
                    parameters: tool.function.parameters
                };
                return acc;
            }, {} as Record<string, any>) : undefined;

            const result = await generateText({
                model,
                prompt,
                tools: aiTools,
                temperature: this.config.temperature,
                maxTokens: this.config.max_tokens,
            });

            return result.text;

        } catch (error: any) {
            // Enhanced error handling with provider-specific guidance
            if (error.message?.includes('API key') || error.message?.includes('authentication')) {
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
     * Get model instance based on service and configuration
     */
    private getModel() {
        const modelName = this.config.model || this.getDefaultModel();
        
        switch (this.config.service) {
            case 'openai':
                const openai = createOpenAI({
                    apiKey: this.config.apiKey,
                });
                return openai(modelName);
            case 'google':
                const google = createGoogleGenerativeAI({
                    apiKey: this.config.apiKey,
                });
                return google(modelName);
            case 'anthropic':
                const anthropic = createAnthropic({
                    apiKey: this.config.apiKey,
                });
                return anthropic(modelName);
            default:
                throw new AgentError(
                    `Unsupported service: ${this.config.service}`,
                    AgentErrorType.INVALID_RESPONSE
                );
        }
    }

    /**
     * Get default model for each service
     */
    private getDefaultModel(): string {
        switch (this.config.service) {
            case 'openai':
                return 'gpt-4o-mini';
            case 'google':
                return 'gemini-1.5-flash';
            case 'anthropic':
                return 'claude-3-haiku-20240307';
            default:
                return 'gpt-4o-mini';
        }
    }

    /**
     * Get supported providers
     */
    static getSupportedProviders(): ServiceName[] {
        return ['openai', 'google', 'anthropic'];
    }


}