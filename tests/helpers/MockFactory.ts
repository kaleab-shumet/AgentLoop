import { jest } from '@jest/globals';
import { AIProvider } from '../../core/providers/AIProvider';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { ToolDefinition, ToolResult, FunctionCallingResponse } from '../../core/types/types';
import { Logger } from '../../core/utils/Logger';
import { z } from 'zod';

export class MockFactory {
  /**
   * Creates a mock AI provider with predefined responses
   */
  static createMockAIProvider(responses: string[]): jest.Mocked<AIProvider> {
    const mockProvider = {
      generateResponse: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
      getProviderName: jest.fn().mockReturnValue('mock-provider'),
    } as jest.Mocked<AIProvider>;

    // Set up sequential responses
    responses.forEach((response, index) => {
      mockProvider.generateResponse.mockReturnValueOnce(Promise.resolve(response));
    });

    return mockProvider;
  }

  /**
   * Creates a mock AI provider that returns function calling responses
   */
  static createMockFunctionCallingProvider(responses: FunctionCallingResponse[]): jest.Mocked<AIProvider> {
    const mockProvider = this.createMockAIProvider([]);
    
    responses.forEach((response, index) => {
      mockProvider.generateResponse.mockReturnValueOnce(Promise.resolve(JSON.stringify(response)));
    });

    return mockProvider;
  }

  /**
   * Creates a mock tool definition with optional schema
   */
  static createMockTool(
    name: string, 
    schema?: z.ZodSchema,
    implementation?: (args: any) => Promise<ToolResult>
  ): ToolDefinition {
    return {
      name,
      description: `Mock tool: ${name}`,
      schema: schema || z.object({}),
      implementation: implementation || (async (args: any) => ({
        success: true,
        result: `Mock result for ${name}`,
      })),
    };
  }

  /**
   * Creates a mock tool that always succeeds
   */
  static createSuccessfulTool(name: string, result: any = `Success from ${name}`): ToolDefinition {
    return this.createMockTool(
      name,
      z.object({ input: z.string().optional() }),
      async (args: any) => ({
        success: true,
        result,
      })
    );
  }

  /**
   * Creates a mock tool that always fails
   */
  static createFailingTool(name: string, error: string = `Error from ${name}`): ToolDefinition {
    return this.createMockTool(
      name,
      z.object({ input: z.string().optional() }),
      async (args: any) => ({
        success: false,
        result: error,
      })
    );
  }

  /**
   * Creates a mock tool that simulates slow execution
   */
  static createSlowTool(name: string, delay: number = 1000): ToolDefinition {
    return this.createMockTool(
      name,
      z.object({ input: z.string().optional() }),
      async (args: any) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        return {
          success: true,
          result: `Slow result from ${name}`,
        };
      }
    );
  }

  /**
   * Creates a mock logger
   */
  static createMockLogger(): jest.Mocked<Logger> {
    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }

  /**
   * Creates a realistic function calling response
   */
  static createFunctionCallingResponse(
    toolName: string,
    args: Record<string, any> = {}
  ): FunctionCallingResponse {
    return {
      name: toolName,
      arguments: args,
    };
  }

  /**
   * Creates multiple function calling responses
   */
  static createMultipleFunctionCallingResponse(
    calls: Array<{ name: string; args: Record<string, any> }>
  ): FunctionCallingResponse[] {
    return calls.map(call => this.createFunctionCallingResponse(call.name, call.args));
  }

  /**
   * Creates a mock DefaultAIProvider with realistic behavior
   */
  static createRealisticMockAIProvider(): jest.Mocked<DefaultAIProvider> {
    const mockProvider = {
      generateResponse: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
      getProviderName: jest.fn().mockReturnValue('mock-openai'),
    } as any;

    // Default to successful responses
    mockProvider.generateResponse.mockImplementation(async (prompt: string) => {
      if (prompt.includes('error')) {
        throw new Error('Mock AI provider error');
      }
      return JSON.stringify({
        name: 'mock_tool',
        arguments: { input: 'test' },
      });
    });

    return mockProvider;
  }

  /**
   * Creates test data for stagnation detection
   */
  static createStagnationTestData(): Array<{ name: string; arguments: Record<string, any> }> {
    return [
      { name: 'tool1', arguments: { input: 'test1' } },
      { name: 'tool2', arguments: { input: 'test2' } },
      { name: 'tool1', arguments: { input: 'test1' } }, // Repeat
      { name: 'tool2', arguments: { input: 'test2' } }, // Repeat
      { name: 'tool1', arguments: { input: 'test1' } }, // Repeat again
    ];
  }

  /**
   * Creates test configuration for agents
   */
  static createTestAgentConfig(overrides: any = {}) {
    return {
      maxIterations: 10,
      enableStagnationDetection: true,
      stagnationThreshold: 3,
      enableParallelExecution: false,
      ...overrides,
    };
  }
}