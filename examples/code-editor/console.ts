import * as readline from 'readline';
import { CodeEditorAgent } from './CodeEditorAgent';

class CodeEditorConsole {
  private agent: CodeEditorAgent;
  private rl: readline.Interface;
  private basePath: string;

  constructor() {
    // Default to current working directory or allow override
    this.basePath = process.argv[2] || process.cwd();
    console.log(`🚀 Code Editor Agent starting in: ${this.basePath}`);
    
    this.agent = new CodeEditorAgent(this.basePath);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '💻 Code Editor> '
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.rl.on('line', async (input) => {
      const command = input.trim();
      
      if (!command) {
        this.rl.prompt();
        return;
      }

      if (command === 'exit' || command === 'quit') {
        console.log('👋 Goodbye!');
        this.rl.close();
        process.exit(0);
      }

      if (command === 'help') {
        this.showHelp();
        this.rl.prompt();
        return;
      }

      if (command === 'clear') {
        console.clear();
        this.rl.prompt();
        return;
      }

      await this.processUserRequest(command);
    });

    this.rl.on('close', () => {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    });
  }

  private async processUserRequest(userInput: string): Promise<void> {
    const startTime = Date.now();
    console.log(`[DEBUG] Start time: ${startTime}`);
    
    try {
      console.log(`\n🤖 Processing: "${userInput}"\n`);
      
      const result = await this.agent.run({
        userPrompt: userInput,
        prevInteractionHistory: []
      });

      const endTime = Date.now();
      console.log(`[DEBUG] End time: ${endTime}`);
      const duration = endTime - startTime;
      console.log(`[DEBUG] Duration: ${duration}`);
      
      if (result.agentResponse && !result.agentResponse.error) {
        console.log('✅ Task completed successfully!\n');
        
        // Display the final response from final_tool
        if (result.agentResponse.context && typeof result.agentResponse.context === 'object' && 'value' in result.agentResponse.context) {
          console.log('📋 Summary:');
          console.log(result.agentResponse.context.value);
          console.log();
        } else if (result.agentResponse.context) {
          console.log('📋 Summary:');
          const context = typeof result.agentResponse.context === 'string' 
            ? result.agentResponse.context 
            : JSON.stringify(result.agentResponse.context);
          console.log(context);
          console.log();
        }

        // Show tool execution results
        if (result.interactionHistory.length > 0) {
          const lastInteraction = result.interactionHistory[result.interactionHistory.length - 1];
          if ('toolCalls' in lastInteraction && lastInteraction.toolCalls) {
            this.displayToolResults(lastInteraction.toolCalls);
          }
        }
      } else {
        console.log('❌ Task failed:');
        console.log(result.agentResponse?.error || 'Unknown error');
      }

      console.log(`⏱️  Completed in ${this.formatDuration(duration)}\n`);

    } catch (error) {
      console.log('💥 Error occurred:');
      console.log(error instanceof Error ? error.message : String(error));
      console.log();
    }

    this.rl.prompt();
  }

  private displayToolResults(toolCalls: any[]): void {
    const successfulCalls = toolCalls.filter(tc => tc.context.success);
    const failedCalls = toolCalls.filter(tc => !tc.context.success);

    if (successfulCalls.length > 0) {
      console.log(`🔧 Tools executed (${successfulCalls.length} successful):`);
      successfulCalls.forEach(tc => {
        console.log(`  ✅ ${tc.context.toolName}`);
        
        // File operation results
        if (tc.result.filepath) {
          console.log(`     📁 ${tc.result.filepath}`);
        }
        if (tc.result.size !== undefined) {
          console.log(`     📏 ${tc.result.size} bytes`);
        }
        
        // Command execution results
        if (tc.context.toolName === 'execute_command') {
          console.log(`     💻 ${tc.result.command}`);
          if (tc.result.exitCode !== undefined) {
            console.log(`     🔢 Exit code: ${tc.result.exitCode}`);
          }
          if (tc.result.output && tc.result.output.length > 0) {
            const output = tc.result.output.length > 200 
              ? tc.result.output.substring(0, 200) + '...' 
              : tc.result.output;
            console.log(`     📤 Output: ${output}`);
          }
        }
      });
      console.log();
    }

    if (failedCalls.length > 0) {
      console.log(`❌ Failed tools (${failedCalls.length}):`);
      failedCalls.forEach(tc => {
        console.log(`  ❌ ${tc.context.toolName}: ${tc.context.error || 'Unknown error'}`);
        
        // Show command execution errors with more detail
        if (tc.context.toolName === 'execute_command' && tc.result.stderr) {
          const stderr = tc.result.stderr.length > 200 
            ? tc.result.stderr.substring(0, 200) + '...' 
            : tc.result.stderr;
          console.log(`     🚨 Error output: ${stderr}`);
        }
      });
      console.log();
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  private showHelp(): void {
    console.log(`
🚀 Code Editor Agent - Help

Commands:
  help     - Show this help message
  clear    - Clear the console
  exit     - Exit the application

Examples:
  "Create a React component called Button"
  "Initialize a new Node.js project and install dependencies" 
  "Read the package.json file and run npm test"
  "Create a TypeScript function and run the build command"
  "Search for TODO comments and run eslint to fix issues"
  "Set up a Git repository and make the first commit"
  "Install Express and create a basic API server"

Features:
  ✅ Create, read, edit, delete files and directories
  ✅ Execute shell commands (npm, git, build tools, etc.)
  ✅ Search file contents and names
  ✅ Handle multiple programming languages
  ✅ Follow coding best practices
  ✅ Maintain project structure and run development workflows

Current working directory: ${this.basePath}
`);
  }

  public start(): void {
    console.log(`
🎯 Welcome to Code Editor Agent!

This AI agent can help you with:
• Creating and editing files
• Managing project structure  
• Reading and analyzing code
• Searching through codebases
• Following coding best practices

Type 'help' for more information or start by describing what you'd like to do.
`);
    this.rl.prompt();
  }
}

// Start the console if this file is run directly
if (require.main === module) {
  const console_app = new CodeEditorConsole();
  console_app.start();
}

export { CodeEditorConsole };