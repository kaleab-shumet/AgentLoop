// StagnationDetector.ts
import { Interaction, PendingToolCall } from '../types/types';
import { OutcomeRecord } from '../agents/AgentLoop';
import * as crypto from 'crypto';

interface StagnationPattern {
  pattern: string;
  count: number;
  firstSeen: number;
  confidence: number;
}

interface OutcomeSignature {
  toolName: string;
  argsHash: string;
  outputHash: string;
  success: boolean;
  timestamp: number;
  executionTime?: number;
}

interface StagnationResult {
  isStagnant: boolean;
  reason?: string;
  confidence: number;
  patterns?: string[];
}

export interface StagnationDetectorConfig {
  windowSize?: number;
  similarityThreshold?: number;
  repeatedCallThreshold?: number;
  errorLoopThreshold?: number;
  cyclicPatternThreshold?: number;
  progressStagnationThreshold?: number;
  adaptiveThreshold?: boolean;
  progressEvaluationWindow?: number;
  outputDiversityThreshold?: number;
  maxPatternLength?: number;
  adaptiveIterationFactor?: number;
}

export class StagnationDetector {
  private windowSize: number;
  private similarityThreshold: number;
  private repeatedCallThreshold: number;
  private errorLoopThreshold: number;
  private cyclicPatternThreshold: number;
  private progressStagnationThreshold: number;
  private adaptiveThreshold: boolean;
  private progressEvaluationWindow: number;
  private outputDiversityThreshold: number;
  private maxPatternLength: number;
  private adaptiveIterationFactor: number;
  
  private patternCache = new Map<string, StagnationPattern | null>();
  
  constructor(config: StagnationDetectorConfig = {}) {
    this.windowSize = config.windowSize || 20;
    this.similarityThreshold = config.similarityThreshold || 0.7;
    this.repeatedCallThreshold = config.repeatedCallThreshold || 3;
    this.errorLoopThreshold = config.errorLoopThreshold || 3;
    this.cyclicPatternThreshold = config.cyclicPatternThreshold || 2;
    this.progressStagnationThreshold = config.progressStagnationThreshold || 5;
    this.adaptiveThreshold = config.adaptiveThreshold ?? true;
    this.progressEvaluationWindow = config.progressEvaluationWindow || 8;
    this.outputDiversityThreshold = config.outputDiversityThreshold || 0.3;
    this.maxPatternLength = config.maxPatternLength || 5;
    this.adaptiveIterationFactor = config.adaptiveIterationFactor || 20;
  }
  
  /**
   * Main stagnation detection using OutcomeRecord data
   */
  detectStagnationFromOutcomes(outcomeHistory: OutcomeRecord[], currentIteration: number): StagnationResult {
    if (outcomeHistory.length === 0) {
      return { isStagnant: false, confidence: 0 };
    }

    // Build outcome signatures for analysis
    const outcomeSignatures = this.buildOutcomeSignatures(outcomeHistory);
    
    // Run enhanced detection strategies (order by criticality)
    const checks = [
      this.checkErrorLoopsFromOutcomes(outcomeHistory),
      this.checkInputOutputStagnation(outcomeSignatures),
      this.checkProgressStagnation(outcomeSignatures),
      this.checkCyclicPatternsFromOutcomes(outcomeSignatures),
      this.checkRepeatedOutcomes(outcomeSignatures)
    ];
    
    // Apply adaptive thresholding based on iteration count
    const adaptedChecks = this.adaptiveThreshold 
      ? checks.map(check => this.applyAdaptiveThreshold(check, currentIteration))
      : checks;

    // Aggregate results with confidence weighting
    const stagnantChecks = adaptedChecks.filter(c => c.isStagnant);
    if (stagnantChecks.length === 0) {
      return { isStagnant: false, confidence: 0 };
    }

    // Use weighted confidence for multiple signals
    const totalConfidence = stagnantChecks.reduce((sum, check) => sum + check.confidence, 0);
    const averageConfidence = totalConfidence / stagnantChecks.length;
    const maxConfidence = Math.max(...stagnantChecks.map(c => c.confidence));
    
    // Combine average and max with slight bias toward max for critical issues
    const finalConfidence = Math.min((averageConfidence * 0.6 + maxConfidence * 0.4), 1.0);
    
    const mostConfident = stagnantChecks.reduce((prev, curr) => 
      curr.confidence > prev.confidence ? curr : prev
    );

    return {
      isStagnant: true,
      reason: mostConfident.reason,
      confidence: finalConfidence,
      patterns: stagnantChecks.map(c => c.reason).filter(r => r) as string[]
    };
  }
  
