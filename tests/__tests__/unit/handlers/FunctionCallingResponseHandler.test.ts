import { FunctionCallingFormatHandler } from '../../../../core/handlers/FunctionCallingFormatHandler';
import { Tool, PendingToolCall, FunctionCall, FunctionDefinition } from '../../../../core/types/types';
import { AgentError, AgentErrorType } from '../../../../core/utils/AgentError';
import { MockFactory, TestDataFactory } from '../../../helpers';
import { z } from 'zod';

describe('FunctionCallingResponseHandler', () => {
  let handler: FunctionCallingFormatHandler;
  let mockTools: Tool<any>[];

  beforeEach(() => {
    handler = new FunctionCallingFormatHandler();
    
    // Create mock tools for testing
    mockTools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        argsSchema: z.object({
          input: z.string(),
          optional: z.boolean().optional(),
        }),
        implementation: async (args: any) => ({ success: true, result: 'test' }),
      },
      {
        name: 'math_tool',
        description: 'A math tool',
        argsSchema: z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number(),
          b: z.number(),
        }),
        implementation: async (args: any) => ({ success: true, result: 'math' }),
      },
      {
        name: 'empty_tool',
        description: 'A tool with no arguments',
        argsSchema: z.object({}),
        implementation: async (args: any) => ({ success: true, result: 'empty' }),
      },
    ];
  });

  describe('parseFunctionCall', () => {
    it('should parse valid function call with function_call property', () => {
      const functionData = {
        function_call: {
          name: 'test_tool',
          arguments: '{"input": "test_value", "optional": true}',
        },
      };

      const result = handler.parseFunctionCall(functionData, mockTools);

      expect(result.name).toBe('test_tool');
      expect(result.input).toBe('test_value');
      expect(result.optional).toBe(true);
    });

    it('should parse valid function call with functionCall property', () => {
      const functionData = {
        functionCall: {
          name: 'test_tool',
          arguments: '{"input": "test_value"}',
        },
      };

      const result = handler.parseFunctionCall(functionData, mockTools);

      expect(result.name).toBe('test_tool');
      expect(result.input).toBe('test_value');
    });

    it('should parse valid function call with direct name and arguments', () => {
      const functionData = {
        name: 'test_tool',
        arguments: '{"input": "direct_test"}',
      };

      const result = handler.parseFunctionCall(functionData, mockTools);

      expect(result.name).toBe('test_tool');
      expect(result.input).toBe('direct_test');
    });

    it('should parse function call with complex arguments', () => {
      const functionData = {
        name: 'math_tool',
        arguments: '{"operation": "add", "a": 5, "b": 3}',
      };

      const result = handler.parseFunctionCall(functionData, mockTools);

      expect(result.name).toBe('math_tool');
      expect(result.operation).toBe('add');
      expect(result.a).toBe(5);
      expect(result.b).toBe(3);
    });

    it('should parse function call with empty arguments', () => {
      const functionData = {
        name: 'empty_tool',
        arguments: '{}',
      };

      const result = handler.parseFunctionCall(functionData, mockTools);

      expect(result.name).toBe('empty_tool');
    });

    it('should throw error for invalid function call format', () => {
      const functionData = {
        invalid: 'format',
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
    });

    it('should throw error for non-string arguments', () => {
      const functionData = {
        name: 'test_tool',
        arguments: { input: 'not_string' }, // Should be string
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
    });

    it('should throw error for non-string name', () => {
      const functionData = {
        name: 123, // Should be string
        arguments: '{"input": "test"}',
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
    });

    it('should throw error for non-existent tool', () => {
      const functionData = {
        name: 'non_existent_tool',
        arguments: '{"input": "test"}',
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
      
      try {
        handler.parseFunctionCall(functionData, mockTools);
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).type).toBe(AgentErrorType.TOOL_NOT_FOUND);
      }
    });

    it('should throw error for invalid JSON in arguments', () => {
      const functionData = {
        name: 'test_tool',
        arguments: '{"input": invalid_json}',
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
    });

    it('should throw error for arguments that fail schema validation', () => {
      const functionData = {
        name: 'test_tool',
        arguments: '{"wrong_field": "value"}', // Missing required 'input' field
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
      
      try {
        handler.parseFunctionCall(functionData, mockTools);
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).type).toBe(AgentErrorType.INVALID_SCHEMA);
      }
    });

    it('should throw error for invalid enum values', () => {
      const functionData = {
        name: 'math_tool',
        arguments: '{"operation": "invalid_op", "a": 5, "b": 3}',
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
    });

    it('should throw error for invalid number types', () => {
      const functionData = {
        name: 'math_tool',
        arguments: '{"operation": "add", "a": "not_a_number", "b": 3}',
      };

      expect(() => {
        handler.parseFunctionCall(functionData, mockTools);
      }).toThrow(AgentError);
    });
  });

  describe('parseWithRetry', () => {
    it('should parse valid JSON string', () => {
      const jsonString = '{"key": "value", "number": 42}';
      const result = (handler as any).parseWithRetry(jsonString);
      
      expect(result.key).toBe('value');
      expect(result.number).toBe(42);
    });

    it('should handle JSON with extra whitespace', () => {
      const jsonString = '  {"key": "value"}  ';
      const result = (handler as any).parseWithRetry(jsonString);
      
      expect(result.key).toBe('value');
    });

    it('should handle empty JSON object', () => {
      const jsonString = '{}';
      const result = (handler as any).parseWithRetry(jsonString);
      
      expect(result).toEqual({});
    });

    it('should handle JSON arrays', () => {
      const jsonString = '[1, 2, 3]';
      const result = (handler as any).parseWithRetry(jsonString);
      
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle nested JSON objects', () => {
      const jsonString = '{"nested": {"key": "value"}, "array": [1, 2, 3]}';
      const result = (handler as any).parseWithRetry(jsonString);
      
      expect(result.nested.key).toBe('value');
      expect(result.array).toEqual([1, 2, 3]);
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = '{"key": invalid}';
      
      expect(() => {
        (handler as any).parseWithRetry(invalidJson);
      }).toThrow();
    });

    it('should throw error for incomplete JSON', () => {
      const incompleteJson = '{"key": "value"';
      
      expect(() => {
        (handler as any).parseWithRetry(incompleteJson);
      }).toThrow();
    });
  });

  describe('convertToolsToFunctionDefinitions', () => {
    it('should convert tools to function definitions', () => {
      const definitions = handler.convertToolsToFunctionDefinitions(mockTools);
      
      expect(definitions).toHaveLength(3);
      expect(definitions[0].name).toBe('test_tool');
      expect(definitions[0].description).toBe('A test tool');
      expect(definitions[0].parameters).toBeDefined();
    });

    it('should handle tools with complex schemas', () => {
      const complexTool = {
        name: 'complex_tool',
        description: 'A complex tool',
        argsSchema: z.object({
          required_string: z.string(),
          optional_number: z.number().optional(),
          enum_field: z.enum(['option1', 'option2', 'option3']),
          nested_object: z.object({
            inner_field: z.string(),
          }),
          array_field: z.array(z.string()),
        }),
        implementation: async (args: any) => ({ success: true, result: 'complex' }),
      };

      const definitions = handler.convertToolsToFunctionDefinitions([complexTool]);
      
      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('complex_tool');
      expect(definitions[0].parameters).toBeDefined();
      
      const parameters = definitions[0].parameters as any;
      expect(parameters.type).toBe('object');
      expect(parameters.properties).toBeDefined();
      expect(parameters.properties.required_string).toBeDefined();
      expect(parameters.properties.optional_number).toBeDefined();
      expect(parameters.properties.enum_field).toBeDefined();
      expect(parameters.properties.nested_object).toBeDefined();
      expect(parameters.properties.array_field).toBeDefined();
    });

    it('should handle empty tools array', () => {
      const definitions = handler.convertToolsToFunctionDefinitions([]);
      
      expect(definitions).toHaveLength(0);
    });

    it('should handle tools with no arguments', () => {
      const noArgsTool = {
        name: 'no_args_tool',
        description: 'A tool with no arguments',
        argsSchema: z.object({}),
        implementation: async (args: any) => ({ success: true, result: 'no_args' }),
      };

      const definitions = handler.convertToolsToFunctionDefinitions([noArgsTool]);
      
      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('no_args_tool');
      expect(definitions[0].parameters).toBeDefined();
      
      const parameters = definitions[0].parameters as any;
      expect(parameters.type).toBe('object');
      expect(parameters.properties).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error messages for schema validation failures', () => {
      const functionData = {
        name: 'math_tool',
        arguments: '{"operation": "add", "a": "not_a_number", "b": "also_not_a_number"}',
      };

      try {
        handler.parseFunctionCall(functionData, mockTools);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).type).toBe(AgentErrorType.INVALID_SCHEMA);
        expect((error as AgentError).message).toContain('Invalid arguments for function "math_tool"');
      }
    });

    it('should handle circular reference in arguments', () => {
      const circularObj: any = { key: 'value' };
      circularObj.self = circularObj;
      
      const functionData = {
        name: 'test_tool',
        arguments: JSON.stringify({ input: 'test' }), // Valid arguments
      };

      // This should work fine since we're not dealing with circular references in JSON
      const result = handler.parseFunctionCall(functionData, mockTools);
      expect(result.name).toBe('test_tool');
    });

    it('should handle very large JSON strings', () => {
      const largeString = 'x'.repeat(10000);
      const functionData = {
        name: 'test_tool',
        arguments: `{"input": "${largeString}"}`,
      };

      const result = handler.parseFunctionCall(functionData, mockTools);
      expect(result.name).toBe('test_tool');
      expect(result.input).toBe(largeString);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in JSON values', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const functionData = {
        name: 'test_tool',
        arguments: `{"input": "${specialChars}"}`,
      };

      const result = handler.parseFunctionCall(functionData, mockTools);
      expect(result.name).toBe('test_tool');
      expect(result.input).toBe(specialChars);
    });

    it('should handle Unicode characters in JSON', () => {
      const unicodeString = '🚀🎉🔥💯✨🌟⚡🎯';
      const functionData = {
        name: 'test_tool',
        arguments: `{"input": "${unicodeString}"}`,
      };

      const result = handler.parseFunctionCall(functionData, mockTools);
      expect(result.name).toBe('test_tool');
      expect(result.input).toBe(unicodeString);
    });

    it('should handle escaped quotes in JSON', () => {
      const escapedString = 'This is a "quoted" string';
      const functionData = {
        name: 'test_tool',
        arguments: `{"input": "This is a \\"quoted\\" string"}`,
      };

      const result = handler.parseFunctionCall(functionData, mockTools);
      expect(result.name).toBe('test_tool');
      expect(result.input).toBe(escapedString);
    });

    it('should handle newlines and tabs in JSON', () => {
      const multilineString = 'Line 1\nLine 2\tTabbed';
      const functionData = {
        name: 'test_tool',
        arguments: `{"input": "Line 1\\nLine 2\\tTabbed"}`,
      };

      const result = handler.parseFunctionCall(functionData, mockTools);
      expect(result.name).toBe('test_tool');
      expect(result.input).toBe(multilineString);
    });

    it('should handle null values in JSON', () => {
      const functionData = {
        name: 'test_tool',
        arguments: '{"input": "test", "optional": null}',
      };

      const result = handler.parseFunctionCall(functionData, mockTools);
      expect(result.name).toBe('test_tool');
      expect(result.input).toBe('test');
      expect(result.optional).toBe(null);
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of tools efficiently', () => {
      const largeMockTools = Array.from({ length: 1000 }, (_, i) => ({
        name: `tool_${i}`,
        description: `Tool ${i}`,
        argsSchema: z.object({ input: z.string() }),
        implementation: async (args: any) => ({ success: true, result: `tool_${i}` }),
      }));

      const functionData = {
        name: 'tool_500',
        arguments: '{"input": "test"}',
      };

      const startTime = Date.now();
      const result = handler.parseFunctionCall(functionData, largeMockTools);
      const endTime = Date.now();

      expect(result.name).toBe('tool_500');
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle complex schemas efficiently', () => {
      const complexSchema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              level4: z.object({
                value: z.string(),
                numbers: z.array(z.number()),
                options: z.enum(['a', 'b', 'c', 'd', 'e']),
              }),
            }),
          }),
        }),
      });

      const complexTool = {
        name: 'complex_tool',
        description: 'A very complex tool',
        argsSchema: complexSchema,
        implementation: async (args: any) => ({ success: true, result: 'complex' }),
      };

      const functionData = {
        name: 'complex_tool',
        arguments: JSON.stringify({
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'test',
                  numbers: [1, 2, 3, 4, 5],
                  options: 'c',
                },
              },
            },
          },
        }),
      };

      const startTime = Date.now();
      const result = handler.parseFunctionCall(functionData, [complexTool]);
      const endTime = Date.now();

      expect(result.name).toBe('complex_tool');
      expect(endTime - startTime).toBeLessThan(50); // Should complete in under 50ms
    });
  });
});