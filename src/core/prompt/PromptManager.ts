import { Tool, ChatEntry, ToolResult } from '../types/types';
import { AgentError } from '../utils/AgentError';
import { ZodTypeAny } from 'zod';

export interface PromptTemplate {
  systemPrompt?: string;
  formatInstructions?: string;
  toolDefinitions?: string;
  contextSection?: string;
  conversationSection?: string;
  historySection?: string;
  errorRecoverySection?: string;
  taskSection?: string;
}

export interface PromptConfig {
  includeContext?: boolean;
  includeConversationHistory?: boolean;
  includeToolHistory?: boolean;
  maxHistoryEntries?: number;
  errorRecoveryInstructions?: string;
  customSections?: Record<string, string>;
}

export interface PromptTemplateBuilder {
  buildSystemPrompt(): string;
  buildFormatInstructions(tools: Tool<ZodTypeAny>[], finalToolName: string, parallelExecution: boolean): string;
  buildToolDefinitions(tools: Tool<ZodTypeAny>[]): string;
  buildContextSection(context: Record<string, any>): string;
  buildConversationSection(conversationHistory: ChatEntry[]): string;
  buildHistorySection(toolCallHistory: ToolResult[], maxEntries?: number): string;
  buildErrorRecoverySection(error: AgentError | null, keepRetry: boolean): string;
  buildTaskSection(userPrompt: string, finalToolName: string): string;
}

export class DefaultPromptTemplateBuilder implements PromptTemplateBuilder {
  constructor(private systemPrompt: string, private config: PromptConfig = {}) {}

  buildSystemPrompt(): string {
    return this.systemPrompt;
  }

  buildFormatInstructions(tools: Tool<ZodTypeAny>[], finalToolName: string, parallelExecution: boolean): string {
    return `# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS
Please follow the specified format for tool calling as defined by your response handler.`;
  }

  buildToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    return `# AVAILABLE TOOLS
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}`;
  }

  buildContextSection(context: Record<string, any>): string {
    if (!this.config.includeContext || Object.keys(context).length === 0) {
      return '# CONTEXT\nNo background context provided.';
    }
    const contextLog = Object.entries(context)
      .map(([key, value]) => `**${key}**:\n${JSON.stringify(value)}`)
      .join('\n\n');
    return `# CONTEXT\n${contextLog}`;
  }

  buildConversationSection(conversationHistory: ChatEntry[]): string {
    if (!this.config.includeConversationHistory || conversationHistory.length === 0) {
      return '';
    }
    return `\n# CONVERSATION HISTORY\n${JSON.stringify(conversationHistory, null, 2)}\n`;
  }

  buildHistorySection(toolCallHistory: ToolResult[], maxEntries?: number): string {
    if (!this.config.includeToolHistory) {
      return '# TOOL CALL HISTORY\nNo tool calls have been made yet.';
    }
    
    const entries = maxEntries ? toolCallHistory.slice(-maxEntries) : toolCallHistory;
    const historyLog = entries.length > 0 
      ? JSON.stringify(entries, null, 2) 
      : 'No tool calls have been made yet.';
    
    return `# TOOL CALL HISTORY\n${historyLog}`;
  }

  buildErrorRecoverySection(error: AgentError | null, keepRetry: boolean): string {
    if (!error) return '';
    
    const retryInstruction = keepRetry 
      ? (this.config.errorRecoveryInstructions || "You have more attempts. Analyze the error and history, then retry with a corrected approach.")
      : "You have reached the maximum retry limit. You MUST stop and use the 'final' tool to report what you have accomplished and explain the failure.";
    
    return `\n# ERROR RECOVERY\n- **Error:** ${error.message}\n- **Instruction:** ${retryInstruction}`;
  }

  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `# CURRENT TASK
Based on all the information above, use your tools to respond to this user request:
"${userPrompt}"
Remember: Think step-by-step. If you have enough information to provide a complete answer, you MUST call the '${finalToolName}' tool by itself.`;
  }
}

export class PromptManager {
  private templateBuilder: PromptTemplateBuilder;
  private config: PromptConfig;

  constructor(
    systemPrompt: string, 
    templateBuilder?: PromptTemplateBuilder,
    config: PromptConfig = {}
  ) {
    this.config = {
      includeContext: true,
      includeConversationHistory: true,
      includeToolHistory: true,
      maxHistoryEntries: 10,
      ...config
    };
    
    this.templateBuilder = templateBuilder || new DefaultPromptTemplateBuilder(systemPrompt, this.config);
  }

  setTemplateBuilder(builder: PromptTemplateBuilder): void {
    this.templateBuilder = builder;
  }

  setConfig(config: Partial<PromptConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): PromptConfig {
    return { ...this.config };
  }

  constructPrompt(
    userPrompt: string,
    context: Record<string, any>,
    lastError: AgentError | null,
    conversationHistory: ChatEntry[],
    toolCallHistory: ToolResult[],
    keepRetry: boolean,
    tools: Tool<ZodTypeAny>[],
    finalToolName: string,
    formatInstructions: string,
    toolDefinitions: string
  ): string {
    const sections: string[] = [];

    // System prompt
    sections.push(this.templateBuilder.buildSystemPrompt());

    // Format instructions
    sections.push(`# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS\n${formatInstructions}`);

    // Tool definitions
    sections.push(`# AVAILABLE TOOLS\n${toolDefinitions}`);

    // Context
    sections.push(this.templateBuilder.buildContextSection(context));

    // Conversation history
    const conversationSection = this.templateBuilder.buildConversationSection(conversationHistory);
    if (conversationSection) {
      sections.push(conversationSection);
    }

    // Tool call history
    sections.push(this.templateBuilder.buildHistorySection(toolCallHistory, this.config.maxHistoryEntries));

    // Error recovery
    const errorSection = this.templateBuilder.buildErrorRecoverySection(lastError, keepRetry);
    if (errorSection) {
      sections.push(errorSection);
    }

    // Custom sections
    if (this.config.customSections) {
      Object.entries(this.config.customSections).forEach(([name, content]) => {
        sections.push(`# ${name.toUpperCase()}\n${content}`);
      });
    }

    // Current task
    sections.push(this.templateBuilder.buildTaskSection(userPrompt, finalToolName));

    return sections.join('\n');
  }

  buildSystemPrompt(): string {
    return this.templateBuilder.buildSystemPrompt();
  }

  buildFormatInstructions(tools: Tool<ZodTypeAny>[], finalToolName: string, parallelExecution: boolean): string {
    return this.templateBuilder.buildFormatInstructions(tools, finalToolName, parallelExecution);
  }

  buildToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    return this.templateBuilder.buildToolDefinitions(tools);
  }
}