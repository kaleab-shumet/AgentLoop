import { StagnationDetector, StagnationDetectorConfig } from '../../../../core/utils/StagnationDetector';
import { PendingToolCall, ToolResult } from '../../../../core/types/types';
import { TestDataFactory } from '../../../helpers';

describe('StagnationDetector', () => {
  let detector: StagnationDetector;

  beforeEach(() => {
    detector = new StagnationDetector();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultDetector = new StagnationDetector();
      expect(defaultDetector).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const config: StagnationDetectorConfig = {
        windowSize: 15,
        similarityThreshold: 0.8,
        enableTimeBasedDetection: false,
        repeatedCallThreshold: 5,
        errorLoopThreshold: 3,
        cyclicPatternThreshold: 6,
      };

      const customDetector = new StagnationDetector(config);
      expect(customDetector).toBeDefined();
    });

    it('should handle partial configuration', () => {
      const partialConfig: StagnationDetectorConfig = {
        windowSize: 20,
        similarityThreshold: 0.9,
      };

      const partialDetector = new StagnationDetector(partialConfig);
      expect(partialDetector).toBeDefined();
    });
  });

  describe('Repeated Call Detection', () => {
    it('should detect exact repeated calls', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'same' } },
        { name: 'test_tool', arguments: { input: 'same' } },
        { name: 'test_tool', arguments: { input: 'same' } },
        { name: 'test_tool', arguments: { input: 'same' } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('repeated');
    });

    it('should not detect stagnation with different calls', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { input: 'test1' } },
        { name: 'tool2', arguments: { input: 'test2' } },
        { name: 'tool3', arguments: { input: 'test3' } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(false);
    });

    it('should detect stagnation with similar but not identical calls', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'test', value: 1 } },
        { name: 'test_tool', arguments: { input: 'test', value: 2 } },
        { name: 'test_tool', arguments: { input: 'test', value: 3 } },
        { name: 'test_tool', arguments: { input: 'test', value: 4 } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.3);
    });
  });

  describe('Cyclic Pattern Detection', () => {
    it('should detect alternating patterns', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { input: 'a' } },
        { name: 'tool2', arguments: { input: 'b' } },
        { name: 'tool1', arguments: { input: 'a' } },
        { name: 'tool2', arguments: { input: 'b' } },
        { name: 'tool1', arguments: { input: 'a' } },
        { name: 'tool2', arguments: { input: 'b' } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('cycle' || 'pattern');
    });

    it('should detect complex cyclic patterns', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { step: 1 } },
        { name: 'tool2', arguments: { step: 2 } },
        { name: 'tool3', arguments: { step: 3 } },
        { name: 'tool1', arguments: { step: 1 } },
        { name: 'tool2', arguments: { step: 2 } },
        { name: 'tool3', arguments: { step: 3 } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should not detect cycles in progressive patterns', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { step: 1 } },
        { name: 'tool2', arguments: { step: 2 } },
        { name: 'tool3', arguments: { step: 3 } },
        { name: 'tool4', arguments: { step: 4 } },
        { name: 'tool5', arguments: { step: 5 } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(false);
    });
  });

  describe('Error Loop Detection', () => {
    it('should detect repeated errors', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'failing_tool', arguments: { input: 'test' } },
        { name: 'failing_tool', arguments: { input: 'test' } },
        { name: 'failing_tool', arguments: { input: 'test' } },
        { name: 'failing_tool', arguments: { input: 'test' } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: false,
        result: 'Error: Tool failed',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.reason).toContain('error');
    });

    it('should not detect stagnation with occasional errors', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { input: 'test1' } },
        { name: 'tool2', arguments: { input: 'test2' } },
        { name: 'tool3', arguments: { input: 'test3' } },
      ];

      const toolResults: ToolResult[] = [
        { success: true, result: 'success' },
        { success: false, result: 'error' },
        { success: true, result: 'success' },
      ];

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(false);
    });

    it('should detect mixed error patterns', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { input: 'test' } },
        { name: 'tool2', arguments: { input: 'test' } },
        { name: 'tool1', arguments: { input: 'test' } },
        { name: 'tool2', arguments: { input: 'test' } },
      ];

      const toolResults: ToolResult[] = [
        { success: false, result: 'Error 1' },
        { success: false, result: 'Error 2' },
        { success: false, result: 'Error 1' },
        { success: false, result: 'Error 2' },
      ];

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Confidence Scoring', () => {
    it('should provide higher confidence for exact matches', () => {
      const exactCalls: PendingToolCall[] = Array(5).fill({
        name: 'test_tool',
        arguments: { input: 'exact' },
      });

      const exactResults: ToolResult[] = exactCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(exactCalls, exactResults);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should provide lower confidence for similar matches', () => {
      const similarCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'test1' } },
        { name: 'test_tool', arguments: { input: 'test2' } },
        { name: 'test_tool', arguments: { input: 'test3' } },
        { name: 'test_tool', arguments: { input: 'test4' } },
      ];

      const similarResults: ToolResult[] = similarCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(similarCalls, similarResults);
      if (result.isStagnant) {
        expect(result.confidence).toBeLessThan(0.8);
        expect(result.confidence).toBeGreaterThan(0.3);
      }
    });

    it('should provide confidence scores between 0 and 1', () => {
      const patterns = TestDataFactory.generateStagnationPatterns();
      
      for (const pattern of patterns) {
        const toolCalls: PendingToolCall[] = pattern.pattern.map(p => ({
          name: p.name,
          arguments: p.arguments,
        }));

        const toolResults: ToolResult[] = toolCalls.map(() => ({
          success: true,
          result: 'success',
        }));

        const result = detector.isStagnant(toolCalls, toolResults);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Diagnostic Information', () => {
    it('should provide detailed diagnostic information', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'test' } },
        { name: 'test_tool', arguments: { input: 'test' } },
        { name: 'test_tool', arguments: { input: 'test' } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.callCount).toBe(3);
      expect(result.diagnostics.uniqueCallCount).toBe(1);
      expect(result.diagnostics.errorCount).toBe(0);
      expect(result.diagnostics.successCount).toBe(3);
    });

    it('should track error statistics', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { input: 'test' } },
        { name: 'tool2', arguments: { input: 'test' } },
        { name: 'tool3', arguments: { input: 'test' } },
      ];

      const toolResults: ToolResult[] = [
        { success: true, result: 'success' },
        { success: false, result: 'error' },
        { success: true, result: 'success' },
      ];

      const result = detector.isStagnant(toolCalls, toolResults);
      
      expect(result.diagnostics.errorCount).toBe(1);
      expect(result.diagnostics.successCount).toBe(2);
      expect(result.diagnostics.errorRate).toBeCloseTo(0.33, 2);
    });

    it('should provide pattern analysis', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'tool1', arguments: { input: 'a' } },
        { name: 'tool2', arguments: { input: 'b' } },
        { name: 'tool1', arguments: { input: 'a' } },
        { name: 'tool2', arguments: { input: 'b' } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      
      expect(result.diagnostics.patterns).toBeDefined();
      expect(result.diagnostics.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Impact', () => {
    it('should respect window size configuration', () => {
      const smallWindowDetector = new StagnationDetector({ windowSize: 3 });
      const largeWindowDetector = new StagnationDetector({ windowSize: 20 });

      const toolCalls: PendingToolCall[] = Array(10).fill({
        name: 'test_tool',
        arguments: { input: 'test' },
      });

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const smallResult = smallWindowDetector.isStagnant(toolCalls, toolResults);
      const largeResult = largeWindowDetector.isStagnant(toolCalls, toolResults);

      // Both should detect stagnation, but potentially with different confidence
      expect(smallResult.isStagnant).toBe(true);
      expect(largeResult.isStagnant).toBe(true);
    });

    it('should respect similarity threshold configuration', () => {
      const strictDetector = new StagnationDetector({ similarityThreshold: 0.9 });
      const lenientDetector = new StagnationDetector({ similarityThreshold: 0.5 });

      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'test1', value: 1 } },
        { name: 'test_tool', arguments: { input: 'test2', value: 2 } },
        { name: 'test_tool', arguments: { input: 'test3', value: 3 } },
        { name: 'test_tool', arguments: { input: 'test4', value: 4 } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const strictResult = strictDetector.isStagnant(toolCalls, toolResults);
      const lenientResult = lenientDetector.isStagnant(toolCalls, toolResults);

      // Lenient detector should be more likely to detect stagnation
      expect(lenientResult.isStagnant).toBe(true);
      // Strict detector might not detect it as stagnation
      expect(strictResult.isStagnant).toBe(false);
    });

    it('should respect threshold configurations', () => {
      const highThresholdDetector = new StagnationDetector({ 
        repeatedCallThreshold: 10,
        errorLoopThreshold: 8,
        cyclicPatternThreshold: 6,
      });

      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'test' } },
        { name: 'test_tool', arguments: { input: 'test' } },
        { name: 'test_tool', arguments: { input: 'test' } },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = highThresholdDetector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(false); // Should not detect with high thresholds
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty call history', () => {
      const result = detector.isStagnant([], []);
      expect(result.isStagnant).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should handle single call', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'test' } },
      ];

      const toolResults: ToolResult[] = [
        { success: true, result: 'success' },
      ];

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(false);
    });

    it('should handle mismatched call and result arrays', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: { input: 'test' } },
        { name: 'test_tool', arguments: { input: 'test' } },
      ];

      const toolResults: ToolResult[] = [
        { success: true, result: 'success' },
      ];

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(false);
    });

    it('should handle complex argument structures', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'complex_tool', arguments: { 
          nested: { value: 1, array: [1, 2, 3] }, 
          string: 'test' 
        }},
        { name: 'complex_tool', arguments: { 
          nested: { value: 1, array: [1, 2, 3] }, 
          string: 'test' 
        }},
        { name: 'complex_tool', arguments: { 
          nested: { value: 1, array: [1, 2, 3] }, 
          string: 'test' 
        }},
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result.isStagnant).toBe(true);
    });

    it('should handle null and undefined arguments', () => {
      const toolCalls: PendingToolCall[] = [
        { name: 'test_tool', arguments: null as any },
        { name: 'test_tool', arguments: undefined as any },
        { name: 'test_tool', arguments: {} },
      ];

      const toolResults: ToolResult[] = toolCalls.map(() => ({
        success: true,
        result: 'success',
      }));

      const result = detector.isStagnant(toolCalls, toolResults);
      expect(result).toBeDefined();
      expect(result.isStagnant).toBe(false);
    });
  });
});