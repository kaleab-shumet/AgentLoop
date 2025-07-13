import { TurnState, ToolResult } from '../../../core';
import * as fs from 'fs';
import * as path from 'path';

export class SearchHandlers {
  private workingDirectory: string;
  private maxFileSize: number;
  private allowedExtensions: string[];
  private debugMode: boolean;

  constructor(workingDirectory: string, maxFileSize: number, allowedExtensions: string[], debugMode: boolean = false) {
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

  public async handleSearchFiles(name: string, args: any, turnState: TurnState): Promise<ToolResult> {
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
                        result.matchingLines = matchingLines.slice(0, 5);
                      } else {
                        result.contentMatch = false;
                      }
                    }
                  } catch {
                    result.contentMatch = false;
                    result.contentSearchError = 'Unable to search content';
                  }
                }

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

      turnState.set("display", this.formatSearchResults(results));

      return {
        toolName: name,
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
        toolName: name,
        success: false,
        error: `Search failed: ${error.message}`
      };
    }
  }
}