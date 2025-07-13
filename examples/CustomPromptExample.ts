import {
  AgentLoop,
  PromptManager,
  ResponseFormat,
  PromptTemplateInterface,
  PromptOptions
} from '../core';
import { GeminiAIProvider } from '../core/providers/GeminiAIProvider';
import { ChatEntry, ToolResult } from '../core/types/types';
import { AgentError } from '../core/utils/AgentError';


/**
 * Example of creating a custom prompt template with emoji styling
 * Developers implement PromptTemplateInterface for full control
 */
class EmojiPromptTemplate implements PromptTemplateInterface {
  getFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    const executionStrategy = parallelExecution ?
      "⚡ Multi-tool execution enabled - call all needed tools at once!" :
      "🔄 Sequential execution - complete one tool before moving to the next";

    return `🛠️ **TOOL USAGE INSTRUCTIONS**

📋 **Critical Rules**:
1. 🔍 Always check the tool call history first - never repeat successful operations!
2. 🎯 Use the '${finalToolName}' tool when you have completed the user's request
3. 🚀 Be efficient and avoid redundant calls
4. ✅ If the task is complete, use ONLY the '${finalToolName}' tool

**${executionStrategy}**

📝 **Response Format**: You MUST respond by calling tools using XML format:
\`\`\`xml
<root>
  <toolName><param1>value1</param1></toolName>
</root>
\`\`\`

🎯 **Completion Example**:
\`\`\`xml
<root>
  <${finalToolName}><value>✅ Task completed! [summary]</value></${finalToolName}>
</root>
\`\`\``;
  }

  buildPrompt(
    systemPrompt: string,
    userPrompt: string,
    context: Record<string, any>,
    lastError: AgentError | null,
    conversationHistory: ChatEntry[],
    toolCallHistory: ToolResult[],
    keepRetry: boolean,
    finalToolName: string,
    toolDefinitions: string,
    options: PromptOptions,
    errorRecoveryInstructions?: string
  ): string {
    const sections: string[] = [];

    // 1. Styled system prompt
    sections.push(`🤖 ${systemPrompt}`);

    // 2. Format instructions
    sections.push(`# 📋 OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS\n${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}`);

    // 3. Tool definitions
    sections.push(`# 🛠️ AVAILABLE TOOLS\n${toolDefinitions}`);

    // 4. Context
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // 5. Conversation history
    if (options.includeConversationHistory && conversationHistory.length > 0) {
      sections.push(this.buildConversationSection(conversationHistory, options));
    }

    // 6. Tool call history
    if (options.includeToolHistory) {
      sections.push(this.buildToolHistorySection(toolCallHistory, options));
    }

    // 7. Error recovery
    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, lastError, keepRetry, errorRecoveryInstructions));
    }

    // 8. Custom sections
    if (options.customSections) {
      Object.entries(options.customSections).forEach(([name, content]) => {
        sections.push(`# ✨ ${name.toUpperCase()}\n${content}`);
      });
    }

    // 9. Current task
    sections.push(this.buildTaskSection(userPrompt, finalToolName));

    return sections.join('\n\n');
  }

  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `🎯 **CURRENT TASK**
"${userPrompt}"

💡 **Remember**: 
- 🔍 Check history first
- 🎯 Work step-by-step  
- ✅ Use '${finalToolName}' when done
- 🚀 Be efficient!`;
  }

  buildContextSection(context: Record<string, any>, options: PromptOptions): string {
    if (Object.keys(context).length === 0) {
      return '📄 **CONTEXT**: No additional context provided';
    }

    const contextItems = Object.entries(context)
      .map(([key, value]) => `  📌 **${key}**: ${JSON.stringify(value)}`)
      .join('\n');

    return `📄 **CONTEXT**\n${contextItems}`;
  }

  buildConversationSection(conversationHistory: ChatEntry[], options: PromptOptions): string {
    return `💬 **CONVERSATION HISTORY**\n${JSON.stringify(conversationHistory, null, 2)}`;
  }

  buildToolHistorySection(toolCallHistory: ToolResult[], options: PromptOptions): string {
    const entries = options.maxHistoryEntries
      ? toolCallHistory.slice(-options.maxHistoryEntries)
      : toolCallHistory;

    if (entries.length === 0) {
      return '📊 **TOOL HISTORY**: No previous tool calls';
    }

    const historyList = entries.map(entry =>
      `  ${entry.success ? '✅' : '❌'} **${entry.toolName}**: ${entry.success ? 'Success' : entry.error}`
    ).join('\n');

    const successCount = entries.filter(e => e.success).length;
    const failCount = entries.filter(e => !e.success).length;

    return `📊 **TOOL HISTORY** (${successCount} ✅, ${failCount} ❌)\n${historyList}`;
  }

  buildErrorRecoverySection(
    finalToolName: string,
    error: AgentError | null,
    keepRetry: boolean,
    errorRecoveryInstructions?: string
  ): string {
    if (!error) return '';

    const instruction = keepRetry
      ? "🔄 **Action**: Analyze the error and retry with improvements. Stay positive!"
      : `🛑 **Action**: Maximum retries reached. Use the '${finalToolName}' tool to show what you have and report status`;

    return `🚨 **ERROR RECOVERY**\n  ❌ **Error**: ${error.message}\n  ${instruction}`;
  }
}

