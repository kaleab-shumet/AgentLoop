import { PromptManager } from '../../../core/prompt/PromptManager';
import { AgentError } from '../../../core/utils/AgentError';
import { ChatEntry, ToolResult } from '../../../core/types/types';

describe('Basic Functionality Tests', () => {
  describe('PromptManager Basic Tests', () => {
    let promptManager: PromptManager;

    beforeEach(() => {
      promptManager = new PromptManager('Test system prompt');
    });

    it('should create PromptManager instance', () => {
      expect(promptManager).toBeDefined();
      expect(promptManager).toBeInstanceOf(PromptManager);
    });

    it('should build prompt with all required parameters', () => {
      const result = promptManager.buildPrompt(
        'Hello world',              // userPrompt
        { key: 'value' },          // context
        null,                      // lastError
        [],                        // conversationHistory
        [],                        // toolCallHistory
        false,                     // keepRetry
        'final',                   // finalToolName
        'tool definitions string'   // toolDefinitions
      );
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should build prompt with conversation history', () => {
      const history: ChatEntry[] = [
        { sender: 'user', message: 'Hello' },
        { sender: 'ai', message: 'Hi there!' },
      ];

      const result = promptManager.buildPrompt(
        'Continue conversation',
        {},
        null,
        history,
        [],
        false,
        'final',
        'tools'
      );
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should build prompt with tool history', () => {
      const toolHistory: ToolResult[] = [
        { toolName: 'test_tool', success: true, output: 'Success' },
        { toolName: 'other_tool', success: false, error: 'Failed' },
      ];

      const result = promptManager.buildPrompt(
        'Use tools',
        {},
        null,
        [],
        toolHistory,
        false,
        'final',
        'tools'
      );
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should build prompt with error context', () => {
      const error = new AgentError('Test error', 'TEST_ERROR' as any);

      const result = promptManager.buildPrompt(
        'Handle error',
        {},
        error,
        [],
        [],
        false,
        'final',
        'tools'
      );
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle different parameters', () => {
      const result = promptManager.buildPrompt(
        'Custom request',
        { custom: 'context' },
        null,
        [],
        [],
        true,  // keepRetry
        'custom_final',
        'custom tool definitions'
      );
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('AgentError Basic Tests', () => {
    it('should create AgentError instance', () => {
      const error = new AgentError('Test message', 'TEST_TYPE' as any);
      
      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(AgentError);
      expect(error.message).toBe('Test message');
    });

    it('should handle error with context', () => {
      const error = new AgentError('Test with context', 'TEST_TYPE' as any, { key: 'value' });
      
      expect(error).toBeDefined();
      expect(error.message).toBe('Test with context');
    });
  });

  describe('Type Definitions', () => {
    it('should work with ChatEntry', () => {
      const entry: ChatEntry = {
        sender: 'user',
        message: 'Test message',
      };
      
      expect(entry.sender).toBe('user');
      expect(entry.message).toBe('Test message');
    });

    it('should work with ToolResult', () => {
      const result: ToolResult = {
        toolName: 'test_tool',
        success: true,
        output: 'Test output',
      };
      
      expect(result.toolName).toBe('test_tool');
      expect(result.success).toBe(true);
      expect(result.output).toBe('Test output');
    });

    it('should work with failed ToolResult', () => {
      const result: ToolResult = {
        toolName: 'failing_tool',
        success: false,
        error: 'Test error',
      };
      
      expect(result.toolName).toBe('failing_tool');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });
  });

  describe('Integration Tests', () => {
    it('should work with complex scenario', () => {
      const manager = new PromptManager('Complex system prompt');
      
      const history: ChatEntry[] = [
        { sender: 'user', message: 'Start conversation' },
        { sender: 'ai', message: 'Hello! How can I help?' },
        { sender: 'user', message: 'I need help with tools' },
      ];

      const toolHistory: ToolResult[] = [
        { toolName: 'search_tool', success: true, output: 'Found results' },
        { toolName: 'process_tool', success: true, output: 'Processed data' },
      ];

      const result = manager.buildPrompt(
        'Final request',
        { session: 'abc123' },
        null,
        history,
        toolHistory,
        false,
        'final',
        'available tools: search_tool, process_tool, final'
      );
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100); // Should be substantial
    });
  });
});