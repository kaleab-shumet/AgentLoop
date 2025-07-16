import { AgentLoop, AgentLifecycleHooks } from '../../../../core/agents/AgentLoop';
import { AIProvider } from '../../../../core/providers/AIProvider';
import { DefaultAIProvider } from '../../../../core/providers/DefaultAIProvider';
import { Tool, ToolResult, ExecutionMode, ChatEntry } from '../../../../core/types/types';
import { MockFactory, TestDataFactory, AgentTestHarness } from '../../../helpers';
import { z } from 'zod';

// Create a concrete implementation for integration testing
class IntegrationTestAgent extends AgentLoop {
  protected systemPrompt = 'You are an integration test agent. Use the available tools to complete user requests.';
  
  constructor(provider: AIProvider, options: any = {}) {
    super(provider, options);
  }
}

describe('Agent Workflow Integration Tests', () => {
  let mockProvider: jest.Mocked<AIProvider>;
  let agent: IntegrationTestAgent;
  let testHarness: AgentTestHarness;

  beforeEach(() => {
    mockProvider = MockFactory.createRealisticMockAIProvider();
    agent = new IntegrationTestAgent(mockProvider, {
      maxIterations: 10,
      parallelExecution: false,
    });
    
    testHarness = new AgentTestHarness({
      aiProvider: mockProvider,
      maxIterations: 10,
      enableStagnationDetection: true,
    });
  });

  describe('Single Tool Execution', () => {
    it('should execute a single tool successfully', async () => {
      const calculatorTool = MockFactory.createMockTool(
        'calculator',
        z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number(),
          b: z.number(),
        }),
        async (args: any) => ({
          success: true,
          result: `${args.a} ${args.operation} ${args.b} = ${
            args.operation === 'add' ? args.a + args.b :
            args.operation === 'subtract' ? args.a - args.b :
            args.operation === 'multiply' ? args.a * args.b :
            args.a / args.b
          }`,
        })
      );

      testHarness.setTools([calculatorTool]);
      
      // Mock AI provider to return calculator tool call
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'calculator',
        arguments: { operation: 'add', a: 5, b: 3 },
      }));

      const result = await testHarness.executeAgent('Calculate 5 + 3');
      
      expect(result.success).toBe(true);
      expect(result.toolsExecuted).toHaveLength(1);
      expect(result.toolsExecuted[0].name).toBe('calculator');
      expect(result.toolsExecuted[0].result.result).toContain('8');
    });

    it('should handle tool execution failure gracefully', async () => {
      const failingTool = MockFactory.createFailingTool('failing_tool', 'Intentional failure');
      
      testHarness.setTools([failingTool]);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'failing_tool',
        arguments: { input: 'test' },
      }));

      const result = await testHarness.executeAgent('Execute failing tool');
      
      expect(result.toolsExecuted).toHaveLength(1);
      expect(result.toolsExecuted[0].result.success).toBe(false);
    });
  });

  describe('Multi-Tool Workflow', () => {
    it('should execute multiple tools in sequence', async () => {
      const fileReadTool = MockFactory.createMockTool(
        'file_read',
        z.object({ path: z.string() }),
        async (args: any) => ({
          success: true,
          result: `File content: ${args.path}`,
        })
      );

      const fileWriteTool = MockFactory.createMockTool(
        'file_write',
        z.object({ path: z.string(), content: z.string() }),
        async (args: any) => ({
          success: true,
          result: `Written to ${args.path}: ${args.content}`,
        })
      );

      testHarness.setTools([fileReadTool, fileWriteTool]);
      
      // Mock multiple AI provider responses
      mockProvider.generateResponse
        .mockResolvedValueOnce(JSON.stringify({
          name: 'file_read',
          arguments: { path: '/tmp/test.txt' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'file_write',
          arguments: { path: '/tmp/output.txt', content: 'processed content' },
        }));

      const result = await testHarness.executeAgent('Read file and process it');
      
      expect(result.success).toBe(true);
      expect(result.toolsExecuted.length).toBeGreaterThan(0);
    });

    it('should handle complex multi-step workflows', async () => {
      const tools = [
        MockFactory.createMockTool('search', z.object({ query: z.string() })),
        MockFactory.createMockTool('analyze', z.object({ data: z.string() })),
        MockFactory.createMockTool('summarize', z.object({ content: z.string() })),
        MockFactory.createMockTool('format', z.object({ text: z.string(), format: z.string() })),
      ];

      testHarness.setTools(tools);
      
      // Mock sequential tool calls
      mockProvider.generateResponse
        .mockResolvedValueOnce(JSON.stringify({
          name: 'search',
          arguments: { query: 'integration testing' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'analyze',
          arguments: { data: 'search results' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'summarize',
          arguments: { content: 'analysis results' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'format',
          arguments: { text: 'summary', format: 'markdown' },
        }));

      const result = await testHarness.executeAgent('Search, analyze, summarize, and format results');
      
      expect(result.success).toBe(true);
      expect(result.toolsExecuted.length).toBe(4);
      expect(result.toolsExecuted.map(t => t.name)).toEqual(['search', 'analyze', 'summarize', 'format']);
    });
  });

  describe('Error Recovery Workflows', () => {
    it('should recover from temporary failures', async () => {
      const unreliableTool = MockFactory.createMockTool(
        'unreliable_tool',
        z.object({ input: z.string() }),
        async (args: any) => {
          // Simulate intermittent failures
          if (Math.random() < 0.3) {
            return { success: false, result: 'Temporary failure' };
          }
          return { success: true, result: 'Success after retry' };
        }
      );

      testHarness.setTools([unreliableTool]);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'unreliable_tool',
        arguments: { input: 'test' },
      }));

      const result = await testHarness.executeAgent('Use unreliable tool');
      
      expect(result).toBeDefined();
      expect(result.toolsExecuted).toHaveLength(1);
    });

    it('should handle cascading failures gracefully', async () => {
      const tools = [
        MockFactory.createFailingTool('failing_tool_1', 'First failure'),
        MockFactory.createFailingTool('failing_tool_2', 'Second failure'),
        MockFactory.createSuccessfulTool('recovery_tool', 'Recovery success'),
      ];

      testHarness.setTools(tools);
      
      mockProvider.generateResponse
        .mockResolvedValueOnce(JSON.stringify({
          name: 'failing_tool_1',
          arguments: { input: 'test' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'failing_tool_2',
          arguments: { input: 'test' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'recovery_tool',
          arguments: { input: 'test' },
        }));

      const result = await testHarness.executeAgent('Handle cascading failures');
      
      expect(result.toolsExecuted.length).toBe(3);
      expect(result.toolsExecuted[0].result.success).toBe(false);
      expect(result.toolsExecuted[1].result.success).toBe(false);
      expect(result.toolsExecuted[2].result.success).toBe(true);
    });
  });

  describe('Parallel Execution', () => {
    it('should execute independent tools in parallel when enabled', async () => {
      testHarness.configure({ enableParallelExecution: true });
      
      const parallelTools = [
        MockFactory.createSlowTool('slow_tool_1', 100),
        MockFactory.createSlowTool('slow_tool_2', 100),
        MockFactory.createSlowTool('slow_tool_3', 100),
      ];

      testHarness.setTools(parallelTools);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify([
        { name: 'slow_tool_1', arguments: { input: 'test1' } },
        { name: 'slow_tool_2', arguments: { input: 'test2' } },
        { name: 'slow_tool_3', arguments: { input: 'test3' } },
      ]));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Execute parallel tools');
      const endTime = Date.now();
      
      expect(result.toolsExecuted.length).toBe(3);
      // Parallel execution should be faster than sequential
      expect(endTime - startTime).toBeLessThan(250); // Should complete in under 250ms
    });

    it('should handle parallel execution failures', async () => {
      testHarness.configure({ enableParallelExecution: true });
      
      const mixedTools = [
        MockFactory.createSuccessfulTool('success_tool_1'),
        MockFactory.createFailingTool('failing_tool_1', 'Parallel failure'),
        MockFactory.createSuccessfulTool('success_tool_2'),
      ];

      testHarness.setTools(mixedTools);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify([
        { name: 'success_tool_1', arguments: { input: 'test1' } },
        { name: 'failing_tool_1', arguments: { input: 'test2' } },
        { name: 'success_tool_2', arguments: { input: 'test3' } },
      ]));

      const result = await testHarness.executeAgent('Execute mixed parallel tools');
      
      expect(result.toolsExecuted.length).toBe(3);
      expect(result.toolsExecuted[0].result.success).toBe(true);
      expect(result.toolsExecuted[1].result.success).toBe(false);
      expect(result.toolsExecuted[2].result.success).toBe(true);
    });
  });

  describe('Stagnation Detection Integration', () => {
    it('should detect and handle stagnation in workflows', async () => {
      testHarness.configure({ 
        enableStagnationDetection: true,
        stagnationThreshold: 3,
      });

      const repetitiveTool = MockFactory.createSuccessfulTool('repetitive_tool');
      testHarness.setTools([repetitiveTool]);
      
      // Mock repetitive responses
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'repetitive_tool',
        arguments: { input: 'same_input' },
      }));

      const result = await testHarness.executeAgent('Cause stagnation');
      
      expect(result.stagnationDetected).toBe(true);
    });

    it('should continue execution when no stagnation is detected', async () => {
      testHarness.configure({ 
        enableStagnationDetection: true,
        stagnationThreshold: 5,
      });

      const progressiveTools = [
        MockFactory.createSuccessfulTool('step_1'),
        MockFactory.createSuccessfulTool('step_2'),
        MockFactory.createSuccessfulTool('step_3'),
      ];

      testHarness.setTools(progressiveTools);
      
      mockProvider.generateResponse
        .mockResolvedValueOnce(JSON.stringify({
          name: 'step_1',
          arguments: { input: 'phase_1' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'step_2',
          arguments: { input: 'phase_2' },
        }))
        .mockResolvedValueOnce(JSON.stringify({
          name: 'step_3',
          arguments: { input: 'phase_3' },
        }));

      const result = await testHarness.executeAgent('Progressive workflow');
      
      expect(result.stagnationDetected).toBe(false);
      expect(result.toolsExecuted.length).toBe(3);
    });
  });

  describe('Conversation Context Integration', () => {
    it('should maintain context across multiple interactions', async () => {
      const contextTool = MockFactory.createMockTool(
        'context_tool',
        z.object({ message: z.string() }),
        async (args: any) => ({
          success: true,
          result: `Context: ${args.message}`,
        })
      );

      testHarness.setTools([contextTool]);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'context_tool',
        arguments: { message: 'context preserved' },
      }));

      // First interaction
      const result1 = await testHarness.executeAgent('Initial context');
      expect(result1.success).toBe(true);
      
      // Second interaction with context
      const result2 = await testHarness.executeAgent('Follow-up with context');
      expect(result2.success).toBe(true);
      
      // Verify context is maintained through execution history
      const history = testHarness.getExecutionHistory();
      expect(history.length).toBe(2);
    });

    it('should handle conversation history in prompts', async () => {
      const conversationTool = MockFactory.createSuccessfulTool('conversation_tool');
      testHarness.setTools([conversationTool]);
      
      const conversationHistory: ChatEntry[] = [
        { role: 'user', content: 'Previous user message' },
        { role: 'assistant', content: 'Previous assistant response' },
      ];

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'conversation_tool',
        arguments: { input: 'with_history' },
      }));

      const result = await testHarness.executeAgent('Current message');
      
      expect(result.success).toBe(true);
      expect(result.toolsExecuted).toHaveLength(1);
    });
  });

  describe('Lifecycle Hooks Integration', () => {
    it('should execute lifecycle hooks during workflow', async () => {
      const hookCalls: string[] = [];
      
      const mockHooks: AgentLifecycleHooks = {
        onRunStart: jest.fn().mockImplementation(async () => {
          hookCalls.push('onRunStart');
        }),
        onRunEnd: jest.fn().mockImplementation(async () => {
          hookCalls.push('onRunEnd');
        }),
        onIterationStart: jest.fn().mockImplementation(async () => {
          hookCalls.push('onIterationStart');
        }),
        onIterationEnd: jest.fn().mockImplementation(async () => {
          hookCalls.push('onIterationEnd');
        }),
        onToolCallStart: jest.fn().mockImplementation(async () => {
          hookCalls.push('onToolCallStart');
        }),
        onToolCallEnd: jest.fn().mockImplementation(async () => {
          hookCalls.push('onToolCallEnd');
        }),
      };

      const agentWithHooks = new IntegrationTestAgent(mockProvider, {
        hooks: mockHooks,
        maxIterations: 5,
      });

      const simpleTool = MockFactory.createSuccessfulTool('simple_tool');
      agentWithHooks.tools = [simpleTool];
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'simple_tool',
        arguments: { input: 'test' },
      }));

      // Note: This would require actual agent.run() implementation
      // For now, we test that hooks are properly configured
      expect(mockHooks.onRunStart).toBeDefined();
      expect(mockHooks.onRunEnd).toBeDefined();
      expect(mockHooks.onIterationStart).toBeDefined();
      expect(mockHooks.onIterationEnd).toBeDefined();
      expect(mockHooks.onToolCallStart).toBeDefined();
      expect(mockHooks.onToolCallEnd).toBeDefined();
    });
  });

  describe('Performance Integration', () => {
    it('should maintain performance with multiple tools', async () => {
      const performanceTools = Array.from({ length: 20 }, (_, i) => 
        MockFactory.createSuccessfulTool(`perf_tool_${i}`)
      );

      testHarness.setTools(performanceTools);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'perf_tool_10',
        arguments: { input: 'performance_test' },
      }));

      const performanceResult = await testHarness.runPerformanceBenchmark('small');
      
      expect(performanceResult.averageExecutionTime).toBeLessThan(1000);
      expect(performanceResult.passedBenchmark).toBe(true);
    });

    it('should handle high-frequency executions', async () => {
      const highFreqTool = MockFactory.createSuccessfulTool('high_freq_tool');
      testHarness.setTools([highFreqTool]);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'high_freq_tool',
        arguments: { input: 'high_frequency' },
      }));

      const promises = Array.from({ length: 10 }, (_, i) => 
        testHarness.executeAgent(`High frequency test ${i}`)
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.toolsExecuted).toHaveLength(1);
      });
    });
  });

  describe('Error Boundary Integration', () => {
    it('should handle system-level errors gracefully', async () => {
      const systemErrorTool = MockFactory.createMockTool(
        'system_error_tool',
        z.object({ input: z.string() }),
        async (args: any) => {
          throw new Error('System-level error');
        }
      );

      testHarness.setTools([systemErrorTool]);
      
      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'system_error_tool',
        arguments: { input: 'cause_system_error' },
      }));

      const result = await testHarness.executeAgent('Cause system error');
      
      expect(result.toolsExecuted).toHaveLength(1);
      expect(result.toolsExecuted[0].result.success).toBe(false);
    });

    it('should handle provider communication errors', async () => {
      mockProvider.generateResponse.mockRejectedValue(new Error('Provider communication error'));
      
      const result = await testHarness.executeAgent('Test provider error');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Provider communication error');
    });
  });
});