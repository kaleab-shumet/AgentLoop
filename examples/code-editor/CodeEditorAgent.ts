import { AgentLoop, FormatMode } from '../../core';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import z from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as beautify from 'js-beautify';

/**
 * Code Editor Agent - Full File Management Capabilities
 * Create, Edit, Delete, and manage files and directories
 */
class CodeEditorAgent extends AgentLoop {
  private basePath: string;

  protected systemPrompt = `You are an expert software engineer AI with full codebase management capabilities.

**Your Role:**
You function as a senior software engineer who can understand, analyze, and modify codebases across multiple programming languages and frameworks. You have complete file system access to implement features, fix bugs, refactor code, and maintain software projects.

**Engineering Capabilities:**
- Analyze existing codebases and understand architecture patterns
- Implement new features following established code conventions
- Debug and fix issues across frontend, backend, and full-stack applications
- Refactor code for better performance, maintainability, and scalability
- Create comprehensive file structures for new projects
- Handle multiple programming languages (JavaScript, TypeScript, Python, etc.)
- Work with modern frameworks (React, Vue, Node.js, Express, etc.)

**File Operations You Can Perform:**
- CREATE: New files, components, modules, configuration files
- READ: Analyze code structure, dependencies, and implementation details  
- UPDATE: Edit files with precision targeting (find/replace, line-specific changes)
- DELETE: Remove deprecated files and clean up unused code
- SEARCH: Find functions, classes, imports, and patterns across codebase
- ORGANIZE: Restructure projects, create proper directory hierarchies

**Engineering Best Practices:**
- Follow established code conventions and style guides
- Write clean, maintainable, and well-documented code
- Consider performance, security, and scalability implications
- Test changes thoroughly and handle edge cases
- Maintain backwards compatibility when possible
- Use proper error handling and logging

You approach every task with the mindset of a professional software engineer, considering the broader impact of changes on the entire system.`;

  constructor(basePath: string = path.join(process.cwd(), 'testfolder')) {
    super(new DefaultAIProvider(

      {
        service: 'azure',
        apiKey: process.env.AZURE_OPENAI_API_KEY || "azure-api-key",
        baseURL: process.env.AZURE_OPENAI_RESOURCE_NAME,
        model: 'gpt-4.1-mini',
        temperature: 0
      }

      // {
      //   service: 'google',
      //   apiKey: process.env.GEMINI_API_KEY || "gemin-api-key",
      //   model: 'gemini-2.0-flash'
      // }


    ), {
      formatMode: FormatMode.JSOBJECT,
      maxIterations: 15,
      stagnationTerminationThreshold: 5,
      parallelExecution: false,  // Ensure file operations run sequentially
      sleepBetweenIterationsMs: 5000
      
    });

    this.basePath = basePath;
    this.setupFileOperations();
  }

