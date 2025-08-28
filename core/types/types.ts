import z, { ZodTypeAny } from "zod";
import { TurnState } from "../agents/TurnState";
import { AgentError } from "../utils/AgentError";

/**
 * Format mode for the agent - only LITERAL_JS mode is supported
 */
export enum FormatMode {
  LITERAL_JS = "literal_js"
}

/**
 * OpenAI-style function call structure
 */
export interface FunctionCall {
  name: string;
  arguments: string; // JSON string
}

/**
 * OpenAI-style function definition for tool schema
 */
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// User prompt input to the agent
export interface UserPrompt {
  taskId: string;
  type: "user_prompt";
  timestamp: string;
  message: string;
}

// Response message from the agent
export interface AgentResponse {
  taskId: string;
  type: "agent_response";
  timestamp: string;
  args: unknown;
  error?: string;
  tokenUsage?: TokenUsage;
}

// Tool call event (linearized structure)
export interface ToolCall {
  taskId: string;
  type: "tool_call";
  timestamp: string;
  toolName: string;
  success: boolean;
  error?: string;
  args: unknown;
}

// Tool call report event (groups multiple tool calls with a report)
export interface ToolCallReport {
  report: string;
  overallSuccess: boolean;
  toolCalls: ToolCall[];
  error?: string;
}

// Union of all possible event types
export type Interaction =
  | UserPrompt
  | ToolCallReport
  | AgentResponse;




/**
 * Represents a tool call that has been parsed from the AI's response
 * but has not yet been executed.
 */
export interface PendingToolCall {
  toolName: string;
  [key: string]: unknown;
}

export interface AgentRunInput {
  userPrompt: string;
  prevInteractionHistory: Interaction[];
  context?: Record<string, unknown>;
  completionOptions?: Record<string, unknown>;  
}

/**
 * Output from a single turn of the agent's execution loop.
 * This entire object should be persisted by the developer to continue the conversation.
 */
export interface AgentRunOutput {
  /** The final tool call history after this turn. */
  interactionHistory: Interaction[];
  /** The final answer from the 'final' tool, if it was called. */
  agentResponse?: AgentResponse;
}

/**
 * A generic object for passing data between tools in a chain, if needed.
 * Currently unused but available for future enhancements.
 */
export interface ToolChainData {
  [key: string]: unknown;
}


/**
 * Parameters passed to a tool handler function
 */
export interface HandlerParams<T extends ZodTypeAny = ZodTypeAny> {
  name: string;
  args: z.infer<T>;
  turnState: TurnState;
}

/**
 * Defines the structure for a tool that can be used by the agent.
 */
export interface Tool<T extends ZodTypeAny = ZodTypeAny> {
  /** Timeout for tool execution in milliseconds. Use negative value to disable timeout. */
  timeout?: number;
  /** The unique name of the tool. Must not contain spaces or special characters. */
  name: string;
  /** A clear, detailed description of what the tool does, for the AI. */
  description: string;
  /** A Zod schema defining the arguments the tool expects. */
  argsSchema: T;
  /** The handler function that executes the tool's logic. */
  dependencies?: string[];
  handler: (params: HandlerParams<ZodTypeAny>) => unknown | Promise<unknown>;
}

/**
 * JavaScript execution mode for tool calling
 * SES (Secure EcmaScript) is the only supported mode for maximum security
 */
export type JsExecutionMode = 'ses';

// Essential types only
export type ServiceName = 'openai' | 'google' | 'anthropic' | 'mistral' | 'groq' | 'perplexity' | 'azure';


// Simple AIConfig - only essential fields
export interface AIConfig {
  /** Service to use */
  service: ServiceName;
  /** API Key for the service */
  apiKey: string;
  /** Model to use */
  model?: string;
  /** Temperature for the model */
  temperature?: number;
  /** Maximum number of tokens to generate */
  max_tokens?: number;
  /** Base URL for the service (required for Azure) */
  baseURL?: string;
  /** API version for Azure OpenAI (optional, defaults to latest) */
  apiVersion?: string;
}


export interface TypedPaths {
  arrayPaths: string[];
  booleanPaths: string[];
  numberPaths: string[];
}



/**
 * Interface for handling different response formats (XML vs Function Calling)
 */
export interface FormatHandler {
  parseResponse(response: string, tools: Tool<ZodTypeAny>[]): Promise<PendingToolCall[]>;
  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string;
}

export interface PromptOptions {
  includeContext?: boolean;
  includePreviousTaskHistory?: boolean;
  maxPreviousTaskEntries?: number;
  customSections?: Record<string, string>;
  parallelExecution?: boolean;
  batchMode?: boolean;
}

export interface ConversationEntry {
  user?: string;
  ai?: string;
}

export interface BuildPromptParams {
  systemPrompt: string;
  userPrompt: string;
  context: Record<string, string>;
  currentInteractionHistory: Interaction[];
  prevInteractionHistory: Interaction[];
  lastError: AgentError | null;
  keepRetry: boolean;
  finalToolName: string;
  reportToolName: string;
  toolDefinitions: string;
  nextTasks?: string | null;
  goal?: string | null;
  report?: string | null;
  conversationEntries?: ConversationEntry[];
  conversationLimitNote?: string;
  errorRecoveryInstructions?: string;
}

/**
 * Retry counters and limits for different error types
 */
export interface RetryContext {
  connectionRetryCount: number;
  connectionRetryLimit: number;
  toolExecutionRetryCount: number;
  toolExecutionRetryLimit: number;
}

export interface ErrorHandlingResult {
  errorString: string;
  actualError: AgentError;
  shouldTerminate: boolean;
  feedbackToLLM: boolean;
  retryContext?: RetryContext;
}

/**
 * Token usage information from AI provider
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * AI completion response with token usage information
 */
export interface AICompletionResponse {
  text: string;
  usage?: TokenUsage;
}
