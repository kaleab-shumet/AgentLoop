import {
  BuildPromptParams,
  FormatMode,
} from '../types/types';

/**
 * Interface for prompt templates
 */
export interface BasePromptTemplate {
  /**
   * Returns the supported response format
   */
  getResponseFormat(): FormatMode;

  /**
   * Builds the complete prompt string
   */
  buildPrompt(params: BuildPromptParams): string;
}