  private setupFileOperations() {
    // CREATE FILE
    this.defineTool(z => ({
      name: 'create_file',
      description: 'Create a new file with content',
      argsSchema: z.object({
        filepath: z.string().describe('Path where to create the file'),
        content: z.string().describe('File content to write'),
        overwrite: z.boolean().optional().default(false).describe('Overwrite if file exists'),
        createDirs: z.boolean().optional().default(true).describe('Create parent directories')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, 'testfolder', args.filepath);

          // Check if file exists
          if (fs.existsSync(fullPath) && !args.overwrite) {
            return {
              toolName: 'create_file',
              success: false,
              filepath: args.filepath,
              error: 'File already exists. Use overwrite=true to replace it.',
              exists: true
            };
          }

          // Create parent directories if needed
          if (args.createDirs) {
            const dir = path.dirname(fullPath);
            await fs.promises.mkdir(dir, { recursive: true });
          }

          // Write the file
          await fs.promises.writeFile(fullPath, args.content, 'utf8');
          const stats = await fs.promises.stat(fullPath);

          return {
            toolName: 'create_file',
            success: true,
            filepath: args.filepath,
            size: stats.size,
            lines: args.content.split('\n').length,
            created: true
          };

        } catch (error) {
          return {
            toolName: 'create_file',
            success: false,
            filepath: args.filepath,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }));

    // READ FILE
    this.defineTool(z => ({
      name: 'read_file',
      description: 'Read and display contents of a file. To read full content: omit lines parameter. To read specific lines: provide lines.start and/or lines.end (1-based indexing). Examples: lines:{start:10,end:20} reads lines 10-20, lines:{start:5} reads from line 5 to end, lines:{end:10} reads first 10 lines.',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file to read'),
        encoding: z.string().optional().default('utf8').describe('File encoding (utf8, ascii, etc.)'),
        lines: z.object({
          start: z.number().optional().describe('Start line number (1-based). If omitted, starts from beginning of file'),
          end: z.number().optional().describe('End line number (1-based). If omitted, reads to end of file')
        }).optional().describe('Optional: Read specific line range. Omit this parameter to read the entire file content. Use 1-based line numbering (first line is 1, not 0)')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, 'testfolder', args.filepath);
          const content = await fs.promises.readFile(fullPath, args.encoding as BufferEncoding);
          const stats = await fs.promises.stat(fullPath);
          const contentString = content.toString();

          let displayContent = contentString;
          let totalLines = contentString.split('\n').length;

          // Handle line range if specified
          if (args.lines) {
            const lines = contentString.split('\n');
            const start = (args.lines.start || 1) - 1; // Convert to 0-based
            const end = args.lines.end ? args.lines.end - 1 : lines.length - 1;
            displayContent = lines.slice(start, end + 1).join('\n');
          }

          return {
            toolName: 'read_file',
            success: true,
            filepath: args.filepath,
            content: displayContent,
            size: stats.size,
            totalLines,
            displayedLines: args.lines ? `${args.lines.start || 1}-${args.lines.end || totalLines}` : 'all',
            lastModified: stats.mtime.toISOString(),
            extension: path.extname(args.filepath)
          };

        } catch (error) {
          return {
            toolName: 'read_file',
            success: false,
            filepath: args.filepath,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }));

    // EDIT FILE - Exact string replacement
    this.defineTool(z => ({
      name: 'edit_file',
      description: 'Edit files by targeting COMPLETE LINES of code/text for replacement. NOT for single word edits - use for entire lines, multiple consecutive lines, or line-based structures. Uses LITERAL STRING MATCHING ONLY - NO REGEX. BE EXTREMELY PRECISE: Must match text exactly including ALL spaces, tabs, indentation, braces, commas, line breaks, and special characters. Even a single character difference will cause failure. Read the file first and copy exact text character-by-character.',
      argsSchema: z.object({
        file_path: z.string().describe('Path to the file to edit'),
        old_string: z.string().min(1).describe('COMPLETE LINES of text to find - target entire lines or multiple consecutive lines. LITERAL STRING ONLY, NO REGEX PATTERNS'),
        new_string: z.string().min(1).describe('Text to replace with'),
        expected_match: z.number().min(1).describe('How many matches of string you want to replace.')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, 'testfolder', args.file_path);

          // Check if file exists
          if (!fs.existsSync(fullPath)) {
            return {
              toolName: 'edit_file',
              success: false,
              file_path: args.file_path,
              error: 'File does not exist'
            };
          }

          // Count matches using native Node.js
          const fileContent = await fs.promises.readFile(fullPath, 'utf8');
          let actualMatches = 0;
          let searchIndex = 0;

          while (true) {
            const foundIndex = fileContent.indexOf(args.old_string, searchIndex);
            if (foundIndex === -1) break;
            actualMatches++;
            searchIndex = foundIndex + args.old_string.length;
          }

          // Check if no matches found
          if (actualMatches === 0) {
            throw new Error(`No matches found for "${args.old_string}". SOLUTION: 1. Read the file first using read_file tool, 2. Then check spelling, exact spacing, indentation, line breaks. Copy text character-by-character from the file.`);
          }

          // Check if match count equals expected
          if (actualMatches === args.expected_match) {
            // Use native Node.js approach for reliable replacement
            let newContent = fileContent;
            let replacementsMade = 0;

            // Replace exactly expected_match number of occurrences
            let searchIndex = 0;
            while (replacementsMade < args.expected_match) {
              const foundIndex = newContent.indexOf(args.old_string, searchIndex);
              if (foundIndex === -1) break; // No more matches found

              newContent = newContent.substring(0, foundIndex) +
                args.new_string +
                newContent.substring(foundIndex + args.old_string.length);

              replacementsMade++;
              searchIndex = foundIndex + args.new_string.length;
            }

            const hasChanged = newContent !== fileContent;
            if (hasChanged) {
              await fs.promises.writeFile(fullPath, newContent, 'utf8');
            }

            const newStats = await fs.promises.stat(fullPath);

            return {
              toolName: 'edit_file',
              success: true,
              file_path: args.file_path,
              hasChanged,
              actualMatches,
              expectedMatch: args.expected_match,
              newSize: newStats.size,
              replacements: replacementsMade
            };
          } else {
            // Mismatch - guide LLM to include more context without revealing actual count
            throw new Error(`Found ${actualMatches} matches, expected ${args.expected_match}. SOLUTION: Include more surrounding lines/context to make your old_string unique and appear exactly ${args.expected_match} time(s). Additionally you can target text block.`);
          }

        } catch (error) {
          // Re-throw the error so AgentLoop can handle it properly
          // This ensures failed edit operations are visible in the Notes section
          throw error;
        }
      }
    }));

    // DELETE FILE
    this.defineTool(z => ({
      name: 'delete_file',
      description: 'Delete a file or directory. Use recursive=true to delete non-empty directories. Use backup=true to create a backup before deletion. Use force=true to skip confirmations (be careful!).',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file or directory to delete'),
        force: z.boolean().optional().default(false).describe('Force delete (skip confirmations)'),
        recursive: z.boolean().optional().default(false).describe('Delete directories recursively'),
        backup: z.boolean().optional().default(false).describe('Create backup before deleting')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, 'testfolder', args.filepath);

          if (!fs.existsSync(fullPath)) {
            return {
              toolName: 'delete_file',
              success: false,
              filepath: args.filepath,
              error: 'File or directory does not exist',
              exists: false
            };
          }

          const stats = await fs.promises.stat(fullPath);
          const isDirectory = stats.isDirectory();

          // Create backup if requested
          let backupPath: string | null = null;
          if (args.backup && !isDirectory) {
            backupPath = `${fullPath}.deleted.${Date.now()}`;
            await fs.promises.copyFile(fullPath, backupPath);
          }

          // Delete the file or directory
          if (isDirectory) {
            if (args.recursive) {
              await fs.promises.rm(fullPath, { recursive: true, force: args.force });
            } else {
              await fs.promises.rmdir(fullPath);
            }
          } else {
            await fs.promises.unlink(fullPath);
          }

          return {
            toolName: 'delete_file',
            success: true,
            filepath: args.filepath,
            type: isDirectory ? 'directory' : 'file',
            size: isDirectory ? null : stats.size,
            backup: backupPath,
            deleted: true
          };

        } catch (error) {
          return {
            toolName: 'delete_file',
            success: false,
            filepath: args.filepath,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }));

    // LIST FILES
    this.defineTool(z => ({
      name: 'list_files',
      description: 'List files and directories in a specific directory. Use recursive=true to search subdirectories. Use pattern="*.js" to filter by file extension. Use details=true to get file sizes and dates.',
      argsSchema: z.object({
        directory: z.string().describe('Directory path to list'),
        pattern: z.string().optional().describe('File pattern to match (e.g., "*.js", "*.tsx")'),
        recursive: z.boolean().optional().default(false).describe('Search subdirectories'),
        includeHidden: z.boolean().optional().default(false).describe('Include hidden files (starting with .)'),
        details: z.boolean().optional().default(true).describe('Include file details (size, modified date)')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, 'testfolder', args.directory);
          const files = await this.listFilesRecursive(
            fullPath,
            args.recursive,
            args.pattern,
            args.includeHidden
          );

          let results: any = files;

          if (args.details) {
            results = await Promise.all(
              files.map(async (file) => {
                try {
                  const stats = await fs.promises.stat(file);
                  return {
                    path: file,
                    name: path.basename(file),
                    type: stats.isDirectory() ? 'directory' : 'file',
                    size: stats.isFile() ? stats.size : null,
                    modified: stats.mtime.toISOString(),
                    extension: stats.isFile() ? path.extname(file) : null
                  };
                } catch (error) {
                  return {
                    path: file,
                    name: path.basename(file),
                    error: 'Could not read file stats'
                  };
                }
              })
            );
          } else {
            results = files.map(file => ({ path: file, name: path.basename(file) }));
          }

          return {
            toolName: 'list_files',
            success: true,
            directory: args.directory,
            totalItems: results.length,
            pattern: args.pattern,
            recursive: args.recursive,
            files: results
          };
        } catch (error) {
          return {
            toolName: 'list_files',
            success: false,
            directory: args.directory,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }));

    // CREATE DIRECTORY
    this.defineTool(z => ({
      name: 'create_directory',
      description: 'Create a new directory',
      argsSchema: z.object({
        dirpath: z.string().describe('Path of the directory to create'),
        recursive: z.boolean().optional().default(true).describe('Create parent directories if needed')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, 'testfolder', args.dirpath);

          if (fs.existsSync(fullPath)) {
            return {
              toolName: 'create_directory',
              success: false,
              dirpath: args.dirpath,
              error: 'Directory already exists',
              exists: true
            };
          }

          await fs.promises.mkdir(fullPath, { recursive: args.recursive });

          return {
            toolName: 'create_directory',
            success: true,
            dirpath: args.dirpath,
            created: true
          };
        } catch (error) {
          return {
            toolName: 'create_directory',
            success: false,
            dirpath: args.dirpath,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }));

    // SEARCH FILES
    this.defineTool(z => ({
      name: 'search_files',
      description: 'Search for files by filename, content, or both. Use searchType="filename" to search only filenames, searchType="content" to search file contents, searchType="both" for both. Use caseSensitive=true for exact case matching. Useful for finding TODO comments, function definitions, etc.',
      argsSchema: z.object({
        searchTerm: z.string().describe('Text to search for'),
        directory: z.string().describe('Directory to search in'),
        searchType: z.enum(['filename', 'content', 'both']).default('both').describe('What to search in'),
        filePattern: z.string().optional().describe('File pattern to limit search (e.g., "*.js")'),
        caseSensitive: z.boolean().optional().default(false).describe('Case sensitive search'),
        maxResults: z.number().optional().default(50).describe('Maximum number of results')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, 'testfolder', args.directory);
          const results: any[] = [];

          const files = await this.listFilesRecursive(fullPath, true, args.filePattern, false);

          for (const file of files) {
            if (results.length >= args.maxResults) break;

            try {
              const stats = await fs.promises.stat(file);
              if (stats.isDirectory()) continue;

              const fileName = path.basename(file);
              let matches: any = {
                file,
                name: fileName,
                matches: []
              };

              // Search filename
              if (args.searchType === 'filename' || args.searchType === 'both') {
                const searchIn = args.caseSensitive ? fileName : fileName.toLowerCase();
                const searchFor = args.caseSensitive ? args.searchTerm : args.searchTerm.toLowerCase();

                if (searchIn.includes(searchFor)) {
                  matches.matches.push({ type: 'filename', match: fileName });
                }
              }

              // Search content
              if (args.searchType === 'content' || args.searchType === 'both') {
                try {
                  const content = await fs.promises.readFile(file, 'utf8');
                  const lines = content.split('\n');

                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const searchIn = args.caseSensitive ? line : line.toLowerCase();
                    const searchFor = args.caseSensitive ? args.searchTerm : args.searchTerm.toLowerCase();

                    if (searchIn.includes(searchFor)) {
                      matches.matches.push({
                        type: 'content',
                        line: i + 1,
                        text: line.trim(),
                        match: args.searchTerm
                      });
                    }
                  }
                } catch (error) {
                  // Skip files that can't be read as text
                }
              }

              if (matches.matches.length > 0) {
                results.push(matches);
              }
            } catch (error) {
              // Skip files with errors
            }
          }

          return {
            toolName: 'search_files',
            success: true,
            searchTerm: args.searchTerm,
            directory: args.directory,
            searchType: args.searchType,
            totalResults: results.length,
            results: results.slice(0, args.maxResults)
          };
        } catch (error) {
          return {
            toolName: 'search_files',
            success: false,
            directory: args.directory,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }));

    // EXECUTE COMMAND
    this.defineTool(z => ({
      name: 'execute_command',
      description: 'Execute shell commands like npm install, git commands, running tests, building projects, etc. Use with caution and provide clear commands.',
      argsSchema: z.object({
        command: z.string().describe('The shell command to execute'),
        workingDirectory: z.string().optional().describe('Working directory for the command (defaults to base path)'),
        timeout: z.number().optional().default(30000).describe('Timeout in milliseconds (default: 30 seconds)')
      }),
      handler: async ({ args }: any) => {
        try {
          const { spawn } = require('child_process');
          const workingDir = args.workingDirectory ? path.resolve(this.basePath, args.workingDirectory) : path.join(this.basePath, 'testfolder');
          
          return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            
            // Parse command and arguments
            const commandParts = args.command.split(' ');
            const cmd = commandParts[0];
            const cmdArgs = commandParts.slice(1);
            
            const process = spawn(cmd, cmdArgs, {
              cwd: workingDir,
              stdio: ['pipe', 'pipe', 'pipe'],
              shell: true
            });
            
            // Set timeout
            const timer = setTimeout(() => {
              process.kill();
              resolve({
                toolName: 'execute_command',
                success: false,
                command: args.command,
                workingDirectory: workingDir,
                error: 'Command timed out',
                timeout: true
              });
            }, args.timeout);
            
            process.stdout.on('data', (data: Buffer) => {
              stdout += data.toString();
            });
            
            process.stderr.on('data', (data: Buffer) => {
              stderr += data.toString();
            });
            
            process.on('close', (code: number | null) => {
              clearTimeout(timer);
              
              const success = code === 0;
              resolve({
                toolName: 'execute_command',
                success,
                command: args.command,
                workingDirectory: workingDir,
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                output: success ? stdout.trim() : stderr.trim()
              });
            });
            
            process.on('error', (error: Error) => {
              clearTimeout(timer);
              resolve({
                toolName: 'execute_command',
                success: false,
                command: args.command,
                workingDirectory: workingDir,
                error: error.message
              });
            });
          });
          
        } catch (error) {
          return {
            toolName: 'execute_command',
            success: false,
            command: args.command,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }));

    // FINAL TOOL
    this.defineTool(z => ({
      name: 'final_tool',
      description: 'Provide a final response summarizing completed work or can be used for conversation in nicely formatted way for user',
      argsSchema: z.object({
        value: z.string().describe('Summary of all work completed or can be used for conversation in nicely formatted way for user')
      }),
      handler: async ({ args }: any) => {
        return {
          toolName: 'final_tool',
          success: true,
          value: args.value
        };
      }
    }));
  }

  // Helper Methods
  private async listFilesRecursive(
    dir: string,
    recursive: boolean = false,
    pattern?: string,
    includeHidden: boolean = false
  ): Promise<string[]> {
    const files: string[] = [];
    
    // Common directories to ignore in development projects
    const ignoredDirs = new Set([
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      'dist',
      'build',
      'out',
      'target',
      '__pycache__',
      '.pytest_cache',
      '.mypy_cache',
      '.tox',
      'venv',
      'env',
      '.venv',
      '.env',
      'coverage',
      '.coverage',
      '.nyc_output',
      'tmp',
      'temp',
      '.tmp',
      '.DS_Store',
      'Thumbs.db'
    ]);

    try {
      const items = await fs.promises.readdir(dir);

      for (const item of items) {
        if (!includeHidden && item.startsWith('.')) continue;
        if (ignoredDirs.has(item)) continue; // Skip ignored directories

        const fullPath = path.join(dir, item);
        const stats = await fs.promises.stat(fullPath);

        if (stats.isDirectory() && recursive) {
          const subFiles = await this.listFilesRecursive(fullPath, recursive, pattern, includeHidden);
          files.push(...subFiles);
        } else if (stats.isFile()) {
          if (!pattern || this.matchPattern(item, pattern)) {
            files.push(fullPath);
          }
        } else if (stats.isDirectory()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }

    return files;
  }

  private matchPattern(filename: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regex = new RegExp(
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    );
    return regex.test(filename);
  }
}

export { CodeEditorAgent };