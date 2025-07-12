import { RealFileManagerAgent } from './RealFileManagerAgent';
import { startFileManagerConsole } from './console-interface';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Demo script for the RealFileManagerAgent
 * This demonstrates various capabilities and provides automated testing
 */

// Configuration for Gemini AI
const config = {
  apiKey: process.env.GEMINI_API_KEY || 'AIzaSyCUJwUBXdjfJuW0OGy5e68zAMWK_MEu8D4',
  model: 'gemini-2.0-flash'
};

/**
 * Automated demo showing agent capabilities
 */
export async function runAutomatedDemo(debugMode: boolean = false): Promise<void> {
  console.log('🎬 Real File Manager Agent - Automated Demo');
  if (debugMode) {
    console.log('🐛 Debug mode enabled - showing detailed output');
  }
  console.log('=============================================');
  
  // Create a demo workspace
  const demoWorkspace = path.join(process.cwd(), 'file-manager-demo');
  
  // Ensure demo workspace exists
  if (!fs.existsSync(demoWorkspace)) {
    fs.mkdirSync(demoWorkspace, { recursive: true });
  }
  
  console.log(`📁 Demo workspace: ${demoWorkspace}`);
  
  const agent = new RealFileManagerAgent(config, demoWorkspace, debugMode);
  
  const testCases = [
    {
      description: "📋 List current directory contents",
      prompt: "List all files and directories in the current location with details"
    },
    {
      description: "📁 Create a project structure",
      prompt: "Create directories called 'src', 'docs', and 'tests'"
    },
    {
      description: "📝 Create a package.json file",
      prompt: `Create a file called package.json with this content:
{
  "name": "file-manager-demo",
  "version": "1.0.0",
  "description": "Demo project for file manager agent",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest"
  },
  "dependencies": {},
  "devDependencies": {}
}`
    },
    {
      description: "📄 Create a README file",
      prompt: "Create a README.md file explaining this is a demo project for testing the file manager agent capabilities"
    },
    {
      description: "📝 Create some source files",
      prompt: "In the src directory, create an index.js file with a simple hello world console.log and a utils.js file with a helper function"
    },
    {
      description: "📖 Read the package.json file",
      prompt: "Read and display the contents of the package.json file"
    },
    {
      description: "🔍 Search for JavaScript files",
      prompt: "Search for all .js files in the project"
    },
    {
      description: "🔍 Search for content containing 'hello'",
      prompt: "Search for files that contain the word 'hello' in their content"
    },
    {
      description: "ℹ️ Get detailed info about the src directory",
      prompt: "Show detailed information about the src directory including its contents and statistics"
    },
    {
      description: "📊 List everything recursively",
      prompt: "List all files and directories recursively with full details"
    }
  ];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n${'-'.repeat(60)}`);
    console.log(`🧪 Test ${i + 1}/${testCases.length}: ${testCase.description}`);
    console.log(`📝 Prompt: "${testCase.prompt}"`);
    console.log(`⏳ Processing...`);
    
    const startTime = Date.now();
    
    try {
      const result = await agent.run({
        userPrompt: testCase.prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`\n✅ Success!`);
      
      if (debugMode) {
        console.log(`⏱️  Duration: ${duration}ms`);
        console.log(`🔧 Tools used: ${result.toolCallHistory.length}`);
        
        // Show tool execution summary in debug mode
        if (result.toolCallHistory.length > 0) {
          console.log(`📊 Tool execution summary:`);
          result.toolCallHistory.forEach((tool, index) => {
            const status = tool.success ? '✅' : '❌';
            console.log(`   ${index + 1}. ${status} ${tool.toolname}`);
          });
        }
      }
      
      // Show final answer (always shown)
      if (result.finalAnswer && result.finalAnswer.output?.value) {
        const response = result.finalAnswer.output.value;
        const preview = debugMode ? response : response.substring(0, 150) + (response.length > 150 ? '...' : '');
        console.log(`💬 Agent response: ${preview}`);
      }
      
      // Show any failures (always shown)
      const failedTools = result.toolCallHistory.filter(tool => !tool.success);
      if (failedTools.length > 0) {
        console.log(`⚠️ Failed operations:`);
        failedTools.forEach(tool => {
          console.log(`   ❌ ${tool.toolname}: ${tool.error}`);
        });
      }

    } catch (error: any) {
      console.log(`❌ Test failed: ${error.message}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎉 Demo completed!');
  console.log(`📁 Demo files created in: ${demoWorkspace}`);
  console.log('💡 You can now explore the created files or run the interactive console');
}

