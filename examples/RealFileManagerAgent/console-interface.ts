import * as readline from 'readline';
import * as path from 'path';
import { RealFileManagerAgent } from './RealFileManagerAgent';
import { FormatMode } from '../../core';

/**
 * Interactive console interface for the RealFileManagerAgent
 * Provides a command-line interface for users to interact with the file management agent
 */
export class FileManagerConsole {
  private agent: RealFileManagerAgent;
  private rl: readline.Interface;
  private isRunning: boolean = false;
  private debugMode: boolean = false;

  constructor(config: any, workingDir?: string, debugMode: boolean = false, formatMode: FormatMode = FormatMode.FUNCTION_CALLING) {
    this.debugMode = debugMode;
    this.agent = new RealFileManagerAgent(config, workingDir, debugMode, formatMode);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.debugMode ? '🐛 FileManager[DEBUG]> ' : '📁 FileManager> '
    });
  }

  /**
   * Start the interactive console session
   */
  public async start(): Promise<void> {
    console.log('🚀 Real File Manager Agent - Interactive Console');
    if (this.debugMode) {
      console.log('🐛 DEBUG MODE ENABLED - Detailed logging active');
    }
    console.log('==================================================');
    console.log(`📍 Working Directory: ${this.agent.getWorkingDirectory()}`);
    console.log(`🔧 Format Mode: ${this.agent.formatMode}`);
    console.log('💡 Type "help" for available commands or "exit" to quit');
    console.log('✨ You can use natural language commands like:');
    console.log('   - "hello" or "hi" for a friendly greeting');
    console.log('   - "create a file called test.txt with hello world"');
    console.log('   - "list all files in the current directory"');
    console.log('   - "search for .js files containing console.log"');
    console.log('   - "read the contents of package.json"');
    console.log('   - "delete the temp folder"');
    if (this.debugMode) {
      console.log('🐛 Debug commands:');
      console.log('   - "debug off" to disable debug mode');
      console.log('   - "debug on" to enable debug mode');
    }
    console.log('');

    this.isRunning = true;
    this.rl.prompt();

    this.rl.on('line', async (input: string) => {
      const trimmedInput = input.trim();

      if (!trimmedInput) {
        this.rl.prompt();
        return;
      }

      // Handle special commands
      if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
        this.exit();
        return;
      }

      if (trimmedInput.toLowerCase() === 'help') {
        this.showHelp();
        this.rl.prompt();
        return;
      }

      if (trimmedInput.toLowerCase() === 'clear') {
        console.clear();
        console.log(`📍 Working Directory: ${this.agent.getWorkingDirectory()}`);
        this.rl.prompt();
        return;
      }

      if (trimmedInput.toLowerCase().startsWith('cd ')) {
        const newDir = trimmedInput.substring(3).trim();
        try {
          this.agent.setWorkingDirectory(newDir);
          console.log(`✅ Changed working directory to: ${this.agent.getWorkingDirectory()}`);
        } catch (error: any) {
          console.log(`❌ Failed to change directory: ${error.message}`);
        }
        this.rl.prompt();
        return;
      }

      if (trimmedInput.toLowerCase() === 'pwd') {
        console.log(`📍 Current working directory: ${this.agent.getWorkingDirectory()}`);
        this.rl.prompt();
        return;
      }

      if (trimmedInput.toLowerCase().startsWith('debug ')) {
        const debugCommand = trimmedInput.substring(6).trim();
        if (debugCommand === 'on') {
          this.debugMode = true;
          this.agent.setDebugMode(true);
          this.rl.setPrompt('🐛 FileManager[DEBUG]> ');
          console.log('🐛 Debug mode enabled');
        } else if (debugCommand === 'off') {
          this.debugMode = false;
          this.agent.setDebugMode(false);
          this.rl.setPrompt('📁 FileManager> ');
          console.log('✅ Debug mode disabled');
        } else {
          console.log('❌ Invalid debug command. Use "debug on" or "debug off"');
        }
        this.rl.prompt();
        return;
      }

      // Process the command through the agent
      await this.processCommand(trimmedInput);
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.exit();
    });
  }

  /**
   * Process a user command through the agent
   */
  private async processCommand(userInput: string): Promise<void> {
    console.log(`\n🔄 Processing: "${userInput}"`);
    console.log('⏳ Please wait...\n');

    const startTime = Date.now();

    if (this.debugMode) {
      console.log(`🐛 [DEBUG] Input received: "${userInput}"`);
      console.log(`🐛 [DEBUG] Working directory: ${this.agent.getWorkingDirectory()}`);
    }

    try {
      const result = await this.agent.run({
        userPrompt: userInput,
        conversationHistory: [],
        toolCallHistory: []
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('📊 Execution Summary:');
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`🔧 Tools used: ${result.toolCallHistory.length}`);

      // Show tool execution details only in debug mode or if there are errors
      if (result.toolCallHistory.length > 0 && (this.debugMode || result.toolCallHistory.some(t => !t.success))) {
        console.log('\n🛠️  Tool Execution Details:');
        result.toolCallHistory.forEach((tool, index) => {
          const status = tool.success ? '✅' : '❌';
          console.log(`  ${index + 1}. ${status} ${tool.toolName}`);

          if (!tool.success && tool.error) {
            console.log(`     Error: ${tool.error}`);
          } else if (tool.success && tool.output && this.debugMode) {
            // Show detailed output information only in debug mode
            this.displayToolOutput(tool.toolName, tool.output);
          }
        });
      } else if (result.toolCallHistory.length > 0 && !this.debugMode) {
        // In non-debug mode, just show a summary
        const successCount = result.toolCallHistory.filter(t => t.success).length;
        const failCount = result.toolCallHistory.filter(t => !t.success).length;
        if (failCount > 0) {
          console.log(`\n⚠️  ${successCount} operations succeeded, ${failCount} failed`);
        }
      }

      // Show final answer
      if (result.finalAnswer) {

        if (result.finalAnswer?.display) {
          console.log(result.finalAnswer?.display);

        }
        else {
          console.log('\n💬 Agent Response:');
          console.log(`${result.finalAnswer.output.value || 'Operation completed'}`);
        }
      }
      // Show any failed operations
      const failedTools = result.toolCallHistory.filter(tool => !tool.success);
      if (failedTools.length > 0) {
        console.log('\n⚠️  Some operations failed:');
        failedTools.forEach(tool => {
          console.log(`   ❌ ${tool.toolName}: ${tool.error}`);
        });
      }

    } catch (error: any) {
      console.log(`❌ Command failed: ${error.message}`);
      console.log('💡 Try rephrasing your command or type "help" for examples');
    }

    console.log('\n' + '='.repeat(50));
  }

  /**
   * Display relevant output information for different tool types
   */
  private displayToolOutput(toolName: string, output: any): void {
    switch (toolName) {
      case 'list_directory':
        if (output.contents && output.contents.length > 0) {
          console.log(`     Found ${output.totalItems} items in ${output.relativePath || '.'}`);
          console.log(`     Files: ${output.summary?.files || 0}, Directories: ${output.summary?.directories || 0}`);
          if (output.summary?.totalSize) {
            console.log(`     Total size: ${this.formatBytes(output.summary.totalSize)}`);
          }
        }
        break;

      case 'read_file':
        if (output.type === 'text') {
          console.log(`     Read ${output.lines} lines (${this.formatBytes(output.size)})`);
          if (output.isPartial) {
            console.log(`     Showing partial content (lines ${output.range?.startLine}-${output.range?.endLine})`);
          }
        } else {
          console.log(`     Binary file detected: ${output.extension} (${this.formatBytes(output.size)})`);
        }
        break;

      case 'write_file':
        console.log(`     Written ${this.formatBytes(output.size)} to ${output.relativePath}`);
        if (output.backupCreated) {
          console.log(`     Backup created: ${path.basename(output.backupCreated)}`);
        }
        break;

      case 'search_files':
        if (output.results && output.results.length > 0) {
          console.log(`     Found ${output.totalFound} matching files`);
          if (output.summary?.filesWithContent > 0) {
            console.log(`     ${output.summary.filesWithContent} files contain the search pattern`);
            console.log(`     Total matches: ${output.summary.totalMatches}`);
          }
        } else {
          console.log(`     No files found matching the criteria`);
        }
        break;

      case 'get_file_info':
        const type = output.type === 'directory' ? '📁' : '📄';
        console.log(`     ${type} ${output.relativePath} (${this.formatBytes(output.size)})`);
        if (output.type === 'directory' && output.itemCount !== undefined) {
          console.log(`     Contains: ${output.files || 0} files, ${output.directories || 0} directories`);
        }
        break;

      case 'create_directory':
        console.log(`     Created directory: ${output.relativePath}`);
        break;

      case 'delete_item':
        console.log(`     Deleted ${output.type}: ${output.relativePath}`);
        break;

      case 'change_directory':
        console.log(`     Changed to: ${output.newPath}`);
        break;
    }
  }

  /**
   * Show help information
   */
  private showHelp(): void {
    console.log('\n🆘 File Manager Agent - Help');
    console.log('=============================');
    console.log('\n📋 Special Commands:');
    console.log('  help      - Show this help message');
    console.log('  exit      - Exit the file manager');
    console.log('  clear     - Clear the console');
    console.log('  pwd       - Show current working directory');
    console.log('  cd <dir>  - Change working directory');
    console.log('  debug on  - Enable debug mode for detailed logging');
    console.log('  debug off - Disable debug mode');

    console.log('\n🗂️  Available File Operations:');
    const commands = this.agent.getAvailableTools();
    commands.forEach(cmd => {
      console.log(`  • ${cmd}`);
    });

    console.log('\n💡 Natural Language Examples:');
    console.log('  📝 File Operations:');
    console.log('    "create a file called test.txt with content hello world"');
    console.log('    "read the package.json file"');
    console.log('    "write some code to app.js"');
    console.log('    "delete the temp.txt file"');

    console.log('\n  📁 Directory Operations:');
    console.log('    "list all files in the current directory"');
    console.log('    "show hidden files in the src folder"');
    console.log('    "create a new directory called output"');
    console.log('    "list everything recursively"');

    console.log('\n  🔍 Search Operations:');
    console.log('    "search for all .js files"');
    console.log('    "find files containing console.log"');
    console.log('    "search for *.json files in src folder"');
    console.log('    "find files with error in their content"');

    console.log('\n  ℹ️  Information:');
    console.log('    "get info about package.json"');
    console.log('    "show details of the src directory"');
    console.log('    "what files are in the current folder?"');

    console.log('\n🛡️  Safety Features:');
    console.log('  • Automatic backups for file overwrites (when requested)');
    console.log('  • Confirmation required for delete operations');
    console.log('  • Path traversal protection');
    console.log('  • File size limits for reading operations');
    console.log('  • Binary file detection and safe handling');
    console.log('');
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Exit the console application
   */
  private exit(): void {
    if (this.isRunning) {
      console.log('\n👋 Thanks for using Real File Manager Agent!');
      console.log('📁 Your files are safe and organized.');
      this.isRunning = false;
      this.rl.close();
      process.exit(0);
    }
  }
}

/**
 * Main function to start the console interface
 */
export async function startFileManagerConsole(): Promise<void> {
  // Configuration for the Gemini AI provider
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key', // Default key from examples
    model: 'gemini-2.5-flash',
    service: 'google' as const
  };
  
  const formatMode = FormatMode.FUNCTION_CALLING;

  // Parse command line arguments
  const args = process.argv.slice(2);
  const debugMode = args.includes('--debug');

  // Get working directory (filter out --debug flag)
  let workingDir = args.find(arg => !arg.startsWith('--')) || process.cwd();

  // Convert Windows paths to WSL paths if needed
  if (workingDir.includes('\\') && workingDir.includes(':')) {
    // This looks like a Windows path, convert it to WSL format
    workingDir = workingDir.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
  }

  console.log('🏗️  Initializing File Manager Agent...');
  console.log(`🔧 Using FormatMode: ${formatMode}`);

  try {
    // Ensure the working directory exists
    const fs = await import('fs');
    if (!fs.existsSync(workingDir)) {
      console.log(`📁 Creating working directory: ${workingDir}`);
      fs.mkdirSync(workingDir, { recursive: true });
    }

    const console_interface = new FileManagerConsole(config, workingDir, debugMode, formatMode);
    await console_interface.start();
  } catch (error: any) {
    console.error('❌ Failed to start File Manager Agent:', error.message);
    console.error('💡 Make sure you have a valid GEMINI_API_KEY environment variable set');
    console.error('📁 Working directory issue? Try: mkdir -p /path/to/directory');
    process.exit(1);
  }
}

// Auto-start if this file is run directly
if (require.main === module) {
  startFileManagerConsole().catch(console.error);
}