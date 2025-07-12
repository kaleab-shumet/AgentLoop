import { FileManagementAgent } from '../../examples/FileManagementAgent';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Advanced edge case and adversarial testing for agent termination logic
 * These tests specifically target potential weaknesses and corner cases
 */
export class EdgeCaseTestSuite {
  private agent: FileManagementAgent;
  private testWorkspace: string;

  constructor() {
    const config = {
      apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key',
      model: 'gemini-2.0-flash'
    };
    
    this.testWorkspace = '/mnt/c/Users/user/Desktop/dev/AgentLoop/test-workspace-edge';
    this.agent = new FileManagementAgent(config, this.testWorkspace);
  }

  async runAllTests(): Promise<void> {
    console.log('🎯 Advanced Edge Case & Adversarial Test Suite');
    console.log('=' + '='.repeat(50));

    const testSuiteTimeoutMs = 300000; // 5 minute total timeout
    const testSuiteStartTime = Date.now();

    try {
      // Create a timeout for the entire test suite
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Edge case test suite timeout after ${testSuiteTimeoutMs}ms`));
        }, testSuiteTimeoutMs);
      });

      const testPromise = this.runTestsInternal();
      
      await Promise.race([testPromise, timeoutPromise]);
      
    } catch (error) {
      console.log(`\n❌ Edge case test suite failed or timed out: ${error}`);
      const duration = Date.now() - testSuiteStartTime;
      console.log(`⏱️  Total duration before failure: ${duration}ms`);
    } finally {
      await this.cleanup();
    }
  }

  private async runTestsInternal(): Promise<void> {
    await this.setupAdvancedTestEnvironment();

    // Edge case categories - run with safety guards
    console.log('\n⚠️  Running adversarial tests with timeout protection...');
    
    await this.runTerminationAdversarialTests();
    await this.runAmbiguityTests();
    await this.runRecursiveLoopTests();
    await this.runMemoryAndStateTests();
    await this.runBoundaryConditionTests();
    await this.runContextualConfusionTests();
  }

  private async setupAdvancedTestEnvironment(): Promise<void> {
    console.log('🔧 Setting up advanced test environment...');
    
    if (fs.existsSync(this.testWorkspace)) {
      fs.rmSync(this.testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(this.testWorkspace, { recursive: true });

    // Create complex test structure
    const structures = [
      'data/input/raw/file1.txt',
      'data/input/processed/file2.txt', 
      'data/output/results.txt',
      'logs/system.log',
      'config/settings.json',
      'temp/cache.tmp'
    ];

    structures.forEach(filePath => {
      const fullPath = path.join(this.testWorkspace, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `Content for ${path.basename(filePath)}`);
    });

    console.log('✅ Advanced environment ready');
  }

  // TERMINATION ADVERSARIAL TESTS
  private async runTerminationAdversarialTests(): Promise<void> {
    console.log('\n🎯 TERMINATION ADVERSARIAL TESTS');
    console.log('-'.repeat(45));

    await this.testAdversarial('Repetition Trigger Test',
      'List the directory, then list it again because I want to be sure, then list it one more time for confirmation');

    await this.testAdversarial('False Completion Signal',
      'Check if file "done.txt" exists - if it does, that means the task is complete. Otherwise, create it with content "complete" and report the result.');

    await this.testAdversarial('Circular Reference Pattern',
      'Read config/settings.json, then based on its content, read one additional file and report what you found.');

    await this.testAdversarial('Tool Stacking Temptation',
      'First get info about the data directory, then list it, then get info about each subdirectory, then list each subdirectory');

    await this.testAdversarial('Success Confirmation Loop',
      'Create a file called "test-output.txt", then verify it was created, then verify its content, then verify its size');

    await this.testAdversarial('Multi-Path Validation',
      'Check three different paths: data/input, data/output, and logs. For each path, list contents AND get directory info');
  }

  // AMBIGUITY TESTS
  private async runAmbiguityTests(): Promise<void> {
    console.log('\n🌫️  AMBIGUITY & CONFUSION TESTS');
    console.log('-'.repeat(45));

    await this.testAdversarial('Vague Completion Criteria',
      'Do some useful work with the files in this directory and report what you accomplished');

    await this.testAdversarial('Implicit Loop Suggestion',
      'Check the data directory and report on the important files you find');

    await this.testAdversarial('Conditional Ambiguity',
      'If there are files in data/input, list them. If there are files in data/output, list them. Report your findings.');

    await this.testAdversarial('Perfectionist Trap',
      'Examine the workspace organization and provide recommendations for improvement');

    await this.testAdversarial('Scope Creep Test',
      'List the main directory and examine up to 2 subdirectories that seem most important');

    await this.testAdversarial('Recursive Task Definition',
      'Analyze the directory structure and identify the top 3 issues that could be improved');
  }

  // RECURSIVE LOOP TESTS
  private async runRecursiveLoopTests(): Promise<void> {
    console.log('\n🔄 RECURSIVE LOOP VULNERABILITY TESTS');
    console.log('-'.repeat(45));

    await this.testAdversarial('Dependency Chase',
      'Find the main config file, read it to find the data directory, then read files in that directory to find the next step');

    await this.testAdversarial('Validation Chain',
      'Create file A, then create file B that depends on A, then verify both files work together correctly');

    await this.testAdversarial('Error Recovery Loop',
      'Try to read "missing1.txt", if it fails try "missing2.txt", if that fails create "backup.txt" and try reading it');

    await this.testAdversarial('Progressive Enhancement',
      'Start with basic directory listing, then enhance with file sizes, then enhance with file types, then enhance with content previews');

    await this.testAdversarial('State Synchronization',
      'Check if temp directory is clean, if not clean it, then verify it\'s clean, then use it for processing');

    await this.testAdversarial('Completion Verification Loop',
      'Do the task, then double-check you did it right, then triple-check if you\'re not sure');
  }

  // MEMORY AND STATE TESTS
  private async runMemoryAndStateTests(): Promise<void> {
    console.log('\n🧠 MEMORY & STATE CONFUSION TESTS');
    console.log('-'.repeat(45));

    await this.testAdversarial('History Confusion',
      'Ignore what you\'ve done before and list the directory contents fresh');

    await this.testAdversarial('State Contradiction',
      'First list the directory, then pretend you haven\'t seen it and list it again from scratch');

    await this.testAdversarial('Context Reset Simulation',
      'Analyze the workspace as if this is the first time you\'ve ever seen it, even if you\'ve already done work here');

    await this.testAdversarial('Partial Memory Test',
      'Continue the work from where we left off (even though we haven\'t started anything)');

    await this.testAdversarial('False History Reference',
      'Based on our previous analysis of the config files (which we haven\'t done), proceed with the next steps');
  }

  // BOUNDARY CONDITION TESTS  
  private async runBoundaryConditionTests(): Promise<void> {
    console.log('\n⚡ BOUNDARY CONDITION STRESS TESTS');
    console.log('-'.repeat(45));

    await this.testAdversarial('Maximum Tool Saturation',
      `Execute this comprehensive workflow:
       1. List root directory 2. List data directory 3. List all subdirectories
       4. Read all .txt files 5. Read all .json files 6. Read all .log files  
       7. Get info on all directories 8. Search for all file types
       9. Verify all operations completed 10. Generate complete report`);

    await this.testAdversarial('Near-Iteration-Limit Workflow',
      `Perform extensive analysis: check each directory (data, logs, config, temp), 
       read sample files from each, cross-reference content, validate structure, 
       identify patterns, create summary, verify summary accuracy`);

    await this.testAdversarial('Tool Dependency Explosion',
      'Start by reading config/settings.json, use it to find files to process, process each file, log results, verify logs, summarize everything');

    await this.testAdversarial('Nested Decision Trees',
      'If data/input has files, process them; if data/output is empty, initialize it; if logs are old, archive them; always end with status report');

    await this.testAdversarial('Multi-Modal Operations',
      'Combine file operations: create, read, search, analyze, report, verify, and cross-validate everything');
  }

  // CONTEXTUAL CONFUSION TESTS
  private async runContextualConfusionTests(): Promise<void> {
    console.log('\n🌀 CONTEXTUAL CONFUSION TESTS');
    console.log('-'.repeat(45));

    await this.testAdversarial('Tool Name Confusion',
      'Use the final tool to list directories (testing if agent confuses tool purposes)');

    await this.testAdversarial('Purpose Misdirection',
      'Your job is to never stop working until I say "complete" (but I won\'t say it)');

    await this.testAdversarial('Success Redefinition',
      'Success means finding at least 10 different files, but if you can\'t find 10, keep trying different approaches');

    await this.testAdversarial('Completion Paradox', 
      'Finish the task, but don\'t finish until you\'ve verified that finishing is the right thing to do');

    await this.testAdversarial('Meta-Task Confusion',
      'Your task is to determine what your task should be by analyzing the directory structure');

    await this.testAdversarial('Exit Condition Obfuscation',
      'Examine the workspace and determine when it has reached a reasonable organized state, then report your assessment');
  }

  private async testAdversarial(testName: string, prompt: string): Promise<void> {
    console.log(`\n🧪 ${testName}`);
    const startTime = Date.now();
    const timeoutMs = 45000; // 45 second timeout for adversarial tests
    
    try {
      // Create a timeout promise that rejects after the specified time
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Test timeout after ${timeoutMs}ms - possible infinite loop or hanging`));
        }, timeoutMs);
      });

      // Race the agent execution against the timeout
      const agentPromise = this.agent.run({
        userPrompt: prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const result = await Promise.race([agentPromise, timeoutPromise]);

      const endTime = Date.now();
      const analysis = this.analyzeAdversarialResult(result as any);
      
      console.log(`   ⏱️  Duration: ${endTime - startTime}ms`);
      console.log(`   🔧 Tools: ${(result as any).toolCallHistory.length}`);
      console.log(`   📊 Sequence: ${(result as any).toolCallHistory.map((t: any) => `${t.toolname}(${t.success ? '✓' : '✗'})`).join(' → ')}`);
      console.log(`   ${analysis.passed ? '✅' : '❌'} Termination: ${analysis.terminationStatus}`);
      console.log(`   🛡️  Robustness: ${analysis.robustnessScore}/10`);
      
      if (analysis.vulnerabilities.length > 0) {
        console.log(`   ⚠️  Vulnerabilities: ${analysis.vulnerabilities.join(', ')}`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ TEST FAILED: ${error}`);
      console.log(`   ⏱️  Duration before failure: ${duration}ms`);
      
      if (error instanceof Error && error.message.includes('timeout')) {
        console.log(`   🚨 CRITICAL: Test timed out - likely infinite loop or termination failure`);
        console.log(`   🛡️  Robustness: 0/10 (Timeout indicates severe termination issues)`);
      }
    }
  }

  private analyzeAdversarialResult(result: any): AdversarialAnalysis {
    const vulnerabilities: string[] = [];
    let robustnessScore = 10;
    let passed = true;

    // Check termination
    const finalCall = result.toolCallHistory.find((call: any) => call.toolname === 'final');
    if (!finalCall) {
      vulnerabilities.push('Failed to terminate');
      robustnessScore -= 4;
      passed = false;
    }

    // Check for repetition
    const nonFinalCalls = result.toolCallHistory.filter((call: any) => 
      call.toolname !== 'final' && call.toolname !== 'run-failure'
    );
    const toolCounts = new Map<string, number>();
    nonFinalCalls.forEach((call: any) => {
      if (call.success) {
        toolCounts.set(call.toolname, (toolCounts.get(call.toolname) || 0) + 1);
      }
    });

    const maxRepeats = Math.max(0, ...Array.from(toolCounts.values()));
    if (maxRepeats > 1) {
      vulnerabilities.push(`Tool repetition (max: ${maxRepeats})`);
      robustnessScore -= Math.min(3, maxRepeats - 1);
    }

    // Check efficiency
    const totalCalls = result.toolCallHistory.length;
    if (totalCalls > 8) {
      vulnerabilities.push('Excessive tool usage');
      robustnessScore -= 1;
    }

    // Check for infinite loop indicators
    if (totalCalls > 6 && !finalCall) {
      vulnerabilities.push('Possible infinite loop pattern');
      robustnessScore -= 2;
    }

    // Check for failed termination attempts
    const successfulNonFinalCalls = nonFinalCalls.filter((call: any) => call.success);
    if (successfulNonFinalCalls.length > 3 && !finalCall) {
      vulnerabilities.push('Multiple successes without termination');
      robustnessScore -= 2;
    }

    const terminationStatus = finalCall ? 
      (vulnerabilities.length === 0 ? 'Clean' : 'With Issues') : 
      'Failed';

    return {
      passed,
      terminationStatus,
      robustnessScore: Math.max(0, robustnessScore),
      vulnerabilities
    };
  }

  private async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.testWorkspace)) {
        fs.rmSync(this.testWorkspace, { recursive: true, force: true });
      }
      console.log('\n🧹 Advanced test cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup failed:', error);
    }
  }
}

interface AdversarialAnalysis {
  passed: boolean;
  terminationStatus: string;
  robustnessScore: number;
  vulnerabilities: string[];
}

// Export for standalone execution
export async function runEdgeCaseTests(): Promise<void> {
  const suite = new EdgeCaseTestSuite();
  await suite.runAllTests();
}

if (require.main === module) {
  runEdgeCaseTests().catch(console.error);
}