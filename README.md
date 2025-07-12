# AgentLoop Framework

A powerful, flexible framework for building AI agents with tool-calling capabilities and customizable prompt management.

## 📁 Project Structure

```
src/
├── core/                           # Core AgentLoop framework
│   ├── agents/                     # Base agent classes
│   │   ├── AgentLoop.ts           # Main AgentLoop abstract class
│   │   ├── TurnState.ts           # Turn state management
│   │   └── index.ts               # Agent exports
│   ├── providers/                  # AI provider implementations
│   │   ├── AIProvider.ts          # Base AI provider interface
│   │   ├── GeminiAIProvider.ts    # Gemini AI implementation
│   │   └── index.ts               # Provider exports
│   ├── handlers/                   # Response handlers
│   │   ├── LLMDataHandler.ts      # Main data handler
│   │   ├── FunctionCallingResponseHandler.ts  # Function calling format
│   │   ├── XmlResponseHandler.ts   # XML format
│   │   ├── ResponseHandlerFactory.ts  # Handler factory
│   │   └── index.ts               # Handler exports
│   ├── prompt/                     # Prompt management
│   │   ├── PromptManager.ts       # Customizable prompt system
│   │   └── index.ts               # Prompt exports
│   ├── types/                      # Type definitions
│   │   ├── types.ts               # All framework types
│   │   └── index.ts               # Type exports
│   ├── utils/                      # Utilities and helpers
│   │   ├── AgentError.ts          # Error handling
│   │   ├── Logger.ts              # Logging interface
│   │   ├── JsonToXsd.ts           # JSON to XSD conversion
│   │   └── index.ts               # Utility exports
│   └── index.ts                    # Core framework exports
├── agents/                         # Concrete agent implementations
│   ├── CommandLineAgent.ts        # Command line agent example
│   ├── NewsWeatherAgent.ts        # News and weather agent example
│   └── index.ts                   # Agent exports
├── examples/                       # Example implementations
│   ├── CustomPromptExample.ts     # Custom prompt demonstration
│   ├── BackwardCompatibilityDemo.ts  # Backward compatibility example
│   └── MultiModeExample.ts        # Multi-mode execution example
├── tests/                          # Test files
│   ├── TestPromptManager.ts       # PromptManager tests
│   └── JsonToXsd.test.ts          # JSON to XSD conversion tests
├── docs/                           # Documentation
│   ├── PROMPT_CUSTOMIZATION.md    # Detailed prompt customization guide
│   └── TOOL_CALLING_README.md     # Tool calling documentation
└── index.ts                       # Main library export
```

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Basic Usage

```typescript
import { AgentLoop, GeminiAIProvider } from 'agentloop';

class MyAgent extends AgentLoop {
  protected systemPrompt = "You are a helpful assistant.";
  
  constructor() {
    const provider = new GeminiAIProvider({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.0-flash'
    });
    
    super(provider);
    
    // Define your tools
    this.defineTool((z) => ({
      name: 'calculator',
      description: 'Perform mathematical calculations',
      responseSchema: z.object({
        expression: z.string().describe('Mathematical expression to evaluate')
      }),
      handler: async (name: string, args: any) => {
        const result = eval(args.expression); // In production, use a safe math parser
        return {
          toolname: name,
          success: true,
          output: `${args.expression} = ${result}`
        };
      }
    }));
  }
}

// Use the agent
const agent = new MyAgent();
const result = await agent.run({
  userPrompt: "What is 25 * 4?",
  conversationHistory: [],
  toolCallHistory: []
});
```

### Custom Prompts

```typescript
import { PromptManager, PromptTemplateBuilder } from 'agentloop';

class CustomBuilder implements PromptTemplateBuilder {
  buildSystemPrompt(): string {
    return "🤖 Custom AI Assistant\n\nI provide excellent help with a friendly tone.";
  }
  
  // Implement other required methods...
}

const customPromptManager = new PromptManager(
  "You are a helpful assistant.",
  new CustomBuilder(),
  {
    includeContext: true,
    maxHistoryEntries: 5,
    customSections: {
      "BRAND_GUIDELINES": "Always maintain a professional yet friendly tone"
    }
  }
);

const agent = new MyAgent();
agent.setPromptManager(customPromptManager);
```

## 🏗️ Architecture

### Core Components

- **AgentLoop**: Abstract base class for all agents
- **AIProvider**: Interface for different AI providers (Gemini, OpenAI, etc.)
- **PromptManager**: Customizable prompt construction and formatting
- **ResponseHandlers**: Parse and validate tool calls from different formats
- **TurnState**: Manage state within a single agent turn

### Key Features

- 🔧 **Flexible Tool System**: Easy tool definition with Zod schemas
- 🎨 **Custom Prompts**: Complete control over prompt formatting and structure
- 🔄 **Multiple Execution Modes**: XML and Function Calling formats
- ⚡ **Parallel/Sequential Execution**: Choose your execution strategy
- 🛡️ **Type Safety**: Full TypeScript support with comprehensive types
- 🔗 **Extensible**: Easy to add new providers, handlers, and customizations

## 📖 Documentation

- [Prompt Customization Guide](src/docs/PROMPT_CUSTOMIZATION.md) - Detailed guide on customizing prompts
- [Tool Calling Documentation](src/docs/TOOL_CALLING_README.md) - Tool calling system documentation

## 🧪 Testing

```bash
# Run tests
npm test

# Test specific functionality
npx ts-node src/tests/TestPromptManager.ts
```

## 🔨 Building

```bash
# Build the project
npm run build

# Clean build files
npm run clean

# Development mode
npm run dev
```

## 📦 Package Scripts

- `npm start` - Run the main entry point
- `npm run build` - Build TypeScript to JavaScript
- `npm run dev` - Run in development mode
- `npm test` - Run test suite
- `npm run clean` - Clean build directory
- `npm run prepublish` - Clean and build for publishing

## 🤝 Contributing

1. Follow the established folder structure
2. Add appropriate types for new features
3. Update documentation for significant changes
4. Test your changes thoroughly

## 📄 License

ISC

## 🎯 Examples

Check the `src/examples/` folder for comprehensive examples:

- **CustomPromptExample.ts** - Demonstrates advanced prompt customization
- **BackwardCompatibilityDemo.ts** - Shows backward compatibility features
- **MultiModeExample.ts** - Illustrates multi-mode execution

## 🔗 Related

- [Gemini AI](https://ai.google.dev/) - AI provider used in examples
- [Zod](https://zod.dev/) - Schema validation library
- [TypeScript](https://www.typescriptlang.org/) - Type safety and development experience