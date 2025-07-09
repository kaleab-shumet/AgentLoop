// WeatherForcastAgent.ts

import { AgentLoop, AgentConfig } from './AgentLoop/AgentLoop';
import { AgentError } from './AgentLoop/AgentError';
import { ToolResult } from './AgentLoop/types';

export class WeatherForcastAgent extends AgentLoop {
  protected systemPrompt = `
You are a weather forecast assistant. You help users get weather information for specific locations.

Your capabilities include:
- Getting current weather conditions
- Providing weather forecasts
- Giving weather-related advice
- Suggesting appropriate clothing or activities based on weather

Always be helpful, accurate, and provide detailed weather information when available.
`;

  constructor(config: AgentConfig) {
    super(config, {
      maxIterations: 15,
      toolTimeoutMs: 30000,
      retryAttempts: 3,
    });

    this.initializeTools();
  }

  private initializeTools(): void {
    // Weather lookup tool
    this.defineTool((schema) => ({
      name: 'get_weather',
      description: 'Get current weather conditions for a specific location',
      // FIX: The 'name' property is no longer required here; it's added automatically.
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
      // FIX: The 'name' property is no longer required here.
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
  }

  private async getWeatherHandler(name: string, args: any): Promise<ToolResult> {
    try {
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

  // Change from private to protected
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Required abstract method implementations
  public onToolCallFail(error: AgentError): ToolResult {
    this.logger.error(`[WeatherForecastAgent] Tool call failed: ${error.message}`, error.context);
    return {
      toolname: error.context.toolName || 'unknown',
      success: false,
      error: error.getUserMessage(),
      context: error.context,
    };
  }

  public onToolCallSuccess(toolResult: ToolResult): ToolResult {
    this.logger.info(`[WeatherForecastAgent] Tool call succeeded: ${toolResult.toolname}`);
    return toolResult;
  }
}


const weatherAgent = new WeatherForcastAgent({
  apiKey: process.env.GEMINI_API_KEY || 'AIzaSyBBvprrxsMRaS7I1RTrX7IhH8-qBWs_S7A',
  model: 'gemini-2.5-flash',
  service: 'google',
  temperature: 0.7,
});

// Run the agent
async function runWeatherAgent() {
  try {
    const result = await weatherAgent.run(
      "What's the weather like in New York today? Should I bring an umbrella for my outdoor meeting?"
    );

    console.log('Agent Result:', result);
  } catch (error) {
    console.error('Agent Error:', error);
  }
}

runWeatherAgent();