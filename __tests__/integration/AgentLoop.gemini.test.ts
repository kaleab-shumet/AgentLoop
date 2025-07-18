// Clean Gemini integration test with one simple tool
import { AgentLoop, AgentLoopOptions } from '../../core/agents/AgentLoop';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { FormatMode } from '../../core/types/types';
import { TurnState } from '../../core/agents/TurnState';
import { ToolResult } from '../../core/types/types';
import z from 'zod';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Minimal test agent with ONE simple tool
 */
class SimpleTestAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful assistant. Use the provided tool to complete tasks.
When done, use the final tool to summarize what you accomplished.`;

  constructor(provider: DefaultAIProvider) {
    super(provider, {
      maxIterations: 3,
      formatMode: FormatMode.FUNCTION_CALLING
    });

    // Define ONE simple tool only
    this.defineAddTool();
  }

  private defineAddTool() {
    this.defineTool((z) => ({
      name: 'add_numbers',
      description: 'Add two numbers together',
      argsSchema: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number')
      }),
      handler: async (name: string, args: { a: number, b: number }, turnState: TurnState): Promise<ToolResult> => {
        const { a, b } = args;
        const result = a + b;

        return {
          toolName: name,
          success: true,
          output: {
            first: a,
            second: b,
            sum: result,
            operation: `${a} + ${b} = ${result}`
          }
        };
      }
    }));
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const conditionalDescribe = GEMINI_API_KEY ? describe : describe.skip;

conditionalDescribe('Simple Gemini Test - One Tool Only', () => {
  let provider: DefaultAIProvider;
  let agent: SimpleTestAgent;

  beforeAll(() => {
    if (!GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY not found. Skipping test.');
      return;
    }

    console.log('🧪 Testing ONE simple tool with Gemini...');
    
    provider = new DefaultAIProvider({
      service: 'google',
      apiKey: GEMINI_API_KEY,
      model: 'gemini-1.5-flash',
      temperature: 0,
      max_tokens: 100
    });

    agent = new SimpleTestAgent(provider);
  });

  it('should add two numbers using Gemini API', async () => {
    console.log('🧪 Starting AgentLoop test...');
    
    const result = await agent.run({
      userPrompt: 'Add 5 and 3',
      conversationHistory: [],
      toolCallHistory: [],
      context: {}
    });

    console.log('✅ AgentLoop completed');
    console.log('📊 Tool calls:', result.toolCallHistory.length);
    console.log('🎯 Final answer success:', result.finalAnswer?.success);

    expect(result.finalAnswer).toBeDefined();
    expect(result.finalAnswer?.success).toBe(true);
    
    const addCall = result.toolCallHistory.find(t => t.toolName === 'add_numbers' && t.success);
    expect(addCall).toBeDefined();
    expect(addCall?.output?.sum).toBe(8);
    expect(addCall?.output?.first).toBe(5);
    expect(addCall?.output?.second).toBe(3);
  }, 30000);
});