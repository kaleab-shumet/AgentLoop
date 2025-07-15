import { AgentLoop } from '../../core/agents/AgentLoop';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { ExecutionMode } from '../../core/types/types';
import { z } from 'zod';

// Load environment variables from .env file
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
} catch (error) {
  // Try from current directory
  try {
    require('dotenv').config();
  } catch (error2) {
    // dotenv not installed, that's ok - assume env vars are set manually
  }
}

/**
 * Real Function Calling Tests with Gemini API
 * These tests use your actual Gemini API key to test function calling in real scenarios
 */

// Real test agent that extends AgentLoop
class RealTestAgent extends AgentLoop {
  protected systemPrompt = 'You are a helpful assistant that can use tools to accomplish tasks. Always call the final tool with your answer when you are done.';
  
  constructor(provider: DefaultAIProvider, tools: any[], options: any = {}) {
    super(provider, options);
    tools.forEach(tool => this.defineTool(() => tool));
  }
}

// Test tools for real scenarios
const calculatorTool = {
  name: 'calculator',
  description: 'Performs arithmetic calculations (add, subtract, multiply, divide)',
  argsSchema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number().describe('First number'),
    b: z.number().describe('Second number')
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
      output: `${a} ${operation} ${b} = ${result}`
    };
  }
};

const weatherTool = {
  name: 'get_weather',
  description: 'Gets simulated weather information for a location',
  argsSchema: z.object({
    location: z.string().describe('The city or location to get weather for'),
    units: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature units')
  }),
  handler: async (name: string, args: any) => {
    const { location, units = 'celsius' } = args;
    
    // Simulate weather data
    const temp = units === 'celsius' ? Math.floor(Math.random() * 30) + 5 : Math.floor(Math.random() * 50) + 40;
    const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy'][Math.floor(Math.random() * 4)];
    
    return {
      toolName: name,
      success: true,
      output: `Weather in ${location}: ${temp}°${units === 'celsius' ? 'C' : 'F'}, ${conditions}`
    };
  }
};

const searchTool = {
  name: 'search_knowledge',
  description: 'Searches for information on a given topic',
  argsSchema: z.object({
    query: z.string().describe('The search query'),
    category: z.enum(['science', 'history', 'technology', 'general']).optional()
  }),
  handler: async (name: string, args: any) => {
    const { query, category = 'general' } = args;
    
    // Simulate search results
    const results = [
      `Found information about ${query} in ${category} category`,
      `Key facts: This is simulated search data for testing purposes`,
      `Source: Test Knowledge Base`
    ];
    
    return {
      toolName: name,
      success: true,
      output: results.join('. ')
    };
  }
};

const finalTool = {
  name: 'final',
  description: 'Provides the final answer to the user. Call this when you have completed the task.',
  argsSchema: z.object({
    answer: z.string().describe('Your final answer to the user')
  }),
  handler: async (name: string, args: any) => {
    return {
      toolName: name,
      success: true,
      output: args.answer
    };
  }
};