  /**
   * Build outcome signatures from OutcomeRecord data for enhanced analysis
   */
  private buildOutcomeSignatures(outcomeHistory: OutcomeRecord[]): OutcomeSignature[] {
    return outcomeHistory.slice(-this.windowSize).map(outcome => {
      const timestamp = parseInt(outcome.toolCall.timestamp);
      const argsHash = this.hashObject(outcome.args);
      const outputHash = this.hashObject(outcome.toolCall.context.output || outcome.toolCall.context.error || 'no-output');
      
      return {
        toolName: outcome.args.toolName,
        argsHash,
        outputHash,
        success: outcome.toolCall.context.success,
        timestamp,
        executionTime: outcome.toolCall.context.executionTime
      };
    });
  }

  /**
   * Check for input-output stagnation: same inputs producing same outputs repeatedly
   */
  private checkInputOutputStagnation(signatures: OutcomeSignature[]): StagnationResult {
    if (signatures.length < this.repeatedCallThreshold) {
      return { isStagnant: false, confidence: 0 };
    }

    const inputOutputPairs = new Map<string, { count: number; outputs: Set<string>; firstSeen: number }>();
    
    signatures.forEach((sig, index) => {
      const inputKey = `${sig.toolName}:${sig.argsHash}`;
      if (!inputOutputPairs.has(inputKey)) {
        inputOutputPairs.set(inputKey, { count: 0, outputs: new Set(), firstSeen: index });
      }
      const pair = inputOutputPairs.get(inputKey)!;
      pair.count++;
      pair.outputs.add(sig.outputHash);
    });

    for (const [inputKey, data] of inputOutputPairs) {
      if (data.count >= this.repeatedCallThreshold && data.outputs.size === 1) {
        const confidence = Math.min(0.85 + (data.count - this.repeatedCallThreshold) * 0.03, 0.98);
        const toolName = inputKey.split(':')[0];
        return {
          isStagnant: true,
          reason: `Tool '${toolName}' called ${data.count} times with identical inputs and outputs`,
          confidence
        };
      }
    }

    return { isStagnant: false, confidence: 0 };
  }

  /**
   * Check for progress stagnation: no meaningful progress being made
   */
  private checkProgressStagnation(signatures: OutcomeSignature[]): StagnationResult {
    if (signatures.length < this.progressStagnationThreshold) {
      return { isStagnant: false, confidence: 0 };
    }

    const recentSignatures = signatures.slice(-this.progressEvaluationWindow);
    
    // Calculate output diversity
    const outputHashes = recentSignatures.map(s => s.outputHash);
    const uniqueOutputs = new Set(outputHashes).size;
    const outputDiversity = uniqueOutputs / outputHashes.length;
    
    // Calculate success rate
    const successRate = recentSignatures.filter(s => s.success).length / recentSignatures.length;
    
    // Calculate tool diversity
    const toolNames = recentSignatures.map(s => s.toolName);
    const uniqueTools = new Set(toolNames).size;
    const toolDiversity = uniqueTools / toolNames.length;

    // Progress stagnation if low output diversity AND either low success or low tool diversity
    const lowOutputDiversity = outputDiversity < this.outputDiversityThreshold;
    const lowSuccess = successRate < 0.4;
    const lowToolDiversity = toolDiversity < 0.3;

    if (lowOutputDiversity && (lowSuccess || lowToolDiversity)) {
      let confidence = 0.7;
      
      // Increase confidence based on severity
      if (lowOutputDiversity && lowSuccess && lowToolDiversity) confidence = 0.9;
      else if (outputDiversity < 0.15) confidence = 0.85;
      else if (successRate < 0.2) confidence = 0.8;

      return {
        isStagnant: true,
        reason: `Progress stagnation: low output diversity (${(outputDiversity * 100).toFixed(0)}%), success rate (${(successRate * 100).toFixed(0)}%)`,
        confidence
      };
    }

    return { isStagnant: false, confidence: 0 };
  }

