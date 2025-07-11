// NewsWeatherAgent.ts

import { AgentLoop, AgentConfig } from './AgentLoop/AgentLoop';
import { AgentError } from './AgentLoop/AgentError';
import { ToolResult } from './AgentLoop/types';

export class NewsWeatherAgent extends AgentLoop {
  protected systemPrompt = `
You are a news and weather assistant. You help users get both weather information for specific locations and provide news updates.

Your capabilities include:
- Getting current weather conditions
- Providing weather forecasts
- Giving weather-related advice
- Suggesting appropriate clothing or activities based on weather
- Providing news updates based on user queries (topics, locations, or general news)

Users may ask about the weather, the news, or both in a single request. Always respond helpfully, accurately, and provide detailed information when available. If a request involves both weather and news, handle both parts in your response.
`;


  private failcount: number = 0;

  constructor(config: AgentConfig) {
    super(config, {
      maxIterations: 15,
      toolTimeoutMs: 30000,
      retryAttempts: 5,
      parallelExecution: false,
    });

    this.initializeTools();
  }

  private initializeTools(): void {
    // Weather lookup tool
    this.defineTool((schema) => ({
      name: 'get_weather',
      description: 'Get current weather conditions for a specific location',
      responseSchema: schema.object({
        location: schema.string().describe('The city and country/state'),
        units: schema.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
      }),
      handler: this.getWeatherHandler.bind(this),
    }));

    // Weather forecast tool
    this.defineTool((schema) => ({
      name: 'get_forecast',
      description: 'Get weather forecast for a specific location',
      responseSchema: schema.object({
        location: schema.string().describe('The city and country/state'),
        days: schema.number().min(1).max(7).optional().default(5),
        units: schema.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
      }),
      handler: this.getForecastHandler.bind(this),
    }));

    // Weather advice tool
    this.defineTool((schema) => ({
      name: 'weather_advice',
      description: 'Provide weather-related advice based on conditions',
      responseSchema: schema.object({
        weather_condition: schema.string().describe('Current weather condition'),
        temperature: schema.number().describe('Temperature in degrees'),
        activity: schema.string().optional().describe('Specific activity user is planning'),
      }),
      handler: this.getWeatherAdviceHandler.bind(this),
    }));

    // News tool
    this.defineTool((schema) => ({
      name: 'get_news',
      description: 'Get news updates based on a query (e.g., topic, location)',
      responseSchema: schema.object({
        query: schema.string().describe('The news topic or location to search for'),
      }),
      handler: this.getNewsHandler.bind(this),
    }));
  }

  private async getWeatherHandler(name: string, args: any): Promise<ToolResult> {
    try {

      if(this.failcount < 5){
        this.failcount++;
        throw new Error("Error Occured, unable to get weather");
      }

      // Simulate API call to weather service
      await this.sleep(1000);

      const mockWeatherData = {
        location: args.location,
        temperature: 22,
        condition: 'Partly cloudy',
        humidity: 65,
        windSpeed: 12,
        units: args.units,
      };

      return {
        toolname: name,
        success: true,
        output: mockWeatherData,
      };
    } catch (error: any) {
      return {
        toolname: name,
        success: false,
        error: `Failed to get weather for ${args.location}: ${error.message}`,
      };
    }
  }

  private async getForecastHandler(name: string, args: any): Promise<ToolResult> {
    try {
      await this.sleep(1500);

      const mockForecast = Array.from({ length: args.days }, (_, i) => ({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        temperature: 20 + Math.random() * 10,
        condition: ['Sunny', 'Partly cloudy', 'Cloudy', 'Rainy'][Math.floor(Math.random() * 4)],
      }));

      return {
        toolname: name,
        success: true,
        output: { location: args.location, forecast: mockForecast },
      };
    } catch (error: any) {
      return {
        toolname: name,
        success: false,
        error: `Failed to get forecast for ${args.location}: ${error.message}`,
      };
    }
  }

