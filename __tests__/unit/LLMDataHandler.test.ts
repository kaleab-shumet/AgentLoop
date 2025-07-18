import { LLMDataHandler } from '../../core/handlers/LLMDataHandler';
import { FormatHandlerFactory } from '../../core/handlers/FormatHandlerFactory';
import { FormatMode, FormatHandler, Tool, PendingToolCall } from '../../core/types/types';
import { z } from 'zod';

describe('LLMDataHandler', () => {
  let handler: LLMDataHandler;
  let mockFormatHandler: FormatHandler;

  beforeEach(() => {
    // Clear any existing handlers
    FormatHandlerFactory.clearHandlers();
    
    // Create mock format handler
    mockFormatHandler = {
      parseResponse: jest.fn(),
      formatToolDefinitions: jest.fn()
    };
    
    // Register mock handler
    FormatHandlerFactory.registerHandler(FormatMode.FUNCTION_CALLING, mockFormatHandler);
    
    handler = new LLMDataHandler(FormatMode.FUNCTION_CALLING);
  });

  afterEach(() => {
    FormatHandlerFactory.clearHandlers();
  });

  describe('Constructor', () => {
    it('should create with default format mode', () => {
      const defaultHandler = new LLMDataHandler();
      expect(defaultHandler).toBeDefined();
    });

    it('should create with specified format mode', () => {
      const yamlHandler = new LLMDataHandler(FormatMode.YAML_MODE);
      expect(yamlHandler).toBeDefined();
    });
  });

  describe('parseAndValidate', () => {
    it('should call format handler parseResponse method', () => {
      const mockResponse = 'test response';
      const mockTools: Tool[] = [
        {
          name: 'test_tool',
          description: 'Test tool',
          argsSchema: z.object({ input: z.string() }),
          handler: jest.fn()
        }
      ];

      const expectedResult: PendingToolCall[] = [
        { toolName: 'test_tool', args: { input: 'test' } }
      ];

      (mockFormatHandler.parseResponse as jest.Mock).mockReturnValue(expectedResult);

      const result = handler.parseAndValidate(mockResponse, mockTools);

      expect(mockFormatHandler.parseResponse).toHaveBeenCalledWith(mockResponse, mockTools);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty response', () => {
      const mockTools: Tool[] = [];
      const expectedResult: PendingToolCall[] = [];

      (mockFormatHandler.parseResponse as jest.Mock).mockReturnValue(expectedResult);

      const result = handler.parseAndValidate('', mockTools);

      expect(mockFormatHandler.parseResponse).toHaveBeenCalledWith('', mockTools);
      expect(result).toEqual(expectedResult);
    });

    it('should handle multiple tool calls', () => {
      const mockResponse = 'multiple tools response';
      const mockTools: Tool[] = [
        {
          name: 'tool1',
          description: 'First tool',
          argsSchema: z.object({ input: z.string() }),
          handler: jest.fn()
        },
        {
          name: 'tool2',
          description: 'Second tool',
          argsSchema: z.object({ value: z.number() }),
          handler: jest.fn()
        }
      ];

      const expectedResult: PendingToolCall[] = [
        { toolName: 'tool1', args: { input: 'test' } },
        { toolName: 'tool2', args: { value: 42 } }
      ];

      (mockFormatHandler.parseResponse as jest.Mock).mockReturnValue(expectedResult);

      const result = handler.parseAndValidate(mockResponse, mockTools);

      expect(mockFormatHandler.parseResponse).toHaveBeenCalledWith(mockResponse, mockTools);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('formatToolDefinitions', () => {
    it('should call format handler formatToolDefinitions method', () => {
      const mockTools: Tool[] = [
        {
          name: 'format_tool',
          description: 'Tool for formatting',
          argsSchema: z.object({ text: z.string() }),
          handler: jest.fn()
        }
      ];

      const expectedResult = 'formatted tool definitions';
      (mockFormatHandler.formatToolDefinitions as jest.Mock).mockReturnValue(expectedResult);

      const result = handler.formatToolDefinitions(mockTools);

      expect(mockFormatHandler.formatToolDefinitions).toHaveBeenCalledWith(mockTools);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty tools array', () => {
      const mockTools: Tool[] = [];
      const expectedResult = 'no tools available';

      (mockFormatHandler.formatToolDefinitions as jest.Mock).mockReturnValue(expectedResult);

      const result = handler.formatToolDefinitions(mockTools);

      expect(mockFormatHandler.formatToolDefinitions).toHaveBeenCalledWith(mockTools);
      expect(result).toEqual(expectedResult);
    });

    it('should handle complex tool schemas', () => {
      const mockTools: Tool[] = [
        {
          name: 'complex_tool',
          description: 'Complex tool with nested schema',
          argsSchema: z.object({
            user: z.object({
              name: z.string(),
              age: z.number()
            }),
            options: z.array(z.string()).optional()
          }),
          handler: jest.fn()
        }
      ];

      const expectedResult = 'complex tool definitions';
      (mockFormatHandler.formatToolDefinitions as jest.Mock).mockReturnValue(expectedResult);

      const result = handler.formatToolDefinitions(mockTools);

      expect(mockFormatHandler.formatToolDefinitions).toHaveBeenCalledWith(mockTools);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('Format Mode Integration', () => {
    it('should work with YAML mode', () => {
      const yamlMockHandler: FormatHandler = {
        parseResponse: jest.fn().mockReturnValue([{ name: 'yaml_tool', args: { data: 'yaml' } }]),
        formatToolDefinitions: jest.fn().mockReturnValue('yaml formatted tools')
      };

      FormatHandlerFactory.registerHandler(FormatMode.YAML_MODE, yamlMockHandler);

      const yamlHandler = new LLMDataHandler(FormatMode.YAML_MODE);
      const mockTools: Tool[] = [
        {
          name: 'yaml_tool',
          description: 'YAML tool',
          argsSchema: z.object({ data: z.string() }),
          handler: jest.fn()
        }
      ];

      const parseResult = yamlHandler.parseAndValidate('yaml response', mockTools);
      const formatResult = yamlHandler.formatToolDefinitions(mockTools);

      expect(parseResult).toEqual([{ name: 'yaml_tool', args: { data: 'yaml' } }]);
      expect(formatResult).toBe('yaml formatted tools');
    });
  });

  describe('Error Handling', () => {
    it('should propagate format handler errors', () => {
      const error = new Error('Format handler error');
      (mockFormatHandler.parseResponse as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const mockTools: Tool[] = [
        {
          name: 'error_tool',
          description: 'Tool that causes error',
          argsSchema: z.object({ input: z.string() }),
          handler: jest.fn()
        }
      ];

      expect(() => {
        handler.parseAndValidate('error response', mockTools);
      }).toThrow('Format handler error');
    });

    it('should handle format handler returning invalid data', () => {
      (mockFormatHandler.parseResponse as jest.Mock).mockReturnValue(null);

      const mockTools: Tool[] = [];
      const result = handler.parseAndValidate('test', mockTools);

      expect(result).toBeNull();
    });
  });
});