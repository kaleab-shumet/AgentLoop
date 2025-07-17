import { AgentLoop, FormatMode, TurnState, ToolResult, AgentRunInput, AgentRunOutput } from '../../core';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { FileOperationHandlers, DirectoryHandlers, SearchHandlers, AdvancedFileHandlers } from './handlers';
import { ConversationMemory } from './utils';
import * as path from 'path';

/**
 * Enhanced Real File Manager Agent that provides a comprehensive file management interface.
 * Features include file operations, directory management, content search, and safe file handling.
 */

export class RealFileManagerAgent extends AgentLoop {
  protected systemPrompt = `You are a friendly and helpful file management assistant named FileBot. You have a warm, conversational personality and comprehensive file operation capabilities.

🚨 CRITICAL TERMINATION RULES (READ FIRST):
- ALWAYS check the tool call history BEFORE choosing any tool
- If you see ANY successful operation in the history, DO NOT repeat it
- If you have completed the user's request, immediately use the 'final' tool
- If data already exists in history (like file contents), use it - don't re-read
- NEVER call the same tool with identical parameters more than once
- When in doubt, use the 'final' tool to complete the task

🎯 CONVERSATIONAL BEHAVIOR:
- Respond warmly to greetings, but put ALL conversational text inside the 'final' tool's value parameter
- For greetings like "hello" or "hi", use the final tool with a warm, friendly response
- Be encouraging and supportive in your tool responses
- Use emojis in your final tool responses to make interactions engaging
- NEVER put conversational text outside of XML tool calls

🔧 TECHNICAL CAPABILITIES:
- Creating, reading, writing, and managing files and directories
- Listing directory contents with detailed information  
- Searching for files and content within files
- Providing file information and statistics
- Managing working directories safely

🛡️ SAFETY PRIORITIES:
- Confirm destructive operations before proceeding
- Provide clear, friendly feedback on all operations
- Use relative paths when possible
- Warn about potential data loss in a helpful way
- Maintain clear working directory context

📋 IMPORTANT TOOL USAGE RULES:
- For "recursive" or "list everything" requests, ALWAYS use list_directory with recursive=true
- If a tool call doesn't give you what you need, try different parameters before repeating
- Once you have completed a task successfully, use the final tool immediately
- Don't repeat the same tool call with identical parameters more than twice
- When listing recursively fails, try breaking it into smaller chunks

🔧 TOOL USAGE EXAMPLES:
- Request: "List all files recursively" → Use: list_directory with recursive=true
- Request: "List everything recursively" → Use: list_directory with recursive=true  
- Request: "Show all files in subdirectories" → Use: list_directory with recursive=true

Always be helpful and accurate. Put all conversational responses inside the 'final' tool to maintain proper XML format. Make file management feel approachable and less intimidating!`;

  private fileHandlers!: FileOperationHandlers;
  private directoryHandlers!: DirectoryHandlers;
  private searchHandlers!: SearchHandlers;
  private advancedFileHandlers!: AdvancedFileHandlers;
  private conversationMemory!: ConversationMemory;
  private workingDirectory: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB limit
  private allowedExtensions: string[] = ['.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.xml', '.csv', '.log', '.py', '.java', '.cpp', '.c', '.h'];
  private debugMode: boolean = false;

  constructor(config: any, workingDir: string = process.cwd(), debugMode: boolean = false, formatMode: FormatMode = FormatMode.YAML_MODE) {
    const provider = new DefaultAIProvider(config);
    super(provider, {
      maxIterations: 10,
      parallelExecution: false, // Sequential for file operations safety
      formatMode: formatMode
    });

    this.workingDirectory = path.resolve(workingDir);
    this.debugMode = debugMode;
    this.conversationMemory = new ConversationMemory({
      maxEntries: 20,
      summarizeOlderThan: 15,
      enableSummary: true,
      persistToDisk: false
    });
    this.initializeHandlers();
    this.setupTools();
  }

