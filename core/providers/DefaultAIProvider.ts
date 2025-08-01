import { FunctionCallTool, AIConfig, ServiceName, AICompletionResponse, TokenUsage } from "../types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { AIProvider } from "./AIProvider";
import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMistral } from "@ai-sdk/mistral";
import { createCohere } from "@ai-sdk/cohere";
import { createGroq } from "@ai-sdk/groq";
import { createFireworks } from "@ai-sdk/fireworks";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createAzure } from "@ai-sdk/azure";
import { z } from "zod";

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
    async getCompletion(prompt: string, tools: FunctionCallTool[] = [], options = {}): Promise<AICompletionResponse> {
        try {


            const model = this.getModel();

            // Convert tools to AI-SDK format using the Zod schemas directly
            const aiTools = tools.length > 0 ? tools.reduce((acc, functionTool) => {
                acc[functionTool.function.name] = tool({
                    description: functionTool.function.description,
                    parameters: functionTool.function.parameters // Use Zod schema directly
                });
                return acc;
            }, {} as Record<string, any>) : undefined;

            const result = await generateText({
                model,
                prompt,
                tools: aiTools,
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

        } catch (error: any) {
            // Enhanced error handling with provider-specific guidance
            if (error.message?.includes('API key') || error.message?.includes('authentication')) {
                throw new AgentError(
                    `API authentication failed for ${this.config.service}. Please check your API key.`,
                    AgentErrorType.CONFIGURATION_ERROR,
                    { service: this.config.service, hasApiKey: !!this.config.apiKey, originalError: error.message }
                );
            }

            if (error.message?.includes('model')) {
                throw new AgentError(
                    `Model "${this.config.model}" not available for ${this.config.service}. Try a different model.`,
                    AgentErrorType.CONFIGURATION_ERROR,
                    { service: this.config.service, model: this.config.model, originalError: error.message }
                );
            }

            throw new AgentError(
                `AI provider error: ${error.message}`,
                AgentErrorType.UNKNOWN,
                { service: this.config.service, originalError: error.message, errorType: error.name }
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
            case 'mistral':
                const mistral = createMistral({
                    apiKey: this.config.apiKey,
                });
                return mistral(modelName);
            case 'cohere':
                const cohere = createCohere({
                    apiKey: this.config.apiKey,
                });
                return cohere(modelName);
            case 'groq':
                const groq = createGroq({
                    apiKey: this.config.apiKey,
                });
                return groq(modelName);
            case 'fireworks':
                const fireworks = createFireworks({
                    apiKey: this.config.apiKey,
                });
                return fireworks(modelName);
            case 'deepseek':
                const deepseek = createDeepSeek({
                    apiKey: this.config.apiKey,
                });
                return deepseek(modelName);
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
            case 'cohere':
                return 'command-r-plus';
            case 'groq':
                return 'llama3-8b-8192';
            case 'fireworks':
                return 'accounts/fireworks/models/llama-v3p1-8b-instruct';
            case 'deepseek':
                return 'deepseek-chat';
            case 'perplexity':
                return 'llama-3.1-sonar-small-128k-online';
            case 'azure':
                return 'gpt-4o-mini';
            default:
                return 'gpt-4o-mini';
        }
    }

    /**
     * Convert JSON schema to Zod schema for AI-SDK compatibility
     */
    private convertToZodSchema(jsonSchema: any): z.ZodSchema {
        if (!jsonSchema || typeof jsonSchema !== 'object') {
            return z.any();
        }

        if (!jsonSchema.properties) {
            return z.object({});
        }

        const zodObj: Record<string, z.ZodSchema> = {};

        try {
            for (const [key, value] of Object.entries(jsonSchema.properties)) {
                const prop = value as any;
                let zodSchema: z.ZodSchema;

                switch (prop.type) {
                    case 'string':
                        if (prop.enum && Array.isArray(prop.enum)) {
                            zodSchema = z.enum(prop.enum as [string, ...string[]]);
                        } else {
                            zodSchema = z.string();
                        }
                        break;
                    case 'number':
                        zodSchema = z.number();
                        break;
                    case 'integer':
                        zodSchema = z.number().int();
                        break;
                    case 'boolean':
                        zodSchema = z.boolean();
                        break;
                    case 'array':
                        // Handle array items properly with recursion
                        if (prop.items) {
                            const itemSchema = this.convertToZodSchema(prop.items);
                            zodSchema = z.array(itemSchema);
                        } else {
                            zodSchema = z.array(z.any());
                        }
                        break;
                    case 'object':
                        // Recursive object handling
                        if (prop.properties) {
                            zodSchema = this.convertToZodSchema(prop);
                        } else {
                            zodSchema = z.object({});
                        }
                        break;
                    default:
                        zodSchema = z.any();
                }

                if (prop.description && typeof prop.description === 'string') {
                    zodSchema = zodSchema.describe(prop.description);
                }

                if (!jsonSchema.required?.includes(key)) {
                    zodSchema = zodSchema.optional();
                }

                zodObj[key] = zodSchema;
            }

            return z.object(zodObj);
        } catch (error) {
            // Fallback to any schema if conversion fails
            return z.any();
        }
    }

    /**
     * Get supported providers
     */
    static getSupportedProviders(): ServiceName[] {
        return ['openai', 'google', 'anthropic', 'mistral', 'cohere', 'groq', 'fireworks', 'deepseek', 'perplexity', 'azure'];
    }


}