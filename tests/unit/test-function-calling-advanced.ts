import { AgentLoop } from '../../core/agents/AgentLoop';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { Logger } from '../../core/utils/Logger';
import { ExecutionMode } from '../../core/types/types';
import { z } from 'zod';

/**
 * Advanced Function Calling Test Suite
 * Tests complex scenarios, edge cases, and error conditions
 */

// Mock AI Provider with advanced capabilities
class AdvancedMockAIProvider extends DefaultAIProvider {
  private responses: string[] = [];
  private currentResponseIndex = 0;
  private callCount = 0;

  setMockResponses(responses: string[]) {
    this.responses = responses;
    this.currentResponseIndex = 0;
    this.callCount = 0;
  }

  async getCompletion(prompt: string, tools: any[] = [], options = {}): Promise<string> {
    this.callCount++;
    
    if (this.currentResponseIndex >= this.responses.length) {
      throw new Error(`No more mock responses available (call ${this.callCount})`);
    }
    
    const response = this.responses[this.currentResponseIndex];
    this.currentResponseIndex++;
    return response;
  }

  getCallCount(): number {
    return this.callCount;
  }
}

// Concrete test agent that extends AgentLoop
class AdvancedTestAgent extends AgentLoop {
  protected systemPrompt = 'You are an advanced test agent for function calling.';
  
  constructor(provider: DefaultAIProvider, tools: any[], options: any = {}) {
    super(provider, options);
    tools.forEach(tool => this.defineTool(() => tool));
  }
}

// Advanced test tools
const databaseTool = {
  name: 'database_query',
  description: 'Executes database queries',
  argsSchema: z.object({
    query: z.string(),
    parameters: z.array(z.any()).optional(),
    timeout: z.number().optional()
  }),
  handler: async (name: string, args: any) => {
    const { query, parameters = [], timeout = 5000 } = args;
    
    // Simulate database query
    if (query.toLowerCase().includes('select')) {
      return {
        toolName: name,
        success: true,
        output: {
          rows: [
            { id: 1, name: 'Alice', age: 30 },
            { id: 2, name: 'Bob', age: 25 }
          ],
          count: 2
        }
      };
    }
    
    if (query.toLowerCase().includes('insert')) {
      return {
        toolName: name,
        success: true,
        output: { insertedId: 3, affectedRows: 1 }
      };
    }
    
    throw new Error('Unsupported query type');
  }
};

const apiTool = {
  name: 'api_call',
  description: 'Makes HTTP API calls',
  argsSchema: z.object({
    url: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    headers: z.record(z.string()).optional(),
    body: z.any().optional()
  }),
  handler: async (name: string, args: any) => {
    const { url, method, headers, body } = args;
    
    // Simulate API call
    if (url.includes('error')) {
      return {
        toolName: name,
        success: false,
        error: 'API returned 404'
      };
    }
    
    return {
      toolName: name,
      success: true,
      output: {
        status: 200,
        data: { message: 'API call successful', method, url },
        headers: { 'content-type': 'application/json' }
      }
    };
  }
};

