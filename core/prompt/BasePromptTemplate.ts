import { BuildPromptParams, FormatMode, PromptOptions } from '../types/types';

export interface BasePromptTemplate {
  setResponseFormat(format: FormatMode): void;
  getResponseFormat(): FormatMode;
  buildPrompt(params: BuildPromptParams, options: PromptOptions): string;
}