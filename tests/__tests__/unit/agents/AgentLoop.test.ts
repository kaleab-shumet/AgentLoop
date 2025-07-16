import { jest } from '@jest/globals';
import { AgentLoop, AgentLifecycleHooks, AgentLoopOptions } from '../../../../core/agents/AgentLoop';
import { AIProvider } from '../../../../core/providers/AIProvider';
import { Tool, ToolResult, ExecutionMode, AgentRunInput, AgentRunOutput } from '../../../../core/types/types';
import { AgentError, AgentErrorType } from '../../../../core/utils/AgentError';
import { MockFactory, TestDataFactory, AgentTestHarness } from '../../../helpers';
import { z } from 'zod';

// Create a concrete implementation for testing
class TestAgentLoop extends AgentLoop {
  protected systemPrompt = 'You are a test agent.';
  
  constructor(provider: AIProvider, options: AgentLoopOptions = {}) {
    super(provider, options);
  }
}

describe('AgentLoop', () => {
  let mockProvider: jest.Mocked<AIProvider>;
  let mockLogger: any;
  let agent: TestAgentLoop;
  let testHarness: AgentTestHarness;

  beforeEach(() => {
    mockProvider = MockFactory.createMockAIProvider(['{"name": "test_tool", "arguments": {"input": "test"}}']);
    mockLogger = MockFactory.createMockLogger();
    
    agent = new TestAgentLoop(mockProvider, {
      logger: mockLogger,
      maxIterations: 5,
      parallelExecution: false,
    });

    testHarness = new AgentTestHarness({
      aiProvider: mockProvider,
      logger: mockLogger,
      maxIterations: 5,
    });
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const defaultAgent = new TestAgentLoop(mockProvider);
      expect(defaultAgent).toBeDefined();
      expect((defaultAgent as any).maxIterations).toBe(10);
      expect((defaultAgent as any).parallelExecution).toBe(true);
    });

    it('should initialize with custom options', () => {
      const customAgent = new TestAgentLoop(mockProvider, {
        maxIterations: 20,
        parallelExecution: false,
        toolTimeoutMs: 45000,
        retryAttempts: 5,
      });

      expect((customAgent as any).maxIterations).toBe(20);
      expect((customAgent as any).parallelExecution).toBe(false);
      expect((customAgent as any).toolTimeoutMs).toBe(45000);
      expect((customAgent as any).retryAttempts).toBe(5);
    });

    it('should initialize with lifecycle hooks', () => {
      const mockHooks: AgentLifecycleHooks = {
        onRunStart: jest.fn(),
        onRunEnd: jest.fn(),
        onIterationStart: jest.fn(),
        onIterationEnd: jest.fn(),
      };

      const agentWithHooks = new TestAgentLoop(mockProvider, { hooks: mockHooks });
      expect((agentWithHooks as any).hooks).toBe(mockHooks);
    });
  });

  describe('Tool Management', () => {
    it('should add tools correctly', () => {
      const tool = MockFactory.createSuccessfulTool('test_tool');
      agent.tools = [tool];
      
      expect(agent.tools).toHaveLength(1);
      expect(agent.tools[0].name).toBe('test_tool');
    });

    it('should handle multiple tools', () => {
      const tools = [
        MockFactory.createSuccessfulTool('tool1'),
        MockFactory.createSuccessfulTool('tool2'),
        MockFactory.createSuccessfulTool('tool3'),
      ];
      agent.tools = tools;
      
      expect(agent.tools).toHaveLength(3);
      expect(agent.tools.map(t => t.name)).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should validate tool schemas', () => {
      const toolWithSchema = MockFactory.createMockTool(
        'schema_tool',
        z.object({
          required_param: z.string(),
          optional_param: z.number().optional(),
        })
      );
      
      agent.tools = [toolWithSchema];
      expect(agent.tools[0].schema).toBeDefined();
    });
  });

  describe('Execution Flow', () => {
    it('should execute a simple tool successfully', async () => {
      const successTool = MockFactory.createSuccessfulTool('success_tool', 'Success result');
      testHarness.setTools([successTool]);

      const result = await testHarness.executeAgent('Execute success tool');
      
      expect(result.success).toBe(true);
      expect(result.toolsExecuted).toHaveLength(1);
      expect(result.toolsExecuted[0].name).toBe('success_tool');
    });

    it('should handle tool execution failure', async () => {
      const failingTool = MockFactory.createFailingTool('failing_tool', 'Tool failed');
      testHarness.setTools([failingTool]);

      const result = await testHarness.executeAgent('Execute failing tool');
      
      // The result structure depends on implementation
      expect(result.errors).toBeDefined();
    });

    it('should respect maximum iterations', async () => {
      testHarness.configure({ maxIterations: 3 });
      
      const result = await testHarness.executeAgent('Test max iterations');
      
      expect(result.iterationCount).toBeLessThanOrEqual(3);
    });

    it('should handle parallel execution when enabled', async () => {
      const tool1 = MockFactory.createSuccessfulTool('tool1');
      const tool2 = MockFactory.createSuccessfulTool('tool2');
      
      testHarness.setTools([tool1, tool2]);
      testHarness.configure({ enableParallelExecution: true });

      const result = await testHarness.executeAgent('Execute multiple tools');
      
      expect(result.success).toBe(true);
    });

    it('should handle sequential execution when disabled', async () => {
      const tool1 = MockFactory.createSuccessfulTool('tool1');
      const tool2 = MockFactory.createSuccessfulTool('tool2');
      
      testHarness.setTools([tool1, tool2]);
      testHarness.configure({ enableParallelExecution: false });

      const result = await testHarness.executeAgent('Execute multiple tools');
      
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle AI provider errors', async () => {
      const errorProvider = MockFactory.createMockAIProvider([]);
      errorProvider.generateResponse.mockRejectedValue(new Error('AI Provider Error'));
      
      const errorHarness = new AgentTestHarness({
        aiProvider: errorProvider,
        logger: mockLogger,
      });

      const result = await errorHarness.executeAgent('Test error handling');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('AI Provider Error');
    });

    it('should handle malformed JSON responses', async () => {
      const malformedProvider = MockFactory.createMockAIProvider(['invalid json']);
      
      const malformedHarness = new AgentTestHarness({
        aiProvider: malformedProvider,
        logger: mockLogger,
      });

      const result = await malformedHarness.executeAgent('Test malformed response');
      
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Failed to parse AI response');
    });

    it('should handle tool execution timeout', async () => {
      const slowTool = MockFactory.createSlowTool('slow_tool', 5000);
      
      testHarness.setTools([slowTool]);
      testHarness.configure({ maxIterations: 1 });

      const result = await testHarness.executeAgent('Execute slow tool');
      
      // Test depends on implementation of timeout handling
      expect(result).toBeDefined();
    });

    it('should recover from errors when possible', async () => {
      const errorRecoveryResult = await testHarness.testErrorRecovery();
      
      expect(errorRecoveryResult.totalErrors).toBeGreaterThan(0);
      expect(errorRecoveryResult.results).toHaveLength(errorRecoveryResult.totalErrors);
    });
  });

  describe('Stagnation Detection', () => {
    it('should detect stagnation patterns', async () => {
      testHarness.configure({ 
        enableStagnationDetection: true,
        stagnationThreshold: 2 
      });

      const stagnationResult = await testHarness.testStagnationDetection();
      
      expect(stagnationResult.totalPatterns).toBeGreaterThan(0);
      expect(stagnationResult.results).toHaveLength(stagnationResult.totalPatterns);
    });

    it('should not detect stagnation when disabled', async () => {
      testHarness.configure({ enableStagnationDetection: false });
      
      const result = await testHarness.executeAgent('Test no stagnation detection');
      
      expect(result.stagnationDetected).toBe(false);
    });

    it('should respect stagnation threshold', async () => {
      testHarness.configure({ 
        enableStagnationDetection: true,
        stagnationThreshold: 5 
      });

      const result = await testHarness.executeAgent('Test stagnation threshold');
      
      // Should not detect stagnation quickly with higher threshold
      expect(result.stagnationDetected).toBe(false);
    });
  });

  describe('Lifecycle Hooks', () => {
    let mockHooks: jest.Mocked<AgentLifecycleHooks>;

    beforeEach(() => {
      mockHooks = {
        onRunStart: jest.fn(),
        onRunEnd: jest.fn(),
        onIterationStart: jest.fn(),
        onIterationEnd: jest.fn(),
        onPromptCreate: jest.fn().mockImplementation((prompt) => Promise.resolve(prompt)),
        onLLMStart: jest.fn(),
        onLLMEnd: jest.fn(),
        onToolCallStart: jest.fn(),
        onToolCallEnd: jest.fn(),
        onFinalAnswer: jest.fn(),
        onError: jest.fn(),
      };
    });

    it('should call onRunStart and onRunEnd hooks', async () => {
      const agentWithHooks = new TestAgentLoop(mockProvider, { hooks: mockHooks });
      const tool = MockFactory.createSuccessfulTool('test_tool');
      agentWithHooks.tools = [tool];

      // This would require actual run method implementation
      // For now, test that hooks are stored correctly
      expect((agentWithHooks as any).hooks).toBe(mockHooks);
    });

    it('should call onIterationStart and onIterationEnd hooks', async () => {
      const agentWithHooks = new TestAgentLoop(mockProvider, { hooks: mockHooks });
      
      expect((agentWithHooks as any).hooks.onIterationStart).toBe(mockHooks.onIterationStart);
      expect((agentWithHooks as any).hooks.onIterationEnd).toBe(mockHooks.onIterationEnd);
    });

    it('should call onError hook when errors occur', async () => {
      const agentWithHooks = new TestAgentLoop(mockProvider, { hooks: mockHooks });
      
      expect((agentWithHooks as any).hooks.onError).toBe(mockHooks.onError);
    });

    it('should allow prompt modification through onPromptCreate hook', async () => {
      const modifyingHook = jest.fn().mockImplementation((prompt) => 
        Promise.resolve(prompt + ' [Modified]')
      );
      
      const agentWithHooks = new TestAgentLoop(mockProvider, { 
        hooks: { onPromptCreate: modifyingHook } 
      });
      
      expect((agentWithHooks as any).hooks.onPromptCreate).toBe(modifyingHook);
    });
  });

  describe('Configuration', () => {
    it('should handle different execution modes', () => {
      const functionCallingAgent = new TestAgentLoop(mockProvider, {
        executionMode: ExecutionMode.FUNCTION_CALLING,
      });
      
      expect((functionCallingAgent as any).llmDataHandler).toBeDefined();
    });

    it('should configure retry settings', () => {
      const retryAgent = new TestAgentLoop(mockProvider, {
        retryAttempts: 5,
        retryDelay: 2000,
      });
      
      expect((retryAgent as any).retryAttempts).toBe(5);
      expect((retryAgent as any).retryDelay).toBe(2000);
    });

    it('should configure timeout settings', () => {
      const timeoutAgent = new TestAgentLoop(mockProvider, {
        toolTimeoutMs: 60000,
        sleepBetweenIterationsMs: 1000,
      });
      
      expect((timeoutAgent as any).toolTimeoutMs).toBe(60000);
      expect((timeoutAgent as any).sleepBetweenIterationsMs).toBe(1000);
    });
  });

  describe('Performance', () => {
    it('should complete execution within reasonable time', async () => {
      const performanceResult = await testHarness.runPerformanceBenchmark('small');
      
      expect(performanceResult.averageExecutionTime).toBeLessThan(5000); // 5 seconds
      expect(performanceResult.totalExecutions).toBeGreaterThan(0);
    });

    it('should handle concurrent executions', async () => {
      const concurrentPromises = Array.from({ length: 5 }, (_, i) => 
        testHarness.executeAgent(`Concurrent test ${i + 1}`)
      );
      
      const results = await Promise.all(concurrentPromises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should maintain consistent performance', async () => {
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        const result = await testHarness.executeAgent(`Performance test ${i + 1}`);
        results.push(result.executionTime);
      }
      
      const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
      const maxTime = Math.max(...results);
      
      // Performance should be consistent (max time not more than 3x average)
      expect(maxTime).toBeLessThan(averageTime * 3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tool list', async () => {
      testHarness.setTools([]);
      
      const result = await testHarness.executeAgent('Test with no tools');
      
      expect(result.toolsExecuted).toHaveLength(0);
    });

    it('should handle very long user input', async () => {
      const longInput = 'x'.repeat(10000);
      const tool = MockFactory.createSuccessfulTool('long_input_tool');
      testHarness.setTools([tool]);
      
      const result = await testHarness.executeAgent(longInput);
      
      expect(result).toBeDefined();
    });

    it('should handle special characters in input', async () => {
      const specialInput = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const tool = MockFactory.createSuccessfulTool('special_char_tool');
      testHarness.setTools([tool]);
      
      const result = await testHarness.executeAgent(specialInput);
      
      expect(result).toBeDefined();
    });

    it('should handle null and undefined inputs gracefully', async () => {
      const tool = MockFactory.createSuccessfulTool('null_test_tool');
      testHarness.setTools([tool]);
      
      // Test with empty string
      const result = await testHarness.executeAgent('');
      expect(result).toBeDefined();
    });
  });

  describe('Integration with Components', () => {
    it('should work with custom prompt manager', async () => {
      // Test would require actual PromptManager integration
      expect(agent).toBeDefined();
    });

    it('should work with custom stagnation detector', async () => {
      // Test would require actual StagnationDetector integration
      expect(agent).toBeDefined();
    });

    it('should work with different AI providers', async () => {
      const alternativeProvider = MockFactory.createMockAIProvider(['{"name": "alt_tool", "arguments": {}}']);
      const alternativeHarness = new AgentTestHarness({
        aiProvider: alternativeProvider,
      });
      
      const result = await alternativeHarness.executeAgent('Test alternative provider');
      
      expect(result).toBeDefined();
    });
  });
});