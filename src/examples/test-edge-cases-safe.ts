import { FileManagementAgent } from './FileManagementAgent';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SAFE version of edge case tests with robust timeout protection
 * This version focuses on validating termination behavior without risky infinite loop scenarios
 */
export class SafeEdgeCaseTestSuite {
  private agent: FileManagementAgent;
  private testWorkspace: string;

  constructor() {
    const config = {
      apiKey: process.env.GEMINI_API_KEY || 'AIzaSyBBvprrxsMRaS7I1RTrX7IhH8-qBWs_S7A',
      model: 'gemini-2.0-flash'
    };
    
    this.testWorkspace = '/mnt/c/Users/user/Desktop/dev/AgentLoop/test-workspace-edge-safe';
    this.agent = new FileManagementAgent(config, this.testWorkspace);
  }

  async runSafeEdgeTests(): Promise<void> {
    console.log('🛡️  SAFE EDGE CASE TEST SUITE');
    console.log('=' + '='.repeat(40));
    console.log('Testing termination robustness with safe timeouts');

    await this.setupSafeTestEnvironment();

    // Safe edge case tests that won't cause infinite loops
    await this.runSafeTerminationTests();
    
    console.log('\n⏳ Waiting 5 seconds between test categories...');
    await this.sleep(5000);
    
    await this.runSafeAmbiguityTests();
    
    console.log('\n⏳ Waiting 5 seconds between test categories...');
    await this.sleep(5000);
    
    await this.runSafeErrorHandlingTests();

    await this.cleanup();
    console.log('\n✅ Safe edge case tests completed');
  }

  private async setupSafeTestEnvironment(): Promise<void> {
    console.log('🔧 Setting up safe test environment...');
    
    if (fs.existsSync(this.testWorkspace)) {
      fs.rmSync(this.testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(this.testWorkspace, { recursive: true });

    // Create minimal test structure
    const testFiles = [
      'data/input.txt',
      'data/output.txt',
      'config/settings.json',
      'logs/app.log'
    ];

    testFiles.forEach(filePath => {
      const fullPath = path.join(this.testWorkspace, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `Test content for ${path.basename(filePath)}`);
    });

    console.log('✅ Safe environment ready');
  }

  private async runSafeTerminationTests(): Promise<void> {
    console.log('\n🎯 SAFE TERMINATION TESTS');
    console.log('-'.repeat(35));

    await this.safeTest('Repetition Prevention Test',
      'List the directory contents twice to make sure they are accurate, then provide a summary');

    await this.safeTest('Task Completion Detection',
      'Check if there is a file called "complete.txt" and if not, create it, then report the status');

    await this.safeTest('Multi-Step Workflow Completion',
      'List the data directory, read input.txt, then create a summary file called "processed.txt" with the results');

    await this.safeTest('Conditional Task Execution',
      'If the config directory exists, read settings.json and summarize its content. Otherwise, report that no config was found');
  }

  private async runSafeAmbiguityTests(): Promise<void> {
    console.log('\n🌫️  SAFE AMBIGUITY TESTS');
    console.log('-'.repeat(35));

    await this.safeTest('Vague Task Clarification',
      'Organize the workspace by examining what files exist and suggesting an improved structure');

    await this.safeTest('Best Effort Processing',
      'Process the files in the data directory to the best of your ability and report what was accomplished');

    await this.safeTest('Limited Scope Task',
      'Examine up to 3 files in the workspace and provide insights about their purpose');

    await this.safeTest('Priority-Based Task',
      'Identify the most important file in the workspace and explain why it\'s important');
  }

  private async runSafeErrorHandlingTests(): Promise<void> {
    console.log('\n💥 SAFE ERROR HANDLING TESTS');
    console.log('-'.repeat(35));

    await this.safeTest('Missing File Recovery',
      'Try to read "missing.txt" and if it fails, read any available file instead and report the results');

    await this.safeTest('Partial Operation Success',
      'Try to read both "missing1.txt" and "data/input.txt", then report on what you were able to accomplish');

    await this.safeTest('Graceful Degradation',
      'Attempt to create a comprehensive report using "full-data.txt" (missing), falling back to available files if needed');

    await this.safeTest('Error Recovery Strategy',
      'Try to process "data/missing.txt", and if it fails, create a default file with sample content and use that instead');
  }

  private async safeTest(testName: string, prompt: string): Promise<void> {
    console.log(`\n🧪 ${testName}`);
    const startTime = Date.now();
    const safeTimeoutMs = 30000; // 30 second timeout for safety
    
    try {
      // Create timeout protection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Safe test timeout after ${safeTimeoutMs}ms`));
        }, safeTimeoutMs);
      });

