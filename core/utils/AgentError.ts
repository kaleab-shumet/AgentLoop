// Enhanced AgentError.ts

export enum AgentErrorType {
    // Tool Discovery & Validation Errors
    /** AI requests a tool that doesn't exist in the tool registry */
    TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
    
    /** Tool code crashes, throws exceptions, or fails during execution */
    TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
    
    /** Tool execution exceeds the configured timeout limit */
    TOOL_TIMEOUT_ERROR = 'TOOL_TIMEOUT_ERROR',
    
    // AI Response Format Errors
    /** AI returns malformed response: missing callTools function, invalid JavaScript syntax, wrong structure */
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    
    /** Tool arguments don't match Zod schema: wrong types, missing required fields, validation failures */
    INVALID_INPUT = "INVALID_INPUT",
    
    // Connection & Communication Errors  
    /** Network failures, DNS errors, API timeouts, authentication issues with AI provider */
    CONNECTION_ERROR = 'CONNECTION_ERROR',
    
    /** Unclassified errors that don't fit other categories, treated as potential network/system issues */
    UNKNOWN = "UNKNOWN",
    
    // Agent Loop Control Errors
    /** Agent reaches maximum iteration limit without completing the task */
    MAX_ITERATIONS_REACHED = 'MAX_ITERATIONS_REACHED',
    
    /** AI gets stuck in repetitive reasoning patterns, detected by identical report hash comparison */
    STAGNATION_ERROR = 'STAGNATION_ERROR',
    
    // Configuration & Setup Errors  
    /** Tool name conflicts with reserved system tool names (self_reasoning_tool, final_tool) */
    RESERVED_TOOL_NAME = 'RESERVED_TOOL_NAME',
    
    /** Multiple tools registered with the same name */
    DUPLICATE_TOOL_NAME = 'DUPLICATE_TOOL_NAME',
    
    /** Tool name contains invalid characters or format */
    INVALID_TOOL_NAME = 'INVALID_TOOL_NAME',
    
    /** Invalid AgentLoop configuration: missing required settings, invalid format modes, etc. */
    CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  }
  
  export class AgentError extends Error {
    public readonly type: AgentErrorType;
    public readonly context: Record<string, any>;
    public readonly timestamp: Date;
  
    constructor(message: string, type: AgentErrorType, context: Record<string, any> = {}) {
      super(message);
      this.name = 'AgentError';
      this.type = type;
      this.context = context;
      this.timestamp = new Date();
    }
  
    /**
     * Get a detailed error message with full context for LLM feedback
     */
    public getMessage(): string {
            // Create a comprehensive error dump
      const parts = [
        `Error Type: ${this.type}`,
        `Message: ${this.message}`,
      ];

      // Add context information if available
      if (Object.keys(this.context).length > 0) {
        parts.push(`Error Context: ${JSON.stringify(this.context, null, 2)}`);
      }

      return parts.join('\n');
    }
  
  }
  