  private initializeHandlers(): void {
    this.fileHandlers = new FileOperationHandlers(this.workingDirectory, this.maxFileSize, this.allowedExtensions, this.debugMode);
    this.directoryHandlers = new DirectoryHandlers(this.workingDirectory, this.debugMode);
    this.searchHandlers = new SearchHandlers(this.workingDirectory, this.maxFileSize, this.allowedExtensions, this.debugMode);
    this.advancedFileHandlers = new AdvancedFileHandlers(this.workingDirectory, this.debugMode);
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.fileHandlers = new FileOperationHandlers(this.workingDirectory, this.maxFileSize, this.allowedExtensions, this.debugMode);
    this.directoryHandlers = new DirectoryHandlers(this.workingDirectory, this.debugMode);
    this.searchHandlers = new SearchHandlers(this.workingDirectory, this.maxFileSize, this.allowedExtensions, this.debugMode);
    this.advancedFileHandlers = new AdvancedFileHandlers(this.workingDirectory, this.debugMode);
  }

  public isDebugMode(): boolean {
    return this.debugMode;
  }

  public async run(input: AgentRunInput): Promise<AgentRunOutput> {
    console.log(`\n🔧 RealFileManagerAgent running in FormatMode: ${this.formatMode}`);
    console.log(`📝 Processing user input: "${input.userPrompt}"`);
    
    // Enhance input with conversation history if not provided
    const enhancedInput: AgentRunInput = {
      ...input,
      conversationHistory: input.conversationHistory.length > 0 
        ? input.conversationHistory 
        : this.conversationMemory.getConversationHistory()
    };

    // Run the agent with enhanced input
    const output = await super.run(enhancedInput);

    // Store the interaction in memory
    this.conversationMemory.addEntry(input, output);

    return output;
  }

  public getMemoryStats() {
    return this.conversationMemory.getMemoryStats();
  }

  public clearMemory() {
    this.conversationMemory.clear();
  }

