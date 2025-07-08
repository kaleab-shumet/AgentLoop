/**
 * Error types for agent operations
 */
export enum AgentErrorType {
    /** An error occurred while parsing the LLM's response. */
    PARSER_ERROR = 'PARSER_ERROR',
    /** The LLM returned a response that was empty or otherwise invalid. */
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    /** The LLM requested a tool that has not been defined. */
    TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',

    INVALID_TOOL_FOUND = 'INVALID_TOOL_FOUND',
    /** An unexpected error was thrown during the execution of a tool's handler. */
    TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
    /** The agent exceeded the maximum number of iterations allowed. */
    MAX_ITERATIONS_REACHED = 'MAX_ITERATIONS_REACHED',
    /** A generic, unknown error occurred. */
    UNKNOWN = 'UNKNOWN',
}

export class AgentError extends Error {
    /*
    A machine-readable type for the error.
    */
    public readonly type: AgentErrorType;
    public toolname: string | undefined;
    public toolid: string | undefined
    /**
    A key-value object containing additional context about the error.
    */
    public readonly context?: Record<string, any>;
    constructor(message: string, type: AgentErrorType, toolname?: string, toolid?:string) {
        super(message);
        this.name = 'AgentError';
        this.type = type;
        this.toolname = toolname;
        this.toolid = toolid;

        // This is for V8 environments (like Node.js, Chrome) to capture the stack trace correctly.
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AgentError);
        }
    }
}
