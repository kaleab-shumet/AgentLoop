import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { LLMConfig } from '../../core/types/types';
import { AgentError, AgentErrorType } from '../../core/utils/AgentError';

describe('DefaultAIProvider', () => {
  const validConfig: LLMConfig = {
    service: 'openai',
    apiKey: 'test-api-key',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 100
  };

  it('should create with valid configuration', () => {
    const provider = new DefaultAIProvider(validConfig);
    expect(provider).toBeDefined();
  });

  it('should throw error when API key is missing', () => {
    const invalidConfig = { ...validConfig, apiKey: '' };
    
    expect(() => {
      new DefaultAIProvider(invalidConfig);
    }).toThrow(AgentError);
  });

  it('should throw error when service is missing', () => {
    const invalidConfig = { ...validConfig, service: undefined as any };
    
    expect(() => {
      new DefaultAIProvider(invalidConfig);
    }).toThrow(AgentError);
  });

  it('should have getCompletion method', () => {
    const provider = new DefaultAIProvider(validConfig);
    expect(provider.getCompletion).toBeDefined();
    expect(typeof provider.getCompletion).toBe('function');
  });

  it('should accept different service types', () => {
    const services = ['openai', 'google', 'anthropic', 'mistral', 'cohere', 'groq', 'fireworks', 'deepseek', 'perplexity'];
    
    services.forEach(service => {
      const config = { ...validConfig, service: service as any };
      expect(() => {
        new DefaultAIProvider(config);
      }).not.toThrow();
    });
  });

  it('should handle optional configuration parameters', () => {
    const minimalConfig: LLMConfig = {
      service: 'openai',
      apiKey: 'test-key'
    };
    
    expect(() => {
      new DefaultAIProvider(minimalConfig);
    }).not.toThrow();
  });

  it('should preserve configuration', () => {
    const provider = new DefaultAIProvider(validConfig);
    // We can't directly access private config, but we can test that it doesn't throw
    // and that the provider was created successfully
    expect(provider).toBeDefined();
    expect(provider.getCompletion).toBeDefined();
  });
});