      // Run the agent with timeout protection
      const agentPromise = this.agent.run({
        userPrompt: prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const result = await Promise.race([agentPromise, timeoutPromise]);

      const endTime = Date.now();
      const analysis = this.analyzeSafeResult(result as any);
      
      console.log(`   ⏱️  Duration: ${endTime - startTime}ms`);
      console.log(`   🔧 Tools: ${(result as any).toolCallHistory.length}`);
      console.log(`   📊 Sequence: ${(result as any).toolCallHistory.map((t: any) => `${t.toolname}(${t.success ? '✓' : '✗'})`).join(' → ')}`);
      console.log(`   ${analysis.passed ? '✅' : '❌'} Status: ${analysis.status}`);
      console.log(`   🛡️  Safety Score: ${analysis.safetyScore}/100`);
      
      if (analysis.issues.length > 0) {
        console.log(`   ⚠️  Issues: ${analysis.issues.join(', ')}`);
      }

      // Add delay between tests to prevent rate limiting
      console.log(`   ⏳ Waiting 3 seconds before next test...`);
      await this.sleep(3000);

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ TEST FAILED: ${error}`);
      console.log(`   ⏱️  Duration: ${duration}ms`);
      
      if (error instanceof Error && error.message.includes('timeout')) {
        console.log(`   🚨 TIMEOUT: Agent failed to terminate within ${safeTimeoutMs}ms`);
        console.log(`   🛡️  Safety Score: 0/100 (Critical termination failure)`);
      }

      // Still wait on error to prevent rate limiting
      console.log(`   ⏳ Waiting 3 seconds before next test...`);
      await this.sleep(3000);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private analyzeSafeResult(result: any): SafeAnalysis {
    const issues: string[] = [];
    let safetyScore = 100;
    let passed = true;

    // Check basic termination
    const finalCall = result.toolCallHistory.find((call: any) => call.toolname === 'final');
    if (!finalCall) {
      issues.push('No termination');
      safetyScore -= 50;
      passed = false;
    }

    // Check for excessive tool usage
    const totalCalls = result.toolCallHistory.length;
    if (totalCalls > 6) {
      issues.push('Excessive tool usage');
      safetyScore -= Math.min(30, (totalCalls - 6) * 5);
    }

    // Check for repetition
    const nonFinalCalls = result.toolCallHistory.filter((call: any) => 
      call.toolname !== 'final' && call.toolname !== 'run-failure'
    );
    const successfulCalls = nonFinalCalls.filter((call: any) => call.success);
    
    const toolCounts = new Map<string, number>();
    successfulCalls.forEach((call: any) => {
      toolCounts.set(call.toolname, (toolCounts.get(call.toolname) || 0) + 1);
    });

    const maxRepeats = Math.max(0, ...Array.from(toolCounts.values()));
    if (maxRepeats > 1) {
      issues.push(`Tool repetition (${maxRepeats}x)`);
      safetyScore -= maxRepeats * 15;
    }

    // Determine status
    const status = passed ? 
      (safetyScore >= 90 ? 'EXCELLENT' : safetyScore >= 70 ? 'GOOD' : 'ACCEPTABLE') : 
      'FAILED';

    return {
      passed,
      status,
      safetyScore: Math.max(0, safetyScore),
      issues
    };
  }

  private async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.testWorkspace)) {
        fs.rmSync(this.testWorkspace, { recursive: true, force: true });
      }
      console.log('🧹 Safe test cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup failed:', error);
    }
  }
}

interface SafeAnalysis {
  passed: boolean;
  status: string;
  safetyScore: number;
  issues: string[];
}

// Export for standalone execution
export async function runSafeEdgeCaseTests(): Promise<void> {
  const suite = new SafeEdgeCaseTestSuite();
  await suite.runSafeEdgeTests();
}

if (require.main === module) {
  runSafeEdgeCaseTests().catch(console.error);
}