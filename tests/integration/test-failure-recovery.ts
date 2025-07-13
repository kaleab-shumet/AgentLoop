import { FileManagementAgent } from '../../examples/FileManagementAgent';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Specialized test suite for failure cascade scenarios and recovery mechanisms
 * Tests how the agent handles complex failure patterns and recovery strategies
 */
export class FailureRecoveryTestSuite {
  private agent: FileManagementAgent;
  private testWorkspace: string;
  private recoveryResults: RecoveryResult[] = [];

  constructor() {
    const config = {
      apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key',
      model: 'gemini-2.0-flash'
    };
    
    this.testWorkspace = '/mnt/c/Users/user/Desktop/dev/AgentLoop/test-workspace-recovery';
    this.agent = new FileManagementAgent(config, this.testWorkspace);
  }

  async runAllRecoveryTests(): Promise<void> {
    console.log('🔄 FAILURE CASCADE & RECOVERY TEST SUITE');
    console.log('=' + '='.repeat(45));

    await this.setupRecoveryEnvironment();

    // Recovery test categories
    await this.runCascadingFailureTests();
    await this.runPartialSuccessRecoveryTests();
    await this.runDependencyFailureTests();
    await this.runAdaptiveRecoveryTests();
    await this.runResilienceStressTests();
    await this.runGracefulDegradationTests();

    this.printRecoveryTestSummary();
    await this.cleanup();
  }

