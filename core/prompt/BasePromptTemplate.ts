import { Interaction, PromptOptions } from '../types/types';
import { AgentError } from '../utils/AgentError';

/**
 * Parameters for worker agent prompt building - minimal info needed for execution
 */
export interface WorkerPromptParams {
  type: 'worker';
  systemPrompt: string;
  supervisorCommand: string;
  toolDefinitions: string;
}

/**
 * Parameters for supervisor agent prompt building
 */
export interface SupervisorPromptParams {
  type: 'supervisor';
  systemPrompt: string;
  userPrompt: string;
  context: Record<string, any>;
  currentInteractionHistory: Interaction[];
  prevInteractionHistory: Interaction[];
  lastError: AgentError | null;
  keepRetry: boolean;
  toolDefinitions: string;
  options: PromptOptions;
  errorRecoveryInstructions?: string;
  workerReport?: string;
}

/**
 * Base interface for all prompt templates
 */
export interface BasePromptTemplate {
  buildPrompt(params: WorkerPromptParams | SupervisorPromptParams): string;
}