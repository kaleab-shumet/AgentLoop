import { FileManagementAgent } from '../../examples/FileManagementAgent';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive robustness test suite for agent termination logic
 * Tests edge cases, complex workflows, error scenarios, and stress conditions
 */
export class RobustnessTestSuite {
  private agent: FileManagementAgent;
  private testWorkspace: string;
  private results: TestResult[] = [];

  constructor() {
    const config = {
      apiKey: process.env.GEMINI_API_KEY || 'AIzaSyBBvprrxsMRaS7I1RTrX7IhH8-qBWs_S7A',
      model: 'gemini-2.0-flash'
    };
    
    this.testWorkspace = '/mnt/c/Users/user/Desktop/dev/AgentLoop/test-workspace-robustness';
    this.agent = new FileManagementAgent(config, this.testWorkspace);
  }

  async runAllTests(): Promise<void> {
    console.log('🔬 Starting Comprehensive Robustness Test Suite');
    console.log('=' + '='.repeat(60));

    await this.setupTestEnvironment();

    // Test Categories
    await this.runBasicRobustnessTests();
    await this.runEdgeCaseTests();
    await this.runComplexWorkflowTests();
    await this.runErrorCascadeTests();
    await this.runStressTests();
    await this.runBoundaryTests();

    this.printSummary();
    await this.cleanup();
  }

