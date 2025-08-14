import { AgentLoop, FormatMode } from '../core';
import { DefaultAIProvider } from '../core/providers/DefaultAIProvider';
import z from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { replaceInFile } from 'replace-in-file';
import * as beautify from 'js-beautify';

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
      stagnationTerminationThreshold: 3
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

    // EDIT FILE
    this.defineTool(z => ({
      name: 'edit_file',
      description: 'Edit files using: replace_regex (range-based replacement with start/end boundaries), append (to end), prepend (to start). For replace_regex, provide start and end boundary text - they will be escaped and used to create pattern "start[\\s\\S]*?end" to match everything between boundaries inclusively. Keep boundary selections precise to target complete sections.',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file to edit'),
        operation: z.enum(['replace_regex', 'append', 'prepend']).describe('Type of edit operation: replace_regex=regex find/replace, append=add to end, prepend=add to start'),
        start: z.string().min(3, "Include the first 3 characters").optional().describe('The first characters of the string to be replaced'),
        end: z.string().min(3, "Include the last 3 characters").optional().describe('The last characters of the string to be replaced'),
        flags: z.string().optional().default('g').describe('Regex flags for replace_regex: g=global, i=ignoreCase, m=multiline, s=dotAll'),
        content: z.string().describe('New content or replacement text (what to replace with or add)'),
        numExpectedMatches: z.number().optional().describe('Expected number of matches for replace_regex operation (mandatory for replace_regex only). If actual matches differ from this number, the operation will fail and report back for you to choose more specific start/end boundaries. Example: if you expect to replace exactly 1 occurrence, set this to 1.'),
        backup: z.boolean().optional().default(false).describe('Create .backup file before editing for safety'),
        encoding: z.string().optional().default('utf8').describe('File encoding (utf8, ascii, etc.)')
      }),
      handler: async ({ args }: any) => {
        try {
          const fullPath = path.resolve(this.basePath, args.filepath);

          // Check if file exists
          if (!fs.existsSync(fullPath)) {
            return {
              toolName: 'edit_file',
              success: false,
              filepath: args.filepath,
              error: 'File does not exist'
            };
          }

          const originalStats = await fs.promises.stat(fullPath);
          const originalContent = await fs.promises.readFile(fullPath, args.encoding as BufferEncoding);
          const contentString = originalContent.toString();

          // Create backup if requested
          let backupPath: string | null = null;
          if (args.backup) {
            backupPath = `${fullPath}.backup.${Date.now()}`;
            await fs.promises.writeFile(backupPath, originalContent);
          }

          let result: any;

          switch (args.operation) {
            case 'replace_regex':
              // Regex replacement with mandatory match count validation
              if (args.numExpectedMatches === undefined) {
                throw new Error('numExpectedMatches is required for replace_regex operation');
              }
              
              if (!args.start || !args.end) {
                throw new Error('Both start and end are required for replace_regex operation');
              }
              
              // Create range-based regex pattern: match from start to end (inclusive)
              const escapedStart = args.start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const escapedEnd = args.end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const rangePattern = `${escapedStart}[\\s\\S]*?${escapedEnd}`;
              const regex = new RegExp(rangePattern, args.flags);
              
              // Validate expected matches before replacement
              const matches = contentString.match(regex);
              const actualMatches = matches ? matches.length : 0;
              
              if (actualMatches !== args.numExpectedMatches) {
                return {
                  toolName: 'edit_file',
                  success: false,
                  filepath: args.filepath,
                  operation: args.operation,
                  error: `Boundary match count mismatch. Please choose more specific start/end boundaries to target exactly the intended content.`
                };
              }
              
              result = await replaceInFile({
                files: fullPath,
                from: regex,
                to: args.content,
                encoding: args.encoding
              });
              break;

            case 'append':
              // Append to end of file
              const appendContent = contentString + (contentString.endsWith('\n') ? '' : '\n') + args.content;
              await fs.promises.writeFile(fullPath, appendContent, args.encoding);
              result = {
                operation: 'append',
                changes: [{ file: fullPath, hasChanged: true }]
              };
              break;

            case 'prepend':
              // Add to beginning of file
              const prependContent = args.content + (args.content.endsWith('\n') ? '' : '\n') + contentString;
              await fs.promises.writeFile(fullPath, prependContent, args.encoding);
              result = {
                operation: 'prepend',
                changes: [{ file: fullPath, hasChanged: true }]
              };
              break;

            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }

          // Get updated file stats
          const newStats = await fs.promises.stat(fullPath);
          const newContent = await fs.promises.readFile(fullPath, args.encoding);

          const hasChanged = result.changes && result.changes.length > 0 && result.changes[0].hasChanged;

          return {
            toolName: 'edit_file',
            success: true,
            filepath: args.filepath,
            operation: args.operation,
            hasChanged,
            changes: result.changes ? result.changes.length : 0,
            originalSize: originalStats.size,
            newSize: newStats.size,
            originalLines: contentString.split('\n').length,
            newLines: newContent.toString().split('\n').length,
            backup: backupPath,
            modified: hasChanged
          };

        } catch (error) {
          return {
            toolName: 'edit_file',
            success: false,
            filepath: args.filepath,
            operation: args.operation,
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