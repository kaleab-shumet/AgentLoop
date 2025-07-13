import { TurnState, ToolResult } from '../../../core';
import * as fs from 'fs';
import * as path from 'path';
import z from 'zod';

export class FileOperationHandlers {
  private workingDirectory: string;
  private maxFileSize: number;
  private allowedExtensions: string[];
  private debugMode: boolean;

  constructor(workingDirectory: string, maxFileSize: number = 10 * 1024 * 1024, allowedExtensions: string[], debugMode: boolean = false) {
    this.workingDirectory = workingDirectory;
    this.maxFileSize = maxFileSize;
    this.allowedExtensions = allowedExtensions;
    this.debugMode = debugMode;
  }

  private debugLog(message: string, data?: any): void {
    if (this.debugMode) {
      console.log(`🐛 [DEBUG] ${message}`, data || '');
    }
  }

  private isPathSafe(targetPath: string): boolean {
    const resolved = path.resolve(targetPath);
    const workingDir = path.resolve(this.workingDirectory);
    const normalizedResolved = path.normalize(resolved);
    const normalizedWorkingDir = path.normalize(workingDir);
    return normalizedResolved.startsWith(normalizedWorkingDir) || normalizedResolved === normalizedWorkingDir;
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

  public async handleReadFile(name: string, args: any, turnState: TurnState): Promise<ToolResult> {
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
          toolName: name,
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
        toolName: name,
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
        toolName: name,
        success: false,
        error: `Failed to read file: ${error.message}`
      };
    }
  }

  public async handleWriteFile(name: string, args: any): Promise<ToolResult> {
    try {
      const targetPath = path.resolve(this.workingDirectory, args.filePath);

      if (!this.isPathSafe(targetPath)) {
        throw new Error('Access denied: Path outside allowed directory structure');
      }

      const directory = path.dirname(targetPath);
      const fileName = path.basename(targetPath);
      let backupPath = null;

      if (!fs.existsSync(directory)) {
        if (args.createDirs) {
          fs.mkdirSync(directory, { recursive: true });
        } else {
          throw new Error(`Directory does not exist: ${directory}. Use createDirs=true to create it.`);
        }
      }

      if (args.backup && fs.existsSync(targetPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = path.join(directory, `${fileName}.backup.${timestamp}`);
        fs.copyFileSync(targetPath, backupPath);
      }

      fs.writeFileSync(targetPath, args.content, args.encoding);
      const stats = fs.statSync(targetPath);

      return {
        toolName: name,
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
        toolName: name,
        success: false,
        error: `Failed to write file: ${error.message}`
      };
    }
  }

  public async handleDeleteItem(name: string, args: any): Promise<ToolResult> {
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
        toolName: name,
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
        toolName: name,
        success: false,
        error: `Failed to delete: ${error.message}`
      };
    }
  }

  public async handleGetFileInfo(name: string, args: any): Promise<ToolResult> {
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
        toolName: name,
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
        toolName: name,
        success: false,
        error: `Failed to get file info: ${error.message}`
      };
    }
  }
}