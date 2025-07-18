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
     * Get a user-friendly error message
     */
    public getUserMessage(): string {
      switch (this.type) {
        case AgentErrorType.TOOL_NOT_FOUND:
          return `The requested tool '${this.context.toolName}' is not available. Available tools: ${this.context.availableTools?.join(', ') || 'none'}`;
        case AgentErrorType.TOOL_TIMEOUT_ERROR:
          return `The tool '${this.context.toolName}' took too long to respond (timeout: ${this.context.timeout}ms).`;
        case AgentErrorType.MAX_ITERATIONS_REACHED:
          return 'The agent reached its maximum number of iterations without completing the task.';
        case AgentErrorType.STAGNATION_ERROR:
          return 'The agent got stuck in a loop and couldn\'t make progress.';
        case AgentErrorType.CONFIGURATION_ERROR:
          return `Configuration error: ${this.message}${this.context.service ? ` (Service: ${this.context.service})` : ''}`;
        case AgentErrorType.INVALID_INPUT:
          return `Invalid input provided for tool '${this.context.toolName}': ${this.message}`;
        case AgentErrorType.INVALID_RESPONSE:
          return `Invalid response format: ${this.message}${this.context.responseType ? ` (received: ${this.context.responseType})` : ''}`;
        case AgentErrorType.DUPLICATE_TOOL_NAME:
          return `Tool name '${this.context.toolName}' is already in use.`;
        case AgentErrorType.INVALID_TOOL_NAME:
          return `Invalid tool name '${this.context.toolName}': ${this.message}`;
        case AgentErrorType.MALFORMED_TOOL_FOUND:
          return `Malformed tool found${this.context.toolName ? ` '${this.context.toolName}'` : ''}: ${this.message}`;
        case AgentErrorType.INVALID_SCHEMA:
          return `Invalid schema${this.context.toolName ? ` for tool '${this.context.toolName}'` : ''}: ${this.message}`;
        default:
          return this.message;
      }
    }
  
    /**
     * Check if error is recoverable
     */
    public isRecoverable(): boolean {
      return [
        AgentErrorType.TOOL_EXECUTION_ERROR,
        AgentErrorType.TOOL_TIMEOUT_ERROR,
        AgentErrorType.INVALID_RESPONSE,
        AgentErrorType.STAGNATION_ERROR,
      ].includes(this.type);
    }
  }
  