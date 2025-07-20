// StagnationDetector.ts
import { Interaction, PendingToolCall } from '../types/types';
import * as crypto from 'crypto';

interface StagnationPattern {
  pattern: string;
  count: number;
  firstSeen: number;
}

interface ToolCallSignature {
  toolName: string;
  argsHash: string;
  timestamp: number;
}

export interface StagnationDetectorConfig {
  windowSize?: number;
  similarityThreshold?: number;
  enableTimeBasedDetection?: boolean;
  repeatedCallThreshold?: number;
  errorLoopThreshold?: number;
  cyclicPatternThreshold?: number;
}

export class StagnationDetector {
  private windowSize: number;
  private similarityThreshold: number;
  private enableTimeBasedDetection: boolean;
  private repeatedCallThreshold: number;
  private errorLoopThreshold: number;
  private cyclicPatternThreshold: number;
  
  // Fixed thresholds
  private readonly SEQUENCE_LENGTH_CHECK = 3;
  private readonly TIME_WINDOW_MS = 60000; // 1 minute
  
  constructor(config: StagnationDetectorConfig = {}) {
    this.windowSize = config.windowSize || 12;
    this.similarityThreshold = config.similarityThreshold || 0.75;
    this.enableTimeBasedDetection = config.enableTimeBasedDetection ?? true;
    this.repeatedCallThreshold = config.repeatedCallThreshold || 4;
    this.errorLoopThreshold = config.errorLoopThreshold || 4;
    this.cyclicPatternThreshold = config.cyclicPatternThreshold || 4;
  }
  
  /**
   * Main method to check if the agent is in a stagnation state (stateless)
   */
  isStagnant(
    currentCall: PendingToolCall,
    toolCallHistory: Interaction[],
    currentIteration: number
  ): {
    isStagnant: boolean;
    reason?: string;
    confidence: number;
  } {
    // Build call signature history from tool call history + current call
    const callHistory = this.buildCallHistoryFromResults(toolCallHistory, currentCall);
    
    // Run multiple detection strategies (order matters - more critical checks first)
    const checks = [
      this.checkErrorLoops(toolCallHistory), // Errors are most critical
      this.checkRepeatedCalls(callHistory),
      this.checkCyclicPatterns(callHistory),
      this.checkNoProgress(toolCallHistory),
      ...(this.enableTimeBasedDetection ? [this.checkTimeBasedStagnation(callHistory)] : [])
    ];
    
    // Aggregate results
    const stagnantChecks = checks.filter(c => c.isStagnant);
    if (stagnantChecks.length === 0) {
      return { isStagnant: false, confidence: 0 };
    }
    
    // Return the highest confidence stagnation
    const mostConfident = stagnantChecks.reduce((prev, curr) => 
      curr.confidence > prev.confidence ? curr : prev
    );
    
    return mostConfident;
  }
  
  /**
   * Build call signature history from tool results and current call (stateless)
   */
  private buildCallHistoryFromResults(toolCallHistory: Interaction[], currentCall: PendingToolCall): ToolCallSignature[] {
    const callHistory: ToolCallSignature[] = [];
    
    // Convert tool results to call signatures (approximate timestamps)
    let baseTime = Date.now() - (toolCallHistory.length * 10000); // Assume 10s between calls
    for (const result of toolCallHistory) {
      if (result.context.toolName !== 'final' && result.context.toolName !== 'run-failure') {
        callHistory.push({
          toolName: result.context.toolName,
          argsHash: this.hashResultAsCall(result),
          timestamp: baseTime
        });
        baseTime += 10000;
      }
    }
    
    // Add current call
    callHistory.push({
      toolName: currentCall.toolName,
      argsHash: this.hashArgs(currentCall),
      timestamp: Date.now()
    });
    
    // Keep only recent history within window
    return callHistory.slice(-this.windowSize);
  }
  