  /**
   * Check for error loops from OutcomeRecord data
   */
  private checkErrorLoopsFromOutcomes(outcomeHistory: OutcomeRecord[]): StagnationResult {
    const recentFailures = outcomeHistory
      .slice(-this.windowSize)
      .filter(outcome => !outcome.toolCall.context.success);

    if (recentFailures.length < this.errorLoopThreshold) {
      return { isStagnant: false, confidence: 0 };
    }

    // Group similar error patterns
    const errorGroups = this.groupSimilarOutcomeErrors(recentFailures);
    
    for (const group of errorGroups) {
      if (group.length >= this.errorLoopThreshold) {
        const confidence = Math.min(0.9 + (group.length - this.errorLoopThreshold) * 0.02, 0.99);
        const errorPreview = group[0].toolCall.context.error?.substring(0, 50) || 'Unknown error';
        
        return {
          isStagnant: true,
          reason: `Error loop detected: ${group.length} similar failures - ${errorPreview}...`,
          confidence
        };
      }
    }

    return { isStagnant: false, confidence: 0 };
  }

  /**
   * Check for cyclic patterns in outcomes
   */
  private checkCyclicPatternsFromOutcomes(signatures: OutcomeSignature[]): StagnationResult {
    if (signatures.length < 4) {
      return { isStagnant: false, confidence: 0 };
    }

    // Check for patterns of length 2 to maxPatternLength
    for (let patternLength = 2; patternLength <= Math.min(this.maxPatternLength, Math.floor(signatures.length / 2)); patternLength++) {
      const pattern = this.detectOutcomePatternOptimized(signatures, patternLength);
      if (pattern && pattern.count >= this.cyclicPatternThreshold) {
        return {
          isStagnant: true,
          reason: `Cyclic outcome pattern: ${pattern.pattern} (${pattern.count} repetitions)`,
          confidence: pattern.confidence
        };
      }
    }

    return { isStagnant: false, confidence: 0 };
  }

  /**
   * Check for repeated outcomes with same tool and arguments
   */
  private checkRepeatedOutcomes(signatures: OutcomeSignature[]): StagnationResult {
    if (signatures.length < this.repeatedCallThreshold) {
      return { isStagnant: false, confidence: 0 };
    }

    const outcomeSignatures = new Map<string, number>();
    
    for (const sig of signatures) {
      const fullSignature = `${sig.toolName}:${sig.argsHash}:${sig.outputHash}:${sig.success}`;
      outcomeSignatures.set(fullSignature, (outcomeSignatures.get(fullSignature) || 0) + 1);
    }

    for (const [signature, count] of outcomeSignatures) {
      if (count >= this.repeatedCallThreshold) {
        const confidence = Math.min(0.75 + (count - this.repeatedCallThreshold) * 0.05, 0.95);
        const toolName = signature.split(':')[0];
        const success = signature.split(':')[3] === 'true';
        
        return {
          isStagnant: true,
          reason: `Identical outcomes repeated ${count} times for '${toolName}' (${success ? 'success' : 'failure'})`,
          confidence
        };
      }
    }

    return { isStagnant: false, confidence: 0 };
  }


  /**
   * Apply adaptive thresholding based on iteration count and context
   */
  private applyAdaptiveThreshold(result: StagnationResult, currentIteration: number): StagnationResult {
    if (!result.isStagnant) return result;

    // Progressive threshold adjustment based on iteration phase
    const iterationFactor = Math.min(currentIteration / this.adaptiveIterationFactor, 1);
    
    // Different adjustment strategies based on stagnation type
    let adjustmentFactor = 0.1;
    if (result.reason?.includes('Error loop')) {
      adjustmentFactor = 0.15; // More aggressive for error loops
    } else if (result.reason?.includes('Progress stagnation')) {
      adjustmentFactor = 0.08; // Conservative for progress issues
    } else if (result.reason?.includes('Cyclic')) {
      adjustmentFactor = 0.12; // Moderate for cyclic patterns
    }
    
    const baseAdjustment = iterationFactor * adjustmentFactor;
    
    // Add exponential component for very late iterations
    const exponentialBoost = currentIteration > this.adaptiveIterationFactor ? 
      Math.min((currentIteration - this.adaptiveIterationFactor) * 0.02, 0.1) : 0;
    
    const adjustedConfidence = result.confidence + baseAdjustment + exponentialBoost;

    return {
      ...result,
      confidence: Math.min(adjustedConfidence, 1.0)
    };
  }

