import { RealFileManagerAgent } from '../../examples/RealFileManagerAgent/RealFileManagerAgent';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Simple test to verify the RealFileManagerAgent works correctly
 */
async function runSimpleTest(): Promise<void> {
  console.log('🧪 Running Simple Test for RealFileManagerAgent');
  console.log('===============================================');

  // Create test directory
  const testDir = path.join(process.cwd(), 'test-workspace-simple');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  console.log(`📁 Test directory: ${testDir}`);

  // Configuration (using test key)
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key',
    model: 'gemini-2.0-flash'
  };

  try {
    const agent = new RealFileManagerAgent(config, testDir);
    console.log('✅ Agent created successfully');
    
    // Test tool availability
    const availableTools = agent.getAvailableTools();
    console.log(`🔧 Available tools: ${availableTools.length}`);
    console.log(`   Tools: ${availableTools.join(', ')}`);
    
    // Test working directory
    console.log(`📍 Working directory: ${agent.getWorkingDirectory()}`);
    
    console.log('\n🎉 Simple test completed successfully!');
    console.log('💡 The agent is ready to use. Try running the demo or console interface.');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log('🧹 Cleaned up test directory');
    }
  }
}

// Run the test
if (require.main === module) {
  runSimpleTest().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

export { runSimpleTest };