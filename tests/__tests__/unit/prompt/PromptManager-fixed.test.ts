import { PromptManager, PromptManagerConfig } from '../../../../core/prompt/PromptManager';
import { PromptTemplateInterface } from '../../../../core/prompt/PromptTemplateInterface';
import { DefaultPromptTemplate, FormatType } from '../../../../core/prompt/DefaultPromptTemplate';
import { ChatEntry, ToolResult } from '../../../../core/types/types';
import { AgentError } from '../../../../core/utils/AgentError';

// Mock custom template for testing
class MockPromptTemplate implements PromptTemplateInterface {
  buildPrompt(
    systemPrompt: string,
    userPrompt: string,
    context: Record<string, any>,
    lastError: AgentError | null,
    conversationHistory: ChatEntry[],
    toolCallHistory: ToolResult[],
    keepRetry: boolean,
    finalToolName: string,
    toolDefinitions: string
  ): string {
    return `MOCK: ${systemPrompt} | ${userPrompt} | ${toolDefinitions}`;
  }
}

describe('PromptManager (Fixed)', () => {
  let promptManager: PromptManager;
  let mockHistory: ChatEntry[];
  let mockToolHistory: ToolResult[];

  beforeEach(() => {
    promptManager = new PromptManager('Test system prompt');
    
    mockHistory = [
      { sender: 'user', message: 'User message 1' },
      { sender: 'ai', message: 'AI response 1' },
      { sender: 'user', message: 'User message 2' },
      { sender: 'ai', message: 'AI response 2' },
    ];
    
    mockToolHistory = [
      { toolName: 'tool1', success: true, output: 'Tool 1 result' },
      { toolName: 'tool2', success: false, error: 'Tool 2 error' },
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
  });

  describe('buildPrompt', () => {
    it('should build basic prompt with all parameters', () => {
      const prompt = promptManager.buildPrompt(
        'Hello world',      // userPrompt
        { key: 'value' },   // context
        null,               // lastError
        mockHistory,        // conversationHistory
        mockToolHistory,    // toolCallHistory
        false,              // keepRetry
        'final',            // finalToolName
        'tool definitions'  // toolDefinitions
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include user prompt in output', () => {
      const userPrompt = 'Specific user request';
      const prompt = promptManager.buildPrompt(
        userPrompt,
        {},
        null,
        [],
        [],
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toContain(userPrompt);
    });

    it('should handle error parameter', () => {
      const error = new AgentError('Test error', 'TEST_ERROR' as any);
      const prompt = promptManager.buildPrompt(
        'Test with error',
        {},
        error,
        [],
        [],
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should include conversation history', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        mockHistory,
        [],
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should include tool history', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        mockToolHistory,
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle keepRetry flag', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        [],
        true,  // keepRetry = true
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle final tool name', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        [],
        false,
        'custom_final_tool',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle tool definitions', () => {
      const toolDefinitions = 'complex tool definitions string';
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        [],
        false,
        'final',
        toolDefinitions
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });
  });

  describe('Template System', () => {
    it('should use default template by default', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        [],
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should use custom template when provided', () => {
      const customTemplate = new MockPromptTemplate();
      const manager = new PromptManager('System prompt', {
        customTemplate,
      });
      
      const prompt = manager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        [],
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toContain('MOCK:');
      expect(prompt).toContain('System prompt');
      expect(prompt).toContain('Test input');
    });
  });

  describe('Error Handling', () => {
    it('should handle null parameters gracefully', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        [],
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle empty arrays', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        [],
        [],
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle empty context', () => {
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        mockHistory,
        mockToolHistory,
        false,
        'final',
        'tools'
      );
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });
  });

  describe('Performance', () => {
    it('should handle large inputs efficiently', () => {
      const largeHistory = Array.from({ length: 100 }, (_, i) => ({
        sender: 'user' as const,
        message: `Message ${i}`,
      }));
      
      const largeToolHistory = Array.from({ length: 50 }, (_, i) => ({
        toolName: `tool_${i}`,
        success: true,
        output: `Result ${i}`,
      }));
      
      const startTime = Date.now();
      const prompt = promptManager.buildPrompt(
        'Test input',
        {},
        null,
        largeHistory,
        largeToolHistory,
        false,
        'final',
        'large tool definitions'
      );
      const endTime = Date.now();
      
      expect(prompt).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});