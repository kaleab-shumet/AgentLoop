# API Reference

Complete API documentation for AgentLoop framework.

## Core Classes

### AgentLoop

The main agent class that orchestrates AI interactions and tool execution.

```typescript
abstract class AgentLoop {
  constructor(
    aiProvider: AIProvider, 
    options?: AgentLoopOptions
  )
}
```

#### Constructor Parameters

- `aiProvider`: An implementation of the AIProvider interface
- `options`: Optional configuration object

#### Methods

##### `run(input: AgentRunInput): Promise<AgentRunOutput>`

Execute the agent with a user prompt.

```typescript
interface AgentRunInput {
  userPrompt: string;
  context?: Record<string, unknown>; // v2.0.0: Pass history as context["Conversation History"]
  completionOptions?: Record<string, unknown>;
}

interface AgentRunOutput {
  agentResponse?: AgentResponse;
  error?: AgentError;
  tokenUsage?: TokenUsage;
  executionTime?: number;
}
```

#### AgentRunInput Parameters

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `userPrompt` | `string` | ✅ | The user's message or instruction to the agent |
| `context` | `Record<string, unknown>` | ❌ | Context data including conversation history (pass history as `context["Conversation History"]`) |
| `completionOptions` | `Record<string, unknown>` | ❌ | Optional AI provider completion options (temperature, max_tokens, etc.) |

#### Conversation History Management

AgentLoop uses a **context-based approach** for conversation history, giving you full control over how history is formatted and structured:

```typescript
// Manage conversation history as array
const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [];

const result1 = await agent.run({
  userPrompt: "What is 2 + 2?",
  ...(conversationHistory.length > 0 && {
    context: {
      "Conversation History": conversationHistory
        .map(entry => `${entry.role}: ${entry.message}`)
        .join('\n')
    }
  })
});

// After getting response, update history
conversationHistory.push(
  { role: 'user', message: "What is 2 + 2?" },
  { role: 'agent', message: result1.agentResponse?.args }
);

const result2 = await agent.run({
  userPrompt: "Now multiply that by 3",
  ...(conversationHistory.length > 0 && {
    context: {
      "Conversation History": conversationHistory
        .map(entry => `${entry.role}: ${entry.message}`)
        .join('\n')
    }
  })
});

// After getting response, update history
conversationHistory.push(
  { role: 'user', message: "Now multiply that by 3" },
  { role: 'agent', message: result2.agentResponse?.args }
);
```

**Benefits of Context-Based History:**
- **Full Control**: You decide how to format and structure conversation history
- **Flexible**: Can include additional context beyond just conversation
- **Stateless**: AgentLoop remains completely stateless
- **Scalable**: Easy to persist to databases or external storage
- **Custom Formats**: Support any history format that works for your use case
```

##### `defineTool(definition: ToolDefinition): void`

Define a tool that the agent can use.

```typescript
type ToolDefinition<T extends ZodTypeAny> = (z: typeof import('zod')) => Tool<T>;

// Example
this.defineTool(z => ({
  name: 'example_tool',
  description: 'An example tool',
  argsSchema: z.object({
    param: z.string().describe('A parameter')
  }),
  handler: async ({ args, turnState }) => {
    return { result: args.param };
  }
}));
```

### Tool Interface

```typescript
interface Tool<T extends ZodTypeAny = ZodTypeAny> {
  /** Timeout for tool execution in milliseconds. Use negative value to disable timeout. */
  timeout?: number;
  /** The unique name of the tool. Must not contain spaces or special characters. */
  name: string;
  /** A clear description of what the tool does and when to use it. */
  description: string;
  /** Zod schema defining the expected parameters for this tool. */
  argsSchema: T;
  /** The function that implements the tool's functionality. */
  handler: ToolHandler<T>;
  /** List of tool names this tool depends on. */
  dependencies?: string[];
}
```

### Tool Handler

```typescript
interface HandlerParams<T extends ZodTypeAny = ZodTypeAny> {
  name: string;
  args: z.infer<T>;
  turnState: TurnState;
  dependencies?: Record<string, ToolResult>;
}

type ToolHandler<T extends ZodTypeAny> = (
  params: HandlerParams<T>
) => Promise<ToolResult>;

