// Enhanced AgentError.ts

export enum AgentErrorType {
    TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
    TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
    TOOL_TIMEOUT_ERROR = 'TOOL_TIMEOUT_ERROR',
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    MAX_ITERATIONS_REACHED = 'MAX_ITERATIONS_REACHED',
    STAGNATION_ERROR = 'STAGNATION_ERROR',
    RESERVED_TOOL_NAME = 'RESERVED_TOOL_NAME',
    DUPLICATE_TOOL_NAME = 'DUPLICATE_TOOL_NAME',
    INVALID_TOOL_NAME = 'INVALID_TOOL_NAME',
    CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
    INVALID_SCHEMA = "INVALID_SCHEMA",
    UNKNOWN = "UNKNOWN",
    MALFORMED_TOOL_FOUND = "MALFORMED_TOOL_FOUND",
    INVALID_USER_INPUT = "INVALID_USER_INPUT",
    INVALID_INPUT = "INVALID_INPUT",
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
  