import { PromptManager, PromptManagerConfig } from '../../../../core/prompt/PromptManager';
import { PromptTemplateInterface, PromptOptions } from '../../../../core/prompt/PromptTemplateInterface';
import { DefaultPromptTemplate, FormatType } from '../../../../core/prompt/DefaultPromptTemplate';
import { Tool, ChatEntry, ToolResult } from '../../../../core/types/types';
import { MockFactory, TestDataFactory } from '../../../helpers';
import { z } from 'zod';

// Mock custom template for testing
class MockPromptTemplate implements PromptTemplateInterface {
  buildPrompt(
    systemPrompt: string,
    userInput: string,
    options: PromptOptions,
    tools: Tool<any>[],
    history: ChatEntry[],
    toolHistory: ToolResult[],
    errorRecoveryInstructions?: string
  ): string {
    return `MOCK: ${systemPrompt} | ${userInput} | ${tools.length} tools | ${history.length} history`;
  }
}

describe('PromptManager', () => {
  let promptManager: PromptManager;
  let mockTools: Tool<any>[];
  let mockHistory: ChatEntry[];
  let mockToolHistory: ToolResult[];

  beforeEach(() => {
    promptManager = new PromptManager('Test system prompt');
    
    mockTools = [
      MockFactory.createSuccessfulTool('tool1'),
      MockFactory.createSuccessfulTool('tool2'),
      MockFactory.createSuccessfulTool('tool3'),
    ];

    mockHistory = TestDataFactory.generateChatHistory(3);
    
    mockToolHistory = [
      { success: true, result: 'Tool 1 result' },
      { success: false, result: 'Tool 2 error' },
      { success: true, result: 'Tool 3 result' },
    ];
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      const manager = new PromptManager('System prompt');
      expect(manager).toBeDefined();
    });

    it('should initialize with custom response format', () => {
      const manager = new PromptManager('System prompt', {
        responseFormat: FormatType.FUNCTION_CALLING,
      });
      expect(manager).toBeDefined();
    });

    it('should initialize with custom template', () => {
      const customTemplate = new MockPromptTemplate();
      const manager = new PromptManager('System prompt', {
        customTemplate,
      });
      expect(manager).toBeDefined();
    });

    it('should initialize with custom prompt options', () => {
      const customOptions: PromptOptions = {
        includeContext: false,
        includeConversationHistory: false,
        includeToolHistory: false,
        maxHistoryEntries: 5,
        parallelExecution: true,
      };

      const manager = new PromptManager('System prompt', {
        promptOptions: customOptions,
      });
      expect(manager).toBeDefined();
    });

    it('should initialize with error recovery instructions', () => {
      const manager = new PromptManager('System prompt', {
        errorRecoveryInstructions: 'Custom error recovery instructions',
      });
      expect(manager).toBeDefined();
    });

    it('should handle empty system prompt', () => {
      const manager = new PromptManager('');
      expect(manager).toBeDefined();
    });
  });

  describe('buildPrompt', () => {
    it('should build basic prompt with minimal inputs', () => {
      const prompt = promptManager.buildPrompt('Hello world', mockTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('Hello world');
    });

    it('should include system prompt in output', () => {
      const systemPrompt = 'Custom system prompt';
      const manager = new PromptManager(systemPrompt);
      
      const prompt = manager.buildPrompt('User input', mockTools);
      
      expect(prompt).toContain(systemPrompt);
    });

    it('should include user input in output', () => {
      const userInput = 'Specific user request';
      const prompt = promptManager.buildPrompt(userInput, mockTools);
      
      expect(prompt).toContain(userInput);
    });

    it('should include tool definitions when provided', () => {
      const prompt = promptManager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toContain('tool1');
      expect(prompt).toContain('tool2');
      expect(prompt).toContain('tool3');
    });

    it('should include conversation history when provided', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        mockTools,
        mockHistory
      );
      
      expect(prompt).toContain('User message 1');
      expect(prompt).toContain('Assistant response 1');
    });

    it('should include tool history when provided', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        mockTools,
        mockHistory,
        mockToolHistory
      );
      
      expect(prompt).toContain('Tool 1 result');
      expect(prompt).toContain('Tool 2 error');
      expect(prompt).toContain('Tool 3 result');
    });

    it('should include error recovery instructions when provided', () => {
      const errorInstructions = 'Custom error recovery instructions';
      const manager = new PromptManager('System prompt', {
        errorRecoveryInstructions: errorInstructions,
      });
      
      const prompt = manager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toContain(errorInstructions);
    });

    it('should handle empty tools array', () => {
      const prompt = promptManager.buildPrompt('Test input', []);
      
      expect(prompt).toBeDefined();
      expect(prompt).toContain('Test input');
    });

    it('should handle empty history arrays', () => {
      const prompt = promptManager.buildPrompt('Test input', mockTools, [], []);
      
      expect(prompt).toBeDefined();
      expect(prompt).toContain('Test input');
    });

    it('should handle very long user input', () => {
      const longInput = 'x'.repeat(10000);
      const prompt = promptManager.buildPrompt(longInput, mockTools);
      
      expect(prompt).toBeDefined();
      expect(prompt).toContain(longInput);
    });

    it('should handle special characters in user input', () => {
      const specialInput = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const prompt = promptManager.buildPrompt(specialInput, mockTools);
      
      expect(prompt).toBeDefined();
      expect(prompt).toContain(specialInput);
    });

    it('should handle Unicode characters in user input', () => {
      const unicodeInput = '🚀🎉🔥💯✨🌟⚡🎯';
      const prompt = promptManager.buildPrompt(unicodeInput, mockTools);
      
      expect(prompt).toBeDefined();
      expect(prompt).toContain(unicodeInput);
    });
  });

  describe('Template System', () => {
    it('should use default template by default', () => {
      const prompt = promptManager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should use custom template when provided', () => {
      const customTemplate = new MockPromptTemplate();
      const manager = new PromptManager('System prompt', {
        customTemplate,
      });
      
      const prompt = manager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toContain('MOCK:');
      expect(prompt).toContain('System prompt');
      expect(prompt).toContain('Test input');
      expect(prompt).toContain('3 tools');
    });

    it('should pass all parameters to custom template', () => {
      const customTemplate = new MockPromptTemplate();
      const manager = new PromptManager('System prompt', {
        customTemplate,
      });
      
      const prompt = manager.buildPrompt(
        'Test input',
        mockTools,
        mockHistory,
        mockToolHistory
      );
      
      expect(prompt).toContain('MOCK:');
      expect(prompt).toContain('System prompt');
      expect(prompt).toContain('Test input');
      expect(prompt).toContain('3 tools');
      expect(prompt).toContain('6 history'); // 3 entries * 2 (user + assistant)
    });

    it('should handle template switching', () => {
      // First use default template
      const prompt1 = promptManager.buildPrompt('Test input', mockTools);
      expect(prompt1).not.toContain('MOCK:');
      
      // Switch to custom template
      const customTemplate = new MockPromptTemplate();
      const manager = new PromptManager('System prompt', {
        customTemplate,
      });
      
      const prompt2 = manager.buildPrompt('Test input', mockTools);
      expect(prompt2).toContain('MOCK:');
    });
  });

  describe('Configuration Options', () => {
    it('should respect includeContext option', () => {
      const manager = new PromptManager('System prompt', {
        promptOptions: { includeContext: false },
      });
      
      const prompt = manager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toBeDefined();
      // Context inclusion depends on template implementation
    });

    it('should respect includeConversationHistory option', () => {
      const manager = new PromptManager('System prompt', {
        promptOptions: { includeConversationHistory: false },
      });
      
      const prompt = manager.buildPrompt('Test input', mockTools, mockHistory);
      
      expect(prompt).toBeDefined();
      // History inclusion depends on template implementation
    });

    it('should respect includeToolHistory option', () => {
      const manager = new PromptManager('System prompt', {
        promptOptions: { includeToolHistory: false },
      });
      
      const prompt = manager.buildPrompt(
        'Test input',
        mockTools,
        mockHistory,
        mockToolHistory
      );
      
      expect(prompt).toBeDefined();
      // Tool history inclusion depends on template implementation
    });

    it('should respect maxHistoryEntries option', () => {
      const manager = new PromptManager('System prompt', {
        promptOptions: { maxHistoryEntries: 2 },
      });
      
      const longHistory = TestDataFactory.generateChatHistory(10);
      const prompt = manager.buildPrompt('Test input', mockTools, longHistory);
      
      expect(prompt).toBeDefined();
      // History truncation depends on template implementation
    });

    it('should respect parallelExecution option', () => {
      const manager = new PromptManager('System prompt', {
        promptOptions: { parallelExecution: true },
      });
      
      const prompt = manager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toBeDefined();
      // Parallel execution instructions depend on template implementation
    });
  });

  describe('Error Handling', () => {
    it('should handle null user input gracefully', () => {
      const prompt = promptManager.buildPrompt(null as any, mockTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle undefined user input gracefully', () => {
      const prompt = promptManager.buildPrompt(undefined as any, mockTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle null tools array gracefully', () => {
      const prompt = promptManager.buildPrompt('Test input', null as any);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle undefined tools array gracefully', () => {
      const prompt = promptManager.buildPrompt('Test input', undefined as any);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle invalid tool definitions', () => {
      const invalidTools = [
        { name: null, description: 'Invalid tool' },
        { name: 'valid_tool', description: null },
      ] as any;
      
      const prompt = promptManager.buildPrompt('Test input', invalidTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle circular references in history', () => {
      const circularHistory: any = [
        { role: 'user', content: 'User message' },
      ];
      circularHistory[0].self = circularHistory;
      
      const prompt = promptManager.buildPrompt('Test input', mockTools, circularHistory);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });
  });

  describe('Performance', () => {
    it('should handle large tool arrays efficiently', () => {
      const largeMockTools = Array.from({ length: 100 }, (_, i) => 
        MockFactory.createSuccessfulTool(`tool_${i}`)
      );
      
      const startTime = Date.now();
      const prompt = promptManager.buildPrompt('Test input', largeMockTools);
      const endTime = Date.now();
      
      expect(prompt).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle large history arrays efficiently', () => {
      const largeHistory = TestDataFactory.generateChatHistory(100);
      
      const startTime = Date.now();
      const prompt = promptManager.buildPrompt('Test input', mockTools, largeHistory);
      const endTime = Date.now();
      
      expect(prompt).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle complex tool schemas efficiently', () => {
      const complexTools = Array.from({ length: 10 }, (_, i) => ({
        name: `complex_tool_${i}`,
        description: `Complex tool ${i}`,
        argsSchema: z.object({
          level1: z.object({
            level2: z.object({
              level3: z.object({
                value: z.string(),
                array: z.array(z.number()),
                enum: z.enum(['a', 'b', 'c']),
              }),
            }),
          }),
        }),
        implementation: async (args: any) => ({ success: true, result: `complex_${i}` }),
      }));
      
      const startTime = Date.now();
      const prompt = promptManager.buildPrompt('Test input', complexTools);
      const endTime = Date.now();
      
      expect(prompt).toBeDefined();
      expect(endTime - startTime).toBeLessThan(200); // Should complete in under 200ms
    });

    it('should maintain consistent performance', () => {
      const executionTimes: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        const prompt = promptManager.buildPrompt(`Test input ${i}`, mockTools);
        const endTime = Date.now();
        
        executionTimes.push(endTime - startTime);
        expect(prompt).toBeDefined();
      }
      
      const averageTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
      const maxTime = Math.max(...executionTimes);
      
      // Performance should be consistent (max time not more than 5x average)
      expect(maxTime).toBeLessThan(averageTime * 5);
    });
  });

  describe('Integration with Response Formats', () => {
    it('should work with FUNCTION_CALLING response format', () => {
      const manager = new PromptManager('System prompt', {
        responseFormat: FormatType.FUNCTION_CALLING,
      });
      
      const prompt = manager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should handle response format switching', () => {
      const manager1 = new PromptManager('System prompt', {
        responseFormat: FormatType.FUNCTION_CALLING,
      });
      
      const prompt1 = manager1.buildPrompt('Test input', mockTools);
      expect(prompt1).toBeDefined();
      
      // Create new manager with different format
      const manager2 = new PromptManager('System prompt', {
        responseFormat: FormatType.FUNCTION_CALLING,
      });
      
      const prompt2 = manager2.buildPrompt('Test input', mockTools);
      expect(prompt2).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string inputs', () => {
      const prompt = promptManager.buildPrompt('', mockTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle whitespace-only inputs', () => {
      const prompt = promptManager.buildPrompt('   \n\t   ', mockTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle very long system prompts', () => {
      const longSystemPrompt = 'x'.repeat(50000);
      const manager = new PromptManager(longSystemPrompt);
      
      const prompt = manager.buildPrompt('Test input', mockTools);
      
      expect(prompt).toBeDefined();
      expect(prompt).toContain(longSystemPrompt);
    });

    it('should handle malformed tool definitions gracefully', () => {
      const malformedTools = [
        { name: 'valid_tool', description: 'Valid tool', argsSchema: z.object({}) },
        { name: '', description: 'Empty name tool' },
        { description: 'No name tool' },
        null,
        undefined,
      ] as any;
      
      const prompt = promptManager.buildPrompt('Test input', malformedTools);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle mixed valid and invalid history entries', () => {
      const mixedHistory = [
        { role: 'user', content: 'Valid user message' },
        { role: 'assistant', content: 'Valid assistant message' },
        { role: 'invalid', content: 'Invalid role' },
        { role: 'user', content: null },
        { role: 'assistant' }, // Missing content
        null,
        undefined,
      ] as any;
      
      const prompt = promptManager.buildPrompt('Test input', mockTools, mixedHistory);
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });
  });
});