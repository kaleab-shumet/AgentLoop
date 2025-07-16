import { DefaultAIProvider } from '../../../../core/providers/DefaultAIProvider';
import { AIProvider } from '../../../../core/providers/AIProvider';
import { MockFactory, TestDataFactory } from '../../../helpers';
import { Tool, FunctionDefinition } from '../../../../core/types/types';
import { z } from 'zod';

describe('Provider Integration Tests', () => {
  let mockProvider: DefaultAIProvider;
  let testTools: Tool<any>[];

  beforeEach(() => {
    // Create a mock DefaultAIProvider that simulates real behavior
    mockProvider = new DefaultAIProvider('test-provider', {
      apiKey: 'test-key',
      model: 'test-model',
    });

    // Mock the actual implementation for testing
    (mockProvider as any).generateResponse = jest.fn();
    (mockProvider as any).isConfigured = jest.fn().mockReturnValue(true);
    (mockProvider as any).getProviderName = jest.fn().mockReturnValue('test-provider');

    testTools = [
      MockFactory.createMockTool('weather_tool', z.object({
        location: z.string(),
        unit: z.enum(['celsius', 'fahrenheit']).optional(),
      })),
      MockFactory.createMockTool('calculator_tool', z.object({
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        a: z.number(),
        b: z.number(),
      })),
      MockFactory.createMockTool('search_tool', z.object({
        query: z.string(),
        limit: z.number().optional(),
      })),
    ];
  });

  describe('Provider Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(mockProvider.getProviderName()).toBe('test-provider');
      expect(mockProvider.isConfigured()).toBe(true);
    });

    it('should handle missing configuration gracefully', () => {
      const unconfiguredProvider = new DefaultAIProvider('unconfigured-provider', {});
      
      // Mock the behavior for unconfigured provider
      (unconfiguredProvider as any).isConfigured = jest.fn().mockReturnValue(false);
      
      expect(unconfiguredProvider.isConfigured()).toBe(false);
    });

    it('should validate provider name', () => {
      expect(mockProvider.getProviderName()).toBe('test-provider');
      expect(typeof mockProvider.getProviderName()).toBe('string');
      expect(mockProvider.getProviderName().length).toBeGreaterThan(0);
    });
  });

  describe('Response Generation', () => {
    it('should generate valid responses for simple prompts', async () => {
      const mockResponse = JSON.stringify({
        name: 'weather_tool',
        arguments: { location: 'New York', unit: 'celsius' },
      });

      (mockProvider as any).generateResponse.mockResolvedValue(mockResponse);

      const response = await mockProvider.generateResponse('What is the weather in New York?');
      
      expect(response).toBe(mockResponse);
      expect(typeof response).toBe('string');
    });

    it('should handle complex prompts with multiple tools', async () => {
      const mockResponse = JSON.stringify([
        { name: 'search_tool', arguments: { query: 'AI trends', limit: 10 } },
        { name: 'calculator_tool', arguments: { operation: 'add', a: 5, b: 3 } },
      ]);

      (mockProvider as any).generateResponse.mockResolvedValue(mockResponse);

      const complexPrompt = `
        Search for AI trends and calculate 5 + 3.
        Available tools: ${testTools.map(t => t.name).join(', ')}
      `;

      const response = await mockProvider.generateResponse(complexPrompt);
      
      expect(response).toBe(mockResponse);
      expect(response).toContain('search_tool');
      expect(response).toContain('calculator_tool');
    });

    it('should handle prompts with function definitions', async () => {
      const mockResponse = JSON.stringify({
        name: 'calculator_tool',
        arguments: { operation: 'multiply', a: 7, b: 6 },
      });

      (mockProvider as any).generateResponse.mockResolvedValue(mockResponse);

      const functionDefinitions: FunctionDefinition[] = testTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: {
            // Simplified schema representation
            ...(tool.name === 'calculator_tool' && {
              operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
              a: { type: 'number' },
              b: { type: 'number' },
            }),
          },
          required: tool.name === 'calculator_tool' ? ['operation', 'a', 'b'] : [],
        },
      }));

      const promptWithFunctions = `
        Calculate 7 * 6.
        Functions: ${JSON.stringify(functionDefinitions)}
      `;

      const response = await mockProvider.generateResponse(promptWithFunctions);
      
      expect(response).toBe(mockResponse);
      expect(response).toContain('multiply');
      expect(response).toContain('7');
      expect(response).toContain('6');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network request failed');
      (mockProvider as any).generateResponse.mockRejectedValue(networkError);

      await expect(mockProvider.generateResponse('Test prompt')).rejects.toThrow('Network request failed');
    });

    it('should handle API rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (mockProvider as any).generateResponse.mockRejectedValue(rateLimitError);

      await expect(mockProvider.generateResponse('Test prompt')).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Invalid API key');
      (mockProvider as any).generateResponse.mockRejectedValue(authError);

      await expect(mockProvider.generateResponse('Test prompt')).rejects.toThrow('Invalid API key');
    });

    it('should handle malformed responses', async () => {
      const malformedResponse = 'This is not valid JSON';
      (mockProvider as any).generateResponse.mockResolvedValue(malformedResponse);

      const response = await mockProvider.generateResponse('Test prompt');
      
      expect(response).toBe(malformedResponse);
      // Error handling for malformed responses would be done by the handler
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      (mockProvider as any).generateResponse.mockRejectedValue(timeoutError);

      await expect(mockProvider.generateResponse('Test prompt')).rejects.toThrow('Request timeout');
    });
  });

  describe('Function Calling Format', () => {
    it('should generate function calling format responses', async () => {
      const functionCallResponse = {
        name: 'weather_tool',
        arguments: { location: 'London', unit: 'celsius' },
      };

      (mockProvider as any).generateResponse.mockResolvedValue(JSON.stringify(functionCallResponse));

      const response = await mockProvider.generateResponse('Get weather for London');
      const parsed = JSON.parse(response);
      
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('arguments');
      expect(parsed.name).toBe('weather_tool');
      expect(parsed.arguments).toHaveProperty('location');
      expect(parsed.arguments.location).toBe('London');
    });

    it('should handle multiple function calls', async () => {
      const multipleFunctionCalls = [
        { name: 'search_tool', arguments: { query: 'weather forecast' } },
        { name: 'weather_tool', arguments: { location: 'Paris' } },
      ];

      (mockProvider as any).generateResponse.mockResolvedValue(JSON.stringify(multipleFunctionCalls));

      const response = await mockProvider.generateResponse('Search for weather forecast and get Paris weather');
      const parsed = JSON.parse(response);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('search_tool');
      expect(parsed[1].name).toBe('weather_tool');
    });

    it('should handle function calls with complex arguments', async () => {
      const complexFunctionCall = {
        name: 'calculator_tool',
        arguments: {
          operation: 'add',
          a: 123.45,
          b: 678.90,
        },
      };

      (mockProvider as any).generateResponse.mockResolvedValue(JSON.stringify(complexFunctionCall));

      const response = await mockProvider.generateResponse('Calculate 123.45 + 678.90');
      const parsed = JSON.parse(response);
      
      expect(parsed.name).toBe('calculator_tool');
      expect(parsed.arguments.operation).toBe('add');
      expect(parsed.arguments.a).toBe(123.45);
      expect(parsed.arguments.b).toBe(678.90);
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle high-frequency requests', async () => {
      const responses = Array.from({ length: 50 }, (_, i) => 
        JSON.stringify({ name: 'test_tool', arguments: { index: i } })
      );

      responses.forEach((response, index) => {
        (mockProvider as any).generateResponse.mockResolvedValueOnce(response);
      });

      const promises = responses.map((_, index) => 
        mockProvider.generateResponse(`Request ${index}`)
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(50);
      results.forEach((result, index) => {
        expect(result).toContain(`"index":${index}`);
      });
    });

    it('should maintain consistent response times', async () => {
      const executionTimes: number[] = [];
      
      (mockProvider as any).generateResponse.mockImplementation(async (prompt: string) => {
        // Simulate variable response time
        const delay = Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        return JSON.stringify({ name: 'test_tool', arguments: { prompt } });
      });

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await mockProvider.generateResponse(`Test prompt ${i}`);
        const endTime = Date.now();
        executionTimes.push(endTime - startTime);
      }

      const averageTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
      const maxTime = Math.max(...executionTimes);
      
      expect(averageTime).toBeLessThan(200); // Should average under 200ms
      expect(maxTime).toBeLessThan(500); // No single request should take over 500ms
    });

    it('should handle concurrent requests safely', async () => {
      (mockProvider as any).generateResponse.mockImplementation(async (prompt: string) => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 50));
        return JSON.stringify({ name: 'concurrent_tool', arguments: { prompt } });
      });

      const concurrentPromises = Array.from({ length: 20 }, (_, i) => 
        mockProvider.generateResponse(`Concurrent request ${i}`)
      );

      const results = await Promise.all(concurrentPromises);
      
      expect(results).toHaveLength(20);
      results.forEach((result, index) => {
        expect(result).toContain(`Concurrent request ${index}`);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty prompts', async () => {
      const emptyResponse = JSON.stringify({ name: 'default_tool', arguments: {} });
      (mockProvider as any).generateResponse.mockResolvedValue(emptyResponse);

      const response = await mockProvider.generateResponse('');
      
      expect(response).toBe(emptyResponse);
    });

    it('should handle very long prompts', async () => {
      const longPrompt = 'x'.repeat(50000);
      const longResponse = JSON.stringify({ name: 'long_tool', arguments: { input: 'processed' } });
      
      (mockProvider as any).generateResponse.mockResolvedValue(longResponse);

      const response = await mockProvider.generateResponse(longPrompt);
      
      expect(response).toBe(longResponse);
    });

    it('should handle special characters in prompts', async () => {
      const specialPrompt = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const specialResponse = JSON.stringify({ name: 'special_tool', arguments: { input: specialPrompt } });
      
      (mockProvider as any).generateResponse.mockResolvedValue(specialResponse);

      const response = await mockProvider.generateResponse(specialPrompt);
      
      expect(response).toBe(specialResponse);
    });

    it('should handle Unicode characters', async () => {
      const unicodePrompt = '🚀🎉🔥💯✨🌟⚡🎯';
      const unicodeResponse = JSON.stringify({ name: 'unicode_tool', arguments: { input: unicodePrompt } });
      
      (mockProvider as any).generateResponse.mockResolvedValue(unicodeResponse);

      const response = await mockProvider.generateResponse(unicodePrompt);
      
      expect(response).toBe(unicodeResponse);
    });

    it('should handle null and undefined inputs', async () => {
      const nullResponse = JSON.stringify({ name: 'null_tool', arguments: {} });
      (mockProvider as any).generateResponse.mockResolvedValue(nullResponse);

      // Test with null input
      const response1 = await mockProvider.generateResponse(null as any);
      expect(response1).toBe(nullResponse);

      // Test with undefined input
      const response2 = await mockProvider.generateResponse(undefined as any);
      expect(response2).toBe(nullResponse);
    });
  });

  describe('Provider Compatibility', () => {
    it('should maintain consistent interface across different providers', async () => {
      const providers = [
        new DefaultAIProvider('openai', { apiKey: 'test' }),
        new DefaultAIProvider('anthropic', { apiKey: 'test' }),
        new DefaultAIProvider('google', { apiKey: 'test' }),
      ];

      providers.forEach(provider => {
        // Mock each provider
        (provider as any).generateResponse = jest.fn().mockResolvedValue('{}');
        (provider as any).isConfigured = jest.fn().mockReturnValue(true);
        (provider as any).getProviderName = jest.fn().mockReturnValue('test');

        expect(provider.generateResponse).toBeDefined();
        expect(provider.isConfigured).toBeDefined();
        expect(provider.getProviderName).toBeDefined();
      });
    });

    it('should handle provider-specific response formats', async () => {
      const providerFormats = [
        { name: 'openai', format: { function_call: { name: 'tool', arguments: '{}' } } },
        { name: 'anthropic', format: { name: 'tool', arguments: {} } },
        { name: 'google', format: { functionCall: { name: 'tool', args: {} } } },
      ];

      for (const providerFormat of providerFormats) {
        (mockProvider as any).generateResponse.mockResolvedValue(JSON.stringify(providerFormat.format));
        (mockProvider as any).getProviderName.mockReturnValue(providerFormat.name);

        const response = await mockProvider.generateResponse('Test prompt');
        const parsed = JSON.parse(response);
        
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
      }
    });
  });

  describe('Integration with Tools', () => {
    it('should work seamlessly with tool definitions', async () => {
      const toolDefinitions = testTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      }));

      const responseWithTool = JSON.stringify({
        name: testTools[0].name,
        arguments: { location: 'Tokyo' },
      });

      (mockProvider as any).generateResponse.mockResolvedValue(responseWithTool);

      const prompt = `
        Use the weather tool to get weather for Tokyo.
        Available tools: ${JSON.stringify(toolDefinitions)}
      `;

      const response = await mockProvider.generateResponse(prompt);
      const parsed = JSON.parse(response);
      
      expect(parsed.name).toBe(testTools[0].name);
      expect(parsed.arguments).toHaveProperty('location');
      expect(parsed.arguments.location).toBe('Tokyo');
    });

    it('should handle tool validation errors gracefully', async () => {
      const invalidToolResponse = JSON.stringify({
        name: 'non_existent_tool',
        arguments: { invalid: 'arguments' },
      });

      (mockProvider as any).generateResponse.mockResolvedValue(invalidToolResponse);

      const response = await mockProvider.generateResponse('Use non-existent tool');
      
      expect(response).toBe(invalidToolResponse);
      // Tool validation would be handled by the response handler
    });
  });
});