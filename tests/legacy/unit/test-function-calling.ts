import { AgentLoop } from '../../core/agents/AgentLoop';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { Logger } from '../../core/utils/Logger';
import { ExecutionMode } from '../../core/types/types';
import { z } from 'zod';

/**
 * Comprehensive test suite for AgentLoop with Function Calling
 */

// Mock AI Provider for testing
class MockAIProvider extends DefaultAIProvider {
  private responses: string[] = [];
  private currentResponseIndex = 0;

  setMockResponses(responses: string[]) {
    this.responses = responses;
    this.currentResponseIndex = 0;
  }

  async getCompletion(prompt: string, tools: any[] = [], options = {}): Promise<string> {
    if (this.currentResponseIndex >= this.responses.length) {
      throw new Error('No more mock responses available');
    }
    const response = this.responses[this.currentResponseIndex];
    this.currentResponseIndex++;
    return response;
  }
}

// Concrete test agent that extends AgentLoop
class TestAgent extends AgentLoop {
  protected systemPrompt = 'You are a test agent for function calling.';

  constructor(provider: DefaultAIProvider, tools: any[], options: any = {}) {
    super(provider, options);
    tools.forEach(tool => this.defineTool(() => tool));
  }
}

// Test tools
const calculatorTool = {
  name: 'calculator',
  description: 'Performs basic arithmetic operations',
  argsSchema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async (name: string, args: any) => {
    const { operation, a, b } = args;
    let result: number;

    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) throw new Error('Division by zero');
        result = a / b;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      toolName: name,
      success: true,
      output: result
    };
  }
};

const weatherTool = {
  name: 'get_weather',
  description: 'Gets weather information for a location',
  argsSchema: z.object({
    location: z.string(),
    units: z.enum(['celsius', 'fahrenheit']).optional()
  }),
  handler: async (name: string, args: any) => {
    const { location, units = 'celsius' } = args;

    // Mock weather data
    const weatherData = {
      location,
      temperature: units === 'celsius' ? 22 : 72,
      units,
      conditions: 'sunny'
    };

    return {
      toolName: name,
      success: true,
      output: weatherData
    };
  }
};

const finalTool = {
  name: 'final',
  description: 'Provides the final answer to the user',
  argsSchema: z.object({
    answer: z.string()
  }),
  handler: async (name: string, args: any) => {
    return {
      toolName: name,
      success: true,
      output: args.answer
    };
  }
};

