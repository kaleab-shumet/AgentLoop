import readline from 'readline';
import { AgentLoop, AgentLoopOptions } from '../core/agents/AgentLoop';
import { ToolResult, ChatEntry } from '../core/types/types';
import { AIProvider } from '../core/providers/AIProvider';
import z from 'zod';
import { exec } from 'child_process';

function executeCommandLine(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        // Resolve with the error message and stderr, as this is often useful output
        resolve(`Error executing command: ${error.message}\n${stderr}`);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}

/**
 * An example agent that interacts with the Windows command line.
 * The developer extends AgentLoop and focuses on the agent's purpose and tools,
 * not the underlying communication format with the LLM.
 */
class CommandLineAgent extends AgentLoop {
    private conversationHistory: ChatEntry[] = [];

    /**
     * The system prompt is now clean and high-level. It defines the agent's persona
     * and core objective without any mention of XML, schemas, or output formats.
     * The framework handles those details automatically.
     */
    protected systemPrompt: string = `
You are a helpful and efficient command-line interface agent for Microsoft Windows. 
Your primary goal is to assist the user by executing commands and performing web searches to accomplish their tasks. 
When the user's request requires multiple steps, you must call the necessary tools in sequence.
Do not ask for clarification. Take the most direct action to fulfill the request.`;

    constructor(provider: AIProvider, options: AgentLoopOptions = {}) {
        super(provider, options);

        this.defineTool((z) => ({
          name: 'commandline',
          description: 'Executes a command on the Windows command line and returns the output. Use this for file system operations, running scripts, or any other command-line task.',
          responseSchema: z.object({
            value: z.string().describe("The complete Windows command line command to execute"),
          }),
          handler: async (name: string, args: any) => {
            const output = await executeCommandLine(args.value);
            return {
              toolname: name,
              success: true,
              output,
            };
          },
        }));

        this.defineTool((z) => ({
          name: 'websearch',
          description: 'Performs a web search to find information or answer questions. Use this when you need up-to-date information or knowledge beyond your internal capabilities.',
          responseSchema: z.object({
            query: z.string().describe('The specific search query to use for the web search'),
            url: z.string().url().optional().describe('If the user provides a URL, include it here.'),
          }),
          handler: (name: string, args: any) => ({
            toolname: name,
            success: true,
            output: `Simulated web search for "${args.query}" ${args.url ? 'at ' + args.url : ''} was successful.`,
          }),
        }));
    }

    getConversationHistory(): ChatEntry[] {
        return this.conversationHistory;
    }

    /**
     * Handles tool call failures. This is where a developer can add custom logic
     * for logging, retrying, or notifying the user.
     * @param error The structured AgentError with context about the failure.
     * @returns A ToolResult object representing the failure.
     */
    onToolCallFail(error: any): ToolResult {
        // Log the rich error context for easier debugging
        this.logger.error(`[CommandLineAgent.onToolCallFail] Tool call failed for tool '${error.toolname || 'unknown'}'.`, error);
        return {
            toolname: error.toolname || 'unknown',
            success: false,
            error: error.message || 'Unknown error',
            errorContext: error.context || {}
        };
    }

    /**
     * Handles successful tool calls.
     * @param toolResult The result from the successful tool execution.
     * @returns The same toolResult, possibly with added metadata.
     */
    onToolCallSuccess(toolResult: ToolResult): ToolResult {
        this.logger.info(`[CommandLineAgent.onToolCallSuccess] Tool '${toolResult.toolname}' executed successfully.`);
        return toolResult;
    }
}

// --- CLI Application Logic ---
console.log("Command Line Agent Initialized");
console.log('Type "exit" to quit.');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Mock AI Provider for demo - replace with actual provider
class MockAIProvider implements AIProvider {
    async getCompletion(prompt: string): Promise<string> {
        return `Mock response for prompt: ${prompt.slice(0, 50)}...`;
    }
}

const agent = new CommandLineAgent(
    new MockAIProvider(),
    {
        maxIterations: 10,
        toolTimeoutMs: 5000,
    }
);

function promptUser() {
  rl.question('User > ', async (answer: string) => {
    if (answer.trim().toLowerCase() === 'exit') {
      console.log('Exiting...');
      rl.close();
      return;
    }

    try {
      // The agent run is now a self-contained, robust process.
      const result = await agent.run({
        userPrompt: answer,
        conversationHistory: agent.getConversationHistory(),
        toolCallHistory: []
      });
      console.log('\n--- Agent Final Output ---');
      // The final result from the 'final' tool is in the 'value' property.
      console.log(result.finalAnswer?.output?.value || 'Agent completed its work.');
      console.log('--------------------------\n');
    } catch (e: any) {
      console.error('\n--- Agent Run Failed ---');
      console.error(`Error: ${e.message}`);
      if (e.context) {
        console.error('Context:', JSON.stringify(e.context, null, 2));
      }
      console.error('------------------------\n');
    }

    promptUser();
  });
}

promptUser();