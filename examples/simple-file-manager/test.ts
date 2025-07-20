import { SimpleFileManagerAgent } from './SimpleFileManagerAgent';
import { AIConfig } from '../../core/types/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Automated Test Suite for Simple File Manager Agent
 * 
 * This test suite validates all file management operations in a controlled
 * test environment using a temporary directory and real AI provider.
 */

class FileManagerAgentTest {
  private testDir: string;
  private agent: SimpleFileManagerAgent;

  constructor() {
    // Create a temporary test directory
    this.testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filemanager-test-'));
    console.log(`📁 Test directory: ${this.testDir}`);

    // Environment variable should already be loaded by dotenv
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required for testing');
    }

    this.agent = new SimpleFileManagerAgent({
      service: 'google',
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-1.5-flash'
    }, this.testDir);
  }

  async cleanup() {
    try {
      // Clean up test directory
      console.log(`📁 Test files preserved at: ${this.testDir}`);
      console.log(`   You can inspect the test directory manually if needed`);
      console.log(`   To clean up manually: rm -rf ${this.testDir}`);
      // Uncomment the next line to auto-cleanup:
      // fs.rmSync(this.testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to cleanup test directory:', error);
    }
  }

  /**
   * Test basic file operations without AI interaction
   */
  async testDirectToolCalls() {
    console.log('\n🧪 Testing Direct Tool Calls...');

    try {
      // Test 1: List empty directory
      console.log('\n1. Testing list_directory on empty directory...');
      const listResult1 = await this.runToolDirectly('list_directory', { path: '.' });
      this.assertSuccess(listResult1, 'list_directory should succeed on empty directory');
      this.assertEqual(listResult1.itemCount, 0, 'Empty directory should have 0 items');

      // Test 2: Create a file
      console.log('\n2. Testing create_file...');
      const createResult = await this.runToolDirectly('create_file', {
        path: 'test.txt',
        content: 'Hello, World!\nThis is a test file.'
      });
      this.assertSuccess(createResult, 'create_file should succeed');
      this.assertTrue(createResult.size! > 0, 'Created file should have size > 0');

      // Test 3: List directory with file
      console.log('\n3. Testing list_directory with file...');
      const listResult2 = await this.runToolDirectly('list_directory', { path: '.' });
      this.assertSuccess(listResult2, 'list_directory should succeed');
      this.assertEqual(listResult2.itemCount, 1, 'Directory should have 1 item');
      this.assertEqual(listResult2.items[0].name, 'test.txt', 'File should be named test.txt');

      // Test 4: Read file
      console.log('\n4. Testing read_file...');
      const readResult = await this.runToolDirectly('read_file', { path: 'test.txt' });
      this.assertSuccess(readResult, 'read_file should succeed');
      this.assertTrue(readResult.content!.includes('Hello, World!'), 'File content should match');

      // Test 5: Create subdirectory and file
      console.log('\n5. Testing create_file in subdirectory...');
      const createSubResult = await this.runToolDirectly('create_file', {
        path: 'subdir/nested.txt',
        content: 'Nested file content'
      });
      this.assertSuccess(createSubResult, 'create_file in subdirectory should succeed');

      // Test 6: List directory with subdirectory
      console.log('\n6. Testing list_directory with subdirectory...');
      const listResult3 = await this.runToolDirectly('list_directory', { path: '.' });
      this.assertSuccess(listResult3, 'list_directory should succeed');
      this.assertEqual(listResult3.itemCount, 2, 'Directory should have 2 items');

      // Test 7: Delete file
      console.log('\n7. Testing delete_file...');
      const deleteResult = await this.runToolDirectly('delete_file', { path: 'test.txt' });
      this.assertSuccess(deleteResult, 'delete_file should succeed');

      // Test 8: Verify file is deleted
      console.log('\n8. Testing list_directory after deletion...');
      const listResult4 = await this.runToolDirectly('list_directory', { path: '.' });
      this.assertSuccess(listResult4, 'list_directory should succeed');
      this.assertEqual(listResult4.itemCount, 1, 'Directory should have 1 item after deletion');

      // Test 9: Error cases
      console.log('\n9. Testing error cases...');
      
      // Try to read non-existent file
      const readErrorResult = await this.runToolDirectly('read_file', { path: 'nonexistent.txt' });
      this.assertFailure(readErrorResult, 'read_file should fail for non-existent file');
      
      // Try to delete non-existent file
      const deleteErrorResult = await this.runToolDirectly('delete_file', { path: 'nonexistent.txt' });
      this.assertFailure(deleteErrorResult, 'delete_file should fail for non-existent file');

      // Try to list non-existent directory
      const listErrorResult = await this.runToolDirectly('list_directory', { path: 'nonexistent-dir' });
      this.assertFailure(listErrorResult, 'list_directory should fail for non-existent directory');

      console.log('\n✅ All direct tool call tests passed!');

    } catch (error) {
      console.error('\n❌ Direct tool call tests failed:', error);
      throw error;
    }
  }

  /**
   * Test the agent with real AI responses
   */
  async testAgentWithRealAI() {
    console.log('\n🤖 Testing Agent with Real AI...');

    const testPrompts = [
      'list this directory',
      'Please create a file called hello.txt and inside write hello world',
      'read hello.txt',
      'list this directory again',
      'Please delete the file hello.txt'
    ];

    try {
      let conversationHistory: any[] = [];
      
      for (let i = 0; i < testPrompts.length; i++) {
        const prompt = testPrompts[i];
        console.log(`\n${i + 1}. Testing agent with "${prompt}"...`);
        
        const result = await this.agent.run({
          userPrompt: prompt,
          interactionHistory: conversationHistory,
          context: { workingDirectory: this.testDir }
        });
        
        // Update conversation history for next iteration
        if (result.interactionHistory) {
          conversationHistory.push(...result.interactionHistory);
        }
        
        this.assertTrue(!!result.agentResponse, `Should get agent response for: ${prompt}`);
        console.log(`   📋 Agent response: ${JSON.stringify(result.agentResponse?.context)}`);
        console.log(`   🔧 Tool calls made: ${result.interactionHistory?.filter(h => h.type === 'tool_call').map(h => h.context.toolName).join(', ') || 'none'}`);
        
        // Additional verification for create file
        if (prompt.includes('create a file')) {
          const fileExists = await fs.promises.access(path.join(this.testDir, 'hello.txt')).then(() => true).catch(() => false);
          console.log(`   📁 File exists after create: ${fileExists}`);
          this.assertTrue(fileExists, 'File should actually be created');
        }
      }

      console.log('\n✅ All real AI tests passed!');

    } catch (error) {
      console.error('\n❌ Real AI tests failed:', error);
      throw error;
    }
  }

  /**
   * Helper method to run tools directly through the agent
   */
  private async runToolDirectly(toolName: string, args: any): Promise<any> {
    // Access the tool handlers directly for testing
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

  // Test assertion helpers
  private assertSuccess(result: any, message: string) {
    if (!result.success) {
      throw new Error(`${message} - Error: ${result.error}`);
    }
    console.log(`   ✅ ${message}`);
  }

  private assertFailure(result: any, message: string) {
    if (result.success) {
      throw new Error(`${message} - Expected failure but got success`);
    }
    console.log(`   ✅ ${message}`);
  }

  private assertEqual<T>(actual: T, expected: T, message: string) {
    if (actual !== expected) {
      throw new Error(`${message} - Expected: ${expected}, Actual: ${actual}`);
    }
    console.log(`   ✅ ${message}`);
  }

  private assertTrue(condition: boolean, message: string) {
    if (!condition) {
      throw new Error(`${message} - Condition was false`);
    }
    console.log(`   ✅ ${message}`);
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting File Manager Agent Tests');
    
    try {
      //await this.testDirectToolCalls();
      await this.testAgentWithRealAI();
      
      console.log('\n🎉 All tests completed successfully!');
      
    } catch (error) {
      console.error('\n💥 Tests failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  async function runTests() {
    const tester = new FileManagerAgentTest();
    try {
      await tester.runAllTests();
      process.exit(0);
    } catch (error) {
      console.error('Test suite failed:', error);
      process.exit(1);
    }
  }

  runTests().catch(console.error);
}

export { FileManagerAgentTest };