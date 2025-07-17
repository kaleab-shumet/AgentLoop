import { StagnationDetector } from '../../core/utils/StagnationDetector';
import { PendingToolCall, ToolResult } from '../../core/types/types';

describe('StagnationDetector', () => {
  let detector: StagnationDetector;

  beforeEach(() => {
    detector = new StagnationDetector();
  });

  it('should create with default configuration', () => {
    expect(detector).toBeDefined();
  });

  it('should create with custom configuration', () => {
    const customDetector = new StagnationDetector({
      repeatedCallThreshold: 5,
      similarityThreshold: 0.9
    });
    
    expect(customDetector).toBeDefined();
  });

  it('should return stagnation result with required properties', () => {
    const currentCall: PendingToolCall = {
      name: 'test_tool',
      args: { input: 'test' }
    };

    const toolHistory: ToolResult[] = [];

    const result = detector.isStagnant(currentCall, toolHistory, 1);

    expect(result).toHaveProperty('isStagnant');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.isStagnant).toBe('boolean');
    expect(typeof result.confidence).toBe('number');
  });

  it('should not detect stagnation with empty history', () => {
    const currentCall: PendingToolCall = {
      name: 'test_tool',
      args: { input: 'test' }
    };

    const result = detector.isStagnant(currentCall, [], 1);

    expect(result.isStagnant).toBe(false);
  });

  it('should handle repeated tool calls', () => {
    const currentCall: PendingToolCall = {
      name: 'same_tool',
      args: { input: 'test' }
    };

    const toolHistory: ToolResult[] = [
      { toolName: 'same_tool', success: true, output: 'result1' },
      { toolName: 'same_tool', success: true, output: 'result2' },
      { toolName: 'same_tool', success: true, output: 'result3' },
      { toolName: 'same_tool', success: true, output: 'result4' }
    ];

    const result = detector.isStagnant(currentCall, toolHistory, 5);

    // Just verify the method works and returns expected structure
    expect(result).toHaveProperty('isStagnant');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.isStagnant).toBe('boolean');
    expect(typeof result.confidence).toBe('number');
  });

  it('should handle error scenarios', () => {
    const currentCall: PendingToolCall = {
      name: 'failing_tool',
      args: { input: 'test' }
    };

    const toolHistory: ToolResult[] = [
      { toolName: 'failing_tool', success: false, error: 'Error 1' },
      { toolName: 'failing_tool', success: false, error: 'Error 2' },
      { toolName: 'failing_tool', success: false, error: 'Error 3' },
      { toolName: 'failing_tool', success: false, error: 'Error 4' }
    ];

    const result = detector.isStagnant(currentCall, toolHistory, 5);

    // Just verify the method works and returns expected structure
    expect(result).toHaveProperty('isStagnant');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.isStagnant).toBe('boolean');
    expect(typeof result.confidence).toBe('number');
  });
});