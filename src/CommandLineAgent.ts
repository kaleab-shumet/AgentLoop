import readline from 'readline';
import { AgentLoop, AgentLoopOptions } from './AgentLoop/AgentLoop';
import { ToolResult, ChatEntry } from './AgentLoop/types';
import { LLMDataHandler } from './AgentLoop/LLMDataHandler';
import z from 'zod';
import { exec } from 'child_process';

function executeCommandLine(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve(`Error: ${error.message}\n${stderr}`);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}

class CommandLineAgent extends AgentLoop {
    private conversationHistory: ChatEntry[] = [];

    protected systemPrompt: string = `
You are a command-line interface agent for Windows. You will be provided with a tool schema in XSD format. Your task is to generate Windows commands and web searches that produce output in XML format.

When the user request requires multiple actions, you must call multiple tools.
Output all tool calls as children under a single <root> XML tag. Do not use attributes on any XML tags; use nested elements for all data.

Example:
<root>
  <tool>...</tool>
  <tool>...</tool>
</root>

The output XML must strictly follow this structure.
`;

    constructor(llmDataHandler: LLMDataHandler, options: AgentLoopOptions) {
        super(llmDataHandler, options);
        

        this.defineTool({
          name: 'commandline',
          description: 'Provide the command line command and related metadata',
          responseSchema: z.object({
            name: z.string().describe("The name of the tool"),
            value: z.string().describe("The command line command to execute"),
         }),
          handler: async (name: string, args, toolChainData) => {
            const output = await executeCommandLine(args.value);
            return {
              toolname: name,
              success: true,
              output,
            };
          },
        });

        // Add a web search tool
        this.defineTool({
          name: 'websearch',
          description: 'Perform a web search and return the top result URL.',
          responseSchema: z.object({
            name: z.string().describe("The name of the tool"),
            query: z.string().describe('The search query'),
            url: z.string().url().optional().describe('If the user give you a url provide it here, it should be regular url with http/https'),
          }),
          handler: (name: string, args, toolChainData) => ({
            toolname: name,
            success: true,
            output: `Web search for "${args.query}"${args.url ? ': ' + args.url : ''}`,
          }),
        });
        
    }

    getConversationHistory(): ChatEntry[] {
        return this.conversationHistory;
    }

    onToolCallFail(error: any): ToolResult {
        return {
            toolname: error.toolname || 'unknown',
            success: false,
            error: error.message || 'Unknown error'
        };
    }

    onToolCallSuccess(toolResult: ToolResult): ToolResult {
        return toolResult;
    }
}

// CLI logic
console.log("Command line Agent");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const agent = new CommandLineAgent(
    new LLMDataHandler(),
    {
        maxIterations: 10,
    }
);

function prompt() {
  rl.question('Enter command (type "exit" to quit): ', async (answer: string) => {
    if (answer.trim().toLowerCase() === 'exit') {
      console.log('Exiting...');
      rl.close();
      return;
    }
    try {
      const result = await agent.run(answer);
      console.log('Agent output:', result.output || result);
    } catch (e) {
      console.error('Error:', e);
    }
    prompt();
  });
}

prompt();

// Instead, automatically send a 'list directory' command to the agent
// (async () => {
//     try {
//         const result = await agent.run('I want open notepad, then search for latest ai news in https://techcrunch.com/category/artificial-intelligence/');
//         console.log('Agent output:', result.output || result);
//     } catch (e) {
//         console.error('Error:', e);
//     } finally {
//         rl.close();
//     }
// })();