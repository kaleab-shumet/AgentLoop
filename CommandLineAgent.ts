import readline from 'readline';
import { AgentLoop, AgentLoopOptions } from './AgentLoop/AgentLoop';
import { ToolResult, ChatEntry } from './AgentLoop/types';
import { LLMDataHandler } from './AgentLoop/LLMDataHandler';
import z from 'zod';

class CommandLineAgent extends AgentLoop {
    private conversationHistory: ChatEntry[] = [];

    protected systemPrompt: string = `
You are a command-line interface agent for Windows. You will be provided with a tool schema in XSD format. Your task is to generate Windows commands and web searches that produce output in XML format.

When the user request requires multiple actions, you must call multiple tools.
Output all tool calls as children under a single <root> XML tag. Do not use attributes on any XML tags; use nested elements for all data.

Example:
<root>
  <tool>
    <name>commandline</name>
    <value>notepad</value>
  </tool>
  <tool>
    <name>websearch</name>
    <query>latest ai news</query>
    <url>https://techcrunch.com/category/artificial-intelligence/</url>
  </tool>
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
            shell: z.string().optional().describe("The shell or environment used (e.g., bash, powershell)"),
            description: z.string().optional().describe("A human-readable description of what this command does"),
            arguments: z.array(z.string()).optional().describe("List of command-line arguments used in the command"),
            flags: z.record(z.string(), z.boolean()).optional().describe("Flags or options used in the command with boolean presence"),
            workingDirectory: z.string().optional().describe("The directory from which the command should be executed"),
            requiresElevation: z.boolean().optional().describe("Whether the command requires elevated (e.g., root or admin) privileges"),
            os: z.enum(['linux', 'windows', 'macos']).optional().describe("Target operating system for the command"),
            estimatedRunTime: z.string().optional().describe("Rough estimate of how long the command will take (e.g., '5s', '2m')"),
            tags: z.array(z.string()).optional().describe("Tags or categories for classifying the command (e.g., 'networking', 'filesystem')"),
          }),
          handler: (name: string, args, toolChainData) => ({
            toolname: name,
            success: true,
            output: args.value, // could expand to include metadata if needed
          }),
        });

        // Add a web search tool
        this.defineTool({
          name: 'websearch',
          description: 'Perform a web search and return the top result URL.',
          responseSchema: z.object({

            name: z.string().describe("The name of the tool"),
            query: z.string().describe('The search query'),
            url: z.string().url().optional().describe('If the user give you a url provide it here'),
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

// Commented out user input prompt for now
// function prompt() {
//   rl.question('Enter command (type "exit" to quit): ', async (answer: string) => {
//     if (answer.trim().toLowerCase() === 'exit') {
//       console.log('Exiting...');
//       rl.close();
//       return;
//     }
//     try {
//       const result = await agent.run(answer);
//       console.log('Agent output:', result.output || result);
//     } catch (e) {
//       console.error('Error:', e);
//     }
//     prompt();
//   });
// }

// prompt();

// Instead, automatically send a 'list directory' command to the agent
(async () => {
    try {
        const result = await agent.run('I want open notepad, then search for latest ai news in https://techcrunch.com/category/artificial-intelligence/');
        console.log('Agent output:', result.output || result);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        rl.close();
    }
})();