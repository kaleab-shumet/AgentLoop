import { BuildPromptParams, FormatMode } from '../types/types';

export interface BasePromptTemplate {
  setResponseFormat(format: FormatMode): void;
  getResponseFormat(): FormatMode;
  buildPrompt(params: BuildPromptParams): string;
}