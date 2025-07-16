import { FileManagementAgent } from '../../examples/FileManagementAgent';

/**
 * Test complex scenarios that historically caused termination issues
 */
export async function testComplexTermination() {
  console.log('🧪 Testing Complex Termination Scenarios');
  
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key',
    model: 'gemini-2.0-flash'
  };

  const agent = new FileManagementAgent(config, '/mnt/c/Users/user/Desktop/dev/AgentLoop/test-workspace');

  const testCases = [
    {
      name: "Multi-step file operations",
      prompt: "Create a folder called 'reports', then create a file called 'summary.txt' inside it with content 'Test report', then list the contents to verify"
    },
    {
      name: "File reading and summarization", 
      prompt: "Read the sample.txt file and tell me what it contains"
    },
    {
      name: "Error handling scenario",
      prompt: "Try to read a file that doesn't exist called 'nonexistent.txt' and tell me what happened"
    },
    {
      name: "Bulk file creation and verification",
      prompt: "Create 12 files named file1.txt to file12.txt in the reports folder, each with content 'File N', then list the contents of the reports folder to verify all files exist."
    },
    {
      name: "Multi-step directory and file operations",
      prompt: "Create 3 folders named projectA, projectB, and projectC inside the reports folder. In each folder, create 3 files named data1.txt, data2.txt, and data3.txt with content 'Sample data'. Then list the contents of each folder to verify."
    }
  ];

  for (const testCase of testCases) {
    console.log(`\nTest Case: ${testCase.name}`);
    console.log(`Prompt: ${testCase.prompt}`);
    
    try {
      const result = await agent.run({
        userPrompt: testCase.prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const nonFinalCalls = result.toolCallHistory.filter(call => call.toolName !== 'final');
      const finalCall = result.toolCallHistory.find(call => call.toolName === 'final');
      const hasRepeatedCalls = hasDuplicateSuccessfulCalls(nonFinalCalls);

      // Concise summary log
      console.log('Result Summary:');
      console.log(`  Tool calls: ${result.toolCallHistory.length}`);
      console.log(`  Sequence: ${result.toolCallHistory.map(t => `${t.toolName}(${t.success ? 'OK' : 'FAIL'})`).join(' -> ')}`);
      console.log(`  Terminated properly: ${!!finalCall}`);
      console.log(`  No repetition: ${!hasRepeatedCalls}`);
      if (finalCall) {
        console.log(`  Final answer: ${finalCall.output?.value?.substring(0, 80)}...`);
      }
      if (!hasRepeatedCalls && finalCall) {
        console.log('Test PASSED.');
      } else {
        console.log('Test FAILED: Detected repetition or improper termination.');
      }
      
    } catch (error) {
      console.log('Test failed with error:', error);
    }
    
    // Concise wait log
    console.log('Waiting 2 seconds before next test...');
    await sleep(2000);
  }

  console.log('\nAll complex termination tests completed.');
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hasDuplicateSuccessfulCalls(toolCalls: any[]): boolean {
  const successfulCalls = toolCalls.filter(call => call.success);
  const callCounts = new Map<string, number>();
  
  successfulCalls.forEach(call => {
    const key = `${call.toolName}`;
    callCounts.set(key, (callCounts.get(key) || 0) + 1);
  });
  
  return Array.from(callCounts.values()).some(count => count > 1);
}

// Run the test if this file is executed directly
if (require.main === module) {
  testComplexTermination().catch(console.error);
}