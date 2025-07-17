import { PromptManager } from '../../core/prompt/PromptManager';
import { StagnationDetector } from '../../core/utils/StagnationDetector';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { AIProvider } from '../../core/providers/AIProvider';
import { AgentError, AgentErrorType } from '../../core/utils/AgentError';
import { LLMConfig } from '../../core/types/types';

describe('Basic Workflow Integration', () => {
  let mockProvider: AIProvider;
  let promptManager: PromptManager;
  let stagnationDetector: StagnationDetector;

  beforeEach(() => {
    mockProvider = {
      getCompletion: jest.fn().mockResolvedValue('Mock AI response')
    };

    promptManager = new PromptManager('You are a helpful assistant.');
    stagnationDetector = new StagnationDetector();
  });

  it('should create all components without errors', () => {
    expect(mockProvider).toBeDefined();
    expect(promptManager).toBeDefined();
    expect(stagnationDetector).toBeDefined();
  });

  it('should handle basic prompt generation workflow', async () => {
    // Generate a prompt
    const prompt = promptManager.buildPrompt(
      'Hello world',
      {},
      null,
      [],
      [],
      false,
      'final',
      'No tools available'
    );

    // Mock AI provider response
    const response = await mockProvider.getCompletion(prompt);

    expect(prompt).toBeDefined();
    expect(response).toBe('Mock AI response');
    expect(mockProvider.getCompletion).toHaveBeenCalledWith(prompt);
  });

  it('should handle error recovery workflow', async () => {
    const error = new AgentError('Test error', AgentErrorType.TOOL_EXECUTION_ERROR);
    
    // Generate prompt with error information
    const prompt = promptManager.buildPrompt(
      'Fix the error',
      {},
      error,
      [],
      [],
      true, // keepRetry
      'final',
      'No tools available'
    );

    // Mock AI provider response
    const response = await mockProvider.getCompletion(prompt);

    expect(prompt).toContain('Test error');
    expect(response).toBe('Mock AI response');
  });

  it('should handle stagnation detection workflow', () => {
    const currentCall = {
      name: 'test_tool',
      args: { input: 'test' }
    };

    const toolHistory = [
      { toolName: 'test_tool', success: true, output: 'result1' },
      { toolName: 'test_tool', success: true, output: 'result2' }
    ];

    const result = stagnationDetector.isStagnant(currentCall, toolHistory, 3);

    expect(result).toHaveProperty('isStagnant');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.isStagnant).toBe('boolean');
    expect(typeof result.confidence).toBe('number');
  });

  it('should handle provider configuration workflow', () => {
    const config: LLMConfig = {
      service: 'openai',
      apiKey: 'test-key',
      model: 'gpt-3.5-turbo'
    };

    expect(() => {
      new DefaultAIProvider(config);
    }).not.toThrow();
  });

  it('should handle conversation history workflow', async () => {
    const conversationHistory = [
      { sender: 'user' as const, message: 'Hello' },
      { sender: 'ai' as const, message: 'Hi there!' },
      { sender: 'user' as const, message: 'How are you?' }
    ];

    const prompt = promptManager.buildPrompt(
      'Current message',
      {},
      null,
      conversationHistory,
      [],
      false,
      'final',
      'No tools available'
    );

    const response = await mockProvider.getCompletion(prompt);

    expect(prompt).toContain('Current message');
    expect(prompt).toContain('Hello');
    expect(prompt).toContain('Hi there!');
    expect(response).toBe('Mock AI response');
  });

  it('should handle tool execution workflow', async () => {
    const toolHistory = [
      { toolName: 'calculator', success: true, output: '42' },
      { toolName: 'weather', success: false, error: 'API timeout' }
    ];

    const prompt = promptManager.buildPrompt(
      'Use the tools',
      {},
      null,
      [],
      toolHistory,
      false,
      'final',
      'calculator, weather'
    );

    const response = await mockProvider.getCompletion(prompt);

    expect(prompt).toContain('Use the tools');
    expect(prompt).toContain('calculator');
    expect(prompt).toContain('weather');
    expect(response).toBe('Mock AI response');
  });
});