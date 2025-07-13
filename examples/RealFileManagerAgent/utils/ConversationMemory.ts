import { AgentRunInput, AgentRunOutput } from '../../../core';

interface ConversationEntry {
  timestamp: Date;
  userPrompt: string;
  agentResponse: string;
  toolsUsed: string[];
  success: boolean;
  sessionId?: string;
}

interface MemoryConfig {
  maxEntries: number;
  summarizeOlderThan: number; // minutes
  enableSummary: boolean;
  persistToDisk: boolean;
  memoryFile?: string;
}

export class ConversationMemory {
  private entries: ConversationEntry[] = [];
  private config: MemoryConfig;
  private summary: string = '';

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = {
      maxEntries: 50,
      summarizeOlderThan: 30,
      enableSummary: true,
      persistToDisk: false,
      ...config
    };

    if (this.config.persistToDisk) {
      this.loadFromDisk();
    }
  }

  public addEntry(input: AgentRunInput, output: AgentRunOutput): void {
    const entry: ConversationEntry = {
      timestamp: new Date(),
      userPrompt: input.userPrompt,
      agentResponse: output.finalAnswer?.output?.value || 'No response',
      toolsUsed: output.toolCallHistory.map(tool => tool.toolName),
      success: output.toolCallHistory.every(tool => tool.success),
      sessionId: this.generateSessionId()
    };

    this.entries.unshift(entry); // Add to beginning

    // Maintain max entries limit
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(0, this.config.maxEntries);
    }

    // Create summary if enabled
    if (this.config.enableSummary) {
      this.updateSummary();
    }

    if (this.config.persistToDisk) {
      this.saveToDisk();
    }
  }

  public getRecentEntries(count: number = 5): ConversationEntry[] {
    return this.entries.slice(0, count);
  }

  public getConversationHistory(): any[] {
    const recentEntries = this.getRecentEntries(10);
    const history: any[] = [];

    if (this.summary && this.config.enableSummary) {
      history.push({
        role: 'system',
        content: `Previous conversation summary: ${this.summary}`
      });
    }

    recentEntries.reverse().forEach(entry => {
      history.push({
        role: 'user',
        content: entry.userPrompt,
        timestamp: entry.timestamp
      });
      history.push({
        role: 'assistant',
        content: entry.agentResponse,
        tools_used: entry.toolsUsed,
        timestamp: entry.timestamp
      });
    });

    return history;
  }

  public getToolUsageStats(): { [toolName: string]: number } {
    const stats: { [toolName: string]: number } = {};
    
    this.entries.forEach(entry => {
      entry.toolsUsed.forEach(tool => {
        stats[tool] = (stats[tool] || 0) + 1;
      });
    });

    return stats;
  }

  public getSuccessRate(): number {
    if (this.entries.length === 0) return 1;
    const successCount = this.entries.filter(entry => entry.success).length;
    return successCount / this.entries.length;
  }

  public searchMemory(query: string): ConversationEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.entries.filter(entry => 
      entry.userPrompt.toLowerCase().includes(lowerQuery) ||
      entry.agentResponse.toLowerCase().includes(lowerQuery) ||
      entry.toolsUsed.some(tool => tool.toLowerCase().includes(lowerQuery))
    );
  }

  public clear(): void {
    this.entries = [];
    this.summary = '';
    if (this.config.persistToDisk) {
      this.saveToDisk();
    }
  }

  private updateSummary(): void {
    if (this.entries.length < 5) return;

    const oldEntries = this.entries.filter(entry => {
      const ageMinutes = (Date.now() - entry.timestamp.getTime()) / (1000 * 60);
      return ageMinutes > this.config.summarizeOlderThan;
    });

    if (oldEntries.length === 0) return;

    // Create a simple summary
    const toolUsage = this.getToolUsageStats();
    const mostUsedTools = Object.entries(toolUsage)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([tool]) => tool);

    const recentTopics = this.entries
      .slice(0, 10)
      .map(entry => this.extractKeywords(entry.userPrompt))
      .flat()
      .reduce((acc: { [key: string]: number }, keyword) => {
        acc[keyword] = (acc[keyword] || 0) + 1;
        return acc;
      }, {});

    const topTopics = Object.entries(recentTopics)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);

    this.summary = `Recent session involved ${this.entries.length} interactions. ` +
      `Most used tools: ${mostUsedTools.join(', ')}. ` +
      `Common topics: ${topTopics.join(', ')}. ` +
      `Success rate: ${Math.round(this.getSuccessRate() * 100)}%.`;
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));
    
    return [...new Set(words)]; // Remove duplicates
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were'];
    return stopWords.includes(word);
  }

  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private loadFromDisk(): void {
    if (!this.config.memoryFile) return;
    
    try {
      const fs = require('fs');
      if (fs.existsSync(this.config.memoryFile)) {
        const data = JSON.parse(fs.readFileSync(this.config.memoryFile, 'utf8'));
        this.entries = data.entries.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
        this.summary = data.summary || '';
      }
    } catch (error) {
      console.warn('Failed to load conversation memory from disk:', error);
    }
  }

  private saveToDisk(): void {
    if (!this.config.memoryFile) return;
    
    try {
      const fs = require('fs');
      const data = {
        entries: this.entries,
        summary: this.summary,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.config.memoryFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save conversation memory to disk:', error);
    }
  }

  public getMemoryStats(): {
    totalEntries: number;
    successRate: number;
    topTools: string[];
    memorySize: string;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const toolUsage = this.getToolUsageStats();
    const topTools = Object.entries(toolUsage)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tool]) => tool);

    return {
      totalEntries: this.entries.length,
      successRate: this.getSuccessRate(),
      topTools,
      memorySize: `${JSON.stringify(this.entries).length} bytes`,
      oldestEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : undefined,
      newestEntry: this.entries.length > 0 ? this.entries[0].timestamp : undefined
    };
  }
}