  private async getWeatherAdviceHandler(name: string, args: any): Promise<ToolResult> {
    try {
      let advice = '';

      if (args.weather_condition.toLowerCase().includes('rain')) {
        advice = 'Take an umbrella and wear waterproof clothing.';
      } else if (args.temperature > 25) {
        advice = 'Wear light, breathable clothing and stay hydrated.';
      } else if (args.temperature < 5) {
        advice = 'Dress warmly in layers and protect exposed skin.';
      } else {
        advice = 'The weather looks pleasant. Dress comfortably for the temperature.';
      }

      if (args.activity) {
        if (args.activity.toLowerCase().includes('outdoor')) {
          advice += ' For outdoor activities, ';
          if (args.weather_condition.toLowerCase().includes('sunny')) {
            advice += 'consider sunscreen and a hat.';
          } else if (args.weather_condition.toLowerCase().includes('wind')) {
            advice += 'secure loose items and dress for wind protection.';
          }
        }
      }

      return {
        toolname: name,
        success: true,
        output: { advice, condition: args.weather_condition, temperature: args.temperature },
      };
    } catch (error: any) {
      return {
        toolname: name,
        success: false,
        error: `Failed to generate weather advice: ${error.message}`,
      };
    }
  }

  private async getNewsHandler(name: string, args: any): Promise<ToolResult> {
    try {
      // Simulate API call to news service
      await this.sleep(800);
      let mockNews;
      if (args.query.toLowerCase().includes('ai')) {
        mockNews = [
          {
            headline: "OpenAI Unveils GPT-5: Next Generation Language Model Announced",
            summary: "OpenAI has announced GPT-5, its most advanced language model to date, featuring improved reasoning and multilingual capabilities. The company says the new model will be available to developers later this year.",
            url: "https://news.example.com/openai-gpt5-announcement",
          },
          {
            headline: "AI Startups See Surge in Investment in 2024",
            summary: "Venture capital funding for AI startups has reached record highs in 2024, with investors focusing on generative AI and automation technologies.",
            url: "https://news.example.com/ai-investment-2024",
          },
        ];
      } else if (args.query.toLowerCase().includes('iceland')) {


        if (this.failcount < 3) {
          this.failcount++
          throw new Error("Unable to fetch")
        }


        mockNews = [
          {
            headline: "Iceland Launches Ambitious Renewable Energy Project",
            summary: "The Icelandic government has announced a new initiative to expand geothermal and hydroelectric power, aiming to make the country carbon negative by 2030.",
            url: "https://news.example.com/iceland-renewable-energy",
          },
          {
            headline: "Tourism in Iceland Rebounds Strongly in 2024",
            summary: "After a challenging period, Iceland's tourism sector is seeing a strong recovery, with visitor numbers surpassing pre-pandemic levels.",
            url: "https://news.example.com/iceland-tourism-2024",
          },
        ];
      } else {
        mockNews = [
          {
            headline: `Latest news for '${args.query}'`,
            summary: `This is a recent news summary for '${args.query}'.`,
            url: 'https://news.example.com/latest-story',
          },
          {
            headline: `Another headline about '${args.query}'`,
            summary: `Another recent news summary for '${args.query}'.`,
            url: 'https://news.example.com/another-story',
          },
        ];
      }
      return {
        toolname: name,
        success: true,
        output: { query: args.query, articles: mockNews },
      };
    } catch (error: any) {
      return {
        toolname: name,
        success: false,
        error: `Failed to get news for ${args.query}: ${error.message}`,
      };
    }
  }

  // Change from private to protected
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Required abstract method implementations
  public onToolCallFail(error: AgentError): ToolResult {
    this.logger.error(`[NewsWeatherAgent] Tool call failed: ${error.message}`, error.context);
    return {
      toolname: error.context.toolName || 'unknown',
      success: false,
      error: error.getUserMessage(),
      context: error.context,
    };
  }

  public onToolCallSuccess(toolResult: ToolResult): ToolResult {
    this.logger.info(`[NewsWeatherAgent] Tool call succeeded: ${toolResult.toolname}`);
    return toolResult;
  }
}


const newsWeatherAgent = new NewsWeatherAgent({
  apiKey: process.env.GEMINI_API_KEY || 'AIzaSyBBvprrxsMRaS7I1RTrX7IhH8-qBWs_S7A',
  model: 'gemini-2.0-flash',
  service: 'google',
  temperature: 0.7,
});

// Run the agent
async function runNewsWeatherAgent() {
  try {
    const result = await newsWeatherAgent.run(
      "Can you tell me news about AI, and news about the country Iceland, also tell me about weather of newyork"
    );

    console.log('Agent Result:', result);
  } catch (error) {
    console.error('Agent Error:', error);
  }
}

runNewsWeatherAgent();