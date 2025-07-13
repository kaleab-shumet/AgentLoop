import { Tool, ChatEntry, ToolResult } from '../types/types';
import { AgentError } from '../utils/AgentError';
import { ZodTypeAny } from 'zod';

/**
 * Configuration options for prompt generation
 */
export interface PromptOptions {
  includeContext?: boolean;
  includeConversationHistory?: boolean;
  includeToolHistory?: boolean;
  maxHistoryEntries?: number;
  customSections?: Record<string, string>;
  parallelExecution?: boolean;
  includeExecutionStrategy?: boolean;
}

/**
 * Interface that all prompt templates must implement
 * This allows developers to create custom prompt formats while maintaining consistency
 */
export interface PromptTemplateInterface {
  /**
   * Generate format instructions for the LLM
   */
  getFormatInstructions(finalToolName: string): string;

  /**
   * Build the complete prompt for the agent
   */
  buildPrompt(
    systemPrompt: string,
    userPrompt: string,
    context: Record<string, any>,
    lastError: AgentError | null,
    conversationHistory: ChatEntry[],
    toolCallHistory: ToolResult[],
    keepRetry: boolean,
    finalToolName: string,
    toolDefinitions: string,
    options: PromptOptions,
    errorRecoveryInstructions?: string
  ): string;

  /**
   * Build the context section of the prompt
   */
  buildContextSection(context: Record<string, any>, options: PromptOptions): string;

  /**
   * Build the conversation history section
   */
  buildConversationSection(conversationHistory: ChatEntry[], options: PromptOptions): string;

  /**
   * Build the tool call history section
   */
  buildToolHistorySection(toolCallHistory: ToolResult[], options: PromptOptions): string;

  /**
   * Build the error recovery section
   */
  buildErrorRecoverySection(
    finalToolName: string,
    error: AgentError | null, 
    keepRetry: boolean, 
    errorRecoveryInstructions?: string
  ): string;

  /**
   * Build the task section with user prompt
   */
  buildTaskSection(userPrompt: string, finalToolName: string): string;
}