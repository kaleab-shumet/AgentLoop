import { PromptOptions, Interaction, BuildPromptParams, FormatMode } from '../types/types';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { ZodTypeAny } from 'zod';
import { DefaultPromptTemplate } from './DefaultPromptTemplate';

/**
 * Configuration for PromptManager
 */
export interface PromptManagerConfig {
  responseFormat?: FormatMode;
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
      maxPreviousTaskEntries: 10,
      ...config.promptOptions
    };
    this.errorRecoveryInstructions = config.errorRecoveryInstructions;

    // Determine which template to use
    if (config.customTemplate) {
      this.template = config.customTemplate;
      this.isCustomTemplate = true;
    } else {
      // Use default template with specified response format
      const responseFormat = config.responseFormat || FormatMode.FUNCTION_CALLING;
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
  getResponseFormat(): FormatMode | null {
    if (this.isCustomTemplate) {
      return null; // Custom templates manage their own format
    }
    return (this.template as DefaultPromptTemplate).getResponseFormat();
  }

  /**
   * Switch response format (only applies to default template)
   */
  setResponseFormat(format: FormatMode): PromptManager {
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
  setDefaultTemplate(format: FormatMode = FormatMode.FUNCTION_CALLING): PromptManager {
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
  buildPrompt(params: BuildPromptParams): string {
    // Merge options and error recovery instructions with provided params
    const fullParams: BuildPromptParams = {
      ...params,
      options: this.promptOptions,
      errorRecoveryInstructions: this.errorRecoveryInstructions,
    };
    
    return this.template.buildPrompt(fullParams);
  }

}

export { DefaultPromptTemplate } from './DefaultPromptTemplate';