import { SimpleFileManagerAgent } from './SimpleFileManagerAgent';
import { AIConfig } from '../../core/types/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
  details?: string;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  totalDuration: number;
}

/**
 * Clean Test Suite for Simple File Manager Agent
 */
class FileManagerAgentTest {
  private testDir: string;
  private agent: SimpleFileManagerAgent;
  private testSuites: TestSuite[] = [];
  private currentSuite: TestSuite | null = null;
  private totalTokensUsed = 0;

  constructor() {
    this.testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filemanager-test-'));
    
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('❌ GEMINI_API_KEY environment variable is required');
    }

    this.agent = new SimpleFileManagerAgent({
      service: 'google',
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-1.5-flash'
    }, this.testDir);
  }

  private startSuite(name: string): void {
    this.currentSuite = {
      name,
      tests: [],
      totalDuration: 0
    };
  }

  private endSuite(): void {
    if (this.currentSuite) {
      this.currentSuite.totalDuration = this.currentSuite.tests.reduce((sum, test) => sum + test.duration, 0);
      this.testSuites.push(this.currentSuite);
      this.currentSuite = null;
    }
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    const result: TestResult = {
      name,
      status: 'PASS',
      duration: 0
    };

    try {
      await testFn();
    } catch (error) {
      result.status = 'FAIL';
      result.error = error instanceof Error ? error.message : String(error);
    }

    result.duration = Date.now() - startTime;
    this.currentSuite?.tests.push(result);
  }

  async cleanup() {
    try {
      fs.rmSync(this.testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async testDirectToolCalls() {
    this.startSuite('Direct Tool Operations');

    await this.runTest('List empty directory', async () => {
      const result = await this.runToolDirectly('list_directory', { path: '.' });
      this.assertSuccess(result);
      this.assertEqual(result.itemCount, 0);
    });

    await this.runTest('Create file', async () => {
      const result = await this.runToolDirectly('create_file', {
        path: 'test.txt',
        content: 'Hello, World!\nThis is a test file.'
      });
      this.assertSuccess(result);
      this.assertTrue(result.size! > 0);
    });

    await this.runTest('List directory with file', async () => {
      const result = await this.runToolDirectly('list_directory', { path: '.' });
      this.assertSuccess(result);
      this.assertEqual(result.itemCount, 1);
      this.assertEqual(result.items[0].name, 'test.txt');
    });

    await this.runTest('Read file content', async () => {
      const result = await this.runToolDirectly('read_file', { path: 'test.txt' });
      this.assertSuccess(result);
      this.assertTrue(result.content!.includes('Hello, World!'));
    });

    await this.runTest('Create nested file', async () => {
      const result = await this.runToolDirectly('create_file', {
        path: 'subdir/nested.txt',
        content: 'Nested file content'
      });
      this.assertSuccess(result);
    });

    await this.runTest('Delete file', async () => {
      const result = await this.runToolDirectly('delete_file', { path: 'test.txt' });
      this.assertSuccess(result);
    });

    await this.runTest('Error handling - read non-existent file', async () => {
      const result = await this.runToolDirectly('read_file', { path: 'nonexistent.txt' });
      this.assertFailure(result);
    });

    await this.runTest('Error handling - delete non-existent file', async () => {
      const result = await this.runToolDirectly('delete_file', { path: 'nonexistent.txt' });
      this.assertFailure(result);
    });

    this.endSuite();
  }

  async testAgentWithRealAI() {
    this.startSuite('AI Agent Integration');

    const scenarios = [
      {
        name: 'Basic file operations',
        prompt: 'List this directory, then create a file called hello.txt with content "Hello World", then list the directory again to confirm'
      },
      {
        name: 'File reading and writing',
        prompt: 'Read the hello.txt file, then create a second file called world.txt with content "World Hello", then read both files'
      },
      {
        name: 'JSON file creation',
        prompt: 'Create a file called config.json with sample JSON configuration data, then verify the content'
      },
      {
        name: 'Nested directory handling',
        prompt: 'Create a file at "subdir/nested.txt" with content "nested content", then list both root and subdir'
      },
      {
        name: 'Cleanup operations',
        prompt: 'Delete all created files (hello.txt, world.txt, config.json, subdir/nested.txt) and list directory to confirm'
      }
    ];

    let conversationHistory: any[] = [];

    for (const scenario of scenarios) {
      await this.runTest(scenario.name, async () => {
        const result = await this.agent.run({
          userPrompt: scenario.prompt,
          prevInteractionHistory: conversationHistory,
          context: { workingDirectory: this.testDir }
        });

        if (!result.agentResponse) {
          throw new Error('No agent response received');
        }

        if (!result.agentResponse.error) {
          // Update conversation history for next test
          if (result.interactionHistory) {
            conversationHistory.push(...result.interactionHistory);
          }
          
          // Log token usage for this test
          const tokenUsage = this.agent.getRunTokenUsage();
          if (tokenUsage.totalTokens > 0) {
            console.log(`    📊 Tokens: ${tokenUsage.totalTokens} (Prompt: ${tokenUsage.promptTokens}, Completion: ${tokenUsage.completionTokens})`);
            this.totalTokensUsed += tokenUsage.totalTokens;
          }
        } else {
          throw new Error(`Agent error: ${result.agentResponse.error}`);
        }
      });
    }

    this.endSuite();
  }

  private async runToolDirectly(toolName: string, args: any): Promise<any> {
    const handlers = (this.agent as any).toolHandlers;
    
    switch (toolName) {
      case 'list_directory':
        return await handlers.listDirectory({ name: toolName, args, turnState: {} });
      case 'create_file':
        return await handlers.createFile({ name: toolName, args, turnState: {} });
      case 'read_file':
        return await handlers.readFile({ name: toolName, args, turnState: {} });
      case 'delete_file':
        return await handlers.deleteFile({ name: toolName, args, turnState: {} });
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private assertSuccess(result: any) {
    if (!result.success) {
      throw new Error(`Expected success but got error: ${result.error}`);
    }
  }

  private assertFailure(result: any) {
    if (result.success) {
      throw new Error('Expected failure but operation succeeded');
    }
  }

  private assertEqual<T>(actual: T, expected: T) {
    if (actual !== expected) {
      throw new Error(`Expected: ${expected}, Actual: ${actual}`);
    }
  }

  private assertTrue(condition: boolean) {
    if (!condition) {
      throw new Error('Assertion failed: condition was false');
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log(' FILE MANAGER AGENT TEST RESULTS');
    console.log('='.repeat(80));

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;

    this.testSuites.forEach(suite => {
      const passed = suite.tests.filter(t => t.status === 'PASS').length;
      const failed = suite.tests.filter(t => t.status === 'FAIL').length;
      const status = failed === 0 ? '✅ PASS' : '❌ FAIL';
      
      console.log(`\n📁 ${suite.name} ${status} (${this.formatDuration(suite.totalDuration)})`);
      console.log('-'.repeat(60));
      
      suite.tests.forEach(test => {
        const statusIcon = test.status === 'PASS' ? '✅' : '❌';
        const duration = this.formatDuration(test.duration);
        console.log(`  ${statusIcon} ${test.name} (${duration})`);
        
        if (test.error) {
          console.log(`    Error: ${test.error}`);
        }
      });
      
      totalTests += suite.tests.length;
      totalPassed += passed;
      totalFailed += failed;
      totalDuration += suite.totalDuration;
    });

    console.log('\n' + '='.repeat(80));
    console.log(' SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Duration: ${this.formatDuration(totalDuration)}`);
    console.log(`Success Rate: ${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0}%`);
    
    if (totalFailed === 0) {
      console.log('\n🎉 All tests passed successfully!');
    } else {
      console.log(`\n⚠️  ${totalFailed} test(s) failed`);
    }
    
    if (this.totalTokensUsed > 0) {
      console.log(`\n📊 Total Tokens Used Across All Tests: ${this.totalTokensUsed}`);
    }
    
    console.log('='.repeat(80));
  }

  async runAllTests() {
    console.log('🚀 Simple File Manager Agent Test Suite');
    console.log(`📁 Test directory: ${this.testDir}`);
    console.log('\nRunning tests...');
    
    const startTime = Date.now();
    
    try {
      await this.testDirectToolCalls();
      await this.testAgentWithRealAI();
      
    } catch (error) {
      console.error('\n❌ Test execution failed:', error);
    } finally {
      this.printResults();
      await this.cleanup();
    }
    
    const failed = this.testSuites.some(suite => 
      suite.tests.some(test => test.status === 'FAIL')
    );
    
    if (failed) {
      throw new Error('Some tests failed');
    }
  }
}

if (require.main === module) {
  async function runTests() {
    const tester = new FileManagerAgentTest();
    try {
      await tester.runAllTests();
      process.exit(0);
    } catch (error) {
      process.exit(1);
    }
  }

  runTests().catch(() => process.exit(1));
}

export { FileManagerAgentTest };