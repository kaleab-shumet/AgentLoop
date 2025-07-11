import { NewsWeatherAgent } from '../NewsWeatherAgent';
import { ExecutionMode } from '../AgentLoop/types';

/**
 * Demonstrates backward compatibility and new multi-mode functionality
 * using the existing NewsWeatherAgent
 */
async function demonstrateBackwardCompatibility() {
  console.log('=== Backward Compatibility Demo ===\n');

  // Create agent with default XML mode (backward compatible)
  const agent = new NewsWeatherAgent({
    apiKey: process.env.GEMINI_API_KEY || 'demo-key',
    model: 'gemini-2.0-flash',
    service: 'google',
    temperature: 0.7,
  });

  console.log('1. Default XML Mode (Backward Compatible)');
  console.log('Current execution mode:', agent.getExecutionMode());
  
  // Test with XML mode (original behavior)
  try {
    const xmlResult = await agent.run({
      userPrompt: "What's the weather like in Tokyo?",
      conversationHistory: [],
      toolCallHistory: []
    });
    
    console.log('XML Mode Result:', JSON.stringify(xmlResult, null, 2));
  } catch (error) {
    console.log('XML Mode Error:', error);
  }

  console.log('\n2. Switching to Function Calling Mode');
  
  // Switch to function calling mode
  agent.setExecutionMode(ExecutionMode.FUNCTION_CALLING);
  console.log('Switched to execution mode:', agent.getExecutionMode());
  
  try {
    const functionResult = await agent.run({
      userPrompt: "Give me news about AI developments",
      conversationHistory: [],
      toolCallHistory: []
    });
    
    console.log('Function Calling Mode Result:', JSON.stringify(functionResult, null, 2));
  } catch (error) {
    console.log('Function Calling Mode Error:', error);
  }

  console.log('\n3. Creating Agent with Function Calling Mode from Start');
  
  // Create new agent with function calling mode
  const functionAgent = new NewsWeatherAgent({
    apiKey: process.env.GEMINI_API_KEY || 'demo-key',
    model: 'gemini-2.0-flash',
    service: 'google',
    temperature: 0.7,
  }, { 
    executionMode: ExecutionMode.FUNCTION_CALLING,
    retryAttempts: 3 
  });

  console.log('Function Agent execution mode:', functionAgent.getExecutionMode());

  try {
    const result = await functionAgent.run({
      userPrompt: "What's the weather forecast for London and recent news about climate change?",
      conversationHistory: [],
      toolCallHistory: []
    });
    
    console.log('Function Agent Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('Function Agent Error:', error);
  }

  console.log('\n4. Demonstrating Tool Compatibility');
  
  // Show that tools work the same way in both modes
  const xmlAgent = new NewsWeatherAgent({
    apiKey: process.env.GEMINI_API_KEY || 'demo-key',
    model: 'gemini-2.0-flash',
    service: 'google',
    temperature: 0.7,
  }, { executionMode: ExecutionMode.XML });

  console.log('Available tools (same for both modes):', xmlAgent.getAvailableTools());
  
  console.log('\n=== Backward Compatibility Demo Complete ===');
}

// Export the demonstration function
export { demonstrateBackwardCompatibility };

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateBackwardCompatibility().catch(console.error);
}