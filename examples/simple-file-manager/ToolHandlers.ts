import { HandlerParams, ToolCallContext } from '../../core/types/types';
import * as fs from 'fs';
import * as path from 'path';
import { AgentError, AgentErrorType } from '../../core/utils/AgentError';

/**
 * Tool Handlers for File Management Operations
 * 
 * This class contains all the actual implementation logic for file operations.
 * Separating handlers from the agent class keeps the code clean and makes
 * testing easier.
 */
export class ToolHandlers {
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = path.resolve(basePath);
  }

  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Resolve a path relative to the base path while ensuring security
   */
  private resolvePath(inputPath: string): string {
    const resolved = path.resolve(this.basePath, inputPath);

    // Security check: ensure the resolved path is within or equal to basePath
    if (!resolved.startsWith(this.basePath)) {
      throw new Error(`Access denied: Path '${inputPath}' is outside the allowed directory`);
    }

    return resolved;
  }

  /**
   * List directory contents
   */
  async listDirectory(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { path: inputPath } = params.args as { path: string };
      const fullPath = this.resolvePath(inputPath);

      // Check if path exists and is a directory
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isDirectory()) {
        return {
          toolName: 'list_directory',
          success: false,
          error: `Path '${inputPath}' is not a directory`
        };
      }

      // Read directory contents
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });

      const items = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(fullPath, entry.name);
        try {
          const entryStats = await fs.promises.stat(entryPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: entry.isFile() ? entryStats.size : null,
            modified: entryStats.mtime.toISOString()
          };
        } catch {
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: null,
            modified: null
          };
        }
      }));

      // Sort: directories first, then files, both alphabetically
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        toolName: 'list_directory',
        success: true,
        path: path.relative(this.basePath, fullPath) || '.',
        itemCount: items.length,
        items
      };

    } catch (error) {
      return {
        toolName: 'list_directory',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Create multiple files with content (prevents overwriting existing files)
   */
  async createFiles(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { files } = params.args as { files: Array<{ path: string; content: string }> };

      if (!Array.isArray(files) || files.length === 0) {
        return {
          toolName: 'create_files',
          success: false,
          error: 'No files provided for creation'
        };
      }

      const results: Array<{ path: string; size: number; created: string }> = [];
      const errors: string[] = [];

      // Process each file
      for (const fileSpec of files) {
        try {
          const { path: inputPath, content } = fileSpec;
          const fullPath = this.resolvePath(inputPath);

          // Check if file already exists
          try {
            await fs.promises.access(fullPath);
            errors.push(`File '${inputPath}' already exists. Cannot overwrite existing files.`);
            continue;
          } catch {
            // File doesn't exist, proceed with creation
          }

          // Ensure the directory exists
          const dir = path.dirname(fullPath);
          await fs.promises.mkdir(dir, { recursive: true });

          // Write the file
          await fs.promises.writeFile(fullPath, content, 'utf8');

          // Get file stats for confirmation
          const stats = await fs.promises.stat(fullPath);

          results.push({
            path: path.relative(this.basePath, fullPath),
            size: stats.size,
            created: stats.birthtime.toISOString()
          });

        } catch (error) {
          errors.push(`Failed to create '${fileSpec.path}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Determine overall success
      const success = errors.length < 1;
      const summary = {
        toolName: 'create_files',
        success,
        totalFiles: files.length,
        createdFiles: results.length,
        failedFiles: errors.length,
        createdAt: new Date().toISOString(),
        results,
        ...(errors.length > 0 && { errors })
      };

      if (!success) {
        throw new AgentError(errors.join("\n\n"), AgentErrorType.TOOL_EXECUTION_ERROR, summary);
      }

      return summary;

    } catch (error) {
      return {
        toolName: 'create_files',
        success: false,
        error: error instanceof AgentError ? error.getMessage() : 'Unknown error occurred'
      };
    }
  }

  async handleFinal(params: HandlerParams): Promise<ToolCallContext> {
    const display = await params.turnState.get("display")
    if (display !== undefined) {
      return {
        toolName: params.name,
        display,
        ...params.args,
        success: true
      };
    } else {
      return {
        toolName: params.name,
        ...params.args,
        success: true
      };
    }

  }

  /**
   * Read multiple file contents
   */
  async readFiles(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { paths } = params.args as { paths: string[] };

      if (!Array.isArray(paths) || paths.length === 0) {
        return {
          toolName: 'read_files',
          success: false,
          error: 'No file paths provided for reading'
        };
      }

      const results: Array<{ path: string; size: number; content: string; encoding: string }> = [];
      const errors: string[] = [];
      let combinedDisplay = '';

      // Process each file
      for (const inputPath of paths) {
        try {
          const fullPath = this.resolvePath(inputPath);

          // Check if file exists and is readable
          const stats = await fs.promises.stat(fullPath);
          if (!stats.isFile()) {
            errors.push(`Path '${inputPath}' is not a file`);
            continue;
          }

          // Read file content
          const content = await fs.promises.readFile(fullPath, 'utf8');
          const relativePath = path.relative(this.basePath, fullPath);

          // Add line numbers to content
          const lines = content.split('\n');
          const numberedContent = lines.map((line, index) => {
            return `{ln:${index + 1}} ${line}`;
          }).join('\n');

          results.push({
            path: relativePath,
            size: stats.size,
            content: numberedContent,
            encoding: 'utf8'
          });

          // Combine content for display
          combinedDisplay += `=== ${relativePath} ===\n${numberedContent}\n\n`;

        } catch (error) {
          errors.push(`Failed to read '${inputPath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Set combined display for turnState
      if (combinedDisplay) {
        await params.turnState.set("display", combinedDisplay.trim());
      }

      // Determine overall success
      const success = errors.length < 1;
      const summary = {
        toolName: 'read_files',
        success,
        totalFiles: paths.length,
        readFiles: results.length,
        failedFiles: errors.length,
        readAt: new Date().toISOString(),
        results,
        ...(errors.length > 0 && { errors })
      };

      if (!success) {
        throw new AgentError(errors.join("\n\n"), AgentErrorType.TOOL_EXECUTION_ERROR, summary);
      }

      return summary;

    } catch (error) {
      return {
        toolName: 'read_files',
        success: false,
        error: error instanceof AgentError ? error.getMessage() : 'Unknown error occurred'
      };
    }
  }

  /**
   * Edit files by replacing the entire content
   */
  async editFiles(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { path: filePath, content } = params.args as { 
        path: string; 
        content: string;
      };

      const fullPath = this.resolvePath(filePath);

      // Check if file exists and is readable
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        return {
          toolName: 'edit_files',
          success: false,
          error: `Path '${filePath}' is not a file`
        };
      }

      // Write the new content to the file
      await fs.promises.writeFile(fullPath, content, 'utf8');

      // Get updated file stats
      const updatedStats = await fs.promises.stat(fullPath);

      return {
        toolName: 'edit_files',
        success: true,
        path: path.relative(this.basePath, fullPath),
        newSize: updatedStats.size,
        modifiedAt: updatedStats.mtime.toISOString()
      };

    } catch (error) {
      return {
        toolName: 'edit_files',
        success: false,
        error: error instanceof AgentError ? error.getMessage() : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { paths, askedForConfirmation } = params.args as { paths: string[]; askedForConfirmation: boolean };
      
      // Safety check - require confirmation
      if (!askedForConfirmation) {
        return {
          toolName: 'delete_files',
          success: false,
          error: 'Deletion requires user confirmation. Please ask the user for confirmation before proceeding.'
        };
      }

      if (!Array.isArray(paths) || paths.length === 0) {
        return {
          toolName: 'delete_files',
          success: false,
          error: 'No file paths provided for deletion'
        };
      }

      const results: Array<{ path: string; size: number; deleted: boolean }> = [];
      const errors: string[] = [];
      let totalDeletedSize = 0;

      // Process each file
      for (const inputPath of paths) {
        try {
          const fullPath = this.resolvePath(inputPath);

          // Check if file exists and is a file
          const stats = await fs.promises.stat(fullPath);
          if (!stats.isFile()) {
            errors.push(`Path '${inputPath}' is not a file`);
            continue;
          }

          // Store file info before deletion
          const relativePath = path.relative(this.basePath, fullPath);
          const fileSize = stats.size;

          // Delete the file
          await fs.promises.unlink(fullPath);

          results.push({
            path: relativePath,
            size: fileSize,
            deleted: true
          });

          totalDeletedSize += fileSize;

        } catch (error) {
          errors.push(`Failed to delete '${inputPath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Determine overall success
      const success = errors.length < 1;
      const summary = {
        toolName: 'delete_files',
        success,
        totalFiles: paths.length,
        deletedFiles: results.length,
        failedFiles: errors.length,
        totalDeletedSize,
        deletedAt: new Date().toISOString(),
        results,
        ...(errors.length > 0 && { errors })
      };

      if(!success){
        throw new AgentError(errors.join("\n\n"), AgentErrorType.TOOL_EXECUTION_ERROR, summary);
      }

      return summary;

    } catch (error) {
      return {
        toolName: 'delete_files',
        success: false,
        error: error instanceof AgentError ? error.getMessage() : 'Unknown error occurred'
      };
    }
  }

}