import { FileManagementAgent } from '../../examples/FileManagementAgent';

/**
 * Test script to verify the agent termination fixes
 */
export async function testTerminationFix() {
  console.log('Testing Agent Termination Fixes');
  
  // Mock config for testing
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key',
    model: 'gemini-2.0-flash'
  };

  const agent = new FileManagementAgent(config, '/mnt/c/Users/user/Desktop/dev/AgentLoop/test-workspace');

  // Test case that commonly caused termination issues
  const testPrompt = "List the contents of the current directory and tell me what you found";

  console.log('\nTest Prompt:', testPrompt);
  console.log('Expected Behavior: Agent should list directory, then immediately use final tool to summarize findings');

  try {
    const result = await agent.run({
      userPrompt: testPrompt,
      conversationHistory: [],
      toolCallHistory: []
    });

    console.log('\nTest Results:');
    console.log('- Total tool calls:', result.toolCallHistory.length);
    console.log('- Tool sequence:', result.toolCallHistory.map(t => `${t.toolname}(${t.success ? 'OK' : 'FAIL'})`).join(' -> '));
    console.log('- Final answer provided:', !!result.finalAnswer);
    if (result.finalAnswer) {
      console.log('- Final answer preview:', result.finalAnswer.output?.value?.substring(0, 100) + '...');
    }
    // Check for termination issues
    const nonFinalCalls = result.toolCallHistory.filter(call => call.toolname !== 'final');
    const finalCall = result.toolCallHistory.find(call => call.toolname === 'final');
    const hasRepeatedCalls = hasDuplicateSuccessfulCalls(nonFinalCalls);
    console.log('\nTermination Analysis:');
    console.log('- Repeated successful calls detected:', hasRepeatedCalls);
    console.log('- Agent terminated properly:', !!finalCall);
    console.log('- Efficiency score:', calculateEfficiencyScore(result.toolCallHistory));
    if (!hasRepeatedCalls && finalCall) {
      console.log('Test PASSED: Agent terminated properly without repetition.');
    } else {
      console.log('Test FAILED: Agent still has termination problems.');
    }

  } catch (error) {
    console.log('Test failed with error:', error);
  }
}

function hasDuplicateSuccessfulCalls(toolCalls: any[]): boolean {
  const successfulCalls = toolCalls.filter(call => call.success);
  const callCounts = new Map<string, number>();
  
  successfulCalls.forEach(call => {
    const key = `${call.toolname}`;
    callCounts.set(key, (callCounts.get(key) || 0) + 1);
  });
  
  return Array.from(callCounts.values()).some(count => count > 1);
}

function calculateEfficiencyScore(toolCalls: any[]): string {
  const totalCalls = toolCalls.length;
  const uniqueTools = new Set(toolCalls.map(call => call.toolname));
  const efficiency = (uniqueTools.size / totalCalls) * 100;
  return `${efficiency.toFixed(1)}% (${uniqueTools.size}/${totalCalls} unique)`;
}

// Run the test if this file is executed directly
if (require.main === module) {
  testTerminationFix().catch(console.error);
}