import { jest } from '@jest/globals';

// Extend Jest matchers with custom assertions
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveExecutedTool(toolName: string): R;
      toHaveDetectedStagnation(): R;
      toHaveRecoveredFromError(): R;
      toHaveValidToolResult(): R;
      toBeValidAgentResponse(): R;
    }
  }
}

// Custom matcher implementations
expect.extend({
  toHaveExecutedTool(received: any, toolName: string) {
    const pass = received.toolsExecuted && received.toolsExecuted.some((tool: any) => tool.name === toolName);
    return {
      message: () => pass 
        ? `Expected agent not to have executed tool ${toolName}`
        : `Expected agent to have executed tool ${toolName}`,
      pass,
    };
  },

  toHaveDetectedStagnation(received: any) {
    const pass = received.stagnationDetected === true;
    return {
      message: () => pass
        ? `Expected stagnation not to be detected`
        : `Expected stagnation to be detected`,
      pass,
    };
  },

  toHaveRecoveredFromError(received: any) {
    const pass = received.recovered === true || received.errorRecovered === true;
    return {
      message: () => pass
        ? `Expected error not to be recovered`
        : `Expected error to be recovered`,
      pass,
    };
  },

  toHaveValidToolResult(received: any) {
    const pass = received && 
                 typeof received.success === 'boolean' && 
                 received.result !== undefined;
    return {
      message: () => pass
        ? `Expected invalid tool result`
        : `Expected valid tool result with success boolean and result`,
      pass,
    };
  },

  toBeValidAgentResponse(received: any) {
    const pass = received &&
                 typeof received.success === 'boolean' &&
                 received.result !== undefined &&
                 Array.isArray(received.toolsExecuted);
    return {
      message: () => pass
        ? `Expected invalid agent response`
        : `Expected valid agent response with success, result, and toolsExecuted`,
      pass,
    };
  },
});

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

// Set up test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};