interface ToolResult {
  [key: string]: unknown;
  success?: boolean;
  error?: string;
}
```

## Configuration

### AgentLoopOptions

```typescript
interface AgentLoopOptions {
  /** Format mode for tool calling */
  formatMode?: FormatMode;
  /** Maximum number of reasoning iterations */
  maxIterations?: number;
  /** Enable parallel tool execution */
  parallelExecution?: boolean;
  /** Global timeout in ms for all tools (default: -1, disabled) */
  globalToolTimeoutMs?: number;
  /** JavaScript execution mode for tool calling (SES is the only supported mode) */
  jsExecutionMode?: 'ses';
  /** Retry attempts for tool execution errors */
  toolExecutionRetryAttempts?: number;
  /** Retry attempts for connection/parsing errors */
  connectionRetryAttempts?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Failure tolerance (0.0-1.0) */
  failureTolerance?: number;
  /** Custom logger implementation */
  logger?: Logger;
  /** Stagnation detection threshold */
  stagnationTerminationThreshold?: number;
  /** Memory management limit */
  maxInteractionHistoryCharsLimit?: number;
  /** Rate limiting between iterations */
  sleepBetweenIterationsMs?: number;
  /** Lifecycle hooks */
  hooks?: AgentLifecycleHooks;
}
```

### FormatMode

```typescript
enum FormatMode {
  LITERAL_JS = 'literaljs'
}
```

### JavaScript Execution Mode

```typescript
type JsExecutionMode = 'ses';
```

- **`'ses'`** - Secure EcmaScript (only mode): Maximum security through compartmentalized execution

**Note**: AgentLoop v2.0.0 removes all unsafe execution modes. SES provides maximum security with zero configuration required.

## AI Providers

### DefaultAIProvider

```typescript
class DefaultAIProvider implements AIProvider {
  constructor(config: AIProviderConfig)
}

interface AIProviderConfig {
  service: 'openai' | 'google' | 'anthropic' | 'azure' | 'mistral' | 'groq' | 'perplexity';
  apiKey: string;
  model: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}
```

### Supported Services

#### OpenAI
```typescript
{
  service: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o' | 'gpt-4' | 'gpt-3.5-turbo'
}
```

#### Google Gemini
```typescript
{
  service: 'google',
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.0-flash' | 'gemini-1.5-pro'
}
```

#### Anthropic Claude
```typescript
{
  service: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022' | 'claude-3-opus-20240229'
}
```

#### Azure OpenAI
```typescript
{
  service: 'azure',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_RESOURCE_NAME,
  model: 'gpt-4'
}
```

## Format Handlers

### LiteralJSFormatHandler

Handles JavaScript-based tool calling format.

```typescript
class LiteralJSFormatHandler implements FormatHandler {
  /** JavaScript execution mode configured via constructor */
  public executionMode: JsExecutionMode;
  
  constructor(jsExecutionMode?: JsExecutionMode);
  
  /** Format tool definitions for AI consumption */
  formatToolDefinitions(tools: Tool[]): string;
  
  /** Parse AI response and extract tool calls */
  format(params: FormatParams): Promise<ToolCall[]>;
}
```

### JSExecutionEngine

Handles secure JavaScript execution using SES (Secure EcmaScript) - the only execution mode for maximum security.

```typescript
class JSExecutionEngine {
  async execute(
    jsCode: string,
    tools: Tool[],
    options?: JSExecutionOptions
  ): Promise<Record<string, unknown>[]>;
}

interface JSExecutionOptions {
  mode?: JsExecutionMode; // Always 'ses' - maximum security guaranteed
  timeoutMs?: number;
}
```

## Error Handling

### AgentError

```typescript
class AgentError extends Error {
  constructor(
    message: string,
    type: AgentErrorType,
    context?: Record<string, unknown>
  )
}