  /**
   * Check for repeated identical calls
   */
  private checkRepeatedCalls(callHistory: ToolCallSignature[]): { isStagnant: boolean; reason?: string; confidence: number } {
    if (callHistory.length < 3) {
      return { isStagnant: false, confidence: 0 };
    }
    
    const recentCalls = callHistory.slice(-5);
    const callCounts = new Map<string, number>();
    
    for (const call of recentCalls) {
      const key = `${call.toolName}:${call.argsHash}`;
      callCounts.set(key, (callCounts.get(key) || 0) + 1);
    }
    
    for (const [key, count] of Array.from(callCounts)) {
      if (count >= this.repeatedCallThreshold) {
        // Graduated confidence based on threshold
        const confidence = count === this.repeatedCallThreshold ? 0.75 : Math.min(count / (this.repeatedCallThreshold + 1), 1);
        return {
          isStagnant: true,
          reason: `Tool call ${key.split(':')[0]} repeated ${count} times with same arguments`,
          confidence
        };
      }
    }
    
    return { isStagnant: false, confidence: 0 };
  }
  
  /**
   * Check for cyclic patterns (e.g., A→B→C→A→B→C)
   */
  private checkCyclicPatterns(callHistory: ToolCallSignature[]): { isStagnant: boolean; reason?: string; confidence: number } {
    if (callHistory.length < 6) {
      return { isStagnant: false, confidence: 0 };
    }
    
    const recent = callHistory.slice(-this.windowSize);
    
    // Check for patterns of length 2-4
    for (let patternLength = 2; patternLength <= 4; patternLength++) {
      const pattern = this.detectPattern(recent, patternLength);
      if (pattern) {
        return {
          isStagnant: true,
          reason: `Cyclic pattern detected: ${pattern.pattern}`,
          confidence: Math.min(pattern.count / this.cyclicPatternThreshold, 1)
        };
      }
    }
    
    return { isStagnant: false, confidence: 0 };
  }
  
  /**
   * Check if the agent is making no meaningful progress
   */
  private checkNoProgress(toolCallHistory: Interaction[]): { isStagnant: boolean; reason?: string; confidence: number } {
    if (toolCallHistory.length < 5) {
      return { isStagnant: false, confidence: 0 };
    }
    
    const recentResults = toolCallHistory.slice(-5);
    const successRate = recentResults.filter(r => 
      r.type === 'tool_call' && r.context.success
    ).length / recentResults.length;
    
    // If mostly failures and similar outputs
    if (successRate < 0.4) {
      const outputs = recentResults
        .filter(r => r.type === 'tool_call' && r.context.output)
        .map(r => JSON.stringify(r.context.output));
      
      const uniqueOutputs = new Set(outputs).size;
      const outputDiversity = uniqueOutputs / Math.max(outputs.length, 1);
      
      if (outputDiversity < 0.3) {
        return {
          isStagnant: true,
          reason: 'Low success rate with repetitive outputs',
          confidence: 0.8
        };
      }
    }
    
    return { isStagnant: false, confidence: 0 };
  }
  
  /**
   * Check for error loops
   */
  private checkErrorLoops(toolCallHistory: Interaction[]): { isStagnant: boolean; reason?: string; confidence: number } {
    const recentErrors = toolCallHistory
      .slice(-8)
      .filter(r => r.type === 'tool_call' && !r.context.success && r.context.error);
    
    if (recentErrors.length < 3) {
      return { isStagnant: false, confidence: 0 };
    }
    
    // Group similar errors
    const errorGroups = this.groupSimilarErrors(recentErrors);
    
    for (const group of errorGroups) {
      if (group.length >= this.errorLoopThreshold) {
        // Lower threshold for error loops - they're more critical
        const confidence = group.length === this.errorLoopThreshold ? 0.85 : Math.min(group.length / this.errorLoopThreshold, 1);
        return {
          isStagnant: true,
          reason: `Repeated error pattern: ${group[0].type === 'tool_call' ? group[0].context.error?.substring(0, 50) : 'Unknown'}...`,
          confidence
        };
      }
    }
    
    return { isStagnant: false, confidence: 0 };
  }
  
