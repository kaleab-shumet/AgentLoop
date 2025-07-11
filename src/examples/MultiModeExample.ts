import { AgentLoop, ExecutionMode, AgentRunInput, AgentRunOutput } from '../AgentLoop';
import { AIProvider } from '../AgentLoop/AIProvider';
import z from 'zod';

// Example AI Provider implementation
class ExampleAIProvider implements AIProvider {
  async getCompletion(prompt: string): Promise<string> {
    // This is a mock implementation - replace with actual AI provider
    console.log('Prompt received:', prompt.slice(0, 200) + '...');
    
    // Return a mock response based on the execution mode
    if (prompt.includes('```xml')) {
      return `I'll help you with that task.

\`\`\`xml
<root>
  <get_weather><name>get_weather</name><city>New York</city></get_weather>
</root>
\`\`\``;
    } else {
      return `I'll help you with that task.

\`\`\`json
{
  "function_call": {
    "name": "get_weather",
    "arguments": "{\\"city\\": \\"New York\\"}"
  }
}
\`\`\``;
    }
  }
}

// Example Agent implementation
class WeatherAgent extends AgentLoop {
  protected systemPrompt = `You are a weather assistant. Use the available tools to help users get weather information.`;

  constructor(provider: AIProvider, executionMode: ExecutionMode = ExecutionMode.XML) {
    super(provider, { executionMode });
    this.setupTools();
  }

  private setupTools() {
    this.defineTool((z) => ({
      name: 'get_weather',
      description: 'Get weather information for a specific city',
      responseSchema: z.object({
        city: z.string().describe('The city to get weather for'),
      }),
      handler: async (name: string, args: any) => {
        // Mock weather data
        const weatherData = {
          city: args.city,
          temperature: '22°C',
          condition: 'Sunny',
          humidity: '60%'
        };
        
        return {
          toolname: name,
          success: true,
          output: weatherData
        };
      }
    }));
  }
}

// Example usage function
async function demonstrateMultiModeUsage() {
  const provider = new ExampleAIProvider();
  
  console.log('=== XML Mode Example ===');
  const xmlAgent = new WeatherAgent(provider, ExecutionMode.XML);
  
  const xmlInput: AgentRunInput = {
    userPrompt: 'What is the weather like in New York?',
    conversationHistory: [],
    toolCallHistory: []
  };
  
  console.log('Current execution mode:', xmlAgent.getExecutionMode());
  
  try {
    const xmlResult = await xmlAgent.run(xmlInput);
    console.log('XML Mode Result:', JSON.stringify(xmlResult, null, 2));
  } catch (error) {
    console.log('XML Mode Error:', error);
  }
  
  console.log('\n=== Function Calling Mode Example ===');
  const functionAgent = new WeatherAgent(provider, ExecutionMode.FUNCTION_CALLING);
  
  const functionInput: AgentRunInput = {
    userPrompt: 'What is the weather like in London?',
    conversationHistory: [],
    toolCallHistory: []
  };
  
  console.log('Current execution mode:', functionAgent.getExecutionMode());
  
  try {
    const functionResult = await functionAgent.run(functionInput);
    console.log('Function Calling Mode Result:', JSON.stringify(functionResult, null, 2));
  } catch (error) {
    console.log('Function Calling Mode Error:', error);
  }
  
  console.log('\n=== Dynamic Mode Switching Example ===');
  const dynamicAgent = new WeatherAgent(provider, ExecutionMode.XML);
  
  console.log('Starting with XML mode:', dynamicAgent.getExecutionMode());
  
  // Switch to function calling mode
  dynamicAgent.setExecutionMode(ExecutionMode.FUNCTION_CALLING);
  console.log('Switched to function calling mode:', dynamicAgent.getExecutionMode());
  
  const dynamicInput: AgentRunInput = {
    userPrompt: 'What is the weather like in Paris?',
    conversationHistory: [],
    toolCallHistory: []
  };
  
  try {
    const dynamicResult = await dynamicAgent.run(dynamicInput);
    console.log('Dynamic Mode Result:', JSON.stringify(dynamicResult, null, 2));
  } catch (error) {
    console.log('Dynamic Mode Error:', error);
  }
}

// Export the example function
export { demonstrateMultiModeUsage, WeatherAgent, ExampleAIProvider };

// Run the example if this file is executed directly
if (require.main === module) {
  demonstrateMultiModeUsage().catch(console.error);
}