import { FileManagementAgent } from '../../examples/FileManagementAgent';
import { getRateLimitConfig, rateLimitedSleep } from '../../examples/rate-limit-config';

/**
 * Rate-limited test version to prevent API blocking
 * Simple tests with proper delays between calls
 */
export async function testWithRateLimiting(): Promise<void> {
  console.log('🐌 RATE-LIMITED TERMINATION TEST');
  console.log('=' + '='.repeat(35));
  console.log('Testing with delays to prevent API rate limiting');

  const rateLimitConfig = getRateLimitConfig();
  console.log(`🔧 Using rate limits: ${rateLimitConfig.testDelay/1000}s between tests`);

  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'AIzaSyBBvprrxsMRaS7I1RTrX7IhH8-qBWs_S7A',
    model: 'gemini-2.0-flash'
  };

  const agent = new FileManagementAgent(config, '/mnt/c/Users/user/Desktop/dev/AgentLoop/test-workspace');

  // Simple test cases with delays
  const testCases = [
    {
      name: "Basic Directory Listing",
      prompt: "List the contents of the current directory and tell me what you found",
      delay: 5000 // 5 second delay after test
    },
    {
      name: "Simple File Reading", 
      prompt: "Read the sample.txt file if it exists and summarize its content",
      delay: 5000
    },
    {
      name: "File Creation Test",
      prompt: "Create a small test file called 'rate-limit-test.txt' with content 'Testing rate limits' and confirm it was created",
      delay: 5000
    }
  ];

  let testNumber = 1;
  
  for (const testCase of testCases) {
    console.log(`\n🧪 Test ${testNumber}: ${testCase.name}`);
    console.log(`📝 Prompt: ${testCase.prompt}`);
    
    const startTime = Date.now();
    
    try {
      const result = await agent.run({
        userPrompt: testCase.prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Analyze results
      const finalCall = result.toolCallHistory.find(call => call.toolname === 'final');
      const nonFinalCalls = result.toolCallHistory.filter(call => call.toolname !== 'final');
      const successfulCalls = nonFinalCalls.filter(call => call.success);
      
      // Check for repetition
      const toolCounts = new Map<string, number>();
      successfulCalls.forEach(call => {
        toolCounts.set(call.toolname, (toolCounts.get(call.toolname) || 0) + 1);
      });
      
      const maxRepeats = Math.max(0, ...Array.from(toolCounts.values()));
      const hasRepetition = maxRepeats > 1;
      
      console.log(`   ⏱️  Duration: ${duration}ms`);
      console.log(`   🔧 Tool calls: ${result.toolCallHistory.length}`);
      console.log(`   📊 Sequence: ${result.toolCallHistory.map(t => `${t.toolname}(${t.success ? '✓' : '✗'})`).join(' → ')}`);
      console.log(`   ${finalCall ? '✅' : '❌'} Terminated: ${!!finalCall}`);
      console.log(`   ${hasRepetition ? '⚠️' : '✅'} No repetition: ${!hasRepetition}`);
      
      if (finalCall) {
        console.log(`   📄 Answer: ${finalCall.output?.value?.substring(0, 80)}...`);
      }
      
      if (finalCall && !hasRepetition) {
        console.log(`   🎉 SUCCESS`);
      } else {
        console.log(`   ⚠️  ISSUES DETECTED`);
      }

    } catch (error) {
      console.log(`   ❌ TEST FAILED: ${error}`);
    }

    // Rate limiting delay
    if (testNumber < testCases.length) {
      await rateLimitedSleep(rateLimitConfig.testDelay, `Waiting before next test to prevent rate limiting`);
    }
    
    testNumber++;
  }

  console.log('\n✅ Rate-limited tests completed');
  console.log('If no rate limiting errors occurred, the delays are working correctly.');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if executed directly
if (require.main === module) {
  testWithRateLimiting().catch(console.error);
}