import { describe, it, expect } from '@jest/globals';
import { AgentLoop } from '../core/agents/AgentLoop';
import { DefaultAIProvider } from '../core/providers/DefaultAIProvider';
import { FormatMode, ToolCall, ToolCallContext } from '../core/types/types';
import { AgentErrorType } from '../core/utils/AgentError';

class TestAgentLoop extends AgentLoop {
  protected systemPrompt = 'Test system prompt';
  
  constructor() {
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4'
    }), {
      formatMode: FormatMode.JSOBJECT,
      stagnationTerminationThreshold: 3
    });
  }

  public testTrackStagnation(
    reportText: string,
    reportHashes: Map<string, { text: string, count: number }>,
    otherToolResults: ToolCall[],
    terminationThreshold: number
  ) {
    return (this as any).trackStagnation(reportText, reportHashes, otherToolResults, terminationThreshold);
  }
}

function createMockToolCall(toolName: string, params: Record<string, any>): ToolCall {
  return {
    taskId: 'test-task',
    type: 'tool_call',
    timestamp: '2025-01-01T00:00:00.000Z',
    context: {
      toolName,
      success: true,
      ...params
    } as ToolCallContext
  };
}

describe('Stagnation Detector Core Tests', () => {
  let agent: TestAgentLoop;

  beforeEach(() => {
    agent = new TestAgentLoop();
  });

  it('should not detect stagnation with different file parameters', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const reportText = "Reading files";

    // Different files should not trigger stagnation
    const toolCall1 = createMockToolCall('read_files', { filename: 'f1.txt' });
    const result1 = agent.testTrackStagnation(reportText, reportHashes, [toolCall1], 3);
    expect(result1).toBeNull();

    const toolCall2 = createMockToolCall('read_files', { filename: 'f4.txt' });
    const result2 = agent.testTrackStagnation(reportText, reportHashes, [toolCall2], 3);
    expect(result2).toBeNull();
  });

  it('should detect stagnation with identical tool calls', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const reportText = "Same action";
    const toolCall = createMockToolCall('read_files', { filename: 'same.txt' });

    // First call - no stagnation
    const result1 = agent.testTrackStagnation(reportText, reportHashes, [toolCall], 3);
    expect(result1).toBeNull();

    // Second identical call - should detect stagnation
    const result2 = agent.testTrackStagnation(reportText, reportHashes, [toolCall], 3);
    expect(result2).not.toBeNull();
    expect(result2?.type).toBe(AgentErrorType.STAGNATION_ERROR);
    expect(result2?.context?.occurrenceCount).toBe(2);
  });

  it('should handle empty tool results', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const result = agent.testTrackStagnation('text', reportHashes, [], 3);
    expect(result).toBeNull();
  });

  it('should distinguish different tools with same parameters', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const reportText = "Different tools";

    const toolCall1 = createMockToolCall('read_files', { filename: 'test.txt' });
    const result1 = agent.testTrackStagnation(reportText, reportHashes, [toolCall1], 3);
    expect(result1).toBeNull();

    const toolCall2 = createMockToolCall('write_files', { filename: 'test.txt' });
    const result2 = agent.testTrackStagnation(reportText, reportHashes, [toolCall2], 3);
    expect(result2).toBeNull();
  });

  it('should count occurrences correctly', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const toolCall = createMockToolCall('test_tool', { param: 'value' });

    // First call
    const result1 = agent.testTrackStagnation('text', reportHashes, [toolCall], 5);
    expect(result1).toBeNull();

    // Second call
    const result2 = agent.testTrackStagnation('text', reportHashes, [toolCall], 5);
    expect(result2?.context?.occurrenceCount).toBe(2);

    // Third call
    const result3 = agent.testTrackStagnation('text', reportHashes, [toolCall], 5);
    expect(result3?.context?.occurrenceCount).toBe(3);
  });
});