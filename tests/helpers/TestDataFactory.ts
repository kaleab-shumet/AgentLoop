import { ToolDefinition, FunctionCallingResponse, ChatEntry } from '../../core/types/types';
import { z } from 'zod';

export class TestDataFactory {
  /**
   * Generates a realistic tool definition
   */
  static generateToolDefinition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
    const defaults: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool for unit testing',
      schema: z.object({
        input: z.string().describe('Input parameter'),
        optional: z.boolean().optional().describe('Optional parameter'),
      }),
      implementation: async (args: any) => ({
        success: true,
        result: `Test result: ${args.input}`,
      }),
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Generates multiple tool definitions
   */
  static generateMultipleToolDefinitions(count: number): ToolDefinition[] {
    return Array.from({ length: count }, (_, index) => 
      this.generateToolDefinition({
        name: `tool_${index + 1}`,
        description: `Test tool ${index + 1}`,
      })
    );
  }

  /**
   * Generates a function calling response
   */
  static generateFunctionCallingResponse(
    toolName: string,
    args: Record<string, any> = {}
  ): FunctionCallingResponse {
    return {
      name: toolName,
      arguments: args,
    };
  }

  /**
   * Generates multiple function calling responses
   */
  static generateMultipleFunctionCallingResponses(
    tools: Array<{ name: string; args?: Record<string, any> }>
  ): FunctionCallingResponse[] {
    return tools.map(tool => 
      this.generateFunctionCallingResponse(tool.name, tool.args || {})
    );
  }

  /**
   * Generates chat history entries
   */
  static generateChatHistory(length: number = 5): ChatEntry[] {
    const entries: ChatEntry[] = [];
    
    for (let i = 0; i < length; i++) {
      entries.push({
        role: 'user',
        content: `User message ${i + 1}`,
      });
      
      entries.push({
        role: 'assistant',
        content: `Assistant response ${i + 1}`,
      });
    }
    
    return entries;
  }

  /**
   * Generates error scenarios for testing
   */
  static generateErrorScenarios(): Array<{
    name: string;
    error: Error;
    expectedRecovery: boolean;
  }> {
    return [
      {
        name: 'JSON Parse Error',
        error: new SyntaxError('Unexpected token in JSON'),
        expectedRecovery: true,
      },
      {
        name: 'Network Error',
        error: new Error('Network request failed'),
        expectedRecovery: true,
      },
      {
        name: 'Authentication Error',
        error: new Error('Invalid API key'),
        expectedRecovery: false,
      },
      {
        name: 'Rate Limit Error',
        error: new Error('Rate limit exceeded'),
        expectedRecovery: true,
      },
      {
        name: 'Tool Execution Error',
        error: new Error('Tool execution failed'),
        expectedRecovery: true,
      },
    ];
  }

  /**
   * Generates performance test data
   */
  static generatePerformanceTestData(size: 'small' | 'medium' | 'large' = 'medium'): any {
    const sizes = {
      small: { iterations: 10, toolCount: 5, historyLength: 10 },
      medium: { iterations: 50, toolCount: 20, historyLength: 50 },
      large: { iterations: 100, toolCount: 50, historyLength: 100 },
    };

    const config = sizes[size];
    
    return {
      iterations: config.iterations,
      tools: this.generateMultipleToolDefinitions(config.toolCount),
      history: this.generateChatHistory(config.historyLength),
      expectedMaxExecutionTime: config.iterations * 100, // 100ms per iteration
    };
  }

  /**
   * Generates stagnation test patterns
   */
  static generateStagnationPatterns(): Array<{
    name: string;
    pattern: Array<{ name: string; arguments: Record<string, any> }>;
    shouldDetectStagnation: boolean;
  }> {
    return [
      {
        name: 'Exact Repetition',
        pattern: [
          { name: 'tool1', arguments: { input: 'test' } },
          { name: 'tool1', arguments: { input: 'test' } },
          { name: 'tool1', arguments: { input: 'test' } },
        ],
        shouldDetectStagnation: true,
      },
      {
        name: 'Cyclic Pattern',
        pattern: [
          { name: 'tool1', arguments: { input: 'a' } },
          { name: 'tool2', arguments: { input: 'b' } },
          { name: 'tool1', arguments: { input: 'a' } },
          { name: 'tool2', arguments: { input: 'b' } },
        ],
        shouldDetectStagnation: true,
      },
      {
        name: 'Progressive Pattern',
        pattern: [
          { name: 'tool1', arguments: { input: 'step1' } },
          { name: 'tool2', arguments: { input: 'step2' } },
          { name: 'tool3', arguments: { input: 'step3' } },
        ],
        shouldDetectStagnation: false,
      },
      {
        name: 'Similar but Different',
        pattern: [
          { name: 'tool1', arguments: { input: 'test1' } },
          { name: 'tool1', arguments: { input: 'test2' } },
          { name: 'tool1', arguments: { input: 'test3' } },
        ],
        shouldDetectStagnation: false,
      },
    ];
  }

  /**
   * Generates edge case test data
   */
  static generateEdgeCaseData(): Array<{
    name: string;
    input: any;
    expectedBehavior: 'error' | 'success' | 'recovery';
  }> {
    return [
      {
        name: 'Empty Input',
        input: '',
        expectedBehavior: 'error',
      },
      {
        name: 'Null Input',
        input: null,
        expectedBehavior: 'error',
      },
      {
        name: 'Undefined Input',
        input: undefined,
        expectedBehavior: 'error',
      },
      {
        name: 'Very Large Input',
        input: 'x'.repeat(100000),
        expectedBehavior: 'success',
      },
      {
        name: 'Special Characters',
        input: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        expectedBehavior: 'success',
      },
      {
        name: 'Unicode Characters',
        input: '🚀🎉🔥💯✨🌟⚡🎯',
        expectedBehavior: 'success',
      },
      {
        name: 'JSON-like String',
        input: '{"malformed": json}',
        expectedBehavior: 'success',
      },
      {
        name: 'HTML-like String',
        input: '<script>alert("test")</script>',
        expectedBehavior: 'success',
      },
    ];
  }

  /**
   * Generates realistic conversation flows
   */
  static generateConversationFlows(): Array<{
    name: string;
    steps: Array<{
      userInput: string;
      expectedTools: string[];
      expectedSuccess: boolean;
    }>;
  }> {
    return [
      {
        name: 'Simple Question-Answer',
        steps: [
          {
            userInput: 'What is the weather like?',
            expectedTools: ['weather_check'],
            expectedSuccess: true,
          },
        ],
      },
      {
        name: 'Multi-step Task',
        steps: [
          {
            userInput: 'Create a file and write some content',
            expectedTools: ['file_create', 'file_write'],
            expectedSuccess: true,
          },
        ],
      },
      {
        name: 'Error Recovery Flow',
        steps: [
          {
            userInput: 'Read a non-existent file',
            expectedTools: ['file_read'],
            expectedSuccess: false,
          },
          {
            userInput: 'Create the file first',
            expectedTools: ['file_create'],
            expectedSuccess: true,
          },
        ],
      },
    ];
  }
}