/**
 * Performance and stress testing
 */
export async function runPerformanceTest(debugMode: boolean = false): Promise<void> {
  console.log('\n🏃 Performance Test - Multiple Concurrent Operations');
  console.log('===================================================');
  
  const agent = new RealFileManagerAgent(config, process.cwd(), debugMode);
  
  const stressTests = [
    "Create 10 test files with numbered content",
    "Search for all created test files",
    "Read the contents of the first 5 test files",
    "Get information about all test files",
    "Delete all test files with confirmation"
  ];

  console.log('⏱️ Running stress tests...');
  
  for (const test of stressTests) {
    const startTime = Date.now();
    
    try {
      await agent.run({
        userPrompt: test,
        conversationHistory: [],
        toolCallHistory: []
      });
      
      const duration = Date.now() - startTime;
      if (debugMode) {
        console.log(`✅ "${test}" - ${duration}ms`);
      } else {
        console.log(`✅ "${test}" completed`);
      }
      
    } catch (error: any) {
      console.log(`❌ "${test}" - Failed: ${error.message}`);
    }
  }
}

/**
 * Error handling and edge case testing
 */
export async function runErrorHandlingTest(debugMode: boolean = false): Promise<void> {
  console.log('\n🛡️ Error Handling Test - Edge Cases and Invalid Operations');
  console.log('=========================================================');
  
  const agent = new RealFileManagerAgent(config, process.cwd(), debugMode);
  
  const errorTests = [
    "Read a file that doesn't exist called nonexistent.txt",
    "Create a file in a directory that doesn't exist without creating directories",
    "Delete a file that doesn't exist",
    "Search for files with an invalid pattern",
    "Try to read a very large file (simulate)",
    "Get info about a path that doesn't exist"
  ];

  for (const test of errorTests) {
    console.log(`\n🧪 Testing: "${test}"`);
    
    try {
      const result = await agent.run({
        userPrompt: test,
        conversationHistory: [],
        toolCallHistory: []
      });
      
      const hasErrors = result.toolCallHistory.some(tool => !tool.success);
      console.log(hasErrors ? '✅ Error handled gracefully' : '⚠️ Expected error but operation succeeded');
      
    } catch (error: any) {
      console.log(`✅ Error caught and handled: ${error.message.substring(0, 100)}`);
    }
  }
}

/**
 * Interactive demo mode - starts the console interface
 */
export async function runInteractiveDemo(): Promise<void> {
  console.log('\n🎮 Starting Interactive Demo Mode');
  console.log('=================================');
  console.log('💡 This will launch the interactive console interface');
  console.log('📝 Try commands like:');
  console.log('   - "create a file with some content"');
  console.log('   - "list all files"');
  console.log('   - "search for .js files"');
  console.log('   - Type "help" for more examples');
  console.log('');
  
  await startFileManagerConsole();
}

/**
 * Main demo function with options
 */
export async function runDemo(mode: 'auto' | 'interactive' | 'performance' | 'errors' | 'all' = 'auto', debugMode: boolean = false): Promise<void> {
  console.log('🚀 Real File Manager Agent Demo Suite');
  if (debugMode) {
    console.log('🐛 Debug mode enabled');
  }
  console.log('=====================================');
  
  try {
    switch (mode) {
      case 'auto':
        await runAutomatedDemo(debugMode);
        break;
      case 'interactive':
        await runInteractiveDemo();
        break;
      case 'performance':
        await runPerformanceTest(debugMode);
        break;
      case 'errors':
        await runErrorHandlingTest(debugMode);
        break;
      case 'all':
        await runAutomatedDemo(debugMode);
        await runPerformanceTest(debugMode);
        await runErrorHandlingTest(debugMode);
        console.log('\n🎮 All automated tests completed! Starting interactive mode...');
        await runInteractiveDemo();
        break;
      default:
        console.log('❌ Invalid mode. Use: auto, interactive, performance, errors, or all');
        console.log('💡 Add --debug flag for detailed output');
    }
  } catch (error: any) {
    console.error('❌ Demo failed:', error.message);
    console.error('💡 Make sure you have a valid GEMINI_API_KEY environment variable');
  }
}

// Auto-run demo if this file is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const debugMode = args.includes('--debug');
  const mode = (args.find(arg => !arg.startsWith('--')) as any) || 'auto';
  
  runDemo(mode, debugMode).catch(console.error);
}