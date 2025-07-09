import z, { ZodTypeAny } from "zod";

/**
 * Represents the result of a single tool execution.
 * This is stored in the agent's history.
 */
export interface ToolResult {
    toolname: string;
    success: boolean;
    // 'output' for successful results, 'error' for failures.
    output?: any;
    error?: string;
    // Optional context for richer error reporting.
    context?: Record<string, any>;
  }
  
  /**
   * Represents a tool call that has been parsed from the LLM's response
   * but has not yet been executed.
   */
  export interface PendingToolCall {
    name: string;
    [key: string]: any;
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
    timeout: number;
    /** The unique name of the tool. Must not contain spaces or special characters. */
    name: string;
    /** A clear, detailed description of what the tool does, for the LLM. */
    description: string;
    /** A Zod schema defining the arguments the tool expects. */
    responseSchema: T;
    /** The handler function that executes the tool's logic. */
    dependencies: [];
    handler: (name: string, args: z.infer<T>, toolChainData: ToolChainData) => ToolResult | Promise<ToolResult>;
  };