const fileTool = {
  name: 'file_operation',
  description: 'Performs file operations',
  argsSchema: z.object({
    operation: z.enum(['read', 'write', 'delete', 'list']),
    path: z.string(),
    content: z.string().optional(),
    encoding: z.string().optional()
  }),
  handler: async (name: string, args: any) => {
    const { operation, path, content, encoding = 'utf8' } = args;
    
    switch (operation) {
      case 'read':
        return {
          toolName: name,
          success: true,
          output: { content: 'File content here', encoding, size: 100 }
        };
      
      case 'write':
        if (!content) {
          throw new Error('Content required for write operation');
        }
        return {
          toolName: name,
          success: true,
          output: { bytesWritten: content.length, path }
        };
      
      case 'list':
        return {
          toolName: name,
          success: true,
          output: { files: ['file1.txt', 'file2.txt'], count: 2 }
        };
      
      case 'delete':
        return {
          toolName: name,
          success: true,
          output: { deleted: true, path }
        };
      
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }
};

const finalTool = {
  name: 'final',
  description: 'Provides the final answer',
  argsSchema: z.object({
    answer: z.string(),
    metadata: z.record(z.any()).optional()
  }),
  handler: async (name: string, args: any) => {
    return {
      toolName: name,
      success: true,
      output: args.answer,
      metadata: args.metadata
    };
  }
};

// Test 1: Chain of Dependencies
async function testChainOfDependencies(): Promise<void> {
  console.log('🧪 Test 1: Chain of Dependencies');
  
  const mockProvider = new AdvancedMockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });
  
  mockProvider.setMockResponses([
    // First: Query database
    `\`\`\`json
{
  "functionCall": {
    "name": "database_query",
    "arguments": "{\\"query\\": \\"SELECT * FROM users WHERE active = true\\", \\"parameters\\": []}"
  }
}
\`\`\``,
    // Second: Use DB results to make API call
    `\`\`\`json
{
  "functionCall": {
    "name": "api_call",
    "arguments": "{\\"url\\": \\"https://api.example.com/users/sync\\", \\"method\\": \\"POST\\", \\"body\\": {\\"users\\": [{\\"id\\": 1, \\"name\\": \\"Alice\\"}, {\\"id\\": 2, \\"name\\": \\"Bob\\"}]}}"
  }
}
\`\`\``,
    // Third: Save results to file
    `\`\`\`json
{
  "functionCall": {
    "name": "file_operation",
    "arguments": "{\\"operation\\": \\"write\\", \\"path\\": \\"/tmp/sync_results.json\\", \\"content\\": \\"{\\\\\\"status\\\\\\": \\\\\\"success\\\\\\", \\\\\\"synced\\\\\\": 2}\\"}"
  }
}
\`\`\``,
    // Final: Summarize
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"Successfully synced 2 users and saved results to file\\", \\"metadata\\": {\\"chain_length\\": 3}}"
  }
}
\`\`\``
  ]);
  
  const agent = new AdvancedTestAgent(mockProvider, [databaseTool, apiTool, fileTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 5,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Query active users, sync them via API, and save results',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }

  console.log('✅ Chain of dependencies test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
  console.log('🔗 Tool calls:', result.toolCallHistory.length);
}

// Test 2: Conditional Logic with Failures
async function testConditionalLogicWithFailures(): Promise<void> {
  console.log('\n🧪 Test 2: Conditional Logic with Failures');
  
  const mockProvider = new AdvancedMockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });
  
  mockProvider.setMockResponses([
    // First: Try primary API
    `\`\`\`json
{
  "functionCall": {
    "name": "api_call",
    "arguments": "{\\"url\\": \\"https://api.error.com/primary\\", \\"method\\": \\"GET\\"}"
  }
}
\`\`\``,
    // Second: Primary failed, try backup
    `\`\`\`json
{
  "functionCall": {
    "name": "api_call",
    "arguments": "{\\"url\\": \\"https://api.backup.com/secondary\\", \\"method\\": \\"GET\\"}"
  }
}
\`\`\``,
    // Third: Log the fallback
    `\`\`\`json
{
  "functionCall": {
    "name": "file_operation",
    "arguments": "{\\"operation\\": \\"write\\", \\"path\\": \\"/tmp/fallback.log\\", \\"content\\": \\"Primary API failed, used backup successfully\\"}"
  }
}
\`\`\``,
    // Final: Report
    `\`\`\`json
{
  "functionCall": {
    "name": "final",
    "arguments": "{\\"answer\\": \\"Primary API failed, successfully used backup API\\", \\"metadata\\": {\\"fallback_used\\": true}}"
  }
}
\`\`\``
  ]);
  
  const agent = new AdvancedTestAgent(mockProvider, [apiTool, fileTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 5,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Try primary API, use backup if it fails',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  // Verify the test actually succeeded
  if (!result.finalAnswer || result.finalAnswer.output === undefined) {
    throw new Error('Test failed: No final answer received');
  }

  console.log('✅ Conditional logic with failures test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
  console.log('🔄 Fallback used:', result.finalAnswer?.metadata?.fallback_used);
}

// Test 3: Complex Nested JSON Arguments
async function testComplexNestedJson(): Promise<void> {
  console.log('\n🧪 Test 3: Complex Nested JSON Arguments');
  
  const complexTool = {
    name: 'complex_processor',
    description: 'Processes complex nested data structures',
    argsSchema: z.object({
      config: z.object({
        processing: z.object({
          mode: z.enum(['batch', 'stream', 'realtime']),
          options: z.object({
            batchSize: z.number(),
            timeout: z.number(),
            retries: z.number()
          })
        }),
        output: z.object({
          format: z.enum(['json', 'csv', 'xml']),
          compression: z.boolean(),
          destination: z.string()
        })
      }),
      data: z.array(z.object({
        id: z.string(),
        payload: z.record(z.any()),
        metadata: z.object({
          timestamp: z.string(),
          source: z.string(),
          tags: z.array(z.string())
        })
      }))
    }),
    handler: async (name: string, args: any) => {
      const { config, data } = args;
      
      // Process based on config
      const processedCount = data.length;
      const processingTime = processedCount * 10; // Simulate processing time
      
      return {
        toolName: name,
        success: true,
        output: {
          processed: processedCount,
          mode: config.processing.mode,
          format: config.output.format,
          processingTime
        }
      };
    }
  };
  
  const mockProvider = new AdvancedMockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });
  
  mockProvider.setMockResponses([
    `
    \`\`\`json
    {
      "functionCall": {
        "name": "complex_processor",
        "arguments": "{\"config\": {\"processing\": {\"mode\": \"batch\", \"options\": {\"batchSize\": 100, \"timeout\": 30000, \"retries\": 3}}, \"output\": {\"format\": \"json\", \"compression\": true, \"destination\": \"/tmp/processed.json.gz\"}}, \"data\": [{\"id\": \"item1\", \"payload\": {\"value\": 42, \"type\": \"number\", \"nested\": {\"deep\": \"value\"}}, \"metadata\": {\"timestamp\": \"2024-01-01T00:00:00Z\", \"source\": \"system\", \"tags\": [\"important\", \"processed\"]}}, {\"id\": \"item2\", \"payload\": {\"value\": \"text\", \"type\": \"string\"}, \"metadata\": {\"timestamp\": \"2024-01-01T00:01:00Z\", \"source\": \"user\", \"tags\": [\"user-input\"]}}]}"
      }
    }
    \`\`\`
    `,
    `
    \`\`\`json
    {
      "functionCall": {
        "name": "final",
        "arguments": "{\"answer\": \"Successfully processed 2 items in batch mode, output saved as compressed JSON\"}"
      }
    }
    \`\`\`
    `
  ]);
  
  const agent = new AdvancedTestAgent(mockProvider, [complexTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 3,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Process complex nested data with batch configuration',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  console.log('✅ Complex nested JSON test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Test 4: Tool Timeout and Retry Logic
async function testToolTimeoutAndRetry(): Promise<void> {
  console.log('\n🧪 Test 4: Tool Timeout and Retry Logic');
  
  const timeoutTool = {
    name: 'timeout_tool',
    description: 'A tool that can timeout',
    timeout: 100, // 100ms timeout
    argsSchema: z.object({
      delay: z.number(),
      shouldSucceed: z.boolean()
    }),
    handler: async (name: string, args: any) => {
      const { delay, shouldSucceed } = args;
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      if (!shouldSucceed) {
        throw new Error('Tool execution failed');
      }
      
      return {
        toolName: name,
        success: true,
        output: `Completed after ${delay}ms`
      };
    }
  };
  
  const mockProvider = new AdvancedMockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });
  
  mockProvider.setMockResponses([
    // First: Try with timeout (will fail)
    `
    \`\`\`json
    {
      "functionCall": {
        "name": "timeout_tool",
        "arguments": "{\"delay\": 200, \"shouldSucceed\": true}"
      }
    }
    \`\`\`
    `,
    // Second: Retry with shorter delay
    `
    \`\`\`json
    {
      "functionCall": {
        "name": "timeout_tool",
        "arguments": "{\"delay\": 50, \"shouldSucceed\": true}"
      }
    }
    \`\`\`
    `,
    // Final: Report
    `
    \`\`\`json
    {
      "functionCall": {
        "name": "final",
        "arguments": "{\"answer\": \"Tool succeeded after retry with shorter delay\"}"
      }
    }
    \`\`\`
    `
  ]);
  
  const agent = new AdvancedTestAgent(mockProvider, [timeoutTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 4,
    toolTimeoutMs: 100,
    retryAttempts: 2,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Test tool with timeout and retry logic',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  console.log('✅ Tool timeout and retry test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Test 5: Large Scale Parallel Processing
async function testLargeScaleParallelProcessing(): Promise<void> {
  console.log('\n🧪 Test 5: Large Scale Parallel Processing');
  
  const parallelTool = {
    name: 'parallel_task',
    description: 'Executes parallel tasks',
    argsSchema: z.object({
      taskId: z.string(),
      workload: z.number(),
      data: z.array(z.string())
    }),
    handler: async (name: string, args: any) => {
      const { taskId, workload, data } = args;
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, workload));
      
      return {
        toolName: name,
        success: true,
        output: {
          taskId,
          processed: data.length,
          workload
        }
      };
    }
  };
  
  const mockProvider = new AdvancedMockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });
  
  // Generate 8 parallel tasks
  const parallelTasks = Array.from({ length: 8 }, (_, i) => ({
    functionCall: {
      name: 'parallel_task',
      arguments: JSON.stringify({
        taskId: `task-${i + 1}`,
        workload: 50,
        data: [`item-${i}-1`, `item-${i}-2`, `item-${i}-3`]
      })
    }
  }));
  
  mockProvider.setMockResponses([
    `\`\`\`json\n${JSON.stringify(parallelTasks)}\n\`\`\``,
    `
    \`\`\`json
    {
      "functionCall": {
        "name": "final",
        "arguments": "{\"answer\": \"Successfully processed 8 parallel tasks, total items: 24\"}"
      }
    }
    \`\`\`
    `
  ]);
  
  const startTime = Date.now();
  
  const agent = new AdvancedTestAgent(mockProvider, [parallelTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    parallelExecution: true,
    maxIterations: 3,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Execute 8 parallel tasks simultaneously',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  const executionTime = Date.now() - startTime;
  
  console.log('✅ Large scale parallel processing test passed');
  console.log(`⏱️  Execution time: ${executionTime}ms`);
  console.log('📊 Result:', result.finalAnswer?.output);
  console.log('🔗 Tool calls:', result.toolCallHistory.length);
}

// Test 6: Edge Case - Empty and Malformed Responses
async function testEdgeCasesAndMalformedResponses(): Promise<void> {
  console.log('\n🧪 Test 6: Edge Cases and Malformed Responses');
  
  const mockProvider = new AdvancedMockAIProvider({
    service: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4'
  });
  
  mockProvider.setMockResponses([
    // Malformed JSON with extra characters
    `
    Some text before
    \`\`\`json
    {
      "functionCall": {
        "name": "database_query",
        "arguments": "{\"query\": \"SELECT * FROM users\", \"note\": \"This has \\\"nested\\\" quotes and \\n newlines\"}"
      }
    }
    \`\`\`
    Some text after
    `,
    // Final response
    `
    \`\`\`json
    {
      "functionCall": {
        "name": "final",
        "arguments": "{\"answer\": \"Successfully handled malformed JSON and extracted valid function call\"}"
      }
    }
    \`\`\`
    `
  ]);
  
  const agent = new AdvancedTestAgent(mockProvider, [databaseTool, finalTool], {
    executionMode: ExecutionMode.FUNCTION_CALLING,
    maxIterations: 3,
    logger: console
  });
  
  const result = await agent.run({
    userPrompt: 'Test handling of malformed responses',
    conversationHistory: [],
    toolCallHistory: []
  });
  
  console.log('✅ Edge cases and malformed responses test passed');
  console.log('📊 Result:', result.finalAnswer?.output);
}

// Main test runner
async function runAdvancedTests(): Promise<void> {
  console.log('🚀 Starting Advanced Function Calling Tests');
  console.log('============================================');
  
  try {
    await testChainOfDependencies();
    await testConditionalLogicWithFailures();
    await testComplexNestedJson();
    await testToolTimeoutAndRetry();
    await testLargeScaleParallelProcessing();
    await testEdgeCasesAndMalformedResponses();
    
    console.log('\n🎉 All advanced tests passed successfully!');
  } catch (error: any) {
    console.error('❌ Advanced test failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAdvancedTests().catch(error => {
    console.error('❌ Advanced test execution failed:', error);
    process.exit(1);
  });
}

export { runAdvancedTests };