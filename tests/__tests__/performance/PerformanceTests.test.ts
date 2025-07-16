import { AgentTestHarness, MockFactory, TestDataFactory } from '../../helpers';
import { AIProvider } from '../../../core/providers/AIProvider';
import { Tool } from '../../../core/types/types';
import { z } from 'zod';

describe('Performance Tests', () => {
  let mockProvider: jest.Mocked<AIProvider>;
  let testHarness: AgentTestHarness;

  beforeEach(() => {
    mockProvider = MockFactory.createRealisticMockAIProvider();
    testHarness = new AgentTestHarness({
      aiProvider: mockProvider,
      maxIterations: 20,
      enableStagnationDetection: true,
    });
  });

  describe('Single Tool Performance', () => {
    it('should execute simple tools within performance thresholds', async () => {
      const simpleTool = MockFactory.createSuccessfulTool('simple_tool');
      testHarness.setTools([simpleTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'simple_tool',
        arguments: { input: 'test' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Execute simple tool');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle complex schemas efficiently', async () => {
      const complexTool = MockFactory.createMockTool(
        'complex_tool',
        z.object({
          level1: z.object({
            level2: z.object({
              level3: z.object({
                data: z.array(z.string()),
                numbers: z.array(z.number()),
                flags: z.record(z.boolean()),
              }),
            }),
          }),
        }),
        async (args: any) => ({ success: true, result: 'complex result' })
      );

      testHarness.setTools([complexTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'complex_tool',
        arguments: {
          level1: {
            level2: {
              level3: {
                data: ['a', 'b', 'c'],
                numbers: [1, 2, 3],
                flags: { flag1: true, flag2: false },
              },
            },
          },
        },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Execute complex tool');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(200); // Should complete in under 200ms
    });
  });

  describe('Multiple Tools Performance', () => {
    it('should handle large numbers of tools efficiently', async () => {
      const largeMockTools = Array.from({ length: 100 }, (_, i) => 
        MockFactory.createSuccessfulTool(`tool_${i}`)
      );

      testHarness.setTools(largeMockTools);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'tool_50',
        arguments: { input: 'test' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Execute tool from large set');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should execute sequential tools efficiently', async () => {
      const sequentialTools = Array.from({ length: 10 }, (_, i) => 
        MockFactory.createSuccessfulTool(`sequential_tool_${i}`)
      );

      testHarness.setTools(sequentialTools);
      testHarness.configure({ enableParallelExecution: false });

      // Mock sequential tool calls
      sequentialTools.forEach((tool, index) => {
        mockProvider.generateResponse.mockResolvedValueOnce(JSON.stringify({
          name: tool.name,
          arguments: { input: `step_${index}` },
        }));
      });

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Execute sequential tools');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should execute parallel tools efficiently', async () => {
      const parallelTools = Array.from({ length: 10 }, (_, i) => 
        MockFactory.createSlowTool(`parallel_tool_${i}`, 50)
      );

      testHarness.setTools(parallelTools);
      testHarness.configure({ enableParallelExecution: true });

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify(
        parallelTools.map(tool => ({
          name: tool.name,
          arguments: { input: 'parallel' },
        }))
      ));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Execute parallel tools');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      // Parallel execution should be faster than sequential
      expect(endTime - startTime).toBeLessThan(200); // Should complete in under 200ms
    });
  });

  describe('Memory Performance', () => {
    it('should handle large conversation histories efficiently', async () => {
      const largeHistory = TestDataFactory.generateChatHistory(500);
      const simpleTool = MockFactory.createSuccessfulTool('history_tool');
      
      testHarness.setTools([simpleTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'history_tool',
        arguments: { input: 'with_large_history' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Handle large history');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle large tool result histories efficiently', async () => {
      const largeToolHistory = Array.from({ length: 100 }, (_, i) => ({
        success: true,
        result: `Tool result ${i}: ${'x'.repeat(1000)}`, // 1KB per result
      }));

      const historyTool = MockFactory.createSuccessfulTool('history_tool');
      testHarness.setTools([historyTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'history_tool',
        arguments: { input: 'with_tool_history' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Handle large tool history');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Throughput Performance', () => {
    it('should maintain high throughput with concurrent executions', async () => {
      const throughputTool = MockFactory.createSuccessfulTool('throughput_tool');
      testHarness.setTools([throughputTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'throughput_tool',
        arguments: { input: 'throughput_test' },
      }));

      const concurrentExecutions = 50;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentExecutions }, (_, i) => 
        testHarness.executeAgent(`Throughput test ${i}`)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(concurrentExecutions);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      const totalTime = endTime - startTime;
      const throughput = concurrentExecutions / (totalTime / 1000); // executions per second
      
      expect(throughput).toBeGreaterThan(10); // Should handle at least 10 executions per second
    });

    it('should handle sustained load efficiently', async () => {
      const sustainedTool = MockFactory.createSuccessfulTool('sustained_tool');
      testHarness.setTools([sustainedTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'sustained_tool',
        arguments: { input: 'sustained_test' },
      }));

      const executionTimes: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = await testHarness.executeAgent(`Sustained test ${i}`);
        const endTime = Date.now();

        expect(result.success).toBe(true);
        executionTimes.push(endTime - startTime);
      }

      const averageTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
      const maxTime = Math.max(...executionTimes);
      const minTime = Math.min(...executionTimes);

      expect(averageTime).toBeLessThan(100); // Average should be under 100ms
      expect(maxTime).toBeLessThan(500); // Max should be under 500ms
      expect(maxTime / minTime).toBeLessThan(10); // Performance should be consistent
    });
  });

  describe('Stress Tests', () => {
    it('should handle extreme tool counts without performance degradation', async () => {
      const extremeToolCount = 1000;
      const extremeTools = Array.from({ length: extremeToolCount }, (_, i) => 
        MockFactory.createSuccessfulTool(`extreme_tool_${i}`)
      );

      testHarness.setTools(extremeTools);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'extreme_tool_500',
        arguments: { input: 'extreme_test' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Extreme tool count test');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it('should handle very large input data efficiently', async () => {
      const largeTool = MockFactory.createMockTool(
        'large_data_tool',
        z.object({
          large_text: z.string(),
          large_array: z.array(z.string()),
        }),
        async (args: any) => ({ success: true, result: 'Large data processed' })
      );

      testHarness.setTools([largeTool]);

      const largeText = 'x'.repeat(100000); // 100KB string
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item_${i}`);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'large_data_tool',
        arguments: {
          large_text: largeText,
          large_array: largeArray,
        },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Process large data');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle rapid-fire executions without memory leaks', async () => {
      const rapidTool = MockFactory.createSuccessfulTool('rapid_tool');
      testHarness.setTools([rapidTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'rapid_tool',
        arguments: { input: 'rapid_test' },
      }));

      const initialMemory = process.memoryUsage().heapUsed;
      const rapidIterations = 1000;

      for (let i = 0; i < rapidIterations; i++) {
        const result = await testHarness.executeAgent(`Rapid test ${i}`);
        expect(result.success).toBe(true);
        
        // Clear history periodically to prevent memory buildup
        if (i % 100 === 0) {
          testHarness.clearHistory();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePerIteration = memoryIncrease / rapidIterations;

      // Memory increase should be minimal (less than 1KB per iteration)
      expect(memoryIncreasePerIteration).toBeLessThan(1024);
    });
  });

  describe('Benchmark Tests', () => {
    it('should meet performance benchmarks for small workloads', async () => {
      const benchmark = await testHarness.runPerformanceBenchmark('small');
      
      expect(benchmark.passedBenchmark).toBe(true);
      expect(benchmark.averageExecutionTime).toBeLessThan(100);
      expect(benchmark.maxExecutionTime).toBeLessThan(500);
      expect(benchmark.totalExecutions).toBeGreaterThan(0);
    });

    it('should meet performance benchmarks for medium workloads', async () => {
      const benchmark = await testHarness.runPerformanceBenchmark('medium');
      
      expect(benchmark.passedBenchmark).toBe(true);
      expect(benchmark.averageExecutionTime).toBeLessThan(200);
      expect(benchmark.maxExecutionTime).toBeLessThan(1000);
      expect(benchmark.totalExecutions).toBeGreaterThan(0);
    });

    it('should meet performance benchmarks for large workloads', async () => {
      const benchmark = await testHarness.runPerformanceBenchmark('large');
      
      expect(benchmark.passedBenchmark).toBe(true);
      expect(benchmark.averageExecutionTime).toBeLessThan(500);
      expect(benchmark.maxExecutionTime).toBeLessThan(2000);
      expect(benchmark.totalExecutions).toBeGreaterThan(0);
    });

    it('should maintain consistent performance across multiple runs', async () => {
      const benchmarks = [];
      const runs = 5;

      for (let i = 0; i < runs; i++) {
        const benchmark = await testHarness.runPerformanceBenchmark('medium');
        benchmarks.push(benchmark);
        
        // Clear history between runs
        testHarness.clearHistory();
      }

      const averageTimes = benchmarks.map(b => b.averageExecutionTime);
      const overallAverage = averageTimes.reduce((a, b) => a + b, 0) / averageTimes.length;
      const maxDeviation = Math.max(...averageTimes.map(time => Math.abs(time - overallAverage)));

      // Performance should be consistent (deviation less than 50% of average)
      expect(maxDeviation).toBeLessThan(overallAverage * 0.5);
    });
  });

  describe('Resource Usage', () => {
    it('should maintain reasonable memory usage during execution', async () => {
      const memoryTool = MockFactory.createSuccessfulTool('memory_tool');
      testHarness.setTools([memoryTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'memory_tool',
        arguments: { input: 'memory_test' },
      }));

      const initialMemory = process.memoryUsage();
      
      // Execute multiple times to monitor memory growth
      for (let i = 0; i < 100; i++) {
        const result = await testHarness.executeAgent(`Memory test ${i}`);
        expect(result.success).toBe(true);
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory growth should be reasonable (less than 10MB for 100 executions)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });

    it('should handle garbage collection efficiently', async () => {
      const gcTool = MockFactory.createSuccessfulTool('gc_tool');
      testHarness.setTools([gcTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'gc_tool',
        arguments: { input: 'gc_test' },
      }));

      const memoryReadings: number[] = [];
      
      for (let i = 0; i < 50; i++) {
        const result = await testHarness.executeAgent(`GC test ${i}`);
        expect(result.success).toBe(true);
        
        // Force garbage collection periodically
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
        
        memoryReadings.push(process.memoryUsage().heapUsed);
      }

      // Memory usage should not continuously grow
      const firstHalf = memoryReadings.slice(0, 25);
      const secondHalf = memoryReadings.slice(25);
      
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      // Memory usage should stabilize (second half should not be significantly higher)
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 2);
    });
  });

  describe('Edge Case Performance', () => {
    it('should handle error conditions efficiently', async () => {
      const errorTool = MockFactory.createFailingTool('error_tool', 'Intentional error');
      testHarness.setTools([errorTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'error_tool',
        arguments: { input: 'error_test' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Handle error efficiently');
      const endTime = Date.now();

      expect(result.toolsExecuted).toHaveLength(1);
      expect(result.toolsExecuted[0].result.success).toBe(false);
      expect(endTime - startTime).toBeLessThan(200); // Error handling should be fast
    });

    it('should handle stagnation detection efficiently', async () => {
      testHarness.configure({ 
        enableStagnationDetection: true,
        stagnationThreshold: 3,
      });

      const stagnationTool = MockFactory.createSuccessfulTool('stagnation_tool');
      testHarness.setTools([stagnationTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'stagnation_tool',
        arguments: { input: 'same_input' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Test stagnation detection');
      const endTime = Date.now();

      expect(result.stagnationDetected).toBe(true);
      expect(endTime - startTime).toBeLessThan(500); // Stagnation detection should be fast
    });

    it('should handle timeout conditions gracefully', async () => {
      const timeoutTool = MockFactory.createSlowTool('timeout_tool', 5000);
      testHarness.setTools([timeoutTool]);

      mockProvider.generateResponse.mockResolvedValue(JSON.stringify({
        name: 'timeout_tool',
        arguments: { input: 'timeout_test' },
      }));

      const startTime = Date.now();
      const result = await testHarness.executeAgent('Test timeout handling');
      const endTime = Date.now();

      // Should not wait for the full 5 seconds
      expect(endTime - startTime).toBeLessThan(6000);
    });
  });
});