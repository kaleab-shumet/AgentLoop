import { DefaultAIProvider } from '../core/providers/DefaultAIProvider';
import { AIConfig, ServiceName } from '../core/types/types';
import { AgentError } from '../core/utils/AgentError';
import { generateText } from 'ai';

// Mock the ai package
jest.mock('ai', () => ({
    generateText: jest.fn(),
}));

// Mock the provider packages
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn(() => jest.fn()) }));
jest.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: jest.fn(() => jest.fn()) }));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn(() => jest.fn()) }));
jest.mock('@ai-sdk/mistral', () => ({ createMistral: jest.fn(() => jest.fn()) }));
jest.mock('@ai-sdk/groq', () => ({ createGroq: jest.fn(() => jest.fn()) }));
jest.mock('@ai-sdk/perplexity', () => ({ createPerplexity: jest.fn(() => jest.fn()) }));
jest.mock('@ai-sdk/azure', () => ({ createAzure: jest.fn(() => jest.fn()) }));

describe('DefaultAIProvider', () => {
    const defaultConfig: AIConfig = {
        service: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
    };

    it('should throw error if apiKey is missing', () => {
        expect(() => new DefaultAIProvider({ service: 'openai', apiKey: '' })).toThrow(AgentError);
    });

    it('should throw error if service is missing', () => {
        expect(() => new DefaultAIProvider({ service: '' as any, apiKey: 'key' })).toThrow(AgentError);
    });

    it('should return config', () => {
        const provider = new DefaultAIProvider(defaultConfig);
        expect(provider.getConfig()).toEqual(defaultConfig);
    });

    it('should get supported providers', () => {
        expect(DefaultAIProvider.getSupportedProviders()).toContain('openai');
    });

    describe('getCompletion', () => {
        it('should call generateText and return response', async () => {
            (generateText as jest.Mock).mockResolvedValue({
                text: 'AI response',
                usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            });

            const provider = new DefaultAIProvider(defaultConfig);
            const response = await provider.getCompletion('Hello');

            expect(generateText).toHaveBeenCalled();
            expect(response.text).toBe('AI response');
            expect(response.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
        });

        it('should handle missing usage in result', async () => {
            (generateText as jest.Mock).mockResolvedValue({
                text: 'AI response',
            });

            const provider = new DefaultAIProvider(defaultConfig);
            const response = await provider.getCompletion('Hello');

            expect(response.usage).toBeUndefined();
        });

        it('should handle authentication errors', async () => {
            (generateText as jest.Mock).mockRejectedValue(new Error('API key invalid'));

            const provider = new DefaultAIProvider(defaultConfig);
            await expect(provider.getCompletion('Hello')).rejects.toThrow('API authentication failed');
        });

        it('should handle model errors', async () => {
            (generateText as jest.Mock).mockRejectedValue(new Error('model not found'));

            const provider = new DefaultAIProvider(defaultConfig);
            await expect(provider.getCompletion('Hello')).rejects.toThrow('not available');
        });

        it('should handle unknown errors', async () => {
            (generateText as jest.Mock).mockRejectedValue(new Error('Something went wrong'));

            const provider = new DefaultAIProvider(defaultConfig);
            await expect(provider.getCompletion('Hello')).rejects.toThrow('AI provider error');
        });

        it('should handle non-Error objects in catch', async () => {
            (generateText as jest.Mock).mockRejectedValue('String error');

            const provider = new DefaultAIProvider(defaultConfig);
            await expect(provider.getCompletion('Hello')).rejects.toThrow('AI provider error: String error');
        });
    });

    describe('Provider Creation', () => {
        const testProvider = (service: ServiceName) => {
            it(`should create ${service} model`, async () => {
                (generateText as jest.Mock).mockResolvedValue({ text: 'ok' });
                const provider = new DefaultAIProvider({ service, apiKey: 'key' });
                await provider.getCompletion('test');
            });
        };

        testProvider('openai');
        testProvider('google');
        testProvider('anthropic');
        testProvider('mistral');
        testProvider('groq');
        testProvider('perplexity');
        testProvider('azure');

        it('should throw error for unsupported service in getModel', async () => {
            const provider = new DefaultAIProvider(defaultConfig);
            (provider as any).config.service = 'INVALID';
            await expect(provider.getCompletion('test')).rejects.toThrow('Unsupported service');
        });
    });
});
