import { AgentLoop, ExecutionMode, AgentRunInput, AgentRunOutput } from '../core';
import { GeminiAIProvider } from '../core/providers/GeminiAIProvider';
import z from 'zod';
import * as fs from 'fs';
import * as path from 'path';

/**
 * A practical example agent that demonstrates file management capabilities.
 * This agent can list directories, read files, write files, and manage file operations.
 * It showcases error handling, tool dependencies, and real-world use cases.
 */
export class FileManagementAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful file management assistant. You can help users navigate directories, read and write files, organize content, and perform file operations safely. Always be careful with file operations and confirm destructive actions.`;

  private workingDirectory: string;

  constructor(config: any, workingDir: string = process.cwd()) {
    const provider = new GeminiAIProvider(config);
    super(provider, { 
      maxIterations: 8,
      parallelExecution: false, // Sequential for file operations safety
      executionMode: ExecutionMode.XML 
    });
    
    this.workingDirectory = path.resolve(workingDir);
    this.setupFileTools();
  }

  private setupFileTools() {
    // Tool to list directory contents
    this.defineTool((z) => ({
      name: 'list_directory',
      description: 'List contents of a directory. Shows files and subdirectories with basic info.',
      argsSchema: z.object({
        dirPath: z.string().describe('Directory path to list (relative to working directory or absolute)'),
        showHidden: z.boolean().optional().default(false).describe('Whether to show hidden files')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.dirPath);
          
          // Security check - prevent directory traversal outside working directory
          if (!targetPath.startsWith(this.workingDirectory) && !path.isAbsolute(args.dirPath)) {
            throw new Error('Access denied: Path outside working directory');
          }

          const items = fs.readdirSync(targetPath, { withFileTypes: true });
          const contents = items
            .filter(item => args.showHidden || !item.name.startsWith('.'))
            .map(item => {
              const itemPath = path.join(targetPath, item.name);
              const stats = fs.statSync(itemPath);
              return {
                name: item.name,
                type: item.isDirectory() ? 'directory' : 'file',
                size: item.isFile() ? stats.size : null,
                modified: stats.mtime.toISOString()
              };
            });

          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              contents,
              totalItems: contents.length
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Failed to list directory: ${error.message}`
          };
        }
      }
    }));

    // Tool to read file contents
    this.defineTool((z) => ({
      name: 'read_file',
      description: 'Read the contents of a text file. For binary files, returns basic file info instead.',
      argsSchema: z.object({
        filePath: z.string().describe('Path to the file to read'),
        maxSize: z.number().optional().default(1024 * 1024).describe('Maximum file size to read in bytes (default 1MB)')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.filePath);
          
          if (!fs.existsSync(targetPath)) {
            throw new Error('File does not exist');
          }

          const stats = fs.statSync(targetPath);
          
          if (!stats.isFile()) {
            throw new Error('Path is not a file');
          }

          if (stats.size > args.maxSize) {
            throw new Error(`File too large (${stats.size} bytes > ${args.maxSize} bytes limit)`);
          }

          // Try to determine if it's a text file
          const extension = path.extname(targetPath).toLowerCase();
          const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.xml', '.csv', '.log'];
          
          if (!textExtensions.includes(extension)) {
            // For binary files, just return file info
            return {
              toolname: name,
              success: true,
              output: {
                type: 'binary',
                path: targetPath,
                size: stats.size,
                extension,
                modified: stats.mtime.toISOString(),
                message: 'Binary file - content not displayed'
              }
            };
          }

          const content = fs.readFileSync(targetPath, 'utf8');
          
          return {
            toolname: name,
            success: true,
            output: {
              type: 'text',
              path: targetPath,
              content,
              size: stats.size,
              lines: content.split('\n').length,
              modified: stats.mtime.toISOString()
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Failed to read file: ${error.message}`
          };
        }
      }
    }));

    // Tool to write/create files
    this.defineTool((z) => ({
      name: 'write_file',
      description: 'Write content to a file. Creates new file or overwrites existing file.',
      argsSchema: z.object({
        filePath: z.string().describe('Path where to write the file'),
        content: z.string().describe('Content to write to the file'),
        createDirs: z.boolean().optional().default(false).describe('Create parent directories if they don\'t exist')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.filePath);
          const directory = path.dirname(targetPath);

          // Check if directory exists or needs to be created
          if (!fs.existsSync(directory)) {
            if (args.createDirs) {
              fs.mkdirSync(directory, { recursive: true });
            } else {
              throw new Error(`Directory does not exist: ${directory}. Use createDirs=true to create it.`);
            }
          }

          fs.writeFileSync(targetPath, args.content, 'utf8');
          const stats = fs.statSync(targetPath);

          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              size: stats.size,
              created: stats.mtime.toISOString(),
              message: 'File written successfully'
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Failed to write file: ${error.message}`
          };
        }
      }
    }));

    // Tool to create directories
    this.defineTool((z) => ({
      name: 'create_directory',
      description: 'Create a new directory. Can create nested directories if specified.',
      argsSchema: z.object({
        dirPath: z.string().describe('Path of the directory to create'),
        recursive: z.boolean().optional().default(false).describe('Create parent directories if needed')
      }),
      dependencies: [], // No dependencies
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.dirPath);
          
          if (fs.existsSync(targetPath)) {
            if (fs.statSync(targetPath).isDirectory()) {
              throw new Error('Directory already exists');
            } else {
              throw new Error('Path exists but is not a directory');
            }
          }

          fs.mkdirSync(targetPath, { recursive: args.recursive });

          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              created: new Date().toISOString(),
              message: 'Directory created successfully'
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Failed to create directory: ${error.message}`
          };
        }
      }
    }));

    // Tool to search for files
    this.defineTool((z) => ({
      name: 'search_files',
      description: 'Search for files by name pattern in a directory and subdirectories.',
      argsSchema: z.object({
        searchPath: z.string().describe('Directory to search in'),
        pattern: z.string().describe('File name pattern to search for (supports wildcards like *.txt)'),
        maxDepth: z.number().optional().default(3).describe('Maximum directory depth to search'),
        maxResults: z.number().optional().default(50).describe('Maximum number of results to return')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.searchPath);
          const results: any[] = [];
          
          const searchRecursive = (dir: string, depth: number) => {
            if (depth > args.maxDepth || results.length >= args.maxResults) return;
            
            try {
              const items = fs.readdirSync(dir, { withFileTypes: true });
              
              for (const item of items) {
                if (results.length >= args.maxResults) break;
                
                const itemPath = path.join(dir, item.name);
                
                if (item.isFile()) {
                  // Simple pattern matching (could be enhanced with proper glob matching)
                  const pattern = args.pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
                  const regex = new RegExp(pattern, 'i');
                  
                  if (regex.test(item.name)) {
                    const stats = fs.statSync(itemPath);
                    results.push({
                      path: itemPath,
                      name: item.name,
                      size: stats.size,
                      modified: stats.mtime.toISOString(),
                      relativePath: path.relative(this.workingDirectory, itemPath)
                    });
                  }
                } else if (item.isDirectory() && !item.name.startsWith('.')) {
                  searchRecursive(itemPath, depth + 1);
                }
              }
            } catch (error) {
              // Skip directories we can't read
            }
          };

          searchRecursive(targetPath, 0);

          return {
            toolname: name,
            success: true,
            output: {
              searchPath: targetPath,
              pattern: args.pattern,
              results,
              totalFound: results.length,
              searchComplete: results.length < args.maxResults
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Search failed: ${error.message}`
          };
        }
      }
    }));

    // Tool to get file/directory information
    this.defineTool((z) => ({
      name: 'get_file_info',
      description: 'Get detailed information about a file or directory (size, permissions, dates, etc.).',
      argsSchema: z.object({
        itemPath: z.string().describe('Path to the file or directory to examine')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.itemPath);
          
          if (!fs.existsSync(targetPath)) {
            throw new Error('File or directory does not exist');
          }

          const stats = fs.statSync(targetPath);
          
          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              relativePath: path.relative(this.workingDirectory, targetPath),
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              accessed: stats.atime.toISOString(),
              permissions: stats.mode.toString(8),
              isReadable: fs.constants.R_OK,
              isWritable: fs.constants.W_OK,
              extension: stats.isFile() ? path.extname(targetPath) : null
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Failed to get file info: ${error.message}`
          };
        }
      }
    }));
  }

  /**
   * Get the current working directory
   */
  public getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Change the working directory
   */
  public setWorkingDirectory(newDir: string): void {
    const resolvedPath = path.resolve(newDir);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new Error('Directory does not exist or is not a directory');
    }
    this.workingDirectory = resolvedPath;
  }
}

// Example usage and test functions
export async function demonstrateFileManagement() {
  // You would need to provide your actual Gemini API key
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'gemini-api-key',
    model: 'gemini-2.0-flash'
  };

  const agent = new FileManagementAgent(config, './test-workspace');

  console.log('🗂️  File Management Agent Demo');
  console.log('Working directory:', agent.getWorkingDirectory());

  const testCases = [
    "List the contents of the current directory",
    "Create a test directory called 'demo-files'",
    "Create a file called 'hello.txt' with content 'Hello, AgentLoop!' in the demo-files directory",
    "Read the contents of the hello.txt file",
    "Search for all .txt files in the current directory",
    "Get detailed information about the demo-files directory"
  ];

  for (let i = 0; i < testCases.length; i++) {
    console.log(`\n--- Test Case ${i + 1}: ${testCases[i]} ---`);
    
    try {
      const result = await agent.run({
        userPrompt: testCases[i],
        conversationHistory: [],
        toolCallHistory: []
      });

      console.log('✅ Success!');
      console.log('Final Answer:', result.finalAnswer?.output?.value || 'No final answer');
      console.log('Tool Calls Made:', result.toolCallHistory.length);
      
      // Show failed tools if any
      const failedTools = result.toolCallHistory.filter(tool => !tool.success);
      if (failedTools.length > 0) {
        console.log('❌ Failed Tools:', failedTools.map(t => `${t.toolname}: ${t.error}`));
      }
    } catch (error) {
      console.log('❌ Test failed:', error);
    }
  }
}

// Complex scenario test
export async function demonstrateComplexFileOperations() {
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'your-api-key-here',
    model: 'gemini-2.0-flash'
  };

  const agent = new FileManagementAgent(config);

  console.log('\n🔧 Complex File Operations Demo');

  const complexPrompt = `I need help organizing my project files. Please:
1. Create a project structure with folders: src, docs, tests
2. Create a package.json file in the root with basic project info
3. Create a README.md file with project description
4. List all files and directories when done
Please make sure each step is completed before moving to the next.`;

  try {
    const result = await agent.run({
      userPrompt: complexPrompt,
      conversationHistory: [],
      toolCallHistory: []
    });

    console.log('📋 Complex Operation Result:');
    console.log('Tool Calls Made:', result.toolCallHistory.length);
    console.log('Final Answer:', result.finalAnswer?.output?.value);
    
    // Show the sequence of operations
    result.toolCallHistory.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.toolname}: ${tool.success ? '✅' : '❌'} ${tool.success ? 'Success' : tool.error}`);
    });

  } catch (error) {
    console.log('❌ Complex operation failed:', error);
  }
}

// Additional exports for testing and usage