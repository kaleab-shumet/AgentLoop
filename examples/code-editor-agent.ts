import { AgentLoop, FormatMode } from '../core';
import { DefaultAIProvider } from '../core/providers/DefaultAIProvider';
import z from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as beautify from 'js-beautify';
import { replaceInFile } from 'replace-in-file';

/**
 * Code Editor Agent - Full File Management Capabilities
 * Create, Edit, Delete, and manage files and directories
 */
class CodeEditorAgent extends AgentLoop {
  private basePath: string;

  protected systemPrompt = `You are a professional code editor AI assistant with full file management capabilities.

**Your Core Functions:**
- Create new files with proper content and structure
- Edit existing files (replace content, insert/append text, find/replace)
- Delete files and directories safely
- List and search files
- Manage directory structures
- Handle multiple programming languages and file types

**File Operations You Can Perform:**
- CREATE: New files with content, templates, boilerplate code
- READ: View file contents, get file information
- UPDATE: Edit files, replace sections, insert/append content
- DELETE: Remove files and empty directories safely
- SEARCH: Find files by name, pattern, or content
- ORGANIZE: Create directory structures, move files

**Best Practices:**
- Always confirm destructive operations (delete)
- Create backups when requested
- Use proper file extensions and naming conventions
- Respect existing file structures
- Handle errors gracefully and inform the user

You are a powerful file manager - use these capabilities responsibly to help users manage their codebase effectively.`;

  constructor(basePath: string = path.join(process.cwd(), 'testfolder')) {
    super(new DefaultAIProvider(
      
      {
      service: 'azure',
      apiKey: process.env.AZURE_OPENAI_API_KEY || "azure-api-key",
      baseURL: process.env.AZURE_OPENAI_RESOURCE_NAME,
      model: 'gpt-4.1-mini'
    }

  //  {
  //     service: 'google',
  //     apiKey: process.env.GEMINI_API_KEY || "gemin-api-key",
  //     model: 'gemini-2.0-flash'
  //   }
  
  
  ), {
      formatMode: FormatMode.JSOBJECT,
      maxIterations: 8,
      stagnationTerminationThreshold: 5
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
          const fullPath = path.resolve(this.basePath, args.filepath);

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
          const fullPath = path.resolve(this.basePath, args.filepath);
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
        new_string: z.string().describe('Text to replace with'),
        expected_match: z.number().min(1).describe('Expected number of matches to find')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, args.file_path);

          // Check if file exists
          if (!fs.existsSync(fullPath)) {
            return {
              toolName: 'edit_file',
              success: false,
              file_path: args.file_path,
              error: 'File does not exist'
            };
          }

          // First, count matches using replace-in-file dry run with global regex
          // Convert string to escaped regex with global flag to count ALL occurrences
          const escapedString = args.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const globalRegex = new RegExp(escapedString, 'g');
          
          const countResult = await replaceInFile({
            files: fullPath,
            from: globalRegex,
            to: args.new_string,
            dry: true, // Don't actually replace, just count
            countMatches: true, // Enable counting
            encoding: 'utf8'
          });

          const actualMatches = countResult[0]?.numMatches || 0;

          // Check if no matches found
          if (actualMatches === 0) {
            return {
              toolName: 'edit_file',
              success: false,
              file_path: args.file_path,
              error: `No matches found for the provided old_string. BE EXTREMELY PRECISE: copy the EXACT text from the file including ALL spaces, tabs, indentation, braces, commas, and line breaks. Even a single character difference will cause failure. Read the file first and copy the exact string character-by-character.`,
              expectedMatch: args.expected_match,
              actualMatches: 0
            };
          }

          // Check if match count equals expected
          if (actualMatches === args.expected_match) {
            // Execute actual replacement using same global regex
            const replaceResult = await replaceInFile({
              files: fullPath,
              from: globalRegex,
              to: args.new_string,
              encoding: 'utf8'
            });
            
            const newStats = await fs.promises.stat(fullPath);
            const hasChanged = replaceResult[0]?.hasChanged || false;

            return {
              toolName: 'edit_file',
              success: true,
              file_path: args.file_path,
              hasChanged,
              actualMatches,
              expectedMatch: args.expected_match,
              newSize: newStats.size,
              replacements: actualMatches
            };
          } else {
            // Mismatch - guide LLM to include more context without revealing actual count
            return {
              toolName: 'edit_file',
              success: false,
              file_path: args.file_path,
              error: `The number of matches found in the string is different from the your expected match count. Please add more surrounding string to match exactly or include the whole text block.`,
              expectedMatch: args.expected_match
            };
          }

        } catch (error) {
          return {
            toolName: 'edit_file',
            success: false,
            file_path: args.file_path,
            error: error instanceof Error ? error.message : String(error)
          };
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
          const fullPath = path.resolve(this.basePath, args.filepath);

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
          const fullPath = path.resolve(this.basePath, args.directory);
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
          const fullPath = path.resolve(this.basePath, args.dirpath);

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
          const fullPath = path.resolve(this.basePath, args.directory);
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
  }

  // Helper Methods
  private async listFilesRecursive(
    dir: string,
    recursive: boolean = false,
    pattern?: string,
    includeHidden: boolean = false
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const items = await fs.promises.readdir(dir);

      for (const item of items) {
        if (!includeHidden && item.startsWith('.')) continue;

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