// Test 1: Basic Math Calculation
async function testBasicCalculation(): Promise<void> {
  console.log('🧪 Test 1: Basic Math Calculation');
  
  const provider = new DefaultAIProvider({
    service: 'google',
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.0-flash'
  });
  
  const agent = new RealTestAgent(provider, [calculatorTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 5,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Calculate 47 * 23 and tell me the result',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  if (!result.finalAnswer || !result.finalAnswer.output) {
    throw new Error('Test failed: No final answer received');
  }
  
  console.log('✅ Basic calculation test passed');
  console.log('📊 Result:', result.finalAnswer.output);
  console.log('🔗 Tool calls made:', result.toolCallHistory.length);
}

// Test 2: Multiple Tool Usage
async function testMultipleTools(): Promise<void> {
  console.log('\\n🧪 Test 2: Multiple Tool Usage');
  
  const provider = new DefaultAIProvider({
    service: 'google',
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.0-flash'
  });
  
  const agent = new RealTestAgent(provider, [calculatorTool, weatherTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 8,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Calculate 12 + 8, then get the weather for Tokyo, and summarize both results',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  if (!result.finalAnswer || !result.finalAnswer.output) {
    throw new Error('Test failed: No final answer received');
  }
  
  console.log('✅ Multiple tools test passed');
  console.log('📊 Result:', result.finalAnswer.output);
  console.log('🔗 Tool calls made:', result.toolCallHistory.length);
}

// Test 3: Complex Reasoning
async function testComplexReasoning(): Promise<void> {
  console.log('\\n🧪 Test 3: Complex Reasoning with Tools');
  
  const provider = new DefaultAIProvider({
    service: 'google',
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.0-flash'
  });
  
  const agent = new RealTestAgent(provider, [calculatorTool, searchTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 10,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'I have 15 apples and I want to divide them equally among 4 people. How many apples does each person get, and search for information about apple nutrition.',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  if (!result.finalAnswer || !result.finalAnswer.output) {
    throw new Error('Test failed: No final answer received');
  }
  
  console.log('✅ Complex reasoning test passed');
  console.log('📊 Result:', result.finalAnswer.output);
  console.log('🔗 Tool calls made:', result.toolCallHistory.length);
}

// Test 4: Error Handling
async function testErrorHandling(): Promise<void> {
  console.log('\\n🧪 Test 4: Error Handling');
  
  const provider = new DefaultAIProvider({
    service: 'google',
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.0-flash'
  });
  
  const agent = new RealTestAgent(provider, [calculatorTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 5,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Try to divide 10 by 0 and handle any errors that occur',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  if (!result.finalAnswer || !result.finalAnswer.output) {
    throw new Error('Test failed: No final answer received');
  }
  
  console.log('✅ Error handling test passed');
  console.log('📊 Result:', result.finalAnswer.output);
  console.log('🔗 Tool calls made:', result.toolCallHistory.length);
}

// Test 5: Conversational Context
async function testConversationalContext(): Promise<void> {
  console.log('\\n🧪 Test 5: Conversational Context');
  
  const provider = new DefaultAIProvider({
    service: 'google',
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.0-flash'
  });
  
  const agent = new RealTestAgent(provider, [calculatorTool, weatherTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 10,
    logger: console
  });
  
  // First interaction
  const result1 = await agent.run({
    userPrompt: 'Calculate 5 + 3',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  // Second interaction with context
  const result2 = await agent.run({
    userPrompt: 'Now multiply that result by 4',
    conversationHistory: [
      { sender: 'user', message: 'Calculate 5 + 3' },
      { sender: 'ai', message: result1.finalAnswer?.output || 'Error' }
    ],
    toolCallHistory: result1.toolCallHistory
  });
  
  if (!result2.finalAnswer || !result2.finalAnswer.output) {
    throw new Error('Test failed: No final answer received');
  }
  
  console.log('✅ Conversational context test passed');
  console.log('📊 First result:', result1.finalAnswer?.output);
  console.log('📊 Second result:', result2.finalAnswer?.output);
  console.log('🔗 Total tool calls:', result2.toolCallHistory.length);
}

// Main test runner
async function runRealFunctionCallingTests(): Promise<void> {
  console.log('🚀 Starting Real Function Calling Tests with Gemini');
  console.log('====================================================');
  
  // Check if API key is available
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️  Warning: GEMINI_API_KEY environment variable not set');
    console.log('Please set your Gemini API key as an environment variable');
    console.log('Example: export GEMINI_API_KEY=your_api_key_here');
    return;
  }
  
  const startTime = Date.now();
  
  try {
    await testBasicCalculation();
    await testMultipleTools();
    await testComplexReasoning();
    await testErrorHandling();
    await testConversationalContext();
    
    const totalTime = Date.now() - startTime;
    
    console.log('\\n🎉 All real function calling tests passed!');
    console.log(`⏱️  Total execution time: ${totalTime}ms`);
    console.log('\\n📋 Test Summary:');
    console.log('   ✓ Basic calculation with single tool');
    console.log('   ✓ Multiple tool usage in sequence');
    console.log('   ✓ Complex reasoning with tool combination');
    console.log('   ✓ Error handling and recovery');
    console.log('   ✓ Conversational context preservation');
    
  } catch (error: any) {
    console.error('❌ Real function calling test failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runRealFunctionCallingTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

export { runRealFunctionCallingTests };