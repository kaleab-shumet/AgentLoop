import { AgentLoop, PromptManager, PromptTemplateBuilder, PromptConfig } from '../core';
import { GeminiAIProvider } from '../core/providers/GeminiAIProvider';
import { Tool, ChatEntry, ToolResult } from '../core/types/types';
import { AgentError } from '../core/utils/AgentError';
import { ZodTypeAny } from 'zod';

class CustomPromptTemplateBuilder implements PromptTemplateBuilder {
  constructor(private systemPrompt: string) {}

  buildSystemPrompt(): string {
    return `🤖 ${this.systemPrompt}

🎯 **Mission**: Be extremely helpful and efficient
📝 **Style**: Professional yet friendly
⚡ **Speed**: Prioritize quick, accurate responses`;
  }

  buildFormatInstructions(tools: Tool<ZodTypeAny>[], finalToolName: string, parallelExecution: boolean): string {
    const strategy = parallelExecution ? "⚡ Multi-tool execution enabled" : "🔄 Sequential tool execution";
    return `
🛠️ **TOOL USAGE INSTRUCTIONS**
${strategy}

📋 **Rules**:
1. 🔍 Always check tool call history first
2. 🎯 Use ${finalToolName} tool when you have the complete answer
3. 🚀 Be efficient and avoid redundant calls

📝 **Response Format**: Follow the specified tool calling format
`;
  }

  buildToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    const toolList = tools.map(tool => `  🔧 **${tool.name}**: ${tool.description}`).join('\n');
    return `🛠️ **AVAILABLE TOOLS**\n${toolList}`;
  }

  buildContextSection(context: Record<string, any>): string {
    if (Object.keys(context).length === 0) {
      return '📄 **CONTEXT**: No additional context provided';
    }
    
    const contextItems = Object.entries(context)
      .map(([key, value]) => `  📌 **${key}**: ${JSON.stringify(value)}`)
      .join('\n');
    
    return `📄 **CONTEXT**\n${contextItems}`;
  }

  buildConversationSection(conversationHistory: ChatEntry[]): string {
    if (conversationHistory.length === 0) return '';
    
    return `\n💬 **CONVERSATION HISTORY**\n${JSON.stringify(conversationHistory, null, 2)}`;
  }

  buildHistorySection(toolCallHistory: ToolResult[], maxEntries?: number): string {
    const entries = maxEntries ? toolCallHistory.slice(-maxEntries) : toolCallHistory;
    
    if (entries.length === 0) {
      return '📊 **TOOL HISTORY**: No previous tool calls';
    }
    
    const historyList = entries.map(entry => 
      `  ${entry.success ? '✅' : '❌'} **${entry.toolname}**: ${entry.success ? 'Success' : entry.error}`
    ).join('\n');
    
    return `📊 **TOOL HISTORY**\n${historyList}`;
  }

  buildErrorRecoverySection(error: AgentError | null, keepRetry: boolean): string {
    if (!error) return '';
    
    const instruction = keepRetry 
      ? "🔄 **Action**: Analyze the error and retry with improvements"
      : "🛑 **Action**: Maximum retries reached. Use 'final' tool to report status";
    
    return `\n🚨 **ERROR RECOVERY**\n  ❌ **Error**: ${error.message}\n  ${instruction}`;
  }

  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `
🎯 **CURRENT TASK**
"${userPrompt}"

💡 **Remember**: 
- Think step-by-step
- Use available tools efficiently  
- Call '${finalToolName}' when you have the complete answer
`;
  }
}

class WeatherAgentWithCustomPrompts extends AgentLoop {
  protected systemPrompt = `You are a professional weather assistant specialized in providing accurate, helpful weather information and advice.`;