/**
 * Weather agent using default template with XML format
 */
class WeatherAgentWithXmlFormat extends AgentLoop {
  protected systemPrompt = `🌤️ You are a professional weather assistant specialized in providing accurate, helpful weather information and advice.`;

  constructor(config: any) {
    const geminiProvider = new GeminiAIProvider(config);

    // Use default template with XML format
    const promptManager = new PromptManager(
      `🌤️ You are a professional weather assistant specialized in providing accurate, helpful weather information and advice.`,
      {
        responseFormat: ResponseFormat.XML,
        promptOptions: {
          includeContext: true,
          includeConversationHistory: true,
          includeToolHistory: true,
          maxHistoryEntries: 5,
          customSections: {
            "WEATHER_TIPS": "🌡️ Always consider providing weather-appropriate clothing or activity suggestions",
            "ACCURACY_NOTE": "📍 Weather data accuracy depends on location precision and current conditions"
          }
        },
        errorRecoveryInstructions: "🔄 Weather services can be unreliable. Try alternative approaches or inform the user about the limitation."
      }
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
      argsSchema: z.object({
        name: z.literal('get_weather'),
        location: z.string().describe('City and country/state'),
        units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
      }),
      handler: async (name: string, args: any) => {
        // Simulate weather API call
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
          success: true,
          data: {
            location: args.location,
            temperature: `${Math.floor(Math.random() * 30) + 5}°${args.units === 'fahrenheit' ? 'F' : 'C'}`,
            condition: ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)],
            humidity: `${Math.floor(Math.random() * 60) + 40}%`,
            windSpeed: `${Math.floor(Math.random() * 20) + 5} mph`
          }
        };
      }
    }));
  }
}

/**
 * Weather agent using custom emoji template
 */
class WeatherAgentWithCustomTemplate extends AgentLoop {
  protected systemPrompt = `🌤️ You are a professional weather assistant specialized in providing accurate, helpful weather information and advice.`;

  constructor(config: any) {
    const geminiProvider = new GeminiAIProvider(config);

    // Use custom emoji template
    const customTemplate = new EmojiPromptTemplate();
    const promptManager = new PromptManager(
      `🌤️ You are a professional weather assistant specialized in providing accurate, helpful weather information and advice.`,
      {
        customTemplate,
        promptOptions: {
          includeContext: true,
          includeConversationHistory: true,
          includeToolHistory: true,
          maxHistoryEntries: 5,
          customSections: {
            "WEATHER_TIPS": "🌡️ Remember to suggest appropriate clothing or activities!",
            "ACCURACY_NOTE": "📍 Weather data depends on location precision"
          }
        },
        errorRecoveryInstructions: "🔄 Weather services can be unreliable. Stay positive and try alternative approaches!"
      }
    );

    super(geminiProvider, {
      promptManager,
      maxIterations: 5
    });

    this.initializeTools();
  }

  private initializeTools(): void {
    // Same tools as the other agent
    this.defineTool((z) => ({
      name: 'get_weather',
      description: 'Get current weather conditions for a specific location',
      argsSchema: z.object({
        name: z.literal('get_weather'),
        location: z.string().describe('City and country/state'),
        units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
      }),
      handler: async (name: string, args: any) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          success: true,
          data: {
            location: args.location,
            temperature: `${Math.floor(Math.random() * 30) + 5}°${args.units === 'fahrenheit' ? 'F' : 'C'}`,
            condition: ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)],
            humidity: `${Math.floor(Math.random() * 60) + 40}%`,
            windSpeed: `${Math.floor(Math.random() * 20) + 5} mph`
          }
        };
      }
    }));
  }
}

/**
 * Function calling agent using default template with function calling format
 */
class WeatherAgentWithFunctionCalling extends AgentLoop {
  protected systemPrompt = `You are a professional weather assistant that uses function calling format.`;

