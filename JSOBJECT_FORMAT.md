# JSObject Format Handler

The JSObject format handler is a new response format for AgentLoop that allows AI models to call tools by writing JavaScript functions. This format is particularly useful for models that are good at generating JavaScript code.

## How It Works

When using `FormatMode.JSOBJECT`, the AI is instructed to write a JavaScript function called `callTools()` that returns an array of tool call objects. Each object must have a `toolName` property and the required arguments for that tool.

## Usage

```typescript
import { AgentLoop, FormatMode } from 'agentloop';

const agent = new MyAgent(provider, {
  formatMode: FormatMode.JSOBJECT
});
```

## Expected AI Response Format

The AI should respond with a JavaScript function wrapped in code blocks:

```javascript
function callTools() {
  const calledToolsList = [];
  
  // Add tool calls to the list
  calledToolsList.push({
    toolName: "example_tool",
    arg1: "value1",
    arg2: 42
  });
  
  // Can add multiple tool calls
  calledToolsList.push({
    toolName: "another_tool",
    message: "Hello world"
  });
  
  return calledToolsList;
}
```

## Key Features

1. **Pure JavaScript**: No external libraries or imports allowed
2. **Generic**: Works with any provided tool schema
3. **Flexible**: Supports complex logic within the function
4. **Safe Execution**: Runs in a controlled environment
5. **Validation**: Validates arguments against tool schemas

## Example

```typescript
class FileManagerAgent extends AgentLoop {
  protected systemPrompt = `You are a file management assistant.
When you need to use tools, write a JavaScript function called 'callTools' 
that returns an array of tool call objects.`;

  constructor() {
    super(provider, { formatMode: FormatMode.JSOBJECT });
    
    this.defineTool(z => ({
      name: 'read_file',
      description: 'Read a file',
      argsSchema: z.object({
        filename: z.string(),
        encoding: z.string().optional()
      }),
      handler: async ({ args }) => ({ 
        toolName: 'read_file', 
        success: true, 
        content: 'file content' 
      })
    }));
  }
}
```

## AI Response Example

When asked to read a file, the AI would respond:

```javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "read_file",
    filename: "example.txt",
    encoding: "utf8"
  });
  
  return calledToolsList;
}
```

## Benefits

- **Natural for Code-Generation Models**: Many LLMs excel at generating JavaScript
- **Human Readable**: Easy to understand and debug
- **Flexible Logic**: Can include conditional logic, loops, and calculations
- **Type Safe**: Full TypeScript support with schema validation

## Comparison with Other Formats

| Format | Pros | Cons |
|--------|------|------|
| Function Calling | Native AI support, fast | Limited by AI's function calling abilities |
| TOML | Human readable, structured | Less familiar to most AIs |
| JSObject | Natural for code models, flexible | Requires JavaScript execution |

## Security

The JSObject format handler executes JavaScript in a controlled environment with limited scope:
- No access to Node.js APIs
- No access to file system
- No access to network
- Limited to basic JavaScript constructs (Array, Object, Math, etc.)

This makes it safe for executing AI-generated code while maintaining functionality.