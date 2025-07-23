import { PromptOptions, Interaction } from '../types/types';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { ZodTypeAny } from 'zod';
import { WorkerPromptTemplate, FormatType } from './WorkerPromptTemplate';
import { BasePromptTemplate, WorkerPromptParams, SupervisorPromptParams } from './BasePromptTemplate';

/**
 * Configuration for PromptManager
 */
export interface PromptManagerConfig {
  responseFormat?: FormatType;
  customTemplate?: BasePromptTemplate;
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
  private template: BasePromptTemplate;
  private isCustomTemplate: boolean;
  private promptOptions: PromptOptions;
  private errorRecoveryInstructions?: string;

  constructor(systemPrompt: string, config: PromptManagerConfig = {}) {
    this.systemPrompt = systemPrompt;
    this.promptOptions = {
      includeContext: true,
      includePreviousTaskHistory: true,
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
      this.template = new WorkerPromptTemplate(responseFormat);
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
   * Get the current response format (only applies to worker template)
   */
  getResponseFormat(): FormatType | null {
    if (this.isCustomTemplate) {
      return null; // Custom templates manage their own format
    }
    return (this.template as WorkerPromptTemplate).getResponseFormat();
  }

  /**
   * Switch response format (only applies to worker template)
   */
  setResponseFormat(format: FormatType): PromptManager {
    if (this.isCustomTemplate) {
      throw new AgentError(
        'Cannot set response format when using a custom template. Custom templates manage their own format.',
        AgentErrorType.CONFIGURATION_ERROR,
        { currentTemplate: 'custom', attemptedFormat: format }
      );
    }
    (this.template as WorkerPromptTemplate).setResponseFormat(format);
    return this;
  }

  /**
   * Set a custom template
   */
  setCustomTemplate(template: BasePromptTemplate): PromptManager {
    this.template = template;
    this.isCustomTemplate = true;
    return this;
  }

  /**
   * Switch back to worker template with specified format
   */
  setWorkerTemplate(format: FormatType = FormatType.FUNCTION_CALLING): PromptManager {
    this.template = new WorkerPromptTemplate(format);
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
    currentTaskInteractionHistory: Interaction[],
    prevTasksInteractionHistory: Interaction[],
    lastError: AgentError | null,
    keepRetry: boolean,
    toolDefinitions: string,
    agentType: 'worker' | 'supervisor' = 'worker',
    workerSystemPrompt?: string
  ): string {
    if (agentType === 'worker') {
      return this.template.buildPrompt({
        type: 'worker',
        systemPrompt: workerSystemPrompt || this.systemPrompt,
        supervisorCommand: userPrompt, // The userPrompt IS the supervisor's command
        toolDefinitions,
      });
    } else {
      return this.template.buildPrompt({
        type: 'supervisor',
        systemPrompt: this.systemPrompt,
        userPrompt,
        context,
        currentInteractionHistory: currentTaskInteractionHistory,
        prevInteractionHistory: prevTasksInteractionHistory,
        lastError,
        keepRetry,
        toolDefinitions,
        options: this.promptOptions,
        errorRecoveryInstructions: this.errorRecoveryInstructions,
      });
    }
  }

  /**
   * Get the current template
   */
  getTemplate(): BasePromptTemplate {
    return this.template;
  }

}

export { WorkerPromptTemplate, FormatType } from './WorkerPromptTemplate';