  constructor(config: any) {
    const geminiProvider = new GeminiAIProvider(config);

    // Use default template with function calling format
    const promptManager = new PromptManager(
      `You are a professional weather assistant that uses function calling format.`,
      {
        responseFormat: ResponseFormat.FUNCTION_CALLING,
        promptOptions: {
          includeContext: true,
          includeConversationHistory: true,
          includeToolHistory: true,
          maxHistoryEntries: 5
        }
      }
    );

    super(geminiProvider, {
      promptManager,
      maxIterations: 5,
      executionMode: 'functionCalling' as any // Cast to avoid type issues
    });

    this.initializeTools();
  }

  private initializeTools(): void {
    // Same weather tool
    this.defineTool((z) => ({
      name: 'get_weather',
      description: 'Get current weather conditions for a specific location',
      argsSchema: z.object({
        name: z.literal('get_weather'),
        location: z.string().describe('City and country/state'),
        units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
      }),
      handler: async (name: string, args: any) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          success: true,
          data: {
            location: args.location,
            temperature: `${Math.floor(Math.random() * 30) + 5}°${args.units === 'fahrenheit' ? 'F' : 'C'}`,
            condition: ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)]
          }
        };
      }
    }));
  }
}

// Demo function to show different template approaches
export async function runCustomPromptDemo(config: any) {
  console.log('🎭 Streamlined Prompt Template Demo\n');

  try {
    // 1. Default template with XML format
    console.log('1️⃣ Testing Default Template (XML Format)...');
    const xmlAgent = new WeatherAgentWithXmlFormat(config);
    const xmlResult = await xmlAgent.run({
      userPrompt: "What's the weather like in Tokyo?",
      context: { timestamp: new Date().toISOString() },
      conversationHistory: [],
      toolCallHistory: []
    });
    console.log('✅ XML Format Result:', xmlResult.finalAnswer);

    // 2. Custom template (developer implements interface)
    console.log('\n2️⃣ Testing Custom Template (Emoji Style)...');
    const emojiAgent = new WeatherAgentWithCustomTemplate(config);
    const emojiResult = await emojiAgent.run({
      userPrompt: "What's the weather like in New York?",
      context: { timestamp: new Date().toISOString() },
      conversationHistory: [],
      toolCallHistory: []
    });
    console.log('✅ Custom Template Result:', emojiResult.finalAnswer);

    // 3. Default template with function calling format
    console.log('\n3️⃣ Testing Default Template (Function Calling Format)...');
    const functionAgent = new WeatherAgentWithFunctionCalling(config);
    const toolResult = await functionAgent.run({
      userPrompt: "What's the weather like in London?",
      context: { timestamp: new Date().toISOString() },
      conversationHistory: [],
      toolCallHistory: []
    });
    console.log('✅ Function Calling Result:', toolResult.finalAnswer);

    console.log('\n🎉 All template demos completed successfully!');
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Example factory functions for different use cases
export function createXmlPromptManager(): PromptManager {
  return new PromptManager(
    "You are a helpful assistant.",
    {
      responseFormat: ResponseFormat.XML,
      promptOptions: {
        includeContext: true,
        includeConversationHistory: true,
        includeToolHistory: true,
        maxHistoryEntries: 10
      }
    }
  );
}

export function createFunctionCallingPromptManager(): PromptManager {
  return new PromptManager(
    "You are a helpful assistant that uses function calling.",
    {
      responseFormat: ResponseFormat.FUNCTION_CALLING,
      promptOptions: {
        includeContext: true,
        includeConversationHistory: true,
        includeToolHistory: true,
        maxHistoryEntries: 10
      }
    }
  );
}

export function createCustomStyledPromptManager(): PromptManager {
  return new PromptManager(
    "🤖 You are a helpful and friendly assistant!",
    {
      customTemplate: new EmojiPromptTemplate(),
      promptOptions: {
        includeContext: true,
        includeConversationHistory: true,
        includeToolHistory: true,
        maxHistoryEntries: 5,
        customSections: {
          'Style Guide': '✨ Always be friendly and use emojis!'
        }
      },
      errorRecoveryInstructions: "🔄 Stay positive and try again!"
    }
  );
}

export function createMinimalPromptManager(): PromptManager {
  return new PromptManager(
    "You are a helpful assistant.",
    {
      responseFormat: ResponseFormat.XML,
      promptOptions: {
        includeContext: false,
        includeConversationHistory: false,
        includeToolHistory: true,
        maxHistoryEntries: 3
      }
    }
  );
}

// Export the classes and template for developers to use
export {
  EmojiPromptTemplate,
  WeatherAgentWithXmlFormat,
  WeatherAgentWithCustomTemplate,
  WeatherAgentWithFunctionCalling
};