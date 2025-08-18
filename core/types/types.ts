import z, { ZodTypeAny } from "zod";
import { TurnState } from "../agents/TurnState";
import { AgentError } from "../utils/AgentError";

/**
 * Format mode for the agent - only JSObject mode is supported
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
    properties: Record<string, any>;
    required?: string[];
  };
}

// User prompt input to the agent
export interface UserPrompt {
  taskId: string;
  type: "user_prompt";
  timestamp: string;
  context: string;
}

// Response message from the agent
export interface AgentResponse {
  taskId: string;
  type: "agent_response";
  timestamp: string;
  context: any;
  error?: string;
  tokenUsage?: TokenUsage;
}

// Context structure used inside tool_call events
export interface ToolCallContext {
  toolName: string;
  success: boolean;
  [key: string]: any
  error?: string;
}

// Tool call event (uses ToolCallContext)
export interface ToolCall {
  taskId: string;
  type: "tool_call";
  timestamp: string;
  context: ToolCallContext;
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
  [key: string]: any;
}

export interface AgentRunInput {
  userPrompt: string;
  prevInteractionHistory: Interaction[];
  context?: Record<string, any>;
  completionOptions?: Record<string, any>;  
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
  [key: string]: any
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
  timeout?: number;
  /** The unique name of the tool. Must not contain spaces or special characters. */
  name: string;
  /** A clear, detailed description of what the tool does, for the AI. */
  description: string;
  /** A Zod schema defining the arguments the tool expects. */
  argsSchema: T;
  /** The handler function that executes the tool's logic. */
  dependencies?: string[];
  handler: (params: HandlerParams<ZodTypeAny>) => ToolCallContext | Promise<ToolCallContext>;
}

// Essential types only
export type ServiceName = 'openai' | 'google' | 'anthropic' | 'mistral' | 'cohere' | 'groq' | 'fireworks' | 'deepseek' | 'perplexity' | 'azure';


export interface FunctionCallTool {
  function: { description: string; name: string; parameters: any };
  type: "function";
}

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

  tools?: FunctionCallTool[];



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
  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string | FunctionCallTool[];
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
  context: Record<string, any>;
  currentInteractionHistory: Interaction[];
  prevInteractionHistory: Interaction[];
  lastError: AgentError | null;
  keepRetry: boolean;
  finalToolName: string;
  reportToolName: string;
  toolDefinitions: string;
  options: PromptOptions;
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
