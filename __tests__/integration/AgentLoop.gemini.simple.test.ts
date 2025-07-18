// Simple Gemini test without arrays to isolate the issue
import { AgentLoop, AgentLoopOptions } from '../../core/agents/AgentLoop';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { FormatMode } from '../../core/types/types';
import { TurnState } from '../../core/agents/TurnState';
import { ToolResult } from '../../core/types/types';
import z from 'zod';
import dotenv from 'dotenv';
dotenv.config();

class SimpleGeminiTestAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful test assistant. Use the provided tools to complete tasks accurately.
When you complete a task, use the final tool with a clear summary of what was accomplished.`;

  constructor(provider: DefaultAIProvider, options: AgentLoopOptions = {}) {
    super(provider, {
      maxIterations: 3,
      formatMode: FormatMode.FUNCTION_CALLING,
      ...options
    });

    // Only define simple tools without arrays
    this.defineCalculatorTool();
    this.defineGreetingTool();
  }

  private defineCalculatorTool() {
    this.defineTool((z) => ({
      name: 'calculate',
      description: 'Perform basic mathematical calculations',
      argsSchema: z.object({
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The mathematical operation to perform'),
        a: z.number().describe('First number'),
        b: z.number().describe('Second number')
      }),
      handler: async (name: string, args: { operation: string, a: number, b: number }, turnState: TurnState): Promise<ToolResult> => {
        const { operation, a, b } = args;
        let result: number;

        switch (operation) {
          case 'add':
            result = a + b;
            break;
          case 'subtract':
            result = a - b;
            break;
          case 'multiply':
            result = a * b;
            break;
          case 'divide':
            if (b === 0) {
              return {
                toolName: name,
                success: false,
                error: 'Division by zero is not allowed'
              };
            }
            result = a / b;
            break;
          default:
            return {
              toolName: name,
              success: false,
              error: `Unknown operation: ${operation}`
            };
        }

        return {
          toolName: name,
          success: true,
          output: {
            operation,
            operands: [a, b],
            result,
            formatted: `${a} ${operation === 'add' ? '+' : operation === 'subtract' ? '-' : operation === 'multiply' ? '×' : '÷'} ${b} = ${result}`
          }
        };
      }
    }));
  }

  private defineGreetingTool() {
    this.defineTool((z) => ({
      name: 'greet_user',
      description: 'Generate a personalized greeting for a user',
      argsSchema: z.object({
        name: z.string().describe('The name of the user to greet'),
        language: z.enum(['english', 'spanish', 'french']).optional().describe('Language for the greeting')
      }),
      handler: async (name: string, args: { name: string, language?: string }, turnState: TurnState): Promise<ToolResult> => {
        const { name: userName, language = 'english' } = args;
        
        const greetings = {
          english: `Hello, ${userName}! Welcome to our test system.`,
          spanish: `¡Hola, ${userName}! Bienvenido a nuestro sistema de prueba.`,
          french: `Bonjour, ${userName}! Bienvenue dans notre système de test.`
        };

        return {
          toolName: name,
          success: true,
          output: {
            user: userName,
            language,
            greeting: greetings[language as keyof typeof greetings]
          }
        };
      }
    }));
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const conditionalDescribe = GEMINI_API_KEY ? describe : describe.skip;

conditionalDescribe('Simple Gemini Integration Test', () => {
  let provider: DefaultAIProvider;
  let agent: SimpleGeminiTestAgent;

  beforeAll(() => {
    if (!GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY not found. Skipping Gemini integration tests.');
      return;
    }

    console.log('🚀 Running simple Gemini integration test...');
    
    provider = new DefaultAIProvider({
      service: 'google',
      apiKey: GEMINI_API_KEY,
      model: 'gemini-1.5-flash',
      temperature: 0.1,
      max_tokens: 200
    });

    agent = new SimpleGeminiTestAgent(provider, {
      maxIterations: 3,
      toolTimeoutMs: 10000,
      sleepBetweenIterationsMs: 500
    });
  });

  it('should perform simple calculation without arrays', async () => {
    const result = await agent.run({
      userPrompt: 'Add 5 and 3',
      conversationHistory: [],
      toolCallHistory: [],
      context: {}
    });

    expect(result.finalAnswer).toBeDefined();
    expect(result.finalAnswer?.success).toBe(true);
    
    const calculation = result.toolCallHistory.find(t => t.toolName === 'calculate' && t.success);
    expect(calculation).toBeDefined();
    expect(calculation?.output?.result).toBe(8);
  }, 15000);

  it('should generate greeting without arrays', async () => {
    const result = await agent.run({
      userPrompt: 'Greet Bob in English',
      conversationHistory: [],
      toolCallHistory: [],
      context: {}
    });

    expect(result.finalAnswer).toBeDefined();
    expect(result.finalAnswer?.success).toBe(true);
    
    const greeting = result.toolCallHistory.find(t => t.toolName === 'greet_user' && t.success);
    expect(greeting).toBeDefined();
    expect(greeting?.output?.user).toBe('Bob');
    expect(greeting?.output?.language).toBe('english');
  }, 15000);
});