  constructor(config: any) {
    const customBuilder = new CustomPromptTemplateBuilder(
      `You are a professional weather assistant specialized in providing accurate, helpful weather information and advice.`
    );
    
    const promptConfig: PromptConfig = {
      includeContext: true,
      includeConversationHistory: true,
      includeToolHistory: true,
      maxHistoryEntries: 5,
      errorRecoveryInstructions: "🔄 Weather services can be unreliable. Try alternative approaches or inform the user about the limitation.",
      customSections: {
        "WEATHER_TIPS": "🌡️ Always consider providing weather-appropriate clothing or activity suggestions",
        "ACCURACY_NOTE": "📍 Weather data accuracy depends on location precision and current conditions"
      }
    };

    const geminiProvider = new GeminiAIProvider(config);
    const promptManager = new PromptManager(
      `You are a professional weather assistant specialized in providing accurate, helpful weather information and advice.`,
      customBuilder,
      promptConfig
    );

    super(geminiProvider, { 
      promptManager,
      maxIterations: 5 
    });

    this.initializeTools();
  }

  private initializeTools(): void {
    this.defineTool((z) => ({
      name: 'get_weather',
      description: 'Get current weather conditions for a specific location',
      responseSchema: z.object({
        location: z.string().describe('City and country/state'),
        units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
      }),
      handler: async (name: string, args: any) => {
        // Simulate weather API call
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return {
          toolname: name,
          success: true,
          output: {
            location: args.location,
            temperature: Math.floor(Math.random() * 30) + 10,
            condition: 'Partly cloudy',
            humidity: Math.floor(Math.random() * 40) + 40,
            windSpeed: Math.floor(Math.random() * 20) + 5,
            units: args.units
          }
        };
      },
    }));

    this.defineTool((z) => ({
      name: 'weather_advice',
      description: 'Provide clothing and activity recommendations based on weather',
      responseSchema: z.object({
        temperature: z.number().describe('Temperature in degrees'),
        condition: z.string().describe('Weather condition'),
        activity: z.string().optional().describe('Planned activity'),
      }),
      handler: async (name: string, args: any) => {
        const { temperature, condition, activity } = args;
        
        let advice = "Based on the weather: ";
        
        if (temperature < 10) {
          advice += "🧥 Wear warm layers, coat, and gloves. ";
        } else if (temperature < 20) {
          advice += "🧤 Light jacket or sweater recommended. ";
        } else {
          advice += "☀️ Light clothing is perfect. ";
        }
        
        if (condition.toLowerCase().includes('rain')) {
          advice += "☔ Don't forget an umbrella!";
        }
        
        if (activity) {
          advice += ` For ${activity}, consider the weather conditions.`;
        }
        
        return {
          toolname: name,
          success: true,
          output: advice
        };
      },
    }));
  }
}

// Example usage function
export async function demonstrateCustomPrompts() {
  const config = {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash'
  };

  const agent = new WeatherAgentWithCustomPrompts(config);

  try {
    const result = await agent.run({
      userPrompt: "What's the weather like in Tokyo and what should I wear for outdoor sightseeing?",
      conversationHistory: [],
      toolCallHistory: []
    });

    console.log('🎉 Custom Prompt Demo Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Example of creating a prompt manager separately
export function createMinimalPromptManager(): PromptManager {
  class MinimalBuilder implements PromptTemplateBuilder {
    constructor(private systemPrompt: string) {}
    
    buildSystemPrompt(): string {
      return this.systemPrompt;
    }
    
    buildFormatInstructions(): string {
      return "Use tools as needed.";
    }
    
    buildToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
      return `Tools: ${tools.map(t => t.name).join(', ')}`;
    }
    
    buildContextSection(): string { return ""; }
    buildConversationSection(): string { return ""; }
    buildHistorySection(): string { return "Previous calls logged."; }
    buildErrorRecoverySection(): string { return ""; }
    buildTaskSection(userPrompt: string): string { 
      return `Task: ${userPrompt}`;
    }
  }

  return new PromptManager(
    "You are a helpful assistant.",
    new MinimalBuilder("You are a helpful assistant."),
    { 
      includeContext: false,
      includeConversationHistory: false,
      maxHistoryEntries: 3
    }
  );
}