import { HandlerParams, ToolCallContext } from '../../core/types/types';
import * as fs from 'fs';
import * as path from 'path';

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
   * Create a file with content
   */
  async createFile(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { path: inputPath, content } = params.args as { path: string; content: string };
      const fullPath = this.resolvePath(inputPath);

      // Ensure the directory exists
      const dir = path.dirname(fullPath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Write the file
      await fs.promises.writeFile(fullPath, content, 'utf8');

      // Get file stats for confirmation
      const stats = await fs.promises.stat(fullPath);

      return {
        toolName: 'create_file',
        success: true,
        path: path.relative(this.basePath, fullPath),
        size: stats.size,
        created: stats.birthtime.toISOString()
      };

    } catch (error) {
      return {
        toolName: 'create_file',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
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
   * Read file contents
   */
  async readFile(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { path: inputPath } = params.args as { path: string };
      const fullPath = this.resolvePath(inputPath);

      // Check if file exists and is readable
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        return {
          toolName: 'read_file',
          success: false,
          error: `Path '${inputPath}' is not a file`
        };
      }

      // Read file content
      const content = await fs.promises.readFile(fullPath, 'utf8');
      await params.turnState.set("display", content)

      return {
        toolName: 'read_file',
        success: true,
        path: path.relative(this.basePath, fullPath),
        size: stats.size,
        content,
        message: "The content is attached for you to display it",
        encoding: 'utf8'
      };

    } catch (error) {
      return {
        toolName: 'read_file',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(params: HandlerParams): Promise<ToolCallContext> {
    try {
      const { path: inputPath } = params.args as { path: string };
      const fullPath = this.resolvePath(inputPath);

      // Check if file exists
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        return {
          toolName: 'delete_file',
          success: false,
          error: `Path '${inputPath}' is not a file`
        };
      }

      // Store file info before deletion
      const relativePath = path.relative(this.basePath, fullPath);
      const fileSize = stats.size;

      // Delete the file
      await fs.promises.unlink(fullPath);

      return {
        toolName: 'delete_file',
        success: true,
        path: relativePath,
        deletedSize: fileSize,
        deletedAt: new Date().toISOString()
      };

    } catch (error) {
      return {
        toolName: 'delete_file',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}