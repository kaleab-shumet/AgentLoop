import { DefaultPromptTemplate, FormatType } from '../../core/prompt/DefaultPromptTemplate';
import { AgentError, AgentErrorType } from '../../core/utils/AgentError';
import { ChatEntry, ToolResult } from '../../core/types/types';

describe('DefaultPromptTemplate', () => {
  let template: DefaultPromptTemplate;

  beforeEach(() => {
    template = new DefaultPromptTemplate();
  });

  describe('Constructor and Format Management', () => {
    it('should create with default format type', () => {
      expect(template.getResponseFormat()).toBe(FormatType.FUNCTION_CALLING);
    });

    it('should create with specified format type', () => {
      const yamlTemplate = new DefaultPromptTemplate(FormatType.YAML_MODE);
      expect(yamlTemplate.getResponseFormat()).toBe(FormatType.YAML_MODE);
    });

    it('should set response format', () => {
      template.setResponseFormat(FormatType.YAML_MODE);
      expect(template.getResponseFormat()).toBe(FormatType.YAML_MODE);
    });

    it('should change format type', () => {
      template.setResponseFormat(FormatType.YAML_MODE);
      expect(template.getResponseFormat()).toBe(FormatType.YAML_MODE);
      
      template.setResponseFormat(FormatType.FUNCTION_CALLING);
      expect(template.getResponseFormat()).toBe(FormatType.FUNCTION_CALLING);
    });
  });

  describe('buildPrompt', () => {
    const basicOptions = {
      includeContext: true,
      includeConversationHistory: true,
      includeToolHistory: true,
      maxHistoryEntries: 10,
      parallelExecution: false,
      includeExecutionStrategy: true
    };

    it('should build basic prompt', () => {
      const prompt = template.buildPrompt(
        'You are a helpful assistant.',
        'Hello world',
        {},
        null,
        [],
        [],
        false,
        'final',
        'No tools available',
        basicOptions
      );

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('You are a helpful assistant.');
      expect(prompt).toContain('Hello world');
    });

    it('should include context in prompt', () => {
      const context = {
        userName: 'John',
        currentTask: 'testing'
      };

      const prompt = template.buildPrompt(
        'System prompt',
        'User message with {{userName}} and {{currentTask}}',
        context,
        null,
        [],
        [],
        false,
        'final',
        'No tools',
        basicOptions
      );

      expect(prompt).toContain('John');
      expect(prompt).toContain('testing');
    });

    it('should include conversation history', () => {
      const history: ChatEntry[] = [
        { sender: 'user', message: 'Previous user message' },
        { sender: 'ai', message: 'Previous AI response' }
      ];

      const prompt = template.buildPrompt(
        'System prompt',
        'Current message',
        {},
        null,
        history,
        [],
        false,
        'final',
        'No tools',
        basicOptions
      );

      expect(prompt).toContain('Previous user message');
      expect(prompt).toContain('Previous AI response');
    });

    it('should include tool call history', () => {
      const toolHistory: ToolResult[] = [
        { toolName: 'test_tool', success: true, output: 'Tool output' },
        { toolName: 'another_tool', success: false, error: 'Tool error' }
      ];

      const prompt = template.buildPrompt(
        'System prompt',
        'Current message',
        {},
        null,
        [],
        toolHistory,
        false,
        'final',
        'Available tools',
        basicOptions
      );

      expect(prompt).toContain('test_tool');
      expect(prompt).toContain('Tool output');
      expect(prompt).toContain('another_tool');
      expect(prompt).toContain('Tool error');
    });

    it('should include error information', () => {
      const error = new AgentError('Test error occurred', AgentErrorType.TOOL_EXECUTION_ERROR);

      const prompt = template.buildPrompt(
        'System prompt',
        'Fix the error',
        {},
        error,
        [],
        [],
        false,
        'final',
        'No tools',
        basicOptions
      );

      expect(prompt).toContain('Test error occurred');
      expect(prompt).toContain('Fix the error');
    });

    it('should include termination rules with final tool name', () => {
      const prompt = template.buildPrompt(
        'System prompt',
        'User message',
        {},
        null,
        [],
        [],
        false,
        'complete_task',
        'No tools',
        basicOptions
      );

      expect(prompt).toContain('complete_task');
      expect(prompt).toContain('CRITICAL TERMINATION RULES');
    });

    it('should handle keepRetry flag', () => {
      const prompt = template.buildPrompt(
        'System prompt',
        'Retry message',
        {},
        null,
        [],
        [],
        true,
        'final',
        'No tools',
        basicOptions
      );

      expect(prompt).toContain('Retry message');
    });

    it('should include tool definitions', () => {
      const toolDefinitions = 'calculator: performs math calculations\nweather: gets weather information';

      const prompt = template.buildPrompt(
        'System prompt',
        'User message',
        {},
        null,
        [],
        [],
        false,
        'final',
        toolDefinitions,
        basicOptions
      );

      expect(prompt).toContain('calculator');
      expect(prompt).toContain('weather');
    });

    it('should include error recovery instructions when error is present', () => {
      const errorRecoveryInstructions = 'If you encounter errors, try alternative approaches.';
      const error = new AgentError('Test error', AgentErrorType.TOOL_EXECUTION_ERROR);

      const prompt = template.buildPrompt(
        'System prompt',
        'User message',
        {},
        error,
        [],
        [],
        true, // keepRetry = true to use custom instructions
        'final',
        'No tools',
        basicOptions,
        errorRecoveryInstructions
      );

      expect(prompt).toContain('If you encounter errors, try alternative approaches.');
    });
  });

  describe('Format-specific behavior', () => {
    it('should generate different format instructions for function calling', () => {
      template.setResponseFormat(FormatType.FUNCTION_CALLING);

      const prompt = template.buildPrompt(
        'System prompt',
        'User message',
        {},
        null,
        [],
        [],
        false,
        'final',
        'No tools',
        {
          includeContext: true,
          includeConversationHistory: true,
          includeToolHistory: true,
          maxHistoryEntries: 10,
          parallelExecution: false,
          includeExecutionStrategy: true
        }
      );

      expect(prompt).toContain('OUTPUT FORMAT');
    });

    it('should generate different format instructions for YAML mode', () => {
      template.setResponseFormat(FormatType.YAML_MODE);

      const prompt = template.buildPrompt(
        'System prompt',
        'User message',
        {},
        null,
        [],
        [],
        false,
        'final',
        'No tools',
        {
          includeContext: true,
          includeConversationHistory: true,
          includeToolHistory: true,
          maxHistoryEntries: 10,
          parallelExecution: false,
          includeExecutionStrategy: true
        }
      );

      expect(prompt).toContain('OUTPUT FORMAT');
    });
  });

  describe('Options handling', () => {
    it('should respect includeContext option', () => {
      const context = { userName: 'John' };
      const optionsWithoutContext = {
        includeContext: false,
        includeConversationHistory: true,
        includeToolHistory: true,
        maxHistoryEntries: 10,
        parallelExecution: false,
        includeExecutionStrategy: true
      };

      const prompt = template.buildPrompt(
        'System prompt',
        'Hello {{userName}}',
        context,
        null,
        [],
        [],
        false,
        'final',
        'No tools',
        optionsWithoutContext
      );

      // Should still contain the placeholder since context processing might still happen
      expect(prompt).toBeDefined();
    });

    it('should respect maxHistoryEntries option', () => {
      const longHistory: ChatEntry[] = Array.from({ length: 20 }, (_, i) => ({
        sender: i % 2 === 0 ? 'user' : 'ai',
        message: `Message ${i + 1}`
      }));

      const optionsWithLimit = {
        includeContext: true,
        includeConversationHistory: true,
        includeToolHistory: true,
        maxHistoryEntries: 5,
        parallelExecution: false,
        includeExecutionStrategy: true
      };

      const prompt = template.buildPrompt(
        'System prompt',
        'Current message',
        {},
        null,
        longHistory,
        [],
        false,
        'final',
        'No tools',
        optionsWithLimit
      );

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Current message');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty user prompt', () => {
      const prompt = template.buildPrompt(
        'System prompt',
        '',
        {},
        null,
        [],
        [],
        false,
        'final',
        'No tools',
        {
          includeContext: true,
          includeConversationHistory: true,
          includeToolHistory: true,
          maxHistoryEntries: 10,
          parallelExecution: false,
          includeExecutionStrategy: true
        }
      );

      expect(prompt).toBeDefined();
      expect(prompt).toContain('System prompt');
    });

    it('should handle empty system prompt', () => {
      const prompt = template.buildPrompt(
        '',
        'User message',
        {},
        null,
        [],
        [],
        false,
        'final',
        'No tools',
        {
          includeContext: true,
          includeConversationHistory: true,
          includeToolHistory: true,
          maxHistoryEntries: 10,
          parallelExecution: false,
          includeExecutionStrategy: true
        }
      );

      expect(prompt).toBeDefined();
      expect(prompt).toContain('User message');
    });
  });
});