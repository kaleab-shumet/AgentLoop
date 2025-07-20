import { PromptOptions, Interaction } from '../types/types';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { ZodTypeAny } from 'zod';
import { DefaultPromptTemplate, FormatType } from './DefaultPromptTemplate';

/**
 * Configuration for PromptManager
 */
export interface PromptManagerConfig {
  responseFormat?: FormatType;
  customTemplate?: DefaultPromptTemplate;
  promptOptions?: PromptOptions;
  errorRecoveryInstructions?: string;
}

/**
 * Simple, developer-friendly prompt manager with template system
 * 
 * Usage examples:
 * 
 * // Use default template with function calling format
 * const manager = new PromptManager(systemPrompt, { responseFormat: ResponseFormat.FUNCTION_CALLING });
 * 
 * // Use default template with function calling format  
 * const manager = new PromptManager(systemPrompt, { responseFormat: ResponseFormat.FUNCTION_CALLING });
 * 
 * // Use custom template
 * class MyTemplate extends DefaultPromptTemplate { ... }
 * const manager = new PromptManager(systemPrompt, { customTemplate: new MyTemplate() });
 */
export class PromptManager {
  private systemPrompt: string;
  private template: DefaultPromptTemplate;
  private isCustomTemplate: boolean;
  private promptOptions: PromptOptions;
  private errorRecoveryInstructions?: string;

  constructor(systemPrompt: string, config: PromptManagerConfig = {}) {
    this.systemPrompt = systemPrompt;
    this.promptOptions = {
      includeContext: true,
      includePreviousTaskHistory: true,
      includeCurrentTaskHistory: true,
      maxPreviousTaskEntries: 10,
      parallelExecution: false,
      ...config.promptOptions
    };
    this.errorRecoveryInstructions = config.errorRecoveryInstructions;

    // Determine which template to use
    if (config.customTemplate) {
      this.template = config.customTemplate;
      this.isCustomTemplate = true;
    } else {
      // Use default template with specified response format
      const responseFormat = config.responseFormat || FormatType.FUNCTION_CALLING;
      this.template = new DefaultPromptTemplate(responseFormat);
      this.isCustomTemplate = false;
    }
  }

  /**
   * Check if using a custom template
   */
  isUsingCustomTemplate(): boolean {
    return this.isCustomTemplate;
  }

  /**
   * Get the current response format (only applies to default template)
   */
  getResponseFormat(): FormatType | null {
    if (this.isCustomTemplate) {
      return null; // Custom templates manage their own format
    }
    return (this.template as DefaultPromptTemplate).getResponseFormat();
  }

  /**
   * Switch response format (only applies to default template)
   */
  setResponseFormat(format: FormatType): PromptManager {
    if (this.isCustomTemplate) {
      throw new AgentError(
        'Cannot set response format when using a custom template. Custom templates manage their own format.',
        AgentErrorType.CONFIGURATION_ERROR,
        { currentTemplate: 'custom', attemptedFormat: format }
      );
    }
    (this.template as DefaultPromptTemplate).setResponseFormat(format);
    return this;
  }

  /**
   * Set a custom template
   */
  setCustomTemplate(template: DefaultPromptTemplate): PromptManager {
    this.template = template;
    this.isCustomTemplate = true;
    return this;
  }

  /**
   * Switch back to default template with specified format
   */
  setDefaultTemplate(format: FormatType = FormatType.FUNCTION_CALLING): PromptManager {
    this.template = new DefaultPromptTemplate(format);
    this.isCustomTemplate = false;
    return this;
  }

  /**
   * Configure prompt options
   */
  configure(options: Partial<PromptOptions>): PromptManager {
    this.promptOptions = { ...this.promptOptions, ...options };
    return this;
  }

  /**
   * Set custom error recovery instructions
   */
  setErrorRecoveryInstructions(instructions: string): PromptManager {
    this.errorRecoveryInstructions = instructions;
    return this;
  }

  /**
   * Get current prompt options
   */
  getPromptOptions(): PromptOptions {
    return { ...this.promptOptions };
  }

  /**
   * Build the complete prompt for the agent
   */
  buildPrompt(
    userPrompt: string,
    context: Record<string, any>,    
    oldAgentEventHistory: Interaction[],
    agentEventList: Interaction[],
    lastError: AgentError | null,
    keepRetry: boolean,
    finalToolName: string,
    toolDefinitions: string
  ): string {
    return this.template.buildPrompt(
      this.systemPrompt,
      userPrompt,
      context,
      
      oldAgentEventHistory,
      agentEventList,

      lastError,
      keepRetry,
      finalToolName,
      toolDefinitions,
      this.promptOptions,
      this.errorRecoveryInstructions
    );
  }

  /**
   * Get the response format as a string for compatibility with handlers
   */
  getResponseFormatString(): 'function' {
    return 'function';
  }


  setConfig(config: any): void {
    // Convert legacy config to new options format
    if (config.includeContext !== undefined) this.promptOptions.includeContext = config.includeContext;
    if (config.includeConversationHistory !== undefined) this.promptOptions.includePreviousTaskHistory = config.includeConversationHistory;
    if (config.includeToolHistory !== undefined) this.promptOptions.includeCurrentTaskHistory = config.includeToolHistory;
    if (config.maxHistoryEntries !== undefined) this.promptOptions.maxPreviousTaskEntries = config.maxHistoryEntries;
    if (config.customSections !== undefined) this.promptOptions.customSections = config.customSections;
    if (config.errorRecoveryInstructions !== undefined) this.setErrorRecoveryInstructions(config.errorRecoveryInstructions);
  }

  getConfig(): any {
    return {
      includeContext: this.promptOptions.includeContext,
      includeConversationHistory: this.promptOptions.includePreviousTaskHistory,
      includeToolHistory: this.promptOptions.includeCurrentTaskHistory,
      maxHistoryEntries: this.promptOptions.maxPreviousTaskEntries
    };
  }

  // Legacy template type methods (for backward compatibility)
  getTemplateType(): string {
    if (this.isCustomTemplate) {
      return 'custom';
    }
    const format = (this.template as DefaultPromptTemplate).getResponseFormat();
    return 'functionCalling';
  }

  getTemplateTypeString(): 'function' {
    return this.getResponseFormatString();
  }

  setTemplateType(type: string): PromptManager {
    if (type === 'custom') {
      throw new AgentError(
        'Use setCustomTemplate() to set a custom template',
        AgentErrorType.CONFIGURATION_ERROR,
        { attemptedType: type, correctMethod: 'setCustomTemplate()' }
      );
    }
    
    if (this.isCustomTemplate) {
      // Switch back to default template
      const format = FormatType.FUNCTION_CALLING;
      this.setDefaultTemplate(format);
    } else {
      // Update existing default template
      const format = FormatType.FUNCTION_CALLING;
      this.setResponseFormat(format);
    }
    
    return this;
  }
}

export { DefaultPromptTemplate, FormatType as ResponseFormat } from './DefaultPromptTemplate';