enum AgentErrorType {
  TOOL_NOT_FOUND = 'tool_not_found',
  INVALID_RESPONSE = 'invalid_response',
  TOOL_EXECUTION_ERROR = 'tool_execution_error',
  TOOL_TIMEOUT_ERROR = 'tool_timeout_error',
  CONNECTION_ERROR = 'connection_error',
  PARSING_ERROR = 'parsing_error',
  STAGNATION_ERROR = 'stagnation_error',
  CONFIGURATION_ERROR = 'configuration_error',
  VALIDATION_ERROR = 'validation_error',
  DEPENDENCY_ERROR = 'dependency_error',
  CONCURRENCY_ERROR = 'concurrency_error',
  MEMORY_ERROR = 'memory_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  PERMISSION_ERROR = 'permission_error',
  NETWORK_ERROR = 'network_error',
  UNKNOWN_ERROR = 'unknown_error',
  AI_PROVIDER_ERROR = 'ai_provider_error',
  PROMPT_TOO_LONG_ERROR = 'prompt_too_long_error'
}
```

## Lifecycle Hooks

```typescript
interface AgentLifecycleHooks {
  onRunStart?: (input: AgentRunInput) => Promise<void>;
  onRunEnd?: (output: AgentRunOutput) => Promise<void>;
  onIterationStart?: (iteration: number) => Promise<void>;
  onIterationEnd?: (iteration: number, results: ToolCall[]) => Promise<void>;
  onPromptCreate?: (prompt: string) => Promise<string>; // Can modify the prompt
  onAIRequestStart?: (prompt: string) => Promise<void>;
  onAIRequestEnd?: (response: string) => Promise<void>;
  onToolCallStart?: (call: PendingToolCall) => Promise<void>;
  onToolCallEnd?: (result: ToolCall) => Promise<void>;
  onReportData?: (report: string | null, nextTasks: string | null, goal: string | null, iteration: number) => Promise<void>;
  onStagnationDetected?: (reportText: string, iteration: number) => Promise<void>;
  onAgentFinalResponse?: (result: AgentResponse) => Promise<void>;
  onError?: (error: AgentError) => Promise<void>;
}
```

## Token Usage

```typescript
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
```

## Turn State

```typescript
interface TurnState {
  /** Current iteration number */
  iteration: number;
  /** Results from previous tool executions */
  toolResults: ToolCall[];
  /** Interaction history */
  history: InteractionHistoryItem[];
  /** Custom user data */
  userData?: Record<string, unknown>;
}
```

## Data Types

### Interaction Types

AgentLoop uses linearized data structures for better type safety and clarity:

#### UserPrompt
```typescript
interface UserPrompt {
  taskId: string;
  type: "user_prompt";
  timestamp: string;
  message: string;  // Direct message field (linearized from context)
}
```

#### ToolCall  
```typescript
interface ToolCall {
  taskId: string;
  type: "tool_call";
  timestamp: string;
  toolName: string;  // Direct field (linearized from context.toolName)
  success: boolean;  // Direct field (linearized from context.success)
  error?: string;    // Direct field (linearized from context.error)
  args: unknown;     // All tool result data (linearized from context.*)
}
```

#### AgentResponse
```typescript
interface AgentResponse {
  taskId: string;
  type: "assistant";
  timestamp: string;
  args: unknown;     // Response data (linearized from context)
  error?: string;
  tokenUsage?: TokenUsage;
}
```

#### ToolCallReport
```typescript
interface ToolCallReport {
  report: string;
  overallSuccess: boolean;
  toolCalls: ToolCall[];  // Array of linearized ToolCall objects
  error?: string;
}
```

### Union Types

```typescript
type Interaction = UserPrompt | ToolCallReport | AgentResponse;
```

## Utility Types

### InteractionHistoryItem

```typescript
interface InteractionHistoryItem {
  userPrompt: string;
  agentResponse: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}
```

### AgentResponse (Runtime)

```typescript
// Runtime AgentResponse structure
interface AgentResponse {
  content: string;
  context: string;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolCall[];
}
```

### ToolCall (Runtime)

```typescript
// Runtime ToolCall structure used during execution
interface ToolCall {
  type: 'tool_call';
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResult;
  timestamp: string;
  executionTimeMs?: number;
  success: boolean;
  error?: string;
}
```

## Examples

### Basic Tool Definition

```typescript
this.defineTool(z => ({
  name: 'file_read',
  description: 'Read the contents of a file',
  timeout: 5000,
  argsSchema: z.object({
    filepath: z.string().describe('Path to the file to read'),
    encoding: z.string().optional().describe('File encoding (default: utf8)')
  }),
  handler: async ({ args }) => {
    try {
      const content = await fs.readFile(args.filepath, args.encoding || 'utf8');
      return { 
        content, 
        filepath: args.filepath,
        size: content.length,
        success: true 
      };
    } catch (error) {
      return { 
        error: error.message, 
        filepath: args.filepath,
        success: false 
      };
    }
  }
}));
```

### Tool with Dependencies

```typescript
this.defineTool(z => ({
  name: 'analyze_file',
  description: 'Analyze file content and provide insights',
  dependencies: ['file_read'],
  argsSchema: z.object({
    filepath: z.string().describe('Path to the file to analyze')
  }),
  handler: async ({ args, dependencies }) => {
    const fileContent = dependencies?.file_read?.result?.content;
    if (!fileContent) {
      return { error: 'File content not available', success: false };
    }
    
    const analysis = {
      lineCount: fileContent.split('\n').length,
      wordCount: fileContent.split(/\s+/).length,
      charCount: fileContent.length,
      hasCode: /function|class|const|let|var/.test(fileContent)
    };
    
    return { analysis, filepath: args.filepath, success: true };
  }
}));
```

### Custom AI Provider

```typescript
class CustomAIProvider implements AIProvider {
  async completion(messages: Message[]): Promise<AICompletionResponse> {
    // Implement your custom AI integration
    const response = await fetch('https://api.custom-ai.com/chat', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ messages })
    });
    
    const data = await response.json();
    
    return {
      content: data.message,
      tokenUsage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  }
}
```

### Security Configuration

```typescript
class SecureAgent extends AgentLoop {
  constructor() {
    super(aiProvider, {
      // No security configuration needed - SES is always used
      // Maximum security is guaranteed by default
      maxIterations: 10,
      globalToolTimeoutMs: 30000
    });
  }
}
```