  private setupTools() {
    // Directory listing tool
    this.defineTool((z) => ({
      name: 'list_directory',
      description: 'List contents of a directory with detailed file information including size, type, and modification dates. Use recursive=true for "recursive" or "list everything" requests.',
      argsSchema: z.object({
        dirPath: z.string().optional().default('.').describe('Directory path to list (relative to working directory or absolute, defaults to current directory)'),
        showHidden: z.boolean().optional().default(false).describe('Whether to show hidden files and directories'),
        recursive: z.boolean().optional().default(false).describe('Whether to list subdirectories recursively. Set to true for "recursive" or "list everything" requests.'),
        maxDepth: z.number().optional().default(3).describe('Maximum recursion depth when recursive is true')
      }),
      handler: (name: string, args: any, turnState: TurnState) => this.directoryHandlers.handleListDirectory(name, args, turnState)
    }));

    // File reading tool
    this.defineTool((z) => ({
      name: 'read_file',
      description: 'Read the contents of a text file. Supports various text formats and provides encoding detection.',
      argsSchema: z.object({
        filePath: z.string().describe('Path to the file to read'),
        encoding: z.string().optional().default('utf8').describe('File encoding (utf8, ascii, etc.)'),
        startLine: z.number().optional().describe('Start reading from this line number (1-based)'),
        endLine: z.number().optional().describe('Stop reading at this line number (1-based)'),
        preview: z.boolean().optional().default(false).describe('If true, only show first 50 lines for large files')
      }),
      handler: (name: string, args: any, turnState: TurnState) => this.fileHandlers.handleReadFile(name, args, turnState)
    }));

    // File writing tool
    this.defineTool((z) => ({
      name: 'write_file',
      description: 'Write content to a file. Supports creating new files or overwriting existing ones with backup options.',
      argsSchema: z.object({
        filePath: z.string().describe('Path where to write the file'),
        content: z.string().describe('Content to write to the file'),
        createDirs: z.boolean().optional().default(false).describe('Create parent directories if they don\'t exist'),
        backup: z.boolean().optional().default(false).describe('Create a backup of existing file before overwriting'),
        encoding: z.string().optional().default('utf8').describe('File encoding')
      }),
      handler: (name: string, args: any) => this.fileHandlers.handleWriteFile(name, args)
    }));

    // Directory creation tool
    this.defineTool((z) => ({
      name: 'create_directory',
      description: 'Create a new directory or nested directory structure.',
      argsSchema: z.object({
        dirPath: z.string().describe('Path of the directory to create'),
        recursive: z.boolean().optional().default(true).describe('Create parent directories if needed')
      }),
      handler: (name: string, args: any) => this.directoryHandlers.handleCreateDirectory(name, args)
    }));

    // File search tool
    this.defineTool((z) => ({
      name: 'search_files',
      description: 'Search for files by name pattern and optionally search within file contents.',
      argsSchema: z.object({
        searchPath: z.string().optional().default('.').describe('Directory to search in'),
        namePattern: z.string().optional().describe('File name pattern to search for (supports wildcards like *.txt)'),
        contentPattern: z.string().optional().describe('Text pattern to search for within files'),
        maxDepth: z.number().optional().default(5).describe('Maximum directory depth to search'),
        maxResults: z.number().optional().default(100).describe('Maximum number of results to return'),
        caseSensitive: z.boolean().optional().default(false).describe('Whether search should be case sensitive')
      }),
      handler: (name: string, args: any, turnState: TurnState) => this.searchHandlers.handleSearchFiles(name, args, turnState)
    }));

    // File information tool
    this.defineTool((z) => ({
      name: 'get_file_info',
      description: 'Get comprehensive information about a file or directory including permissions, size, dates, and type.',
      argsSchema: z.object({
        itemPath: z.string().describe('Path to the file or directory to examine')
      }),
      handler: (name: string, args: any) => this.fileHandlers.handleGetFileInfo(name, args)
    }));

    // Change directory tool
    this.defineTool((z) => ({
      name: 'change_directory',
      description: 'Change the current working directory for file operations.',
      argsSchema: z.object({
        newPath: z.string().describe('New working directory path')
      }),
      handler: (name: string, args: any) => this.directoryHandlers.handleChangeDirectory(name, args)
    }));

    // Delete tool
    this.defineTool((z) => ({
      name: 'delete_item',
      description: 'Delete a file or directory. Use with caution - this operation cannot be undone!',
      argsSchema: z.object({
        itemPath: z.string().describe('Path to the file or directory to delete'),
        recursive: z.boolean().optional().default(false).describe('For directories: delete recursively including all contents'),
        confirm: z.boolean().describe('Must be true to confirm deletion - this is a safety measure')
      }),
      handler: (name: string, args: any) => this.fileHandlers.handleDeleteItem(name, args)
    }));

    // Advanced file operations
    this.defineTool((z) => ({
      name: 'file_diff',
      description: 'Compare two files and show differences line by line.',
      argsSchema: z.object({
        file1: z.string().describe('Path to the first file'),
        file2: z.string().describe('Path to the second file')
      }),
      handler: (name: string, args: any, turnState: TurnState) => this.advancedFileHandlers.handleFileDiff(name, args, turnState)
    }));

    this.defineTool((z) => ({
      name: 'file_hash',
      description: 'Compute cryptographic hash of a file for integrity verification.',
      argsSchema: z.object({
        filePath: z.string().describe('Path to the file to hash'),
        algorithm: z.string().optional().default('sha256').describe('Hash algorithm (md5, sha1, sha256, sha512)')
      }),
      handler: (name: string, args: any) => this.advancedFileHandlers.handleFileHash(name, args)
    }));

    this.defineTool((z) => ({
      name: 'copy_file',
      description: 'Copy a file from one location to another.',
      argsSchema: z.object({
        sourcePath: z.string().describe('Path to the source file'),
        destinationPath: z.string().describe('Path to the destination'),
        overwrite: z.boolean().optional().default(false).describe('Whether to overwrite if destination exists'),
        createDirs: z.boolean().optional().default(false).describe('Create destination directories if needed')
      }),
      handler: (name: string, args: any) => this.advancedFileHandlers.handleFileCopy(name, args)
    }));

    this.defineTool((z) => ({
      name: 'move_file',
      description: 'Move or rename a file from one location to another.',
      argsSchema: z.object({
        sourcePath: z.string().describe('Path to the source file'),
        destinationPath: z.string().describe('Path to the destination'),
        overwrite: z.boolean().optional().default(false).describe('Whether to overwrite if destination exists'),
        createDirs: z.boolean().optional().default(false).describe('Create destination directories if needed')
      }),
      handler: (name: string, args: any) => this.advancedFileHandlers.handleFileMove(name, args)
    }));

    this.defineTool((z) => ({
      name: 'file_permissions',
      description: 'View or modify file permissions (Unix-style mode).',
      argsSchema: z.object({
        filePath: z.string().describe('Path to the file or directory'),
        mode: z.string().optional().describe('New permissions in octal format (e.g., "755", "644"). Omit to just view current permissions.')
      }),
      handler: (name: string, args: any) => this.advancedFileHandlers.handleFilePermissions(name, args)
    }));

    // Memory management tool
    this.defineTool((z) => ({
      name: 'memory_stats',
      description: 'Get statistics about conversation memory including usage patterns and history.',
      argsSchema: z.object({
        detailed: z.boolean().optional().default(false).describe('Whether to show detailed memory information')
      }),
      handler: async (name: string, args: any): Promise<ToolResult> => {
        const stats = this.conversationMemory.getMemoryStats();
        const toolUsage = this.conversationMemory.getToolUsageStats();
        
        const output: any = {
          totalConversations: stats.totalEntries,
          successRate: `${Math.round(stats.successRate * 100)}%`,
          topTools: stats.topTools,
          memorySize: stats.memorySize,
          sessionDuration: stats.oldestEntry && stats.newestEntry 
            ? `${Math.round((stats.newestEntry.getTime() - stats.oldestEntry.getTime()) / (1000 * 60))} minutes`
            : 'N/A'
        };

        if (args.detailed) {
          output.detailedToolUsage = toolUsage;
          output.recentEntries = this.conversationMemory.getRecentEntries(5).map(entry => ({
            timestamp: entry.timestamp.toISOString(),
            prompt: entry.userPrompt.substring(0, 100) + (entry.userPrompt.length > 100 ? '...' : ''),
            toolsUsed: entry.toolsUsed,
            success: entry.success
          }));
        }

        return {
          toolName: name,
          success: true,
          output
        };
      }
    }));

    // Final tool
    this.defineTool((z) => ({
      name: 'final',
      description: `⚠️ CRITICAL: Call this tool to TERMINATE the execution and provide your final answer. Use when: (1) You have completed the user's request, (2) All necessary operations are done, (3) You can provide a complete response. This tool ENDS the conversation - only call it when finished. NEVER call other tools after this one.`,
      argsSchema: z.object({ 
        value: z.string().describe("The final, complete answer summarizing what was accomplished and any results.") 
      }),
      handler: async (name: string, args: { value: string; }, turnState: TurnState): Promise<ToolResult> => {
        let display = turnState.get("display")
        return {
          toolName: name,
          success: true,
          output: args,
          display
        };
      },
    }));
  }


  // Public utility methods
  public getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  public setWorkingDirectory(newDir: string): void {
    const resolvedPath = path.resolve(newDir);
    if (!require('fs').existsSync(resolvedPath) || !require('fs').statSync(resolvedPath).isDirectory()) {
      throw new Error('Directory does not exist or is not a directory');
    }
    this.workingDirectory = resolvedPath;
    this.directoryHandlers.setWorkingDirectory(resolvedPath);
  }

  public getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

}