import { TurnState, ToolResult } from '../../../core';
import * as fs from 'fs';
import * as path from 'path';

export class DirectoryHandlers {
  private workingDirectory: string;
  private debugMode: boolean;

  constructor(workingDirectory: string, debugMode: boolean = false) {
    this.workingDirectory = workingDirectory;
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

  public async handleListDirectory(name: string, args: any, turnState: TurnState): Promise<ToolResult> {
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

      turnState.set("display", this.formatDirectoryListing(contents));

      return {
        toolName: name,
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
        toolName: name,
        success: false,
        error: `Failed to list directory: ${error.message}`
      };
    }
  }

  public async handleCreateDirectory(name: string, args: any): Promise<ToolResult> {
    try {
      const targetPath = path.resolve(this.workingDirectory, args.dirPath);

      if (!this.isPathSafe(targetPath)) {
        throw new Error('Access denied: Path outside allowed directory structure');
      }

      if (fs.existsSync(targetPath)) {
        if (fs.statSync(targetPath).isDirectory()) {
          return {
            toolName: name,
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
        toolName: name,
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
        toolName: name,
        success: false,
        error: `Failed to create directory: ${error.message}`
      };
    }
  }

  public async handleChangeDirectory(name: string, args: any): Promise<ToolResult> {
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
        toolName: name,
        success: true,
        output: {
          oldPath,
          newPath: this.workingDirectory,
          message: `Working directory changed successfully`
        }
      };
    } catch (error: any) {
      return {
        toolName: name,
        success: false,
        error: `Failed to change directory: ${error.message}`
      };
    }
  }

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
}