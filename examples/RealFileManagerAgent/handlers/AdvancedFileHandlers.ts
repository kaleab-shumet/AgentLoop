import { TurnState, ToolResult } from '../../../core';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class AdvancedFileHandlers {
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

  public async handleFileDiff(name: string, args: any, turnState: TurnState): Promise<ToolResult> {
    try {
      const file1Path = path.resolve(this.workingDirectory, args.file1);
      const file2Path = path.resolve(this.workingDirectory, args.file2);

      if (!this.isPathSafe(file1Path) || !this.isPathSafe(file2Path)) {
        throw new Error('Access denied: Path outside allowed directory structure');
      }

      if (!fs.existsSync(file1Path) || !fs.existsSync(file2Path)) {
        throw new Error('One or both files do not exist');
      }

      const content1 = fs.readFileSync(file1Path, 'utf8');
      const content2 = fs.readFileSync(file2Path, 'utf8');

      const lines1 = content1.split('\n');
      const lines2 = content2.split('\n');

      const diff = this.computeDiff(lines1, lines2);
      const diffDisplay = this.formatDiff(diff, args.file1, args.file2);

      turnState.set("display", diffDisplay);

      return {
        toolName: name,
        success: true,
        output: {
          file1: file1Path,
          file2: file2Path,
          relativePath1: path.relative(this.workingDirectory, file1Path),
          relativePath2: path.relative(this.workingDirectory, file2Path),
          differences: diff,
          identical: diff.length === 0,
          totalChanges: diff.length
        }
      };
    } catch (error: any) {
      return {
        toolName: name,
        success: false,
        error: `Failed to diff files: ${error.message}`
      };
    }
  }

  public async handleFileHash(name: string, args: any): Promise<ToolResult> {
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

      const content = fs.readFileSync(targetPath);
      const algorithm = args.algorithm || 'sha256';
      
      const hash = crypto.createHash(algorithm).update(content).digest('hex');

      return {
        toolName: name,
        success: true,
        output: {
          path: targetPath,
          relativePath: path.relative(this.workingDirectory, targetPath),
          algorithm,
          hash,
          fileSize: stats.size,
          modified: stats.mtime.toISOString()
        }
      };
    } catch (error: any) {
      return {
        toolName: name,
        success: false,
        error: `Failed to compute file hash: ${error.message}`
      };
    }
  }

  public async handleFileCopy(name: string, args: any): Promise<ToolResult> {
    try {
      const sourcePath = path.resolve(this.workingDirectory, args.sourcePath);
      const destinationPath = path.resolve(this.workingDirectory, args.destinationPath);

      if (!this.isPathSafe(sourcePath) || !this.isPathSafe(destinationPath)) {
        throw new Error('Access denied: Path outside allowed directory structure');
      }

      if (!fs.existsSync(sourcePath)) {
        throw new Error('Source file does not exist');
      }

      const sourceStats = fs.statSync(sourcePath);
      if (!sourceStats.isFile()) {
        throw new Error('Source path is not a file');
      }

      // Check if destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        if (args.createDirs) {
          fs.mkdirSync(destDir, { recursive: true });
        } else {
          throw new Error(`Destination directory does not exist: ${destDir}`);
        }
      }

      // Handle overwrite protection
      if (fs.existsSync(destinationPath) && !args.overwrite) {
        throw new Error('Destination file already exists. Use overwrite=true to replace it.');
      }

      fs.copyFileSync(sourcePath, destinationPath);
      const destStats = fs.statSync(destinationPath);

      return {
        toolName: name,
        success: true,
        output: {
          sourcePath,
          destinationPath,
          relativeSourcePath: path.relative(this.workingDirectory, sourcePath),
          relativeDestinationPath: path.relative(this.workingDirectory, destinationPath),
          size: destStats.size,
          copied: new Date().toISOString(),
          message: 'File copied successfully'
        }
      };
    } catch (error: any) {
      return {
        toolName: name,
        success: false,
        error: `Failed to copy file: ${error.message}`
      };
    }
  }

  public async handleFileMove(name: string, args: any): Promise<ToolResult> {
    try {
      const sourcePath = path.resolve(this.workingDirectory, args.sourcePath);
      const destinationPath = path.resolve(this.workingDirectory, args.destinationPath);

      if (!this.isPathSafe(sourcePath) || !this.isPathSafe(destinationPath)) {
        throw new Error('Access denied: Path outside allowed directory structure');
      }

      if (!fs.existsSync(sourcePath)) {
        throw new Error('Source file does not exist');
      }

      // Check if destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        if (args.createDirs) {
          fs.mkdirSync(destDir, { recursive: true });
        } else {
          throw new Error(`Destination directory does not exist: ${destDir}`);
        }
      }

      // Handle overwrite protection
      if (fs.existsSync(destinationPath) && !args.overwrite) {
        throw new Error('Destination file already exists. Use overwrite=true to replace it.');
      }

      const sourceStats = fs.statSync(sourcePath);
      fs.renameSync(sourcePath, destinationPath);

      return {
        toolName: name,
        success: true,
        output: {
          oldPath: sourcePath,
          newPath: destinationPath,
          relativeOldPath: path.relative(this.workingDirectory, sourcePath),
          relativeNewPath: path.relative(this.workingDirectory, destinationPath),
          size: sourceStats.size,
          moved: new Date().toISOString(),
          message: 'File moved successfully'
        }
      };
    } catch (error: any) {
      return {
        toolName: name,
        success: false,
        error: `Failed to move file: ${error.message}`
      };
    }
  }

  public async handleFilePermissions(name: string, args: any): Promise<ToolResult> {
    try {
      const targetPath = path.resolve(this.workingDirectory, args.filePath);

      if (!this.isPathSafe(targetPath)) {
        throw new Error('Access denied: Path outside allowed directory structure');
      }

      if (!fs.existsSync(targetPath)) {
        throw new Error('File or directory does not exist');
      }

      const stats = fs.statSync(targetPath);
      const currentMode = stats.mode;

      if (args.mode) {
        // Set new permissions
        const newMode = parseInt(args.mode, 8);
        fs.chmodSync(targetPath, newMode);
        const newStats = fs.statSync(targetPath);

        return {
          toolName: name,
          success: true,
          output: {
            path: targetPath,
            relativePath: path.relative(this.workingDirectory, targetPath),
            oldMode: currentMode.toString(8),
            newMode: newStats.mode.toString(8),
            changed: new Date().toISOString(),
            message: 'Permissions updated successfully'
          }
        };
      } else {
        // Just return current permissions
        return {
          toolName: name,
          success: true,
          output: {
            path: targetPath,
            relativePath: path.relative(this.workingDirectory, targetPath),
            mode: currentMode.toString(8),
            permissions: {
              owner: {
                read: !!(currentMode & 0o400),
                write: !!(currentMode & 0o200),
                execute: !!(currentMode & 0o100)
              },
              group: {
                read: !!(currentMode & 0o040),
                write: !!(currentMode & 0o020),
                execute: !!(currentMode & 0o010)
              },
              others: {
                read: !!(currentMode & 0o004),
                write: !!(currentMode & 0o002),
                execute: !!(currentMode & 0o001)
              }
            }
          }
        };
      }
    } catch (error: any) {
      return {
        toolName: name,
        success: false,
        error: `Failed to handle file permissions: ${error.message}`
      };
    }
  }

  private computeDiff(lines1: string[], lines2: string[]): any[] {
    const diff: any[] = [];
    const maxLines = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];

      if (line1 !== line2) {
        if (line1 === undefined) {
          diff.push({ type: 'added', lineNumber: i + 1, content: line2 });
        } else if (line2 === undefined) {
          diff.push({ type: 'removed', lineNumber: i + 1, content: line1 });
        } else {
          diff.push({ type: 'changed', lineNumber: i + 1, oldContent: line1, newContent: line2 });
        }
      }
    }

    return diff;
  }

  private formatDiff(diff: any[], file1: string, file2: string): string {
    if (diff.length === 0) {
      return `🔍 Files are identical: ${file1} and ${file2}`;
    }

    let output = `🔍 File Diff: ${file1} vs ${file2}\n`;
    output += '─'.repeat(60) + '\n';

    diff.forEach(change => {
      switch (change.type) {
        case 'added':
          output += `+ Line ${change.lineNumber}: ${change.content}\n`;
          break;
        case 'removed':
          output += `- Line ${change.lineNumber}: ${change.content}\n`;
          break;
        case 'changed':
          output += `~ Line ${change.lineNumber}:\n`;
          output += `  - ${change.oldContent}\n`;
          output += `  + ${change.newContent}\n`;
          break;
      }
    });

    output += `\nTotal changes: ${diff.length}`;
    return output;
  }
}