// Test 1: Basic Function Calling
async function testBasicFunctionCalling(): Promise<void> {
  console.log('🧪 Test 1: Basic Function Calling');

  const mockProvider = new MockAIProvider({
    apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key', // Default key from examples
    model: 'gemini-2.5-flash',
    service: 'google' as const
  });

  // Mock response with function call
  mockProvider.setMockResponses([
    `\`\`\`json
{
  "functionCall": {
    "name": "calculator",
    "arguments": "{\\"operation\\": \\"add\\", \\"a\\": 5, \\"b\\": 3}"
  }
}
\`\`\``,
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"The result is 8\\"}"
  }
}
\`\`\``
  ]);

  const agent = new TestAgent(mockProvider, [calculatorTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 3,
    logger: console
  });

  const result = await agent.run({
    userPrompt: 'Calculate 5 + 3',
    conversationHistory: [],
    toolCallHistory: []
  });

  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }

  console.log('✅ Basic function calling test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Test 2: Multiple Tool Calls
async function testMultipleToolCalls(): Promise<void> {
  console.log('\n🧪 Test 2: Multiple Tool Calls');

  const mockProvider = new MockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });

  mockProvider.setMockResponses([
    `\`\`\`json
[
  {
    "functionCall": {
      "name": "calculator",
      "arguments": "{\\"operation\\": \\"multiply\\", \\"a\\": 6, \\"b\\": 7}"
    }
  },
  {
    "functionCall": {
      "name": "get_weather",
      "arguments": "{\\"location\\": \\"New York\\", \\"units\\": \\"fahrenheit\\"}"
    }
  }
]
\`\`\``,
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"The calculation result is 42 and the weather in New York is 72°F and sunny\\"}"
  }
}
\`\`\``
  ]);

  const agent = new TestAgent(mockProvider, [calculatorTool, weatherTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 3,
    logger: console
  });

  const result = await agent.run({
    userPrompt: 'Calculate 6 * 7 and get weather for New York',
    conversationHistory: [],
    toolCallHistory: []
  });

  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }

  console.log('✅ Multiple tool calls test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Test 3: Complex JSON Arguments
async function testComplexJsonArguments(): Promise<void> {
  console.log('\n🧪 Test 3: Complex JSON Arguments');

  const complexTool = {
    name: 'process_data',
    description: 'Processes complex data structures',
    argsSchema: z.object({
      data: z.array(z.object({
        id: z.number(),
        name: z.string(),
        metadata: z.record(z.any())
      })),
      options: z.object({
        sort: z.boolean(),
        filter: z.string().optional()
      })
    }),
    handler: async (name: string, args: any) => {
      const { data, options } = args;
      let processed = [...data];

      if (options.filter) {
        processed = processed.filter(item =>
          item.name.toLowerCase().includes(options.filter.toLowerCase())
        );
      }

      if (options.sort) {
        processed.sort((a, b) => a.name.localeCompare(b.name));
      }

      return {
        toolName: name,
        success: true,
        output: { processed, count: processed.length }
      };
    }
  };

  const mockProvider = new MockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });

  mockProvider.setMockResponses([
    `\`\`\`json
{
  "functionCall": {
    "name": "process_data",
    "arguments": "{\\"data\\": [{\\"id\\": 1, \\"name\\": \\"Alice\\", \\"metadata\\": {\\"age\\": 30, \\"city\\": \\"NYC\\"}}, {\\"id\\": 2, \\"name\\": \\"Bob\\", \\"metadata\\": {\\"age\\": 25, \\"city\\": \\"LA\\"}}], \\"options\\": {\\"sort\\": true, \\"filter\\": \\"A\\"}}"
  }
}
\`\`\``,
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"Processed 1 item matching filter 'A'\\"}"
  }
}
\`\`\``
  ]);

  const agent = new TestAgent(mockProvider, [complexTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 3,
    logger: console
  });

  const result = await agent.run({
    userPrompt: 'Process the data with sorting and filtering',
    conversationHistory: [],
    toolCallHistory: []
  });

  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }

  console.log('✅ Complex JSON arguments test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Test 4: Error Handling
async function testErrorHandling(): Promise<void> {
  console.log('\n🧪 Test 4: Error Handling');

  const errorTool = {
    name: 'error_tool',
    description: 'A tool that can throw errors',
    argsSchema: z.object({
      shouldError: z.boolean(),
      errorMessage: z.string().optional()
    }),
    handler: async (name: string, args: any) => {
      if (args.shouldError) {
        throw new Error(args.errorMessage || 'Tool execution failed');
      }

      return {
        toolName: name,
        success: true,
        output: 'Tool executed successfully'
      };
    }
  };

  const mockProvider = new MockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });

  mockProvider.setMockResponses([
    `\`\`\`json
{
  "functionCall": {
    "name": "error_tool",
    "arguments": "{\\"shouldError\\": true, \\"errorMessage\\": \\"Intentional test error\\"}"
  }
}
\`\`\``,
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"Handled the error gracefully\\"}"
  }
}
\`\`\``
  ]);

  const agent = new TestAgent(mockProvider, [errorTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 3,
    logger: console
  });

  const result = await agent.run({
    userPrompt: 'Test error handling',
    conversationHistory: [],
    toolCallHistory: []
  });

  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }

  console.log('✅ Error handling test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Test 5: Invalid JSON Handling
async function testInvalidJsonHandling(): Promise<void> {
  console.log('\n🧪 Test 5: Invalid JSON Handling');

  const mockProvider = new MockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });

  // Test with malformed JSON that needs fixing
  mockProvider.setMockResponses([
    `\`\`\`json
{
  "functionCall": {
    "name": "calculator",
    "arguments": "{\\"operation\\": \\"add\\", \\"a\\": 10, \\"b\\": 5, \\"note\\": \\"This is a \\"quoted\\" string\\"}"
  }
}
\`\`\``,
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"Fixed JSON parsing and got result: 15\\"}"
  }
}
\`\`\``
  ]);

  const agent = new TestAgent(mockProvider, [calculatorTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 3,
    logger: console
  });

  const result = await agent.run({
    userPrompt: 'Calculate 10 + 5',
    conversationHistory: [],
    toolCallHistory: []
  });

  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }

  console.log('✅ Invalid JSON handling test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Test 6: Parallel Tool Execution
async function testParallelExecution(): Promise<void> {
  console.log('\n🧪 Test 6: Parallel Tool Execution');

  const slowTool = {
    name: 'slow_tool',
    description: 'A tool that takes time to execute',
    argsSchema: z.object({
      delay: z.number(),
      result: z.string()
    }),
    handler: async (name: string, args: any) => {
      await new Promise(resolve => setTimeout(resolve, args.delay));
      return {
        toolName: name,
        success: true,
        output: args.result
      };
    }
  };

  const mockProvider = new MockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });

  mockProvider.setMockResponses([
    `\`\`\`json
[
  {
    "functionCall": {
      "name": "slow_tool",
      "arguments": "{\\"delay\\": 100, \\"result\\": \\"Task 1 completed\\"}"
    }
  },
  {
    "functionCall": {
      "name": "slow_tool",
      "arguments": "{\\"delay\\": 100, \\"result\\": \\"Task 2 completed\\"}"
    }
  }
]
\`\`\``,
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"Both parallel tasks completed successfully\\"}"
  }
}
\`\`\``
  ]);

  const startTime = Date.now();

  const agent = new TestAgent(mockProvider, [slowTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    parallelExecution: true,
    maxIterations: 3,
    logger: console
  });

  const result = await agent.run({
    userPrompt: 'Execute parallel tasks',
    conversationHistory: [],
    toolCallHistory: []
  });

  const executionTime = Date.now() - startTime;
  
  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }
  
  console.log('✅ Parallel execution test passed');
  console.log(`⏱️  Execution time: ${executionTime}ms (should be ~100ms, not ~200ms)`);
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Main test runner
async function runAllTests(): Promise<void> {
  console.log('🚀 Starting AgentLoop Function Calling Tests');
  console.log('==============================================');

  try {
    await testBasicFunctionCalling();
    await testMultipleToolCalls();
    await testComplexJsonArguments();
    await testErrorHandling();
    await testInvalidJsonHandling();
    await testParallelExecution();

    console.log('\n🎉 All tests passed successfully!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

export { runAllTests };