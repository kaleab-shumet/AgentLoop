import { describe, it, expect } from '@jest/globals';
import { AgentLoop } from '../core/agents/AgentLoop';
import { DefaultAIProvider } from '../core/providers/DefaultAIProvider';
import { FormatMode } from '../core/types/types';
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
    terminationThreshold: number
  ) {
    return (this as any).trackStagnation(reportText, reportHashes, terminationThreshold);
  }
}

describe('Stagnation Detector Core Tests', () => {
  let agent: TestAgentLoop;

  beforeEach(() => {
    agent = new TestAgentLoop();
  });

  it('should not detect stagnation with different reasoning texts', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const reportText = "Reading files";

    // Different report texts should not trigger stagnation
    const result1 = agent.testTrackStagnation("Reading files - step 1", reportHashes, 3);
    expect(result1).toBeNull();

    const result2 = agent.testTrackStagnation("Reading files - step 2", reportHashes, 3);
    expect(result2).toBeNull();
  });

  it('should detect stagnation with identical reports', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const reportText = "Same reasoning pattern";

    // First call - no stagnation
    const result1 = agent.testTrackStagnation(reportText, reportHashes, 3);
    expect(result1).toBeNull();

    // Second identical call - should detect stagnation
    const result2 = agent.testTrackStagnation(reportText, reportHashes, 3);
    expect(result2).not.toBeNull();
    expect(result2?.type).toBe(AgentErrorType.STAGNATION_ERROR);
    expect(result2?.context?.occurrenceCount).toBe(2);
  });

  it('should handle empty report text', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const result = agent.testTrackStagnation('', reportHashes, 3);
    expect(result).toBeNull();
  });

  it('should distinguish different reasoning patterns', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();

    const result1 = agent.testTrackStagnation("I need to read the file", reportHashes, 3);
    expect(result1).toBeNull();

    const result2 = agent.testTrackStagnation("I need to write the file", reportHashes, 3);
    expect(result2).toBeNull();
  });

  it('should count occurrences correctly', () => {
    const reportHashes = new Map<string, { text: string, count: number }>();
    const reportText = 'Same reasoning text';

    // First call
    const result1 = agent.testTrackStagnation(reportText, reportHashes, 5);
    expect(result1).toBeNull();

    // Second call
    const result2 = agent.testTrackStagnation(reportText, reportHashes, 5);
    expect(result2?.context?.occurrenceCount).toBe(2);

    // Third call
    const result3 = agent.testTrackStagnation(reportText, reportHashes, 5);
    expect(result3?.context?.occurrenceCount).toBe(3);
  });
});