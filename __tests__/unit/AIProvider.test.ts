import { AIProvider } from '../../core/providers/AIProvider';
import { FunctionCallingTool } from '../../core/types/types';

describe('AIProvider Interface', () => {
  it('should work with mock implementation', async () => {
    const mockProvider: AIProvider = {
      getCompletion: jest.fn().mockResolvedValue('Mock response')
    };

    const result = await mockProvider.getCompletion('Test prompt');
    
    expect(result).toBe('Mock response');
    expect(mockProvider.getCompletion).toHaveBeenCalledWith('Test prompt');
  });

  it('should handle tools parameter', async () => {
    const mockProvider: AIProvider = {
      getCompletion: jest.fn().mockResolvedValue('Tool response')
    };

    const tools: FunctionCallingTool[] = [
      {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'Test tool',
          parameters: { type: 'object', properties: {} }
        }
      }
    ];

    const result = await mockProvider.getCompletion('Test prompt', tools);
    
    expect(result).toBe('Tool response');
    expect(mockProvider.getCompletion).toHaveBeenCalledWith('Test prompt', tools);
  });

  it('should handle options parameter', async () => {
    const mockProvider: AIProvider = {
      getCompletion: jest.fn().mockResolvedValue('Options response')
    };

    const options = { temperature: 0.7, maxTokens: 100 };

    const result = await mockProvider.getCompletion('Test prompt', undefined, options);
    
    expect(result).toBe('Options response');
    expect(mockProvider.getCompletion).toHaveBeenCalledWith('Test prompt', undefined, options);
  });

  it('should handle synchronous response', () => {
    const syncProvider: AIProvider = {
      getCompletion: jest.fn().mockReturnValue('Sync response')
    };

    const result = syncProvider.getCompletion('Test prompt');
    
    expect(result).toBe('Sync response');
    expect(syncProvider.getCompletion).toHaveBeenCalledWith('Test prompt');
  });

  it('should handle undefined response', () => {
    const undefinedProvider: AIProvider = {
      getCompletion: jest.fn().mockReturnValue(undefined)
    };

    const result = undefinedProvider.getCompletion('Test prompt');
    
    expect(result).toBeUndefined();
    expect(undefinedProvider.getCompletion).toHaveBeenCalledWith('Test prompt');
  });

  it('should handle error responses', async () => {
    const errorProvider: AIProvider = {
      getCompletion: jest.fn().mockRejectedValue(new Error('Provider error'))
    };

    await expect(errorProvider.getCompletion('Test prompt')).rejects.toThrow('Provider error');
  });
});