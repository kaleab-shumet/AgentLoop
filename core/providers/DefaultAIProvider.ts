import { AIConfig, ServiceName, AICompletionResponse, TokenUsage } from "../types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { AIProvider } from "./AIProvider";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createAzure } from "@ai-sdk/azure";

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
    private config: AIConfig;

    constructor(config: AIConfig) {

        // Validate required configuration
        if (!config.apiKey) {
            throw new AgentError(
                'API key is required. Please provide apiKey in the configuration.',
                AgentErrorType.CONFIGURATION_ERROR,
                { config: { service: config.service, hasApiKey: false } }
            );
        }

        if (!config.service) {
            throw new AgentError(
                'Service is required. Please specify one of: openai, google, anthropic, mistral, cohere, groq, fireworks, deepseek, perplexity, azure',
                AgentErrorType.CONFIGURATION_ERROR,
                { supportedServices: DefaultAIProvider.getSupportedProviders() }
            );
        }

        this.config = config;
    }


    /**
     * Get completion - stateless operation
     */
    async getCompletion(prompt: string, _options = {}): Promise<AICompletionResponse> {
        try {


            const model = this.getModel();

            // Convert tools to AI-SDK format using the Zod schemas directly
            // const aiTools = tools.length > 0 ? tools.reduce((acc, functionTool) => {
            //     acc[functionTool.function.name] = tool({
            //         description: functionTool.function.description,
            //         parameters: functionTool.function.parameters // Use Zod schema directly
            //     });
            //     return acc;
            // }, {} as Record<string, unknown>) : undefined;

            const result = await generateText({
                model,
                prompt,
                temperature: this.config.temperature,
                maxTokens: this.config.max_tokens,
            });

            // Extract token usage information if available
            const usage: TokenUsage | undefined = result.usage ? {
                promptTokens: result.usage.promptTokens || 0,
                completionTokens: result.usage.completionTokens || 0,
                totalTokens: result.usage.totalTokens || 0
            } : undefined;

            return {
                text: result.text,
                usage
            };

        } catch (error: unknown) {
            // Enhanced error handling with provider-specific guidance
            const errorMessage: string = error instanceof Error ? error.message : String(error);
            if (errorMessage?.includes('API key') || errorMessage?.includes('authentication')) {
                throw new AgentError(
                    `API authentication failed for ${this.config.service}. Please check your API key.`,
                    AgentErrorType.CONFIGURATION_ERROR,
                    { service: this.config.service, hasApiKey: !!this.config.apiKey, originalError: errorMessage }
                );
            }

            if (errorMessage?.includes('model')) {
                throw new AgentError(
                    `Model "${this.config.model}" not available for ${this.config.service}. Try a different model.`,
                    AgentErrorType.CONFIGURATION_ERROR,
                    { service: this.config.service, model: this.config.model, originalError: errorMessage }
                );
            }

            throw new AgentError(
                `AI provider error: ${errorMessage}`,
                AgentErrorType.UNKNOWN,
                { service: this.config.service, originalError: errorMessage, errorType: error instanceof Error ? error.name : 'unknown' }
            );
        }
    }

    /**
     * Get current configuration (read-only)
     */
    getConfig(): Readonly<AIConfig> {
        return { ...this.config };
    }

    /**
     * Get model instance based on service and configuration
     */
    private getModel() {
        const modelName = this.config.model ?? this.getDefaultModel();

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
            case 'mistral':
                const mistral = createMistral({
                    apiKey: this.config.apiKey,
                });
                return mistral(modelName);
            case 'groq':
                const groq = createGroq({
                    apiKey: this.config.apiKey,
                });
                return groq(modelName);
            case 'perplexity':
                const perplexity = createPerplexity({
                    apiKey: this.config.apiKey,
                });
                return perplexity(modelName);
            case 'azure':
                const azure = createAzure({
                    apiKey: this.config.apiKey,
                    resourceName: this.config.baseURL, // baseURL now contains just the resource name
                    apiVersion: '2024-10-01-preview'
                });
                return azure(modelName);
            default:
                throw new AgentError(
                    `Unsupported service: ${this.config.service}`,
                    AgentErrorType.CONFIGURATION_ERROR,
                    { service: this.config.service, supportedServices: DefaultAIProvider.getSupportedProviders() }
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
            case 'mistral':
                return 'mistral-7b-instruct';
            case 'groq':
                return 'llama3-8b-8192';
            case 'perplexity':
                return 'llama-3.1-sonar-small-128k-online';
            case 'azure':
                return 'gpt-4o-mini';
            default:
                return 'gpt-4o-mini';
        }
    }

    

    /**
     * Get supported providers
     */
    static getSupportedProviders(): ServiceName[] {
        return ['openai', 'google', 'anthropic', 'mistral', 'groq', 'perplexity', 'azure'];
    }


}