  /**
   * Check if calls are happening too rapidly (panic mode)
   */
  private checkTimeBasedStagnation(callHistory: ToolCallSignature[]): { isStagnant: boolean; reason?: string; confidence: number } {
    if (callHistory.length < 5) {
      return { isStagnant: false, confidence: 0 };
    }
    
    const recentCalls = callHistory.slice(-5);
    const timeSpan = recentCalls[recentCalls.length - 1].timestamp - recentCalls[0].timestamp;
    
    // If 5 calls in less than 5 seconds, might be in a tight loop
    if (timeSpan < 5000) {
      return {
        isStagnant: true,
        reason: 'Rapid-fire tool calls detected',
        confidence: 0.7
      };
    }
    
    return { isStagnant: false, confidence: 0 };
  }
  
  /**
   * Helper: Hash arguments for comparison
   */
  private hashArgs(call: PendingToolCall): string {
    const { toolName, ...args } = call;
    const normalized = JSON.stringify(args, Object.keys(args).sort());
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
  }
  
  /**
   * Helper: Hash tool result as if it were a call (for comparing patterns)
   */
  private hashResultAsCall(result: Interaction): string {
    // Use output or context as basis for hash, fallback to error
    const content = result.context.output || result.context.context || result.context.error || '{}';
    const normalized = JSON.stringify(content, Object.keys(content as any).sort());
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
  }
  
  /**
   * Helper: Detect repeating patterns
   */
  private detectPattern(calls: ToolCallSignature[], patternLength: number): StagnationPattern | null {
    if (calls.length < patternLength * 2) return null;
    
    for (let i = 0; i <= calls.length - patternLength * 2; i++) {
      const pattern = calls.slice(i, i + patternLength)
        .map(c => c.toolName)
        .join('→');
      
      let matches = 1;
      for (let j = i + patternLength; j <= calls.length - patternLength; j += patternLength) {
        const nextPattern = calls.slice(j, j + patternLength)
          .map(c => c.toolName)
          .join('→');
        
        if (pattern === nextPattern) {
          matches++;
        } else {
          break;
        }
      }
      
      if (matches >= this.cyclicPatternThreshold) {
        return {
          pattern,
          count: matches,
          firstSeen: i
        };
      }
    }
    
    return null;
  }
  
  /**
   * Helper: Group similar errors using string similarity
   */
  private groupSimilarErrors(errors: Interaction[]): Interaction[][] {
    const groups: Interaction[][] = [];
    
    for (const error of errors) {
      let addedToGroup = false;
      
      for (const group of groups) {
        if (this.areSimilarErrors(error, group[0])) {
          group.push(error);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groups.push([error]);
      }
    }
    
    return groups;
  }
  
  /**
   * Helper: Check if two errors are similar
   */
  private areSimilarErrors(a: Interaction, b: Interaction): boolean {
    if (a.type !== 'tool_call' || b.type !== 'tool_call') return false;
    if (!a.context.error || !b.context.error) return false;
    if (a.context.toolName !== b.context.toolName) return false;
    
    // Simple similarity check - you could use more sophisticated algorithms
    const similarity = this.calculateStringSimilarity(a.context.error, b.context.error);
    return similarity > this.similarityThreshold;
  }
  
  /**
   * Helper: Calculate string similarity (Jaccard similarity)
   */
  private calculateStringSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = new Set(Array.from(wordsA).filter(x => wordsB.has(x)));
    const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Get diagnostic information from tool call history (stateless)
   */
  getDiagnostics(toolCallHistory: Interaction[]): {
    recentCalls: string[];
    callFrequency: Map<string, number>;
    successRate: number;
  } {
    const recentCalls = toolCallHistory.slice(-10).map(r => {
      if (r.type === 'tool_call') {
        return `${r.context.toolName}(${r.context.success ? '✓' : '✗'})`;
      }
      return `${r.type}`;
    });
    
    const callFrequency = new Map<string, number>();
    for (const result of toolCallHistory) {
      if (result.context.toolName !== 'final' && result.context.toolName !== 'run-failure') {
        callFrequency.set(result.context.toolName, (callFrequency.get(result.context.toolName) || 0) + 1);
      }
    }
    
    const successCount = toolCallHistory.filter(r => 
      r.type === 'tool_call' && r.context.success
    ).length;
    const successRate = toolCallHistory.length > 0 ? successCount / toolCallHistory.length : 1;
    
    return {
      recentCalls,
      callFrequency,
      successRate
    };
  }
}