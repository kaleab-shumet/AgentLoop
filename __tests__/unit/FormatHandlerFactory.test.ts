import { FormatHandlerFactory } from '../../core/handlers/FormatHandlerFactory';
import { FormatMode, FormatHandler } from '../../core/types/types';
import { AgentError, AgentErrorType } from '../../core/utils/AgentError';

describe('FormatHandlerFactory', () => {
  beforeEach(() => {
    // Clear handlers before each test
    FormatHandlerFactory.clearHandlers();
  });

  afterEach(() => {
    // Clean up after each test
    FormatHandlerFactory.clearHandlers();
  });

  describe('getHandler', () => {
    it('should return function calling handler for FUNCTION_CALLING mode', () => {
      const handler = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      
      expect(handler).toBeDefined();
      expect(handler.parseResponse).toBeDefined();
      expect(handler.formatToolDefinitions).toBeDefined();
    });

    it('should return YAML handler for YAML_MODE', () => {
      const handler = FormatHandlerFactory.getHandler(FormatMode.YAML_MODE);
      
      expect(handler).toBeDefined();
      expect(handler.parseResponse).toBeDefined();
      expect(handler.formatToolDefinitions).toBeDefined();
    });

    it('should return same instance for subsequent calls (singleton pattern)', () => {
      const handler1 = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      const handler2 = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      
      expect(handler1).toBe(handler2);
    });

    it('should return different instances for different modes', () => {
      const functionHandler = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      const yamlHandler = FormatHandlerFactory.getHandler(FormatMode.YAML_MODE);
      
      expect(functionHandler).not.toBe(yamlHandler);
    });

    it('should throw error for unsupported format mode', () => {
      const invalidMode = 'invalid_mode' as FormatMode;
      
      expect(() => {
        FormatHandlerFactory.getHandler(invalidMode);
      }).toThrow(AgentError);
      
      expect(() => {
        FormatHandlerFactory.getHandler(invalidMode);
      }).toThrow('Unsupported format mode: invalid_mode');
    });
  });

  describe('registerHandler', () => {
    it('should register custom handler', () => {
      const customHandler: FormatHandler = {
        parseResponse: jest.fn(),
        formatToolDefinitions: jest.fn()
      };
      
      FormatHandlerFactory.registerHandler(FormatMode.FUNCTION_CALLING, customHandler);
      
      const retrievedHandler = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      expect(retrievedHandler).toBe(customHandler);
    });

    it('should allow overriding existing handlers', () => {
      // Get original handler
      const originalHandler = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      
      // Register custom handler
      const customHandler: FormatHandler = {
        parseResponse: jest.fn(),
        formatToolDefinitions: jest.fn()
      };
      
      FormatHandlerFactory.registerHandler(FormatMode.FUNCTION_CALLING, customHandler);
      
      // Should return custom handler now
      const newHandler = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      expect(newHandler).toBe(customHandler);
      expect(newHandler).not.toBe(originalHandler);
    });

    it('should work with custom format modes', () => {
      const customMode = 'custom_mode' as FormatMode;
      const customHandler: FormatHandler = {
        parseResponse: jest.fn().mockReturnValue([{ name: 'custom', args: {} }]),
        formatToolDefinitions: jest.fn().mockReturnValue('custom format')
      };
      
      FormatHandlerFactory.registerHandler(customMode, customHandler);
      
      const retrievedHandler = FormatHandlerFactory.getHandler(customMode);
      expect(retrievedHandler).toBe(customHandler);
    });
  });

  describe('clearHandlers', () => {
    it('should clear all registered handlers', () => {
      // Register custom handler
      const customHandler: FormatHandler = {
        parseResponse: jest.fn(),
        formatToolDefinitions: jest.fn()
      };
      
      FormatHandlerFactory.registerHandler(FormatMode.FUNCTION_CALLING, customHandler);
      
      // Verify it's registered
      const handler1 = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      expect(handler1).toBe(customHandler);
      
      // Clear handlers
      FormatHandlerFactory.clearHandlers();
      
      // Should create new default handler
      const handler2 = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      expect(handler2).not.toBe(customHandler);
    });

    it('should allow handlers to be recreated after clearing', () => {
      // Get initial handler
      const handler1 = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      
      // Clear handlers
      FormatHandlerFactory.clearHandlers();
      
      // Get new handler
      const handler2 = FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING);
      
      // Should be different instances
      expect(handler1).not.toBe(handler2);
      
      // But same type
      expect(handler2).toBeDefined();
      expect(handler2.parseResponse).toBeDefined();
      expect(handler2.formatToolDefinitions).toBeDefined();
    });
  });

  describe('Thread Safety', () => {
    it('should handle multiple concurrent calls', () => {
      const handlers = [];
      
      // Simulate concurrent calls
      for (let i = 0; i < 10; i++) {
        handlers.push(FormatHandlerFactory.getHandler(FormatMode.FUNCTION_CALLING));
      }
      
      // All should be the same instance
      const firstHandler = handlers[0];
      handlers.forEach(handler => {
        expect(handler).toBe(firstHandler);
      });
    });
  });

  describe('Error Handling', () => {
    it('should provide meaningful error messages', () => {
      const invalidMode = 'unknown_mode' as FormatMode;
      
      expect(() => {
        FormatHandlerFactory.getHandler(invalidMode);
      }).toThrow(AgentError);
      
      try {
        FormatHandlerFactory.getHandler(invalidMode);
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).type).toBe(AgentErrorType.INVALID_RESPONSE);
        expect((error as AgentError).message).toContain('unknown_mode');
      }
    });
  });
});