  private async setupTestEnvironment(): Promise<void> {
    console.log('🛠️  Setting up test environment...');
    
    // Clean and create test workspace
    if (fs.existsSync(this.testWorkspace)) {
      fs.rmSync(this.testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(this.testWorkspace, { recursive: true });

    // Create test files and directories
    fs.writeFileSync(path.join(this.testWorkspace, 'test.txt'), 'Sample content');
    fs.writeFileSync(path.join(this.testWorkspace, 'large-file.txt'), 'x'.repeat(10000));
    fs.mkdirSync(path.join(this.testWorkspace, 'existing-dir'));
    fs.writeFileSync(path.join(this.testWorkspace, 'existing-dir', 'nested.txt'), 'Nested content');
    
    console.log('✅ Environment ready');
  }

  // BASIC ROBUSTNESS TESTS
  private async runBasicRobustnessTests(): Promise<void> {
    console.log('\n📋 BASIC ROBUSTNESS TESTS');
    console.log('-'.repeat(40));

    await this.runTest('Single Operation Termination', 
      'List the current directory contents');

    await this.runTest('Sequential Operations',
      'First list the directory, then read test.txt, then tell me what you found');

    await this.runTest('Conditional Logic',
      'Check if a file called "maybe.txt" exists, and if not, create it with content "Created by test"');

    await this.runTest('Information Gathering',
      'Get detailed information about the test.txt file and summarize its properties');
  }

  // EDGE CASE TESTS
  private async runEdgeCaseTests(): Promise<void> {
    console.log('\n🎯 EDGE CASE TESTS');
    console.log('-'.repeat(40));

    await this.runTest('Empty Directory Operations',
      'Create a new empty directory called "empty-test" and verify it\'s empty');

    await this.runTest('Duplicate Operation Request',
      'List the directory contents, then list them again, then tell me what you saw');

    await this.runTest('Ambiguous Instructions',
      'Do something useful with the files in this directory');

    await this.runTest('Multiple File Types',
      'Search for all .txt files and give me a report on what you found');

    await this.runTest('Path Resolution',
      'Read the file at ./test.txt and also read existing-dir/nested.txt');

    await this.runTest('Large File Handling',
      'Read the large-file.txt and tell me about its size and content preview');
  }

  // COMPLEX WORKFLOW TESTS
  private async runComplexWorkflowTests(): Promise<void> {
    console.log('\n🔄 COMPLEX WORKFLOW TESTS');
    console.log('-'.repeat(40));

    await this.runTest('Project Structure Creation',
      `Create a complete project structure with these folders: src, docs, tests, config. 
       Then create a README.md in the root with project info, 
       a main.ts file in src with a hello world function,
       and a test.spec.ts in tests. Finally, list everything to confirm.`);

    await this.runTest('File Organization Workflow',
      `Find all .txt files, create a "text-files" directory, 
       and tell me what you would need to do to organize them (don't actually move them)`);

    await this.runTest('Content Analysis Pipeline',
      `Read all .txt files in the workspace, analyze their content, 
       and create a summary report of what types of content they contain`);

    await this.runTest('Backup and Verification',
      `Create a backup directory, copy test.txt to it as test-backup.txt, 
       then verify the backup was successful by comparing file sizes`);

    await this.runTest('Multi-Step File Processing',
      `Create a new file called "processed.txt", 
       read the content from test.txt, 
       modify it by adding a timestamp prefix, 
       write it to processed.txt,
       then verify the operation was successful`);
  }

  // ERROR CASCADE TESTS
  private async runErrorCascadeTests(): Promise<void> {
    console.log('\n💥 ERROR CASCADE TESTS');
    console.log('-'.repeat(40));

    await this.runTest('Missing File Recovery',
      'Try to read "nonexistent1.txt", then "nonexistent2.txt", then tell me what happened');

    await this.runTest('Permission-Like Errors',
      'Try to create a directory with an invalid name containing special characters: "bad<>dir|name"');

    await this.runTest('Dependency Chain Failure',
      'Read a file called "missing.txt", then try to copy its content to "output.txt", then report the results');

    await this.runTest('Partial Success Scenario',
      'Create files "success1.txt" and "success2.txt", then try to read "missing.txt", then summarize what worked');

    await this.runTest('Error Recovery Strategy',
      'Try to read "missing1.txt", if it fails try "missing2.txt", if that fails create "fallback.txt" with default content');
  }

  // STRESS TESTS
  private async runStressTests(): Promise<void> {
    console.log('\n⚡ STRESS TESTS');
    console.log('-'.repeat(40));

    await this.runTest('High Tool Count Workflow',
      `Perform this sequence: 
       1. List current directory
       2. Create "stress-test" directory
       3. Create 3 files: a.txt, b.txt, c.txt with different content
       4. Read each file
       5. Search for .txt files
       6. Get info on stress-test directory
       7. Provide a comprehensive summary`);

    await this.runTest('Deep Nesting Operations',
      'Create a deeply nested directory structure: level1/level2/level3/level4, then create a file at the deepest level');

    await this.runTest('Multiple Similar Operations',
      'Create 5 different directories with names dir1, dir2, dir3, dir4, dir5, then list the main directory');

    await this.runTest('Complex Conditional Logic',
      `Check if "conditional-test" directory exists, if not create it.
       Then check if it contains "config.json", if not create it with {"setting": "default"}.
       Then read the config and tell me what it contains.`);
  }

  // BOUNDARY TESTS
  private async runBoundaryTests(): Promise<void> {
    console.log('\n🎯 BOUNDARY TESTS');
    console.log('-'.repeat(40));

    await this.runTest('Maximum Iteration Approach',
      `Perform many small operations: create "boundary-test" dir, 
       create file1.txt in it, read file1.txt, create file2.txt, read file2.txt,
       list the directory, get directory info, then provide final summary`);

    await this.runTest('Tool Repetition Prevention',
      'List the directory contents multiple times and tell me what you see (test should prevent actual repetition)');

    await this.runTest('Complex Success Detection',
      `Create a "success-test" directory,
       add three files with content "file 1", "file 2", "file 3",
       verify all files exist,
       count the total files,
       and provide a completion report`);

    await this.runTest('Mixed Success/Failure Pattern',
      'Try to read "exists.txt" (doesn\'t exist), create "new.txt", read "test.txt" (exists), then summarize the mixed results');
  }

  private async runTest(testName: string, prompt: string): Promise<void> {
    console.log(`\n🧪 ${testName}`);
    const startTime = Date.now();
    
    try {
      const result = await this.agent.run({
        userPrompt: prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const endTime = Date.now();
      const analysis = this.analyzeResult(result, testName);
      
      console.log(`   ⏱️  Duration: ${endTime - startTime}ms`);
      console.log(`   🔧 Tool calls: ${result.toolCallHistory.length}`);
      console.log(`   📊 Sequence: ${result.toolCallHistory.map(t => `${t.toolname}(${t.success ? '✓' : '✗'})`).join(' → ')}`);
      console.log(`   ${analysis.passed ? '✅' : '❌'} Result: ${analysis.status}`);
      
      if (analysis.issues.length > 0) {
        console.log(`   ⚠️  Issues: ${analysis.issues.join(', ')}`);
      }

      this.results.push({
        testName,
        passed: analysis.passed,
        duration: endTime - startTime,
        toolCallCount: result.toolCallHistory.length,
        issues: analysis.issues,
        result
      });

    } catch (error) {
      console.log(`   ❌ FAILED: ${error}`);
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        toolCallCount: 0,
        issues: [`Test execution failed: ${error}`],
        result: null
      });
    }

    // Add delay between tests to prevent rate limiting
    console.log(`   ⏳ Waiting 2 seconds before next test...`);
    await this.sleep(2000);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private analyzeResult(result: any, testName: string): { passed: boolean; status: string; issues: string[] } {
    const issues: string[] = [];
    let passed = true;

    // Check for proper termination
    const finalCall = result.toolCallHistory.find((call: any) => call.toolname === 'final');
    if (!finalCall) {
      issues.push('No final termination');
      passed = false;
    }

    // Check for tool repetition
    const nonFinalCalls = result.toolCallHistory.filter((call: any) => call.toolname !== 'final' && call.toolname !== 'run-failure');
    const successfulCalls = nonFinalCalls.filter((call: any) => call.success);
    const callCounts = new Map<string, number>();
    
    successfulCalls.forEach((call: any) => {
      const key = `${call.toolname}`;
      callCounts.set(key, (callCounts.get(key) || 0) + 1);
    });

    const hasRepeats = Array.from(callCounts.values()).some(count => count > 1);
    if (hasRepeats) {
      issues.push('Tool repetition detected');
      passed = false;
    }

    // Check for efficiency (too many tool calls might indicate issues)
    const maxExpectedCalls = testName.includes('High Tool Count') ? 15 : testName.includes('Complex') ? 10 : 6;
    if (result.toolCallHistory.length > maxExpectedCalls) {
      issues.push(`Excessive tool calls (${result.toolCallHistory.length} > ${maxExpectedCalls})`);
      // Not a failure, but worth noting
    }

    // Check for immediate failures
    const allFailed = result.toolCallHistory.length > 0 && result.toolCallHistory.every((call: any) => !call.success);
    if (allFailed && !testName.includes('Error')) {
      issues.push('All operations failed');
      passed = false;
    }

    const status = passed ? 'PASSED' : 'FAILED';
    return { passed, status, issues };
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUITE SUMMARY');
    console.log('='.repeat(60));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    // Performance stats
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / totalTests;
    const avgToolCalls = this.results.reduce((sum, r) => sum + r.toolCallCount, 0) / totalTests;

    console.log(`\nPerformance Metrics:`);
    console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`Average Tool Calls: ${avgToolCalls.toFixed(1)}`);

    // Issue analysis
    const allIssues = this.results.flatMap(r => r.issues);
    const issueTypes = new Map<string, number>();
    allIssues.forEach(issue => {
      issueTypes.set(issue, (issueTypes.get(issue) || 0) + 1);
    });

    if (issueTypes.size > 0) {
      console.log(`\nCommon Issues:`);
      Array.from(issueTypes.entries())
        .sort(([,a], [,b]) => b - a)
        .forEach(([issue, count]) => {
          console.log(`  ${issue}: ${count} occurrences`);
        });
    }

    // Failed tests details
    if (failedTests > 0) {
      console.log(`\nFailed Tests:`);
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  ❌ ${r.testName}: ${r.issues.join(', ')}`);
        });
    }

    console.log('\n' + '='.repeat(60));
  }

  private async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.testWorkspace)) {
        fs.rmSync(this.testWorkspace, { recursive: true, force: true });
      }
      console.log('🧹 Cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup failed:', error);
    }
  }
}

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  toolCallCount: number;
  issues: string[];
  result: any;
}

// Export test function for standalone execution
export async function runRobustnessTests(): Promise<void> {
  const suite = new RobustnessTestSuite();
  await suite.runAllTests();
}

// Run if executed directly
if (require.main === module) {
  runRobustnessTests().catch(console.error);
}