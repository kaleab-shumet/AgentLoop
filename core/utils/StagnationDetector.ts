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
  private readonly TIME_WINDOW_MS = 30000; // 30 seconds for rapid calls
  private readonly RAPID_CALL_THRESHOLD = 5; // 5 calls in time window
  
  constructor(config: StagnationDetectorConfig = {}) {
    this.windowSize = config.windowSize || 15;
    this.similarityThreshold = config.similarityThreshold || 0.6;
    this.enableTimeBasedDetection = config.enableTimeBasedDetection ?? true;
    this.repeatedCallThreshold = config.repeatedCallThreshold || 3;
    this.errorLoopThreshold = config.errorLoopThreshold || 3;
    this.cyclicPatternThreshold = config.cyclicPatternThreshold || 2;
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
    
    // Convert tool results to call signatures using actual timestamps
    for (const result of toolCallHistory) {
      if (result.context.toolName !== 'final' && result.context.toolName !== 'run-failure' && result.context.toolName !== 'stagnation-detector') {
        const timestamp = result.timestamp ? parseInt(result.timestamp) : Date.now();
        
        // Extract arguments from the result context for hashing
        const argsForHashing = this.extractArgsFromResult(result);
        const argsHash = this.hashObject(argsForHashing);
        
        callHistory.push({
          toolName: result.context.toolName,
          argsHash,
          timestamp
        });
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
   * Check for repeated identical calls (tool + arguments)
   */
  private checkRepeatedCalls(callHistory: ToolCallSignature[]): { isStagnant: boolean; reason?: string; confidence: number } {
    if (callHistory.length < this.repeatedCallThreshold) {
      return { isStagnant: false, confidence: 0 };
    }
    
    // Count identical calls (tool name + arguments)
    const callSignatures = new Map<string, number>();
    
    for (const call of callHistory) {
      const signature = `${call.toolName}:${call.argsHash}`;
      callSignatures.set(signature, (callSignatures.get(signature) || 0) + 1);
    }
    
    for (const [signature, count] of Array.from(callSignatures)) {
      if (count >= this.repeatedCallThreshold) {
        // Monotonic confidence: starts at 0.8 and increases
        const confidence = Math.min(0.8 + (count - this.repeatedCallThreshold) * 0.05, 1.0);
        const toolName = signature.split(':')[0];
        return {
          isStagnant: true,
          reason: `Tool '${toolName}' called ${count} times with identical arguments`,
          confidence
        };
      }
    }
    
    return { isStagnant: false, confidence: 0 };
  }
  
  /**
   * Check for cyclic patterns (e.g., A→B→C→A→B→C) using sliding window
   */
  private checkCyclicPatterns(callHistory: ToolCallSignature[]): { isStagnant: boolean; reason?: string; confidence: number } {
    if (callHistory.length < 4) {
      return { isStagnant: false, confidence: 0 };
    }
    
    // Check for patterns of length 2-4
    for (let patternLength = 2; patternLength <= Math.min(4, Math.floor(callHistory.length / 2)); patternLength++) {
      const pattern = this.detectPatternSlidingWindow(callHistory, patternLength);
      if (pattern && pattern.count >= this.cyclicPatternThreshold) {
        // Monotonic confidence: starts at 0.75 and increases
        const confidence = Math.min(0.75 + (pattern.count - this.cyclicPatternThreshold) * 0.05, 1.0);
        return {
          isStagnant: true,
          reason: `Cyclic pattern detected: ${pattern.pattern} (${pattern.count} repetitions)`,
          confidence
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
      .slice(-this.windowSize)
      .filter(r => r.type === 'tool_call' && !r.context.success && r.context.error);
    
    if (recentErrors.length < this.errorLoopThreshold) {
      return { isStagnant: false, confidence: 0 };
    }
    
    // Group similar errors
    const errorGroups = this.groupSimilarErrors(recentErrors);
    
    for (const group of errorGroups) {
      if (group.length >= this.errorLoopThreshold) {
        // Monotonic confidence for error loops - they're critical
        const confidence = Math.min(0.85 + (group.length - this.errorLoopThreshold) * 0.03, 1.0);
        const errorPreview = group[0].type === 'tool_call' && group[0].context.error 
          ? group[0].context.error.substring(0, 50) 
          : 'Unknown error';
        
        return {
          isStagnant: true,
          reason: `Repeated error pattern (${group.length}x): ${errorPreview}...`,
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
    if (callHistory.length < this.RAPID_CALL_THRESHOLD) {
      return { isStagnant: false, confidence: 0 };
    }
    
    const recentCalls = callHistory.slice(-this.RAPID_CALL_THRESHOLD);
    const timeSpan = recentCalls[recentCalls.length - 1].timestamp - recentCalls[0].timestamp;
    
    // If RAPID_CALL_THRESHOLD calls within TIME_WINDOW_MS, likely in tight loop
    if (timeSpan <= this.TIME_WINDOW_MS) {
      const callsPerSecond = this.RAPID_CALL_THRESHOLD / (timeSpan / 1000);
      const confidence = Math.min(0.7 + (callsPerSecond - 1) * 0.05, 0.9);
      
      return {
        isStagnant: true,
        reason: `Rapid tool calls: ${this.RAPID_CALL_THRESHOLD} calls in ${Math.round(timeSpan/1000)}s`,
        confidence
      };
    }
    
    return { isStagnant: false, confidence: 0 };
  }
  
  /**
   * Helper: Hash arguments for comparison
   */
  private hashArgs(call: PendingToolCall): string {
    const { toolName, ...args } = call;
    return this.hashObject(args);
  }
  
  
  /**
   * Helper: Extract arguments from a tool result for hashing
   */
  private extractArgsFromResult(result: Interaction): any {
    // Try to extract original arguments from the result context
    // This is best effort since we don't always have original args
    const context = result.context;
    
    // Remove non-argument fields
    const { toolName, success, error, timestamp, output, ...potentialArgs } = context;
    
    return potentialArgs;
  }

  /**
   * Helper: Hash any object consistently
   */
  private hashObject(obj: any): string {
    const normalized = JSON.stringify(obj, Object.keys(obj || {}).sort());
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
  }
  
  /**
   * Helper: Detect repeating patterns using sliding window approach
   */
  private detectPatternSlidingWindow(calls: ToolCallSignature[], patternLength: number): StagnationPattern | null {
    if (calls.length < patternLength * 2) return null;
    
    const patternCounts = new Map<string, { count: number; firstSeen: number }>();
    
    // Sliding window to detect all possible patterns
    for (let i = 0; i <= calls.length - patternLength; i++) {
      const pattern = calls.slice(i, i + patternLength)
        .map(c => `${c.toolName}:${c.argsHash}`)
        .join('→');
      
      if (!patternCounts.has(pattern)) {
        patternCounts.set(pattern, { count: 0, firstSeen: i });
      }
      
      // Count overlapping occurrences
      let occurrences = 1;
      for (let j = i + 1; j <= calls.length - patternLength; j++) {
        const nextPattern = calls.slice(j, j + patternLength)
          .map(c => `${c.toolName}:${c.argsHash}`)
          .join('→');
        
        if (pattern === nextPattern) {
          occurrences++;
        }
      }
      
      const entry = patternCounts.get(pattern)!;
      entry.count = Math.max(entry.count, occurrences);
    }
    
    // Find the pattern with highest count that meets threshold
    let bestPattern: StagnationPattern | null = null;
    for (const [pattern, data] of patternCounts) {
      if (data.count >= this.cyclicPatternThreshold) {
        if (!bestPattern || data.count > bestPattern.count) {
          bestPattern = {
            pattern: pattern.replace(/:[^→]+/g, ''), // Remove hash for display
            count: data.count,
            firstSeen: data.firstSeen
          };
        }
      }
    }
    
    return bestPattern;
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
    
    // Use more sophisticated similarity check
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