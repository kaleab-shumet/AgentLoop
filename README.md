# AgentLoop

> **A Production-Ready Framework for Building Tool-Using AI Agents**

AgentLoop is a sophisticated TypeScript framework that enables developers to build reliable, scalable AI agents capable of executing complex tool chains. With support for 10+ AI providers, innovative JavaScript-based tool calling, and enterprise-grade error handling, AgentLoop abstracts away the complexity of multi-step AI workflows while maintaining full type safety and extensibility.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

## 🚀 Key Features

### Multi-Provider AI Support
- **10+ AI Providers**: OpenAI, Google (Gemini), Anthropic (Claude), Mistral, Cohere, Groq, Fireworks, DeepSeek, Perplexity, Azure
- **Unified Interface**: Switch between providers without code changes
- **Provider-Specific Optimizations**: Automatic handling of rate limits, context windows, and capabilities

### Innovative Tool Calling
- **JavaScript-Based Tools**: AI writes JavaScript functions for tool execution
- **Type-Safe Validation**: Zod schemas ensure runtime type safety
- **Advanced Features**: Literal blocks for large content, dependency management, parallel/sequential execution

### Enterprise-Grade Reliability
- **Stateless Architecture**: Horizontally scalable, no internal state storage
- **Comprehensive Error Handling**: 19 error types with automatic retry logic
- **Stagnation Detection**: Prevents infinite loops and repetitive behavior
- **Lifecycle Hooks**: Monitor and customize every aspect of agent execution

### Developer Experience
- **Full TypeScript Support**: Complete type safety from tools to responses
- **Extensible Architecture**: Custom providers, templates, and tool formats
- **Rich Configuration**: Fine-tune behavior for any use case
- **Production Ready**: Battle-tested with comprehensive error handling

## 📦 Installation

```bash
npm install agentloop
```

## 🎯 Quick Start

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
      formatMode: FormatMode.JSOBJECT,
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

console.log(result.agentResponse?.context);
```

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

AgentLoop follows a modular, plugin-based architecture:

```
AgentLoop Framework
├── Core Engine (AgentLoop)
├── AI Providers (OpenAI, Gemini, Claude, etc.)
├── Format Handlers (JavaScript, Function Calling)
├── Prompt Management (Templates, Context)
├── Tool System (Validation, Dependencies)
├── Error Handling (Retry, Recovery)
└── Examples (File Manager, Code Editor)
```

### Key Components

- **AgentLoop**: Main execution engine with stateless design
- **AIProvider**: Abstraction layer for multiple AI services  
- **FormatHandler**: Manages tool calling formats and execution
- **PromptManager**: Handles prompt templates and context
- **ToolSystem**: Type-safe tool definition and execution
- **ErrorHandler**: Comprehensive error management and recovery

## 📋 Examples

### File Management Agent
```typescript
import { FileManagerAgent } from 'agentloop/examples';

const agent = new FileManagerAgent('/project/path');
const result = await agent.run({
  userPrompt: "Create a new React component called Button",
  prevInteractionHistory: []
});
```

### Code Editor Agent  
```typescript
import { CodeEditorAgent } from 'agentloop/examples';

const agent = new CodeEditorAgent();
const result = await agent.run({
  userPrompt: "Initialize a Node.js project and install dependencies",
  prevInteractionHistory: []
});
```

### Interactive Console
```bash
# Run file manager
npm run file-manager

# Run code editor
npm run code-editor

# Run custom demo
npm run demo
```

## ⚙️ Configuration

### Agent Options
```typescript
interface AgentLoopOptions {
  maxIterations?: number;                    // Max reasoning iterations (default: 100)
  parallelExecution?: boolean;              // Run tools in parallel (default: true)
  toolTimeoutMs?: number;                   // Tool execution timeout (default: 30s)
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

## 🔧 Advanced Features

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

AgentLoop provides comprehensive error handling with automatic recovery:

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

**AgentLoop** - Build Reliable AI Agents That Get Things Done
