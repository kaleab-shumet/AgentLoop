import z, { ZodTypeAny } from "zod";
import { TurnState } from "../agents/TurnState";

/**
 * Format mode for the agent - function calling and YAML mode are supported
 */
export enum FormatMode {
  FUNCTION_CALLING = "function_calling",
  YAML_MODE = "yaml_mode"
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
export type UserPrompt = {
  taskId: string;
  type: "user_prompt";
  timestamp: string;
  context: string;
};

// Response message from the agent
export type AgentResponse = {
  taskId: string;
  type: "agent_response";
  timestamp: string;
  context: any;
};

// Context structure used inside tool_call events
export type ToolCallContext = {
  toolName: string;
  success: boolean;
  [key: string]: any
  error?: string;
};

// Tool call event (uses ToolCallContext)
export type ToolCall = {
  taskId: string;
  type: "tool_call";
  timestamp: string;
  context: ToolCallContext;
};

// Union of all possible event types
export type Interaction =
  | UserPrompt
  | ToolCall
  | AgentResponse;




/**
 * Represents a tool call that has been parsed from the LLM's response
 * but has not yet been executed.
 */
export interface PendingToolCall {
  toolName: string;
  [key: string]: any;
}

export interface AgentRunInput {
  userPrompt: string;
  interactionHistory: [];
  context?: Record<string, any>;
}

/**
 * Output from a single turn of the agent's execution loop.
 * This entire object should be persisted by the developer to continue the conversation.
 */
export interface AgentRunOutput {
  /** The final tool call history after this turn. */
  interactionList: Interaction[];
  /** The final answer from the 'final' tool, if it was called. */
  finalAnswer?: AgentResponse;
}

/**
 * A generic object for passing data between tools in a chain, if needed.
 * Currently unused but available for future enhancements.
 */
export interface ToolChainData {
  [key: string]: any
}

/**
 * Represents a single entry in the high-level conversation history.
 */
export interface ChatEntry {
  sender: "ai" | "user" | "system";
  message: string;
}

/**
 * Defines the structure for a tool that can be used by the agent.
 */
export type Tool<T extends ZodTypeAny = ZodTypeAny> = {
  timeout?: number;
  /** The unique name of the tool. Must not contain spaces or special characters. */
  name: string;
  /** A clear, detailed description of what the tool does, for the LLM. */
  description: string;
  /** A Zod schema defining the arguments the tool expects. */
  argsSchema: T;
  /** The handler function that executes the tool's logic. */
  dependencies?: string[];
  handler: (name: string, args: z.infer<T>, toolChainData: ToolChainData) => ToolCallContext | Promise<ToolCallContext>;
};

// Essential types only
export type ServiceName = 'openai' | 'google' | 'anthropic' | 'mistral' | 'cohere' | 'groq' | 'fireworks' | 'deepseek' | 'perplexity';


export interface FunctionCallingTool {
  function: { description: string; name: string; parameters: any };
  type: "function";
}

// Simple LLMConfig - only essential fields
export interface LLMConfig {
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

  tools?: FunctionCallingTool[];



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
  parseResponse(response: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[];
  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string | FunctionCallingTool[];
}

export interface PromptOptions {
  includeContext?: boolean;
  includeConversationHistory?: boolean;
  includeToolHistory?: boolean;
  maxHistoryEntries?: number;
  customSections?: Record<string, string>;
  parallelExecution?: boolean;
  includeExecutionStrategy?: boolean;
}