  /**
   * Helper: Group similar outcome errors
   */
  private groupSimilarOutcomeErrors(errorOutcomes: OutcomeRecord[]): OutcomeRecord[][] {
    const groups: OutcomeRecord[][] = [];
    
    for (const outcome of errorOutcomes) {
      let addedToGroup = false;
      
      for (const group of groups) {
        if (this.areSimilarOutcomeErrors(outcome, group[0])) {
          group.push(outcome);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groups.push([outcome]);
      }
    }
    
    return groups;
  }

  /**
   * Helper: Check if two outcome errors are similar
   */
  private areSimilarOutcomeErrors(a: OutcomeRecord, b: OutcomeRecord): boolean {
    if (a.args.toolName !== b.args.toolName) return false;
    
    const errorA = a.toolCall.context.error;
    const errorB = b.toolCall.context.error;
    
    if (!errorA || !errorB) return false;
    
    const similarity = this.calculateStringSimilarity(errorA, errorB);
    return similarity > this.similarityThreshold;
  }

  /**
   * Optimized pattern detection using rolling hash and caching
   */
  private detectOutcomePatternOptimized(signatures: OutcomeSignature[], patternLength: number): StagnationPattern | null {
    if (signatures.length < patternLength * 2) return null;
    
    const cacheKey = `${signatures.length}-${patternLength}-${this.hashObject(signatures.slice(-10))}`;
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey) || null;
    }
    
    const patternMap = new Map<string, { positions: number[]; firstSeen: number }>();
    
    // Single pass to collect all patterns
    for (let i = 0; i <= signatures.length - patternLength; i++) {
      const pattern = signatures.slice(i, i + patternLength)
        .map(s => `${s.toolName}:${s.success ? 'S' : 'F'}`)
        .join('→');
      
      if (!patternMap.has(pattern)) {
        patternMap.set(pattern, { positions: [], firstSeen: i });
      }
      patternMap.get(pattern)!.positions.push(i);
    }
    
    let bestPattern: StagnationPattern | null = null;
    
    for (const [pattern, data] of patternMap) {
      if (data.positions.length >= this.cyclicPatternThreshold) {
        // Check for actual repetitions (not just occurrences)
        const repetitions = this.countConsecutiveRepetitions(data.positions, patternLength);
        
        if (repetitions >= this.cyclicPatternThreshold && 
            (!bestPattern || repetitions > bestPattern.count)) {
          const confidence = Math.min(0.8 + (repetitions - this.cyclicPatternThreshold) * 0.04, 0.96);
          bestPattern = {
            pattern: pattern.replace(/:[SF]/g, ''),
            count: repetitions,
            firstSeen: data.firstSeen,
            confidence
          };
        }
      }
    }
    
    this.patternCache.set(cacheKey, bestPattern);
    return bestPattern;
  }
  
  /**
   * Count consecutive pattern repetitions
   */
  private countConsecutiveRepetitions(positions: number[], patternLength: number): number {
    let maxRepetitions = 1;
    let currentRepetitions = 1;
    
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] === positions[i-1] + patternLength) {
        currentRepetitions++;
      } else {
        maxRepetitions = Math.max(maxRepetitions, currentRepetitions);
        currentRepetitions = 1;
      }
    }
    
    return Math.max(maxRepetitions, currentRepetitions);
  }

  /**
   * Helper: Hash any object consistently
   */
  private hashObject(obj: any): string {
    const normalized = JSON.stringify(obj, Object.keys(obj || {}).sort());
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
  }

  /**
   * Helper: Calculate string similarity (Jaccard similarity)
   */
  private calculateStringSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 0));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 0));
    
    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    
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