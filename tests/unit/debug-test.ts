import { RealFileManagerAgent } from '../../examples/RealFileManagerAgent/RealFileManagerAgent';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Debug test to understand the path resolution issue
 */
async function debugTest(): Promise<void> {
  console.log('🔍 Debug Test for RealFileManagerAgent');
  console.log('=====================================');

  // Check the working directory that was used
  const workingDir = 'C:\\Users\\user\\Desktop\\dev\\AgentLoop\\interactive';
  console.log(`📁 Intended working directory: ${workingDir}`);
  console.log(`📁 Directory exists: ${fs.existsSync(workingDir)}`);
  
  // Check path resolution
  console.log(`📁 Resolved path: ${path.resolve(workingDir)}`);
  console.log(`📁 Current working directory: ${process.cwd()}`);
  
  // Check WSL path mapping
  const wslPath = '/mnt/c/Users/user/Desktop/dev/AgentLoop/interactive';
  console.log(`📁 WSL path: ${wslPath}`);
  console.log(`📁 WSL directory exists: ${fs.existsSync(wslPath)}`);

  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key',
    model: 'gemini-2.0-flash'
  };

  try {
    // Test with WSL path
    console.log('\n🧪 Testing with WSL path...');
    const agent = new RealFileManagerAgent(config, wslPath);
    console.log(`✅ Agent working directory: ${agent.getWorkingDirectory()}`);
    
    // Create a test file in the directory
    const testFile = path.join(wslPath, 'test.txt');
    fs.writeFileSync(testFile, 'Hello World');
    console.log(`✅ Created test file: ${testFile}`);
    
    // Test listing directory
    const result = await agent.run({
      userPrompt: "list all files in the current directory",
      conversationHistory: [],
      toolCallHistory: []
    });
    
    console.log('\n📊 Result:');
    console.log(`Tool calls: ${result.toolCallHistory.length}`);
    result.toolCallHistory.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.success ? '✅' : '❌'} ${tool.toolname}`);
      if (!tool.success) {
        console.log(`   Error: ${tool.error}`);
      }
    });
    
    // Cleanup
    fs.unlinkSync(testFile);
    console.log('🧹 Cleaned up test file');
    
  } catch (error: any) {
    console.error('❌ Debug test failed:', error.message);
  }
}

// Run the debug test
if (require.main === module) {
  debugTest().catch(console.error);
}