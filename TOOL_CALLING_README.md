# AgentLoop Multi-Mode Tool Calling

This document explains the enhanced AgentLoop library that now supports both XML-based tool calling and OpenAI-style function calling.

## Overview

The AgentLoop library has been refactored to support multiple execution modes:
- **XML Mode**: Original XML-based tool calling (default, backward compatible)
- **Function Calling Mode**: OpenAI-style JSON function calling

## Key Features

### 🔄 **Interchangeable Execution Modes**
- Switch between XML and Function Calling modes at runtime
- Maintain backward compatibility with existing code
- Same tool definitions work across both modes

### 🏗️ **Modular Architecture**
- `ResponseHandler` interface for extensible response parsing
- `ResponseHandlerFactory` for managing different handlers
- Clean separation between tool logic and response formatting

### 🛠️ **Enhanced Tool System**
- Optional timeout and dependencies configuration
- Improved error handling and validation
- Consistent tool interface across execution modes

## Usage

### Basic Usage

```typescript
import { AgentLoop, ExecutionMode } from './AgentLoop';

// Create agent with XML mode (default)
const xmlAgent = new MyAgent(provider);

// Create agent with Function Calling mode
const functionAgent = new MyAgent(provider, { 
  executionMode: ExecutionMode.FUNCTION_CALLING 
});

// Switch modes at runtime
xmlAgent.setExecutionMode(ExecutionMode.FUNCTION_CALLING);
```

### Execution Modes

#### XML Mode (Default)
```typescript
// LLM Response Format:
```xml
<root>
  <get_weather><name>get_weather</name><city>Paris</city></get_weather>
  <web_search><name>web_search</name><query>AI news</query></web_search>
</root>
```

#### Function Calling Mode
```typescript
// LLM Response Format:
```json
{
  "function_calls": [
    {
      "name": "get_weather",
      "arguments": "{\"city\": \"Paris\"}"
    },
    {
      "name": "web_search", 
      "arguments": "{\"query\": \"AI news\"}"
    }
  ]
}
```

### Creating Custom Agents

```typescript
import { AgentLoop, ExecutionMode } from './AgentLoop';

class WeatherAgent extends AgentLoop {
  protected systemPrompt = `You are a weather assistant...`;

  constructor(provider: AIProvider, mode: ExecutionMode = ExecutionMode.XML) {
    super(provider, { executionMode: mode });
    this.setupTools();
  }

  private setupTools() {
    this.defineTool((z) => ({
      name: 'get_weather',
      description: 'Get weather for a city',
      responseSchema: z.object({
        city: z.string().describe('City name'),
        units: z.enum(['celsius', 'fahrenheit']).optional()
      }),
      timeout: 5000, // Optional: custom timeout
      dependencies: [], // Optional: tool dependencies
      handler: async (name, args) => {
        // Your tool logic here
        return {
          toolname: name,
          success: true,
          output: { weather: 'sunny', temp: 22 }
        };
      }
    }));
  }
}
```

### Dynamic Mode Switching

```typescript
const agent = new WeatherAgent(provider, ExecutionMode.XML);

// Check current mode
console.log('Current mode:', agent.getExecutionMode());

// Switch to function calling
agent.setExecutionMode(ExecutionMode.FUNCTION_CALLING);

// Run with new mode
const result = await agent.run({
  userPrompt: "What's the weather?",
  conversationHistory: [],
  toolCallHistory: []
});
```

## Architecture

### Core Components

1. **ExecutionMode Enum**: Defines available execution modes
2. **ResponseHandler Interface**: Handles response parsing and formatting
3. **XmlResponseHandler**: Handles XML-based responses
4. **FunctionCallingResponseHandler**: Handles OpenAI-style function calls
5. **ResponseHandlerFactory**: Creates appropriate handlers
6. **Enhanced LLMDataHandler**: Manages different response formats

### Class Hierarchy

```
AgentLoop (Abstract)
├── Enhanced with execution mode support
├── Uses LLMDataHandler for response parsing
└── Maintains backward compatibility

LLMDataHandler
├── Uses ResponseHandlerFactory
├── Delegates to appropriate ResponseHandler
└── Provides unified interface

ResponseHandler (Interface)
├── XmlResponseHandler
├── FunctionCallingResponseHandler
└── Extensible for custom formats
```

## Migration Guide

### Existing Code (No Changes Required)

```typescript
// This still works exactly the same
const agent = new NewsWeatherAgent(config);
const result = await agent.run(input);
```

### Enabling Function Calling

```typescript
// Option 1: Set mode during construction
const agent = new NewsWeatherAgent(config, { 
  executionMode: ExecutionMode.FUNCTION_CALLING 
});

// Option 2: Switch mode at runtime
const agent = new NewsWeatherAgent(config);
agent.setExecutionMode(ExecutionMode.FUNCTION_CALLING);
```

## Advanced Features

### Custom Response Handlers

```typescript
import { ResponseHandler, ExecutionMode } from './AgentLoop';

class CustomResponseHandler implements ResponseHandler {
  parseResponse(response: string, tools: Tool[]): PendingToolCall[] {
    // Custom parsing logic
  }
  
  formatToolDefinitions(tools: Tool[]): string {
    // Custom tool formatting
  }
  
  getFormatInstructions(tools: Tool[], finalToolName: string, parallel: boolean): string {
    // Custom format instructions
  }
}

// Register custom handler
ResponseHandlerFactory.registerHandler(ExecutionMode.CUSTOM, new CustomResponseHandler());
```

### Tool Configuration

```typescript
this.defineTool((z) => ({
  name: 'advanced_tool',
  description: 'An advanced tool with custom configuration',
  responseSchema: z.object({
    param: z.string()
  }),
  timeout: 10000, // 10 second timeout
  dependencies: ['prerequisite_tool'], // Must run after prerequisite_tool
  handler: async (name, args, turnState) => {
    // Tool implementation
  }
}));
```

## Error Handling

Both execution modes provide consistent error handling:

```typescript
try {
  const result = await agent.run(input);
} catch (error) {
  if (error instanceof AgentError) {
    console.log('Agent Error:', error.type, error.message);
  }
}
```

## Best Practices

1. **Use XML mode for backward compatibility** with existing implementations
2. **Use Function Calling mode for OpenAI-compatible applications**
3. **Switch modes based on your LLM provider's capabilities**
4. **Test both modes** to ensure your tools work correctly
5. **Use the factory pattern** for custom response handlers

## Examples

See the `examples/` directory for complete working examples:
- `MultiModeExample.ts`: Demonstrates both execution modes
- `BackwardCompatibilityDemo.ts`: Shows migration from XML to function calling

## Troubleshooting

### Common Issues

1. **Tool not found**: Ensure tool names match exactly between definition and calls
2. **Schema validation errors**: Check that your tool schemas match the expected format
3. **Mode switching**: Remember to call `setExecutionMode()` before running the agent

### Debugging

Enable debug logging to see prompt generation and response parsing:

```typescript
const agent = new MyAgent(provider, { 
  logger: console, // Enable logging
  executionMode: ExecutionMode.FUNCTION_CALLING 
});
```

## Conclusion

The enhanced AgentLoop library provides a robust, extensible framework for tool calling that supports both traditional XML and modern function calling approaches. The modular design ensures easy maintenance and extension while maintaining full backward compatibility.