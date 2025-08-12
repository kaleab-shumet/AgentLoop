import { CodeEditorAgent } from './code-editor-agent';
import { Interaction } from '../core/types/types';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

/**
 * Interactive Console for Code Editor Agent
 * 
 * Full-featured file management console with:
 * - Natural language commands
 * - Memory across conversations
 * - File operations (create, read, edit, delete)
 * - Directory management
 * - File search and listing
 */
class CodeEditorConsole {
  private agent: CodeEditorAgent;
  private rl: readline.Interface;
  private conversationHistory: Interaction[] = [];
  private currentWorkingDirectory: string;

  constructor() {
    // Check for environment variables
    if (!process.env.AZURE_OPENAI_API_KEY) {
      console.error('❌ AZURE_OPENAI_API_KEY environment variable is required');
      process.exit(1);
    }
    if (!process.env.AZURE_OPENAI_RESOURCE_NAME) {
      console.error('❌ AZURE_OPENAI_RESOURCE_NAME environment variable is required');
      process.exit(1);
    }

    this.agent = new CodeEditorAgent();
    this.currentWorkingDirectory = path.join(process.cwd(), 'testfolder');

    // Create testfolder if it doesn't exist
    if (!fs.existsSync(this.currentWorkingDirectory)) {
      fs.mkdirSync(this.currentWorkingDirectory, { recursive: true });
    }

    // Create readline interface with enhanced features
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.completer.bind(this),
      history: []
    });

    // Handle Ctrl+C gracefully
    this.rl.on('SIGINT', () => {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    });
  }

  /**
   * Auto-completion for common commands
   */
  private completer(line: string): [string[], string] {
    const commands = [
      'create file', 'create directory', 'read file', 'edit file', 'delete file',
      'list files', 'search files', 'show directory', 'change directory',
      'memory', 'clear', 'help', 'pwd', 'ls', 'exit'
    ];

    const hits = commands.filter(cmd => cmd.startsWith(line.toLowerCase()));
    return [hits.length ? hits : commands, line];
  }

  /**
   * Start the interactive console
   */
  async start() {
    this.displayWelcome();
    this.displayHelp();
    this.askQuestion();
  }

  private displayWelcome() {
    console.log('🗂️  Code Editor Agent - Interactive File Manager Console');
    console.log('=====================================================');
    console.log('');
    console.log('🎯 Full file management with natural language commands!');
    console.log('💾 Persistent memory across conversations');
    console.log('🔍 Search, edit, create, and delete files effortlessly');
    console.log('');
    console.log(`📂 Working directory: ${this.currentWorkingDirectory} (testfolder)`);
    console.log('');
  }

  private displayHelp() {
    console.log('💡 Example Commands:');
    console.log('');
    console.log('📝 FILE OPERATIONS:');
    console.log('  • "create a React component Button.tsx in src/components"');
    console.log('  • "read the contents of package.json"');
    console.log('  • "edit index.ts and add a new import statement"');
    console.log('  • "delete all .log files in the project"');
    console.log('');
    console.log('📁 DIRECTORY OPERATIONS:');
    console.log('  • "list all files in src directory"');
    console.log('  • "create a new directory called components"');
    console.log('  • "show me all TypeScript files recursively"');
    console.log('');
    console.log('🔍 SEARCH & DISCOVERY:');
    console.log('  • "find all files containing the word TODO"');
    console.log('  • "search for function definitions in .js files"');
    console.log('  • "show me all files larger than 1MB"');
    console.log('');
    console.log('⚡ QUICK COMMANDS:');
    console.log('  • "pwd" - Show current directory');
    console.log('  • "ls" - List files in current directory');
    console.log('  • "cd <path>" - Change directory');
    console.log('  • "memory" - Show conversation history');
    console.log('  • "clear" - Clear memory');
    console.log('  • "help" - Show this help');
    console.log('  • "exit" - Quit (or Ctrl+C)');
    console.log('');
    console.log('---');
  }

  private askQuestion() {
    const prompt = `\n💬 [${path.basename(this.currentWorkingDirectory)}] > `;
    
    this.rl.question(prompt, async (input) => {
      const trimmedInput = input.trim();
      
      if (trimmedInput === '') {
        this.askQuestion();
        return;
      }

      // Handle special commands
      if (await this.handleSpecialCommands(trimmedInput)) {
        this.askQuestion();
        return;
      }

      try {
        console.log('🤖 Working...');
        const startTime = Date.now();

        const result = await this.agent.run({
          userPrompt: trimmedInput,
          prevInteractionHistory: this.conversationHistory,
          context: {
            workingDirectory: this.currentWorkingDirectory,
            timestamp: new Date().toISOString()
          }
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Update conversation history
        if (result.interactionHistory) {
          this.conversationHistory.push(...result.interactionHistory);
        }

        if (result.agentResponse) {
          this.conversationHistory.push(result.agentResponse);
          await this.displayResponse(result.agentResponse, duration);
        } else {
          console.log('✅ Task completed successfully!');
        }

        // Show token usage
        this.displayTokenUsage();

      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      }

      this.askQuestion();
    });
  }

  private async handleSpecialCommands(input: string): Promise<boolean> {
    const lowerInput = input.toLowerCase();

    switch (lowerInput) {
      case 'exit':
      case 'quit':
        console.log('👋 Goodbye!');
        this.rl.close();
        process.exit(0);
        return true;

      case 'help':
      case '?':
        this.displayHelp();
        return true;

      case 'memory':
        this.showMemory();
        return true;

      case 'clear':
        this.clearMemory();
        return true;

      case 'pwd':
        console.log(`📂 Working directory: ${this.currentWorkingDirectory} (testfolder)`);
        return true;

      case 'ls':
        await this.quickListFiles();
        return true;

      default:
        // Handle cd command
        if (lowerInput.startsWith('cd ')) {
          const newPath = input.substring(3).trim();
          await this.changeDirectory(newPath);
          return true;
        }
        
        return false;
    }
  }

  private async displayResponse(response: any, duration: number) {
    if (response.error) {
      console.log('❌ Agent Error:', response.error);
      return;
    }

    const context = response.context;
    if (!context) {
      console.log('⚠️  No response context available');
      return;
    }

    // Display the main response
    const responseText = context.value || context.response || context;
    if (typeof responseText === 'string') {
      console.log('🤖 Agent:', responseText);
    }

    // Display file operation results
    await this.displayFileOperationResults(context);

    console.log(`⏱️  Completed in ${duration}ms`);
  }

  private async displayFileOperationResults(context: any) {
    // Handle different types of file operations
    if (context.toolName) {
      switch (context.toolName) {
        case 'create_file':
          if (context.success) {
            console.log(`✅ Created file: ${context.filepath} (${context.lines} lines, ${context.size} bytes)`);
          }
          break;

        case 'read_file':
          if (context.success && context.content) {
            console.log(`📖 Content of ${context.filepath}:`);
            console.log('─'.repeat(50));
            console.log(context.content);
            console.log('─'.repeat(50));
            console.log(`📊 ${context.totalLines} lines, ${context.size} bytes, modified: ${context.lastModified}`);
          }
          break;

        case 'edit_file':
          if (context.success) {
            console.log(`✏️  Edited ${context.filepath}: ${context.operation}`);
            console.log(`   Lines: ${context.originalLines} → ${context.newLines}`);
            console.log(`   Size: ${context.originalSize} → ${context.newSize} bytes`);
          }
          break;

        case 'delete_file':
          if (context.success) {
            console.log(`🗑️  Deleted ${context.type}: ${context.filepath}`);
            if (context.backup) {
              console.log(`💾 Backup created: ${context.backup}`);
            }
          }
          break;

        case 'list_files':
          if (context.success && context.files) {
            console.log(`📁 Files in ${context.directory} (${context.totalItems} items):`);
            console.log('');
            context.files.forEach((file: any) => {
              const icon = file.type === 'directory' ? '📁' : '📄';
              const size = file.size ? ` (${file.size} bytes)` : '';
              const modified = file.modified ? ` - ${new Date(file.modified).toLocaleDateString()}` : '';
              console.log(`   ${icon} ${file.name}${size}${modified}`);
            });
          }
          break;

        case 'search_files':
          if (context.success && context.results) {
            console.log(`🔍 Search results for "${context.searchTerm}" (${context.totalResults} matches):`);
            console.log('');
            context.results.forEach((result: any) => {
              console.log(`📄 ${result.name}:`);
              result.matches.forEach((match: any) => {
                if (match.type === 'filename') {
                  console.log(`   📂 Found in filename`);
                } else if (match.type === 'content') {
                  console.log(`   📝 Line ${match.line}: ${match.text}`);
                }
              });
              console.log('');
            });
          }
          break;

        case 'create_directory':
          if (context.success) {
            console.log(`📁 Created directory: ${context.dirpath}`);
          }
          break;
      }

      // Show errors
      if (!context.success && context.error) {
        console.log(`❌ ${context.toolName} failed: ${context.error}`);
      }
    }
  }

  private async quickListFiles() {
    try {
      const files = await fs.promises.readdir(this.currentWorkingDirectory);
      console.log(`📁 Files in ${this.currentWorkingDirectory}:`);
      
      for (const file of files.slice(0, 20)) { // Limit to first 20 items
        try {
          const filePath = path.join(this.currentWorkingDirectory, file);
          const stats = await fs.promises.stat(filePath);
          const icon = stats.isDirectory() ? '📁' : '📄';
          const size = stats.isFile() ? ` (${stats.size}b)` : '';
          console.log(`   ${icon} ${file}${size}`);
        } catch (error) {
          console.log(`   ❓ ${file} (cannot read)`);
        }
      }
      
      if (files.length > 20) {
        console.log(`   ... and ${files.length - 20} more items`);
      }
    } catch (error) {
      console.log(`❌ Cannot list directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async changeDirectory(newPath: string) {
    try {
      let targetPath: string;
      
      if (path.isAbsolute(newPath)) {
        targetPath = newPath;
      } else if (newPath === '..') {
        targetPath = path.dirname(this.currentWorkingDirectory);
      } else if (newPath === '~') {
        targetPath = require('os').homedir();
      } else {
        targetPath = path.join(this.currentWorkingDirectory, newPath);
      }

      // Check if directory exists
      const stats = await fs.promises.stat(targetPath);
      if (!stats.isDirectory()) {
        console.log(`❌ ${targetPath} is not a directory`);
        return;
      }

      this.currentWorkingDirectory = targetPath;
      console.log(`📂 Changed to: ${this.currentWorkingDirectory}`);
      
    } catch (error) {
      console.log(`❌ Cannot change to ${newPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private showMemory() {
    console.log('\n📚 Conversation History:');
    if (this.conversationHistory.length === 0) {
      console.log('   No conversation history yet.');
      return;
    }

    console.log(`   ${this.conversationHistory.length} interactions in memory\n`);

    this.conversationHistory.slice(-10).forEach((interaction, index) => {
      if ('type' in interaction) {
        if (interaction.type === 'user_prompt') {
          console.log(`   👤 ${index + 1}. User: ${interaction.context}`);
        } else if (interaction.type === 'agent_response') {
          const context = interaction.context;
          const response = context?.value || context?.response || 'Completed task';
          console.log(`   🤖 ${index + 1}. Agent: ${response}`);
        }
      }
    });

    if (this.conversationHistory.length > 10) {
      console.log(`   ... (showing last 10 of ${this.conversationHistory.length} interactions)`);
    }
  }

  private clearMemory() {
    this.conversationHistory = [];
    console.log('💭 Memory cleared! Starting fresh conversation.');
  }

  private displayTokenUsage() {
    const tokenUsage = this.agent.getRunTokenUsage();
    if (tokenUsage.totalTokens > 0) {
      console.log(`📊 Tokens: ${tokenUsage.promptTokens} + ${tokenUsage.completionTokens} = ${tokenUsage.totalTokens}`);
    }
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const console_app = new CodeEditorConsole();
  console_app.start().catch(console.error);
}

export { CodeEditorConsole };