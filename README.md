# AgentLoop

> **A TypeScript Framework for Building Tool-Using AI Agents**

AgentLoop is a TypeScript framework that enables developers to build AI agents capable of executing complex tool chains. With support for 10+ AI providers, JavaScript-based tool calling, and error handling, AgentLoop abstracts away the complexity of multi-step AI workflows while maintaining full type safety and extensibility.

**Note:** AgentLoop uses JavaScript-based tool calling instead of traditional function calling APIs. AI models generate JavaScript code that calls tools, providing more flexibility and control over execution flow.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/agentloop.svg)](https://www.npmjs.com/package/agentloop)

## What's New in v2.0.0

- **Enhanced Security**: Completely removed eval execution mode - SES is now the only execution mode for maximum security
- **Linearized Data Structures**: Simplified and flattened data types for better performance and developer experience
- **XML References for Large Content**: Uses XML literal blocks to avoid string escaping issues when LLMs work with large content
- **Architecture Cleanup**: Removed outdated execution modes and streamlined the codebase

## 🚀 Key Features

### Multi-Provider AI Support
- **10+ AI Providers**: OpenAI, Google (Gemini), Anthropic (Claude), Mistral, Cohere, Groq, Fireworks, DeepSeek, Perplexity, Azure
- **Unified Interface**: Switch between providers without code changes
- **Provider-Specific Optimizations**: Automatic handling of rate limits, context windows, and capabilities

### Secure Code Execution
- **Maximum Security**: SES (Secure EcmaScript) is the only execution mode - no unsafe alternatives
- **Compartmentalized**: All AI-generated code runs in isolated SES compartments
- **Cross-Platform**: Works in Node.js and browsers with zero configuration
- **Zero Dependencies**: SES included out of the box, no additional installation needed

### Innovative Tool Calling
- **JavaScript-Based Tools**: AI writes JavaScript functions for tool execution
- **Type-Safe Validation**: Zod schemas ensure runtime type safety
- **XML Literal Blocks**: Reference large content without string escaping issues

```javascript
// Clean JavaScript without escaping:
writeFile("path", LiteralLoader.load("file_content_123"));
```

```xml
<literals>
  <literal id="file_content_123">
const data = "hello
world";
console.log(data);
  </literal>
</literals>
```

- **Additional Features**: Dependency management, parallel/sequential execution

### Error Handling & Monitoring
- **Stateless Architecture**: Horizontally scalable, no internal state storage
- **Error Handling**: Multiple error types with automatic retry logic
- **Stagnation Detection**: Prevents infinite loops and repetitive behavior
- **Lifecycle Hooks**: Monitor and customize agent execution

### Developer Experience
- **Full TypeScript Support**: Complete type safety from tools to responses
- **Extensible Architecture**: Custom providers, templates, and tool formats
- **Configurable**: Fine-tune behavior for different use cases
- **Error Recovery**: Built-in error handling and retry mechanisms

## Installation

```bash
npm install agentloop
```

**That's it!** SES (Secure EcmaScript) is included out of the box for secure JavaScript execution.

## Quick Start

### Basic Agent Setup

```typescript
import { AgentLoop, FormatMode } from 'agentloop';
import { DefaultAIProvider } from 'agentloop/providers';

class MyAgent extends AgentLoop {
  protected systemPrompt = "You are a helpful assistant with file management capabilities.";
  
  constructor() {
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4'
    }), {
      formatMode: FormatMode.LITERAL_JS,
      maxIterations: 10
    });
    
    this.setupTools();
  }
  
  private setupTools() {
    // Define your tools with Zod validation
    this.defineTool(z => ({
      name: 'read_file',
      description: 'Read contents of a file',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file')
      }),
      handler: async ({ args }) => {
        const content = await fs.readFile(args.filepath, 'utf8');
        return { content, success: true };
      }
    }));
  }
}
```

### Running the Agent

```typescript
const agent = new MyAgent();

const result = await agent.run({
  userPrompt: "Read the package.json file and tell me about the project",
  prevInteractionHistory: []
});

console.log(result.agentResponse?.args);
```

## 📖 API Reference

### `run(input: AgentRunInput): Promise<AgentRunOutput>`

The main method to execute the agent. This is a stateless operation that processes a single turn of conversation.

#### Parameters (`AgentRunInput`)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `userPrompt` | `string` | ✅ | The user's message or instruction to the agent |
| `prevInteractionHistory` | `Interaction[]` | ✅ | Array of previous interactions (can be empty `[]` for first turn) |
| `context` | `Record<string, unknown>` | ❌ | Optional context data to pass to the agent |
| `completionOptions` | `Record<string, unknown>` | ❌ | Optional AI provider completion options (temperature, max_tokens, etc.) |

#### Return Value (`AgentRunOutput`)

| Property | Type | Description |
|----------|------|-------------|
| `interactionHistory` | `Interaction[]` | Complete interaction history including the new turn. **Persist this for the next run** |
| `agentResponse` | `AgentResponse?` | The agent's final response (only present if agent called the `final_tool`) |

#### Interaction Types

An `Interaction` can be one of:
- **`UserPrompt`** - User's input message with `message` field
- **`ToolCallReport`** - Results from tool execution(s) with linearized `ToolCall[]` 
- **`AgentResponse`** - Agent's final response with `args` field containing the response data

#### Data Structure - Linearized & Simplified

AgentLoop uses a **linearized data structure** for better type safety and easier access:

```typescript
// ✅ NEW: Direct field access
interface ToolCall {
  taskId: string;
  type: "tool_call";
  timestamp: string;
  toolName: string;    // Direct access (was: result.context.toolName)
  success: boolean;    // Direct access (was: result.context.success)  
  error?: string;      // Direct access (was: result.context.error)
  args: unknown;       // All tool data (was: result.context.*)
}

interface UserPrompt {
  taskId: string;
  type: "user_prompt";
  timestamp: string;
  message: string;     // Direct access (was: prompt.context)
}

interface AgentResponse {
  taskId: string;
  type: "agent_response";
  timestamp: string;
  args: unknown;       // Response data (was: response.context)
  error?: string;
  tokenUsage?: TokenUsage;
}
```

**Benefits**: No more nested `.context` properties - everything is top-level and type-safe.

#### Example Usage

```typescript
// First conversation turn
let conversationHistory: Interaction[] = [];

const result1 = await agent.run({
  userPrompt: "Read the file config.json",
  prevInteractionHistory: conversationHistory
});

// Update history for next turn
conversationHistory = result1.interactionHistory;

// Continue conversation
const result2 = await agent.run({
  userPrompt: "Now analyze the configuration",
  prevInteractionHistory: conversationHistory,
  context: { priority: "high" },
  completionOptions: { temperature: 0.3 }
});

// Final response from agent (if any)
if (result2.agentResponse) {
  console.log("Agent says:", result2.agentResponse.args);
}
```

#### Stateless Design

AgentLoop is **completely stateless** - it doesn't store any conversation history internally. You must:

1. **Pass the complete `prevInteractionHistory`** from previous runs
2. **Persist the returned `interactionHistory`** for the next turn
3. **Handle conversation state** in your application

This design makes AgentLoop scalable and easy to integrate with databases, session storage, or distributed systems.

### JavaScript Execution Security

AgentLoop uses **SES (Secure EcmaScript)** as the only execution mode for maximum security:

```typescript
const agent = new MyAgent(provider); // SES is always used - no configuration needed
```

#### SES (Secure EcmaScript) - Only Mode
- **🔒 Maximum Security**: All code runs in isolated compartments
- **🛡️ Memory Safe**: No access to global objects or sensitive APIs
- **📦 Zero Configuration**: SES included out of the box
- **🌐 Cross-Platform**: Works identically in Node.js and browsers
- **🚫 No Unsafe Alternatives**: Eliminates any possibility of insecure execution

**Why SES-Only?**
- **Security First**: No compromise on security - every execution is safe
- **Predictable**: Consistent security model across all environments
- **Zero-Risk**: Eliminates entire class of security vulnerabilities
- **Production Ready**: Battle-tested secure execution without complexity

## 🛠️ Core Concepts

### Tools with Dependencies
```typescript
this.defineTool(z => ({
  name: 'analyze_code',
  description: 'Analyze code quality',
  dependencies: ['read_file'],  // Depends on read_file tool
  argsSchema: z.object({
    filepath: z.string()
  }),
  handler: async ({ args, dependencies }) => {
    const fileContent = dependencies.read_file.result.content;
    // Analyze the content...
  }
}));
```

### JavaScript Tool Calling Format
AI writes JavaScript functions for structured tool execution:

```javascript
import { LiteralLoader, toolCalls } from './utils';
import { toolSchemas } from './toolSchemas';

function callTools() {
  toolCalls.push(
    toolSchemas.read_file.parse({
      filepath: "package.json"
    })
  );
  
  toolCalls.push(
    toolSchemas.final_tool.parse({
      value: LiteralLoader("analysis-result")
    })
  );
  
  return toolCalls;
}
```

### Lifecycle Hooks
```typescript
const agent = new MyAgent({
  hooks: {
    onToolCallStart: async (call) => {
      console.log(`Executing: ${call.toolName}`);
    },
    onError: async (error) => {
      logger.error('Agent error:', error);
    }
  }
});
```

## 🏗️ Architecture

### Process Flow

![AgentLoop Process Flow](./docs/flowchart.png)

The diagram above illustrates AgentLoop's iterative execution process: receiving user input, building prompts with context and tool schemas, generating and executing JavaScript code through AI providers, validating and executing tools, and feeding results back into the loop until task completion.

### Key Components

- **AgentLoop**: Main execution engine with stateless design
- **AIProvider**: Abstraction layer for multiple AI services  
- **FormatHandler**: Manages tool calling formats and execution
- **PromptManager**: Handles prompt templates and context
- **ToolSystem**: Type-safe tool definition and execution
- **ErrorHandler**: Error management and recovery

## 📋 Examples

### File Management Agent
```typescript
import { AgentLoop } from 'agentloop';
import { DefaultAIProvider } from 'agentloop/providers';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

class FileManagerAgent extends AgentLoop {
  protected systemPrompt = "You are a helpful file management assistant. Help users read, write, and organize files safely.";

  constructor(private basePath: string = process.cwd()) {
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4'
    }));

    this.setupTools();
  }

  private setupTools() {
    this.defineTool(z => ({
      name: 'read_file',
      description: 'Read the contents of a file',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file to read')
      }),
      handler: async ({ args }) => {
        try {
          const fullPath = path.resolve(this.basePath, args.filepath);
          const content = await fs.readFile(fullPath, 'utf8');
          const stats = await fs.stat(fullPath);
          return { 
            content, 
            filepath: args.filepath,
            size: stats.size,
            success: true 
          };
        } catch (error) {
          return { 
            error: error.message, 
            success: false 
          };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'write_file',
      description: 'Write content to a file',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file')
      }),
      handler: async ({ args }) => {
        try {
          const fullPath = path.resolve(this.basePath, args.filepath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, args.content);
          
          return { 
            filepath: args.filepath,
            bytesWritten: Buffer.byteLength(args.content, 'utf8'),
            success: true 
          };
        } catch (error) {
          return { 
            error: error.message, 
            success: false 
          };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'list_directory',
      description: 'List files and directories in a path',
      argsSchema: z.object({
        dirpath: z.string().optional().describe('Directory path (default: current directory)')
      }),
      handler: async ({ args }) => {
        try {
          const fullPath = path.resolve(this.basePath, args.dirpath || '.');
          const entries = await fs.readdir(fullPath, { withFileTypes: true });
          
          const items = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
          }));

          return { 
            path: args.dirpath || '.',
            items,
            count: items.length,
            success: true 
          };
        } catch (error) {
          return { 
            error: error.message, 
            success: false 
          };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'final_response',
      description: 'Provide the final response to the user',
      argsSchema: z.object({
        message: z.string().describe('Final message to the user')
      }),
      handler: async ({ args }) => ({ message: args.message, final: true })
    }));
  }
}

// Usage
const agent = new FileManagerAgent('/project/path');
const result = await agent.run({
  userPrompt: "List all files in the src directory, read package.json, and create a project-info.md file with a summary of the project structure and dependencies",
  prevInteractionHistory: []
});
```

### Development Scripts
```bash
# Build and run examples
npm run build:examples
node dist/console.js

# Run code editor demo
npm run demo:codeeditor

# Development with watch mode
npm run dev:watch
```

## ⚙️ Configuration

### Agent Options
```typescript
interface AgentLoopOptions {
  maxIterations?: number;                    // Max reasoning iterations (default: 100)
  parallelExecution?: boolean;              // Run tools in parallel (default: true)
  toolTimeoutMs?: number;                   // Tool execution timeout (default: 30s)
  jsExecutionMode?: 'eval' | 'ses' | 'websandbox'; // JS execution security mode (default: 'eval')
  stagnationTerminationThreshold?: number;  // Prevent infinite loops (default: 3)
  maxInteractionHistoryCharsLimit?: number; // Memory management (default: 100k)
  sleepBetweenIterationsMs?: number;        // Rate limiting (default: 2s)
  hooks?: AgentLifecycleHooks;              // Event handlers
}
```

### AI Provider Configuration
```typescript
// OpenAI
new DefaultAIProvider({
  service: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0.1
})

// Google Gemini
new DefaultAIProvider({
  service: 'google', 
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.0-flash'
})

// Anthropic Claude
new DefaultAIProvider({
  service: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022'
})
```

## 🔒 Security Modes

AgentLoop offers three execution modes with different security trade-offs:

### `eval` Mode (Default)
- ✅ Always available, no dependencies
- ✅ Fast execution, minimal overhead
- ⚠️ No sandboxing or security isolation
- 📦 Minimal bundle impact

```typescript
// Configure in AgentLoop options (default mode)
const agent = new MyAgent(aiProvider, {
  jsExecutionMode: 'eval' // Default mode
});
```

### `ses` Mode (Node.js Secure)
- 🔒 Secure compartment isolation with SES
- 🛡️ Prototype pollution protection
- 🚫 Import statement restrictions handled automatically
- 📦 Requires `ses` package

```typescript
npm install ses@1.14.0

// Configure in AgentLoop options
const agent = new MyAgent(aiProvider, {
  jsExecutionMode: 'ses'
});
```

### `websandbox` Mode (Browser Secure)
- 🌐 Browser-friendly lightweight sandboxing
- ⚡ Isolated execution environment
- 🔗 API communication between host and sandbox
- 📦 Requires `@jetbrains/websandbox` package

```typescript
npm install @jetbrains/websandbox@1.1.2

// Configure in AgentLoop options
const agent = new MyAgent(aiProvider, {
  jsExecutionMode: 'websandbox'
});
```

### Security Engine Dependencies

| Configuration | Dependencies |
|---------------|--------------|
| `eval` mode   | None (built-in) |
| `ses` mode    | `npm install ses@1.14.0` |
| `websandbox` mode | `npm install @jetbrains/websandbox@1.1.2` |

### Security Mode Validation

AgentLoop strictly validates execution modes with **no automatic fallbacks**:

```typescript
// ✅ Works - eval mode always available
handler.executionMode = 'eval';

// ❌ Throws error if SES not installed
handler.executionMode = 'ses';
// Error: "SES execution mode requested but SES is not installed"

// ❌ Throws error if WebSandbox not available  
handler.executionMode = 'websandbox';
// Error: "WebSandbox execution mode requested but WebSandbox is not installed"
```

## 🔧 Additional Features

### Custom AI Providers
```typescript
class CustomProvider implements AIProvider {
  async completion(prompt: string): Promise<AICompletionResponse> {
    // Implement your custom AI integration
  }
}
```

### Custom Tool Formats
```typescript
class CustomFormatHandler implements FormatHandler {
  async parseResponse(response: string, tools: Tool[]): Promise<PendingToolCall[]> {
    // Parse custom tool calling format
  }
}
```

### Custom Prompt Templates
```typescript
class CustomTemplate implements BasePromptTemplate {
  buildPrompt(params: BuildPromptParams): string {
    // Build custom prompt structure
  }
}
```

## 📊 Error Handling

AgentLoop provides error handling with automatic recovery:

```typescript
enum AgentErrorType {
  TOOL_NOT_FOUND = 'tool_not_found',
  INVALID_RESPONSE = 'invalid_response', 
  TOOL_EXECUTION_ERROR = 'tool_execution_error',
  STAGNATION_ERROR = 'stagnation_error',
  // ... 15 more error types
}
```

### Retry Configuration
```typescript
{
  toolExecutionRetryAttempts: 5,    // Retry tool failures
  connectionRetryAttempts: 3,       // Retry AI provider failures
  retryDelay: 1000,                 // Delay between retries
  failureHandlingMode: 'fail_fast'  // How to handle failures
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration  
npm run test:gemini

# Test coverage
npm run test:coverage
```

## 📚 Documentation

- [API Reference](./docs/api-reference.md) - Complete API documentation
- [Tool Development Guide](./docs/tool-development.md) - Creating custom tools
- [Provider Integration](./docs/provider-integration.md) - Adding AI providers
- [Examples Guide](./docs/examples.md) - Detailed example walkthroughs
- [Deployment Guide](./docs/deployment.md) - Production deployment patterns

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [AI-SDK](https://github.com/vercel/ai) for unified AI provider access
- Powered by [Zod](https://github.com/colinhacks/zod) for runtime type safety
- Secure execution via [SES](https://github.com/endojs/endo) (Secure ECMAScript)
- Inspired by the agent frameworks community

---

**AgentLoop** - Build AI Agents That Get Things Done
