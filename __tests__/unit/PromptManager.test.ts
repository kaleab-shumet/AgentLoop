import { PromptManager } from '../../core/prompt/PromptManager';
import { FormatType } from '../../core/prompt/DefaultPromptTemplate';
import { AgentError, AgentErrorType } from '../../core/utils/AgentError';

describe('PromptManager', () => {
  let promptManager: PromptManager;

  beforeEach(() => {
    promptManager = new PromptManager('You are a helpful assistant.');
  });

  it('should create with system prompt', () => {
    expect(promptManager).toBeDefined();
  });

  it('should create with custom configuration', () => {
    const manager = new PromptManager('Custom system prompt', {
      responseFormat: FormatType.YAML_MODE,
      promptOptions: {
        includeContext: false,
        maxHistoryEntries: 5
      }
    });
    
    expect(manager).toBeDefined();
  });

  it('should check if using custom template', () => {
    const isCustom = promptManager.isUsingCustomTemplate();
    expect(typeof isCustom).toBe('boolean');
    expect(isCustom).toBe(false); // Using default template
  });

  it('should get response format', () => {
    const format = promptManager.getResponseFormat();
    expect(format).toBe(FormatType.FUNCTION_CALLING); // Default format
  });

  it('should set response format', () => {
    promptManager.setResponseFormat(FormatType.YAML_MODE);
    const format = promptManager.getResponseFormat();
    expect(format).toBe(FormatType.YAML_MODE);
  });

  it('should build prompt with basic parameters', () => {
    const prompt = promptManager.buildPrompt(
      'Hello, how are you?',
      {},
      null,
      [],
      [],
      false,
      'final',
      'No tools available'
    );

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Hello, how are you?');
  });

  it('should build prompt with context', () => {
    const context = { userName: 'John', task: 'testing' };
    
    const prompt = promptManager.buildPrompt(
      'Hello {{userName}}, please help with {{task}}',
      context,
      null,
      [],
      [],
      false,
      'final',
      'No tools available'
    );

    expect(prompt).toContain('John');
    expect(prompt).toContain('testing');
  });

  it('should build prompt with conversation history', () => {
    const history = [
      { sender: 'user' as const, message: 'Previous question' },
      { sender: 'ai' as const, message: 'Previous answer' }
    ];
    
    const prompt = promptManager.buildPrompt(
      'Current question',
      {},
      null,
      history,
      [],
      false,
      'final',
      'No tools available'
    );

    expect(prompt).toContain('Current question');
    expect(prompt).toContain('Previous question');
    expect(prompt).toContain('Previous answer');
  });

  it('should build prompt with tool history', () => {
    const toolHistory = [
      { toolName: 'test_tool', success: true, output: 'Tool result' }
    ];
    
    const prompt = promptManager.buildPrompt(
      'Use the tool again',
      {},
      null,
      [],
      toolHistory,
      false,
      'final',
      'Tools available'
    );

    expect(prompt).toContain('Use the tool again');
    expect(prompt).toContain('test_tool');
  });

  it('should build prompt with error information', () => {
    const error = new AgentError('Test error', AgentErrorType.TOOL_EXECUTION_ERROR);
    
    const prompt = promptManager.buildPrompt(
      'Fix the error',
      {},
      error,
      [],
      [],
      false,
      'final',
      'No tools available'
    );

    expect(prompt).toContain('Fix the error');
    expect(prompt).toContain('Test error');
  });

  it('should handle method chaining', () => {
    const result = promptManager
      .setResponseFormat(FormatType.YAML_MODE);
    
    expect(result).toBe(promptManager);
    expect(promptManager.getResponseFormat()).toBe(FormatType.YAML_MODE);
  });
});