import { AgentLoop, ExecutionMode, AgentRunInput, AgentRunOutput, TurnState, ToolResult } from '../../core';
import { GeminiAIProvider } from '../../core/providers/GeminiAIProvider';
import z from 'zod';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Enhanced Real File Manager Agent that provides a comprehensive file management interface.
 * Features include file operations, directory management, content search, and safe file handling.
 */
export class RealFileManagerAgent extends AgentLoop {
  protected systemPrompt = `You are a friendly and helpful file management assistant named FileBot. You have a warm, conversational personality and comprehensive file operation capabilities.

🎯 CONVERSATIONAL BEHAVIOR:
- Respond warmly to greetings like "hello", "hi", "good morning" with friendly responses
- Engage in casual conversation while staying focused on file management tasks
- Be encouraging and supportive when users are learning
- Use emojis appropriately to make interactions more engaging
- If someone just says "hello" or greets you, respond conversationally and ask how you can help with file management

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

Always be helpful, accurate, conversational, and explain what you're doing in a friendly manner. Make file management feel approachable and less intimidating!`;

  private workingDirectory: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB limit
  private allowedExtensions: string[] = ['.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.xml', '.csv', '.log', '.py', '.java', '.cpp', '.c', '.h'];
  private debugMode: boolean = false;

  constructor(config: any, workingDir: string = process.cwd(), debugMode: boolean = false) {
    const provider = new GeminiAIProvider(config);
    super(provider, {
      maxIterations: 10,
      parallelExecution: false, // Sequential for file operations safety
      executionMode: ExecutionMode.XML
    });

    this.workingDirectory = path.resolve(workingDir);
    this.debugMode = debugMode;
    this.setupTools();
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  public isDebugMode(): boolean {
    return this.debugMode;
  }

  private debugLog(message: string, data?: any): void {
    if (this.debugMode) {
      console.log(`🐛 [DEBUG] ${message}`, data || '');
    }
  }

  private setupTools() {
    // Enhanced directory listing tool
    this.defineTool((z) => ({
      name: 'list_directory',
      description: 'List contents of a directory with detailed file information including size, type, and modification dates.',
      responseSchema: z.object({
        dirPath: z.string().optional().default('.').describe('Directory path to list (relative to working directory or absolute, defaults to current directory)'),
        showHidden: z.boolean().optional().default(false).describe('Whether to show hidden files and directories'),
        recursive: z.boolean().optional().default(false).describe('Whether to list subdirectories recursively'),
        maxDepth: z.number().optional().default(3).describe('Maximum recursion depth when recursive is true')
      }),
      handler: async (name: string, args: any, turnState: TurnState) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.dirPath);

          if (!this.isPathSafe(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          if (!fs.existsSync(targetPath)) {
            throw new Error('Directory does not exist');
          }

          if (!fs.statSync(targetPath).isDirectory()) {
            throw new Error('Path is not a directory');
          }

          const contents = this.listDirectoryRecursive(targetPath, args.showHidden, args.recursive, args.maxDepth, 0);

          // Store formatted directory listing for direct display
          turnState.set("display", this.formatDirectoryListing(contents));

          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              relativePath: path.relative(this.workingDirectory, targetPath),
              workingDirectory: this.workingDirectory,
              contents,
              totalItems: contents.length,
              summary: {
                files: contents.filter(item => item.type === 'file').length,
                directories: contents.filter(item => item.type === 'directory').length,
                totalSize: contents.filter(item => item.type === 'file').reduce((sum, item) => sum + (item.size || 0), 0)
              }
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

    // Enhanced file reading tool
    this.defineTool((z) => ({
      name: 'read_file',
      description: 'Read the contents of a text file. Supports various text formats and provides encoding detection.',
      responseSchema: z.object({
        filePath: z.string().describe('Path to the file to read'),
        encoding: z.string().optional().default('utf8').describe('File encoding (utf8, ascii, etc.)'),
        startLine: z.number().optional().describe('Start reading from this line number (1-based)'),
        endLine: z.number().optional().describe('Stop reading at this line number (1-based)'),
        preview: z.boolean().optional().default(false).describe('If true, only show first 50 lines for large files')
      }),
      handler: async (name: string, args: any, turnState: TurnState) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.filePath);

          if (!this.isPathSafe(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          if (!fs.existsSync(targetPath)) {
            throw new Error('File does not exist');
          }

          const stats = fs.statSync(targetPath);

          if (!stats.isFile()) {
            throw new Error('Path is not a file');
          }

          if (stats.size > this.maxFileSize) {
            throw new Error(`File too large (${stats.size} bytes > ${this.maxFileSize} bytes limit). Use preview mode for large files.`);
          }

          const extension = path.extname(targetPath).toLowerCase();
          if (!this.allowedExtensions.includes(extension) && extension !== '') {
            return {
              toolname: name,
              success: true,
              output: {
                type: 'binary',
                path: targetPath,
                relativePath: path.relative(this.workingDirectory, targetPath),
                size: stats.size,
                extension,
                modified: stats.mtime.toISOString(),
                message: 'Binary file - content not displayed for safety'
              }
            };
          }

          let content = fs.readFileSync(targetPath, args.encoding as BufferEncoding);
          const lines = content.toString().split('\n');

          let processedContent = content.toString();

          turnState.set("display", processedContent);
          
          this.debugLog(`Read file: ${targetPath}`, { size: content.length, lines: lines.length });
          let isPartial = false;

          if (args.preview && lines.length > 50) {
            processedContent = lines.slice(0, 50).join('\n') + '\n... (file truncated for preview)';
            isPartial = true;
          } else if (args.startLine || args.endLine) {
            const start = Math.max(0, (args.startLine || 1) - 1);
            const end = args.endLine || lines.length;
            processedContent = lines.slice(start, end).join('\n');
            isPartial = true;
          }

          return {
            toolname: name,
            success: true,
            output: {
              type: 'text',
              path: targetPath,
              relativePath: path.relative(this.workingDirectory, targetPath),
              content: processedContent,
              size: stats.size,
              lines: lines.length,
              encoding: args.encoding,
              modified: stats.mtime.toISOString(),
              isPartial,
              range: isPartial ? {
                startLine: args.startLine || 1,
                endLine: args.endLine || (args.preview ? 50 : lines.length)
              } : null
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

    // Enhanced file writing tool
    this.defineTool((z) => ({
      name: 'write_file',
      description: 'Write content to a file. Supports creating new files or overwriting existing ones with backup options.',
      responseSchema: z.object({
        filePath: z.string().describe('Path where to write the file'),
        content: z.string().describe('Content to write to the file'),
        createDirs: z.boolean().optional().default(false).describe('Create parent directories if they don\'t exist'),
        backup: z.boolean().optional().default(false).describe('Create a backup of existing file before overwriting'),
        encoding: z.string().optional().default('utf8').describe('File encoding')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.filePath);

          if (!this.isPathSafe(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          const directory = path.dirname(targetPath);
          const fileName = path.basename(targetPath);
          let backupPath = null;

          // Check if directory exists or needs to be created
          if (!fs.existsSync(directory)) {
            if (args.createDirs) {
              fs.mkdirSync(directory, { recursive: true });
            } else {
              throw new Error(`Directory does not exist: ${directory}. Use createDirs=true to create it.`);
            }
          }

          // Create backup if requested and file exists
          if (args.backup && fs.existsSync(targetPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            backupPath = path.join(directory, `${fileName}.backup.${timestamp}`);
            fs.copyFileSync(targetPath, backupPath);
          }

          fs.writeFileSync(targetPath, args.content, args.encoding);
          const stats = fs.statSync(targetPath);

          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              relativePath: path.relative(this.workingDirectory, targetPath),
              size: stats.size,
              created: stats.mtime.toISOString(),
              encoding: args.encoding,
              backupCreated: backupPath,
              message: `File written successfully${backupPath ? ' (backup created)' : ''}`
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

    // Enhanced directory creation tool
    this.defineTool((z) => ({
      name: 'create_directory',
      description: 'Create a new directory or nested directory structure.',
      responseSchema: z.object({
        dirPath: z.string().describe('Path of the directory to create'),
        recursive: z.boolean().optional().default(true).describe('Create parent directories if needed')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.dirPath);

          if (!this.isPathSafe(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          if (fs.existsSync(targetPath)) {
            if (fs.statSync(targetPath).isDirectory()) {
              return {
                toolname: name,
                success: true,
                output: {
                  path: targetPath,
                  relativePath: path.relative(this.workingDirectory, targetPath),
                  created: new Date().toISOString(),
                  message: 'Directory already exists'
                }
              };
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
              relativePath: path.relative(this.workingDirectory, targetPath),
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

    // File search tool with content search
    this.defineTool((z) => ({
      name: 'search_files',
      description: 'Search for files by name pattern and optionally search within file contents.',
      responseSchema: z.object({
        searchPath: z.string().optional().default('.').describe('Directory to search in'),
        namePattern: z.string().optional().describe('File name pattern to search for (supports wildcards like *.txt)'),
        contentPattern: z.string().optional().describe('Text pattern to search for within files'),
        maxDepth: z.number().optional().default(5).describe('Maximum directory depth to search'),
        maxResults: z.number().optional().default(100).describe('Maximum number of results to return'),
        caseSensitive: z.boolean().optional().default(false).describe('Whether search should be case sensitive')
      }),
      handler: async (name: string, args: any, turnState: TurnState) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.searchPath);

          if (!this.isPathSafe(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          const results: any[] = [];

          const searchRecursive = (dir: string, depth: number) => {
            if (depth > args.maxDepth || results.length >= args.maxResults) return;

            try {
              const items = fs.readdirSync(dir, { withFileTypes: true });

              for (const item of items) {
                if (results.length >= args.maxResults) break;

                const itemPath = path.join(dir, item.name);

                if (item.isFile()) {
                  let nameMatches = true;

                  // Check name pattern if provided
                  if (args.namePattern) {
                    const pattern = args.namePattern.replace(/\*/g, '.*').replace(/\?/g, '.');
                    const regex = new RegExp(pattern, args.caseSensitive ? '' : 'i');
                    nameMatches = regex.test(item.name);
                  }

                  if (nameMatches) {
                    const stats = fs.statSync(itemPath);
                    const result: any = {
                      path: itemPath,
                      relativePath: path.relative(this.workingDirectory, itemPath),
                      name: item.name,
                      size: stats.size,
                      modified: stats.mtime.toISOString(),
                      type: 'file',
                      nameMatch: !!args.namePattern
                    };

                    // Search content if pattern provided and file is text
                    if (args.contentPattern) {
                      try {
                        const ext = path.extname(itemPath).toLowerCase();
                        if (this.allowedExtensions.includes(ext) && stats.size < this.maxFileSize) {
                          const content = fs.readFileSync(itemPath, 'utf8');
                          const regex = new RegExp(args.contentPattern, args.caseSensitive ? 'g' : 'gi');
                          const matches = content.match(regex);

                          if (matches) {
                            result.contentMatch = true;
                            result.matchCount = matches.length;

                            // Find line numbers of matches
                            const lines = content.split('\n');
                            const matchingLines: any[] = [];
                            lines.forEach((line, index) => {
                              if (regex.test(line)) {
                                matchingLines.push({
                                  lineNumber: index + 1,
                                  content: line.trim(),
                                  matches: line.match(regex)
                                });
                              }
                            });
                            result.matchingLines = matchingLines.slice(0, 5); // Limit to first 5 matches
                          } else {
                            result.contentMatch = false;
                          }
                        }
                      } catch {
                        result.contentMatch = false;
                        result.contentSearchError = 'Unable to search content';
                      }
                    }

                    // Only add if name matches or content matches
                    if (!args.contentPattern || result.contentMatch !== false) {
                      results.push(result);
                    }
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

          // Store formatted search results for direct display
          turnState.set("display", this.formatSearchResults(results));

          return {
            toolname: name,
            success: true,
            output: {
              searchPath: targetPath,
              namePattern: args.namePattern,
              contentPattern: args.contentPattern,
              results,
              totalFound: results.length,
              searchComplete: results.length < args.maxResults,
              summary: {
                filesFound: results.length,
                filesWithContent: results.filter(r => r.contentMatch).length,
                totalMatches: results.reduce((sum, r) => sum + (r.matchCount || 0), 0)
              }
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

    // File and directory information tool
    this.defineTool((z) => ({
      name: 'get_file_info',
      description: 'Get comprehensive information about a file or directory including permissions, size, dates, and type.',
      responseSchema: z.object({
        itemPath: z.string().describe('Path to the file or directory to examine')
      }),
      handler: async (name: string, args: any) => {
        try {
          const targetPath = path.resolve(this.workingDirectory, args.itemPath);

          if (!this.isPathSafe(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          if (!fs.existsSync(targetPath)) {
            throw new Error('File or directory does not exist');
          }

          const stats = fs.statSync(targetPath);
          const isDirectory = stats.isDirectory();

          let additionalInfo: any = {};

          if (isDirectory) {
            try {
              const items = fs.readdirSync(targetPath);
              additionalInfo = {
                itemCount: items.length,
                files: items.filter(item => {
                  try {
                    return fs.statSync(path.join(targetPath, item)).isFile();
                  } catch { return false; }
                }).length,
                directories: items.filter(item => {
                  try {
                    return fs.statSync(path.join(targetPath, item)).isDirectory();
                  } catch { return false; }
                }).length
              };
            } catch {
              additionalInfo = { itemCount: 'Unable to read directory contents' };
            }
          } else {
            const extension = path.extname(targetPath);
            additionalInfo = {
              extension,
              isTextFile: this.allowedExtensions.includes(extension.toLowerCase()),
              sizeFormatted: this.formatFileSize(stats.size)
            };
          }

          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              relativePath: path.relative(this.workingDirectory, targetPath),
              type: isDirectory ? 'directory' : 'file',
              size: stats.size,
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              accessed: stats.atime.toISOString(),
              permissions: {
                mode: stats.mode.toString(8),
                readable: !!(stats.mode & fs.constants.S_IRUSR),
                writable: !!(stats.mode & fs.constants.S_IWUSR),
                executable: !!(stats.mode & fs.constants.S_IXUSR)
              },
              ...additionalInfo
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

    // Change working directory tool
    this.defineTool((z) => ({
      name: 'change_directory',
      description: 'Change the current working directory for file operations.',
      responseSchema: z.object({
        newPath: z.string().describe('New working directory path')
      }),
      handler: async (name: string, args: any) => {
        try {
          const newPath = path.resolve(this.workingDirectory, args.newPath);

          if (!this.isPathSafe(newPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          if (!fs.existsSync(newPath)) {
            throw new Error('Directory does not exist');
          }

          if (!fs.statSync(newPath).isDirectory()) {
            throw new Error('Path is not a directory');
          }

          const oldPath = this.workingDirectory;
          this.workingDirectory = newPath;

          return {
            toolname: name,
            success: true,
            output: {
              oldPath,
              newPath: this.workingDirectory,
              message: `Working directory changed successfully`
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Failed to change directory: ${error.message}`
          };
        }
      }
    }));

    // Delete file or directory tool
    this.defineTool((z) => ({
      name: 'delete_item',
      description: 'Delete a file or directory. Use with caution - this operation cannot be undone!',
      responseSchema: z.object({
        itemPath: z.string().describe('Path to the file or directory to delete'),
        recursive: z.boolean().optional().default(false).describe('For directories: delete recursively including all contents'),
        confirm: z.boolean().describe('Must be true to confirm deletion - this is a safety measure')
      }),
      handler: async (name: string, args: any) => {
        try {
          if (!args.confirm) {
            throw new Error('Deletion not confirmed. Set confirm=true to proceed with deletion.');
          }

          const targetPath = path.resolve(this.workingDirectory, args.itemPath);

          if (!this.isPathSafe(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory structure');
          }

          if (!fs.existsSync(targetPath)) {
            throw new Error('File or directory does not exist');
          }

          const stats = fs.statSync(targetPath);
          const isDirectory = stats.isDirectory();

          if (isDirectory) {
            if (args.recursive) {
              fs.rmSync(targetPath, { recursive: true, force: true });
            } else {
              fs.rmdirSync(targetPath);
            }
          } else {
            fs.unlinkSync(targetPath);
          }

          return {
            toolname: name,
            success: true,
            output: {
              path: targetPath,
              relativePath: path.relative(this.workingDirectory, targetPath),
              type: isDirectory ? 'directory' : 'file',
              deleted: new Date().toISOString(),
              message: `${isDirectory ? 'Directory' : 'File'} deleted successfully`
            }
          };
        } catch (error: any) {
          return {
            toolname: name,
            success: false,
            error: `Failed to delete: ${error.message}`
          };
        }
      }
    }));

    this.defineTool((z) => ({
      name: 'final',
      description: `⚠️ CRITICAL: Call this tool to TERMINATE the execution and provide your final answer. Use when: (1) You have completed the user's request, (2) All necessary operations are done, (3) You can provide a complete response. This tool ENDS the conversation - only call it when finished. NEVER call other tools after this one.`,
      responseSchema: z.object({ 
        value: z.string().describe("The final, complete answer summarizing what was accomplished and any results.") 
      }),
      handler: async (name: string, args: { value: string; }, turnState: TurnState): Promise<ToolResult> => {
        
        let display = turnState.get("display")
        
        
        return {
          toolname: name,
          success: true,
          output: args,
          display
        };
      },
    }));
  }

  // Helper methods
  private isPathSafe(targetPath: string): boolean {
    // Ensure the path is within or relative to working directory
    const resolved = path.resolve(targetPath);
    const workingDir = path.resolve(this.workingDirectory);

    // Normalize paths for cross-platform compatibility
    const normalizedResolved = path.normalize(resolved);
    const normalizedWorkingDir = path.normalize(workingDir);

    return normalizedResolved.startsWith(normalizedWorkingDir) || normalizedResolved === normalizedWorkingDir;
  }

  private listDirectoryRecursive(dirPath: string, showHidden: boolean, recursive: boolean, maxDepth: number, currentDepth: number): any[] {
    const results: any[] = [];

    if (currentDepth >= maxDepth && recursive) {
      return results;
    }

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const item of items) {
        if (!showHidden && item.name.startsWith('.')) continue;

        const itemPath = path.join(dirPath, item.name);
        const stats = fs.statSync(itemPath);

        const itemInfo = {
          name: item.name,
          path: itemPath,
          relativePath: path.relative(this.workingDirectory, itemPath),
          type: item.isDirectory() ? 'directory' : 'file',
          size: item.isFile() ? stats.size : null,
          sizeFormatted: item.isFile() ? this.formatFileSize(stats.size) : null,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
          extension: item.isFile() ? path.extname(item.name) : null,
          depth: currentDepth
        };

        results.push(itemInfo);

        // Recurse into directories if requested
        if (recursive && item.isDirectory() && currentDepth < maxDepth) {
          const subItems = this.listDirectoryRecursive(itemPath, showHidden, recursive, maxDepth, currentDepth + 1);
          results.push(...subItems);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return results;
  }

  private formatFileSize(bytes: number): string {
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
   * Format directory listing for direct display
   */
  private formatDirectoryListing(contents: any[]): string {
    if (contents.length === 0) {
      return '📁 Directory is empty';
    }

    let output = `📁 Directory Contents (${contents.length} items):\n`;
    output += '─'.repeat(50) + '\n';
    
    contents.forEach(item => {
      const icon = item.type === 'directory' ? '📁' : '📄';
      const size = item.size ? this.formatFileSize(item.size) : '';
      const modified = new Date(item.modified).toLocaleDateString();
      
      output += `${icon} ${item.name.padEnd(25)} ${size.padEnd(10)} ${modified}\n`;
    });
    
    return output;
  }

  /**
   * Format search results for direct display
   */
  private formatSearchResults(results: any[]): string {
    if (results.length === 0) {
      return '🔍 No files found matching the search criteria';
    }

    let output = `🔍 Search Results (${results.length} files found):\n`;
    output += '─'.repeat(60) + '\n';
    
    results.forEach(result => {
      output += `📄 ${result.relativePath}\n`;
      if (result.contentMatch && result.matchingLines) {
        result.matchingLines.slice(0, 2).forEach((line: any) => {
          output += `   Line ${line.lineNumber}: ${line.content}\n`;
        });
      }
      output += '\n';
    });
    
    return output;
  }

  // Public utility methods
  public getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  public setWorkingDirectory(newDir: string): void {
    const resolvedPath = path.resolve(newDir);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new Error('Directory does not exist or is not a directory');
    }
    this.workingDirectory = resolvedPath;
  }

  public getAvailableCommands(): string[] {
    return this.tools.map(tool => tool.name);
  }
}