  private async setupRecoveryEnvironment(): Promise<void> {
    console.log('🛠️  Setting up failure recovery environment...');
    
    if (fs.existsSync(this.testWorkspace)) {
      fs.rmSync(this.testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(this.testWorkspace, { recursive: true });

    // Create partial environment with some missing elements
    const existingFiles = [
      'working/good-file.txt',
      'working/another-good.txt',
      'config/valid-config.json',
      'logs/recent.log'
    ];

    existingFiles.forEach(filePath => {
      const fullPath = path.join(this.testWorkspace, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `Content of ${path.basename(filePath)}`);
    });

    // Create some problematic scenarios
    fs.mkdirSync(path.join(this.testWorkspace, 'broken'));
    // Create an empty directory that might cause issues
    fs.mkdirSync(path.join(this.testWorkspace, 'empty-problematic'));

    console.log('✅ Recovery environment ready with mixed success/failure scenarios');
  }

  // CASCADING FAILURE TESTS
  private async runCascadingFailureTests(): Promise<void> {
    console.log('\n💥 CASCADING FAILURE TESTS');
    console.log('-'.repeat(40));

    await this.runRecoveryTest('Sequential Failure Chain',
      `Try to read these files in sequence: "missing1.txt", "missing2.txt", "missing3.txt". 
       After each failure, try the next one. Then provide a summary of what happened.`,
      'SEQUENTIAL_FAILURES');

    await this.runRecoveryTest('Dependency Chain Collapse',
      `Try to read "config.txt" to get settings, then use those settings to read "data.txt", 
       then process that data to create "output.txt". Handle any failures gracefully.`,
      'DEPENDENCY_COLLAPSE');

    await this.runRecoveryTest('Mixed Success-Failure Pattern',
      `Try these operations: read "missing1.txt", read "working/good-file.txt", 
       read "missing2.txt", read "working/another-good.txt", read "missing3.txt". 
       Continue despite failures and summarize results.`,
      'MIXED_PATTERN');

    await this.runRecoveryTest('Critical Path Failure',
      `This is a critical workflow: First read "critical-config.txt" (doesn't exist), 
       use its data to determine next steps, then execute those steps. 
       Handle the critical failure appropriately.`,
      'CRITICAL_PATH_FAIL');

    await this.runRecoveryTest('Compound Failure Scenario',
      `Execute this workflow: create "temp" directory, read "source.txt" (missing), 
       copy its content to "temp/processed.txt", then verify the copy worked. 
       Handle multiple potential failure points.`,
      'COMPOUND_FAILURE');
  }

  // PARTIAL SUCCESS RECOVERY TESTS
  private async runPartialSuccessRecoveryTests(): Promise<void> {
    console.log('\n🔀 PARTIAL SUCCESS RECOVERY TESTS');
    console.log('-'.repeat(40));

    await this.runRecoveryTest('Batch Operation with Failures',
      `Process these files as a batch: "working/good-file.txt", "missing-file.txt", 
       "working/another-good.txt", "another-missing.txt". 
       Successfully process what you can and report on failures.`,
      'BATCH_PARTIAL');

    await this.runRecoveryTest('Fallback Strategy Implementation',
      `Try to read "primary-config.json" (doesn't exist), if that fails try "config/valid-config.json", 
       if that fails create a default config. Always end with a working configuration.`,
      'FALLBACK_STRATEGY');

    await this.runRecoveryTest('Progressive Degradation',
      `Implement a service with degraded functionality: 
       Try to get full data from "complete-dataset.json" (missing), 
       fall back to "partial-dataset.json" (missing), 
       fall back to "minimal-dataset.json" (missing), 
       finally create minimal default data and continue.`,
      'PROGRESSIVE_DEGRADATION');

    await this.runRecoveryTest('Best Effort Processing',
      `Process all files in the "working" directory with best effort approach: 
       read each file, process its content, handle any individual failures, 
       but continue with others. Report overall success rate.`,
      'BEST_EFFORT');

    await this.runRecoveryTest('Partial Recovery Workflow',
      `Simulate recovery from a partial system failure: 
       Check for "working" directory (exists), "backup" directory (missing), 
       "logs" directory (exists). Restore what you can and document gaps.`,
      'PARTIAL_RECOVERY');
  }

  // DEPENDENCY FAILURE TESTS
  private async runDependencyFailureTests(): Promise<void> {
    console.log('\n🔗 DEPENDENCY FAILURE TESTS');
    console.log('-'.repeat(40));

    await this.runRecoveryTest('Missing Prerequisite Handling',
      `Execute this task that requires prerequisites: 
       First check if "prerequisites.txt" exists (it doesn't), 
       then based on its content (which you can't read), set up the environment, 
       then proceed with main task. Handle the missing prerequisite gracefully.`,
      'MISSING_PREREQ');

    await this.runRecoveryTest('Circular Dependency Resolution',
      `Handle circular dependency scenario: 
       File A requires data from File B, File B requires processing from File C, 
       File C requires configuration from File A. None exist. Resolve intelligently.`,
      'CIRCULAR_DEPENDENCY');

    await this.runRecoveryTest('External Dependency Failure',
      `Simulate external dependency failure: 
       Try to read "external-api-response.json" (simulating API failure), 
       implement appropriate fallback mechanisms, and continue with degraded functionality.`,
      'EXTERNAL_DEPENDENCY');

    await this.runRecoveryTest('Service Dependency Chain',
      `Model a service dependency chain failure: 
       Database service (missing "db-config.txt"), 
       Cache service (missing "cache-config.txt"), 
       Application service depends on both. Handle the cascade gracefully.`,
      'SERVICE_DEPENDENCY');

    await this.runRecoveryTest('Resource Availability Issue',
      `Handle resource unavailability: 
       Try to access "shared-resource.txt" (doesn't exist), 
       implement queuing mechanism via "queue.txt" (doesn't exist), 
       fall back to alternative resource "backup-resource.txt" (doesn't exist).`,
      'RESOURCE_UNAVAILABLE');
  }

  // ADAPTIVE RECOVERY TESTS
  private async runAdaptiveRecoveryTests(): Promise<void> {
    console.log('\n🎯 ADAPTIVE RECOVERY TESTS');
    console.log('-'.repeat(40));

    await this.runRecoveryTest('Learning from Failure Pattern',
      `Demonstrate adaptive behavior: 
       Try operation A (reading "method-a.txt" - fails), 
       try operation B (reading "method-b.txt" - fails), 
       learn from the pattern and try operation C (create a solution file instead).`,
      'ADAPTIVE_LEARNING');

    await this.runRecoveryTest('Context-Aware Recovery',
      `Implement context-aware recovery: 
       Based on what's available in the workspace, determine the best recovery strategy. 
       Use existing resources creatively to achieve the goal despite missing components.`,
      'CONTEXT_AWARE');

    await this.runRecoveryTest('Self-Healing Workflow',
      `Create a self-healing workflow: 
       Detect issues with missing "health-check.txt", 
       automatically implement fixes by creating necessary files, 
       verify the fixes work, and establish monitoring.`,
      'SELF_HEALING');

    await this.runRecoveryTest('Dynamic Strategy Adjustment',
      `Adjust strategy based on environment: 
       Start with Plan A (needs "plan-a-requirements.txt" - missing), 
       dynamically switch to Plan B (needs "plan-b-requirements.txt" - missing), 
       finally implement Plan C using available resources.`,
      'DYNAMIC_STRATEGY');

    await this.runRecoveryTest('Resilient Architecture Simulation',
      `Simulate resilient architecture: 
       Primary system (missing files), 
       Secondary system (partial files), 
       Tertiary system (create from scratch). 
       Implement automatic failover and recovery.`,
      'RESILIENT_ARCHITECTURE');
  }

  // RESILIENCE STRESS TESTS
  private async runResilienceStressTests(): Promise<void> {
    console.log('\n💪 RESILIENCE STRESS TESTS');
    console.log('-'.repeat(40));

    await this.runRecoveryTest('Maximum Failure Tolerance',
      `Test maximum failure tolerance: 
       Execute 10 operations where 8 will fail: 
       read 8 missing files, read 2 existing files. 
       Maintain functionality and provide useful results despite 80% failure rate.`,
      'MAX_FAILURE_TOLERANCE');

    await this.runRecoveryTest('Repeated Failure Recovery',
      `Handle repeated failures: 
       Try the same operation (reading "unstable-resource.txt") multiple times, 
       implement exponential backoff, circuit breaker pattern, 
       and eventual alternative solution.`,
      'REPEATED_FAILURE');

    await this.runRecoveryTest('System Degradation Under Load',
      `Simulate system degradation: 
       Start with full functionality requirements, 
       encounter multiple failures, 
       gracefully degrade to core functionality, 
       maintain essential services throughout.`,
      'SYSTEM_DEGRADATION');

    await this.runRecoveryTest('Recovery Under Time Pressure',
      `Simulate urgent recovery scenario: 
       Critical system failure (multiple missing components), 
       implement rapid recovery with limited resources, 
       prioritize critical functionality restoration.`,
      'TIME_PRESSURE_RECOVERY');

    await this.runRecoveryTest('Cascading Recovery Complexity',
      `Handle complex cascading recovery: 
       Multiple interdependent systems failing, 
       implement coordinated recovery strategy, 
       handle circular dependencies and race conditions.`,
      'CASCADING_RECOVERY');
  }

  // GRACEFUL DEGRADATION TESTS
  private async runGracefulDegradationTests(): Promise<void> {
    console.log('\n🎭 GRACEFUL DEGRADATION TESTS');
    console.log('-'.repeat(40));

    await this.runRecoveryTest('Feature Degradation Hierarchy',
      `Implement feature degradation hierarchy: 
       Premium features (need "premium-config.txt" - missing), 
       Standard features (need "standard-config.txt" - missing), 
       Basic features (create minimal functionality). 
       Provide best available service level.`,
      'FEATURE_DEGRADATION');

    await this.runRecoveryTest('Quality vs Availability Trade-off',
      `Balance quality vs availability: 
       High-quality output needs "quality-data.txt" (missing), 
       Medium-quality needs "medium-data.txt" (missing), 
       Low-quality uses "working/good-file.txt" (available). 
       Choose optimal trade-off.`,
      'QUALITY_AVAILABILITY');

    await this.runRecoveryTest('Performance Degradation Handling',
      `Handle performance degradation gracefully: 
       Fast method needs "fast-algorithm.txt" (missing), 
       Medium method needs "medium-algorithm.txt" (missing), 
       Slow method uses basic approach with available data. 
       Implement graceful performance degradation.`,
      'PERFORMANCE_DEGRADATION');

    await this.runRecoveryTest('Data Completeness Adaptation',
      `Adapt to incomplete data: 
       Complete dataset from "full-data.json" (missing), 
       Partial dataset from "partial-data.json" (missing), 
       Sample dataset from existing files. 
       Provide best analysis possible with available data.`,
      'DATA_COMPLETENESS');

    await this.runRecoveryTest('Service Level Degradation',
      `Implement service level degradation: 
       Full service level (multiple missing dependencies), 
       Reduced service level (some missing dependencies), 
       Minimal service level (use only available resources). 
       Communicate service level to user.`,
      'SERVICE_LEVEL_DEGRADATION');
  }

  private async runRecoveryTest(testName: string, prompt: string, scenario: string): Promise<void> {
    console.log(`\n🔄 ${testName}`);
    console.log(`📋 Scenario: ${scenario}`);
    
    const startTime = Date.now();
    
    try {
      const result = await this.agent.run({
        userPrompt: prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const endTime = Date.now();
      const analysis = this.analyzeRecoveryResult(result, scenario);
      
      console.log(`   ⏱️  Duration: ${endTime - startTime}ms`);
      console.log(`   🔧 Tool calls: ${result.toolCallHistory.length}`);
      console.log(`   📊 Recovery Score: ${analysis.recoveryScore}/100`);
      console.log(`   🛡️  Resilience: ${analysis.resilienceScore}/100`);
      console.log(`   ${analysis.passed ? '✅' : '❌'} Status: ${analysis.status}`);
      
      if (analysis.recoveryStrategies.length > 0) {
        console.log(`   🎯 Strategies: ${analysis.recoveryStrategies.join(', ')}`);
      }
      
      if (analysis.issues.length > 0) {
        console.log(`   ⚠️  Issues: ${analysis.issues.join(', ')}`);
      }

      this.recoveryResults.push({
        testName,
        scenario,
        passed: analysis.passed,
        duration: endTime - startTime,
        toolCallCount: result.toolCallHistory.length,
        recoveryScore: analysis.recoveryScore,
        resilienceScore: analysis.resilienceScore,
        recoveryStrategies: analysis.recoveryStrategies,
        issues: analysis.issues
      });

    } catch (error) {
      console.log(`   ❌ RECOVERY TEST FAILED: ${error}`);
      this.recoveryResults.push({
        testName,
        scenario,
        passed: false,
        duration: Date.now() - startTime,
        toolCallCount: 0,
        recoveryScore: 0,
        resilienceScore: 0,
        recoveryStrategies: [],
        issues: [`Test execution failed: ${error}`]
      });
    }
  }

  private analyzeRecoveryResult(result: any, scenario: string): RecoveryAnalysis {
    const issues: string[] = [];
    const recoveryStrategies: string[] = [];
    let recoveryScore = 100;
    let resilienceScore = 100;
    let passed = true;

    // Check termination
    const finalCall = result.toolCallHistory.find((call: any) => call.toolName === 'final');
    if (!finalCall) {
      issues.push('No termination');
      recoveryScore -= 40;
      resilienceScore -= 30;
      passed = false;
    }

    // Analyze failure handling
    const failedCalls = result.toolCallHistory.filter((call: any) => !call.success);
    const successfulCalls = result.toolCallHistory.filter((call: any) => call.success);
    
    const failureRate = failedCalls.length / Math.max(result.toolCallHistory.length, 1);
    
    // Recovery strategy detection
    if (failedCalls.length > 0 && successfulCalls.length > 0) {
      recoveryStrategies.push('Continued after failures');
    }
    
    // Check for adaptive behavior
    const toolTypes = new Set(successfulCalls.map((call: any) => call.toolName));
    if (toolTypes.size > 2 && failedCalls.length > 0) {
      recoveryStrategies.push('Multiple tool utilization');
    }

    // Check for graceful degradation
    if (finalCall && failedCalls.length > 0) {
      recoveryStrategies.push('Graceful degradation');
    }

    // Analyze recovery effectiveness
    if (failureRate > 0.7) {
      issues.push('High failure rate');
      recoveryScore -= 30;
    } else if (failureRate > 0.5) {
      recoveryScore -= 15;
    }

    // Check for repetitive failures (poor recovery)
    const failureToolCounts = new Map<string, number>();
    failedCalls.forEach((call: any) => {
      failureToolCounts.set(call.toolName, (failureToolCounts.get(call.toolName) || 0) + 1);
    });
    
    const maxFailureRepeats = Math.max(0, ...Array.from(failureToolCounts.values()));
    if (maxFailureRepeats > 2) {
      issues.push('Repeated failure patterns');
      recoveryScore -= maxFailureRepeats * 10;
      resilienceScore -= maxFailureRepeats * 15;
    }

    // Scenario-specific analysis
    if (scenario.includes('CASCADING') && failedCalls.length === 0) {
      issues.push('Did not encounter expected failures');
      recoveryScore -= 20;
    }

    if (scenario.includes('ADAPTIVE') && toolTypes.size < 3) {
      issues.push('Limited adaptability shown');
      recoveryScore -= 15;
    }

    if (scenario.includes('DEGRADATION') && !finalCall?.output?.value?.toLowerCase().includes('degraded')) {
      issues.push('Did not demonstrate degradation awareness');
      recoveryScore -= 10;
    }

    // Efficiency under stress
    const efficiency = Math.max(successfulCalls.length - failedCalls.length, 0) / Math.max(result.toolCallHistory.length, 1);
    if (efficiency < 0.3) {
      issues.push('Low efficiency under stress');
      resilienceScore -= 20;
    }

    const status = passed ? 
      (recoveryScore >= 80 ? 'EXCELLENT_RECOVERY' : 
       recoveryScore >= 60 ? 'GOOD_RECOVERY' : 'WEAK_RECOVERY') : 
      'FAILED_RECOVERY';

    return {
      passed,
      status,
      recoveryScore: Math.max(0, recoveryScore),
      resilienceScore: Math.max(0, resilienceScore),
      recoveryStrategies,
      issues
    };
  }

  private printRecoveryTestSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 FAILURE RECOVERY TEST SUMMARY');
    console.log('='.repeat(60));

    const totalTests = this.recoveryResults.length;
    const passedTests = this.recoveryResults.filter(r => r.passed).length;
    const avgRecovery = this.recoveryResults.reduce((sum, r) => sum + r.recoveryScore, 0) / totalTests;
    const avgResilience = this.recoveryResults.reduce((sum, r) => sum + r.resilienceScore, 0) / totalTests;

    console.log(`📊 Recovery Performance:`);
    console.log(`   Tests Passed: ${passedTests}/${totalTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
    console.log(`   Average Recovery Score: ${avgRecovery.toFixed(1)}/100`);
    console.log(`   Average Resilience Score: ${avgResilience.toFixed(1)}/100`);

    // Strategy effectiveness
    const allStrategies = this.recoveryResults.flatMap(r => r.recoveryStrategies);
    const strategyStats = new Map<string, number>();
    allStrategies.forEach(strategy => {
      strategyStats.set(strategy, (strategyStats.get(strategy) || 0) + 1);
    });

    if (strategyStats.size > 0) {
      console.log(`\n🎯 Recovery Strategies Used:`);
      Array.from(strategyStats.entries())
        .sort(([,a], [,b]) => b - a)
        .forEach(([strategy, count]) => {
          console.log(`   ${strategy}: ${count} times`);
        });
    }

    // Scenario analysis
    const scenarios = [...new Set(this.recoveryResults.map(r => r.scenario))];
    console.log(`\n📋 Scenario Performance:`);
    scenarios.forEach(scenario => {
      const scenarioResults = this.recoveryResults.filter(r => r.scenario === scenario);
      const scenarioPassed = scenarioResults.filter(r => r.passed).length;
      const avgScenarioRecovery = scenarioResults.reduce((sum, r) => sum + r.recoveryScore, 0) / scenarioResults.length;
      
      console.log(`   ${scenario}: ${scenarioPassed}/${scenarioResults.length} passed, ${avgScenarioRecovery.toFixed(1)} recovery`);
    });

    // Critical weaknesses
    const criticalIssues = this.recoveryResults.filter(r => r.recoveryScore < 50);
    if (criticalIssues.length > 0) {
      console.log(`\n⚠️  Critical Recovery Weaknesses:`);
      criticalIssues.forEach(result => {
        console.log(`   ${result.testName}: ${result.recoveryScore}/100 - ${result.issues.join(', ')}`);
      });
    }

    console.log('\n' + '='.repeat(60));
  }

  private async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.testWorkspace)) {
        fs.rmSync(this.testWorkspace, { recursive: true, force: true });
      }
      console.log('🧹 Recovery test cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup failed:', error);
    }
  }
}

interface RecoveryResult {
  testName: string;
  scenario: string;
  passed: boolean;
  duration: number;
  toolCallCount: number;
  recoveryScore: number;
  resilienceScore: number;
  recoveryStrategies: string[];
  issues: string[];
}

interface RecoveryAnalysis {
  passed: boolean;
  status: string;
  recoveryScore: number;
  resilienceScore: number;
  recoveryStrategies: string[];
  issues: string[];
}

// Export for standalone execution
export async function runFailureRecoveryTests(): Promise<void> {
  const suite = new FailureRecoveryTestSuite();
  await suite.runAllRecoveryTests();
}

if (require.main === module) {
  runFailureRecoveryTests().catch(console.error);
}