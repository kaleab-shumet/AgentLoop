# Getting Started with AgentLoop

This guide will help you build your first AI agent with AgentLoop in just a few minutes.

## Prerequisites

- Node.js 18+ 
- TypeScript knowledge (recommended)
- An AI provider API key (OpenAI, Google, Anthropic, etc.)

## Installation

```bash
# Create a new project
mkdir my-agent && cd my-agent
npm init -y

# Install AgentLoop
npm install agentloop zod

# Install TypeScript (if not already installed)
npm install -D typescript @types/node ts-node

# Choose your AI provider
npm install @ai-sdk/openai  # or @ai-sdk/google, @ai-sdk/anthropic, etc.
```

## Your First Agent

Create a file called `my-agent.ts`:

```typescript
import { AgentLoop, Tool } from 'agentloop';
import { DefaultAIProvider } from 'agentloop/providers';
import { z } from 'zod';

class MyFirstAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful assistant that can perform calculations and manage a simple todo list.
  
Always use the available tools to help users with their requests.`;

  constructor() {
    // Configure your AI provider
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4'
    }), {
      formatMode: 'LITERAL_JS', // Use JavaScript-based tool calling
      maxIterations: 10
    });

    this.setupTools();
  }

  private setupTools() {
    // Calculator tool
    this.defineTool(z => ({
      name: 'calculate',
      description: 'Perform mathematical calculations',
      argsSchema: z.object({
        expression: z.string().describe('Mathematical expression to evaluate (e.g., "2 + 2", "Math.sqrt(16)")')
      }),
      handler: async ({ args }) => {
        try {
          // This handler runs in the secure host environment
          // AI-generated code execution is handled separately by SES
          const result = Function(`"use strict"; return (${args.expression})`)();
          return { 
            result, 
            expression: args.expression,
            success: true 
          };
        } catch (error) {
          return { 
            error: 'Invalid mathematical expression',
            expression: args.expression,
            success: false 
          };
        }
      }
    }));

    // Todo list tool
    const todos: string[] = [];

    this.defineTool(z => ({
      name: 'add_todo',
      description: 'Add an item to the todo list',
      argsSchema: z.object({
        item: z.string().describe('Todo item to add')
      }),
      handler: async ({ args }) => {
        todos.push(args.item);
        return { 
          message: `Added "${args.item}" to todo list`,
          totalItems: todos.length,
          success: true 
        };
      }
    }));

    this.defineTool(z => ({
      name: 'list_todos',
      description: 'Show all items in the todo list',
      argsSchema: z.object({}),
      handler: async () => {
        return { 
          todos: todos.slice(), // Return copy
          count: todos.length,
          success: true 
        };
      }
    }));

    // Final response tool
    this.defineTool(z => ({
      name: 'final_response',
      description: 'Provide the final response to the user',
      argsSchema: z.object({
        message: z.string().describe('Final message to the user')
      }),
      handler: async ({ args }) => {
        return { 
          message: args.message,
          final: true 
        };
      }
    }));
  }
}

export default MyFirstAgent;
```

## Running Your Agent

Create a simple script `run-agent.ts`:

```typescript
import MyFirstAgent from './my-agent';

async function main() {
  const agent = new MyFirstAgent();

  console.log('🤖 Agent is ready! Ask me to calculate something or manage your todos.\n');

  // Test calculation
  console.log('Testing calculation...');
  // Manage conversation history as array
  const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [];

  const calcResult = await agent.run({
    userPrompt: "What's 15 * 23 + 7?",
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
    { role: 'user', message: "What's 15 * 23 + 7?" },
    { role: 'agent', message: calcResult.agentResponse?.args }
  );
  console.log('Response:', calcResult.agentResponse?.args);

  console.log('\n---\n');

  // Test todo management
  console.log('Testing todo management...');
  const todoResult = await agent.run({
    userPrompt: "Add 'Buy groceries' and 'Walk the dog' to my todo list, then show me all items",
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
    { role: 'user', message: "Add 'Buy groceries' and 'Walk the dog' to my todo list, then show me all items" },
    { role: 'agent', message: todoResult.agentResponse?.args }
  );
  console.log('Response:', todoResult.agentResponse?.args);
}

main().catch(console.error);
```

## Environment Setup

Create a `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Install dotenv to load environment variables:

```bash
npm install dotenv
```

Update your script to load environment variables:

```typescript
// Add this at the top of run-agent.ts
import 'dotenv/config';
```

## Running the Agent

```bash
# Compile and run
npx ts-node run-agent.ts
```

You should see output like:

```
🤖 Agent is ready! Ask me to calculate something or manage your todos.

Testing calculation...
Response: The calculation 15 * 23 + 7 equals 352.

---

Testing todo management...
Response: I've added both items to your todo list. Here are all your current todos:
1. Buy groceries
2. Walk the dog

You now have 2 items in your todo list.
```

## Understanding the Code

### Agent Structure

1. **SystemPrompt**: Defines the agent's role and behavior
2. **AI Provider**: Configures which AI service to use
3. **Tools**: Define what actions the agent can perform
4. **Tool Handler**: Implements the actual tool functionality

### Tool Definition

```typescript
this.defineTool(z => ({
  name: 'tool_name',           // Unique identifier
  description: 'What it does', // Clear description for AI
  argsSchema: z.object({       // Input validation with Zod
    param: z.string().describe('Parameter description')
  }),
  handler: async ({ args }) => { // Implementation
    // Your logic here
    return { result: 'success' };
  }
}));
```

### Execution Flow

1. User provides input prompt
2. AI analyzes prompt and available tools
3. AI generates JavaScript code calling appropriate tools
4. AgentLoop executes the code safely
5. Tools return results
6. AI continues until task is complete

## Interactive Console

Create an interactive version `console.ts`:

```typescript
import * as readline from 'readline';
import MyFirstAgent from './my-agent';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const agent = new MyFirstAgent();
// Manage conversation history as array
const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [];

console.log('🤖 Interactive Agent Console');
console.log('Type your requests or "exit" to quit\n');

function askUser(): void {
  rl.question('You: ', async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
      return;
    }

    try {
      console.log('\n🤖 Processing...\n');
      
      const result = await agent.run({
        userPrompt: input,
        ...(conversationHistory.length > 0 && {
          context: {
            "Conversation History": conversationHistory
              .map(entry => `${entry.role}: ${entry.message}`)
              .join('\n')
          }
        })
      });

      if (result.agentResponse) {
        console.log('Agent:', result.agentResponse.args);
        // After getting response, update history
        conversationHistory.push(
          { role: 'user', message: input },
          { role: 'agent', message: result.agentResponse.args }
        );
      }

      console.log('\n---\n');
    } catch (error) {
      console.error('Error:', error);
    }

    askUser();
  });
}

askUser();
```

Run the interactive console:

```bash
npx ts-node console.ts
```

## JavaScript Execution Security

AgentLoop v2.0.0 provides maximum security through SES-only execution:

```typescript
class SecureAgent extends MyFirstAgent {
  constructor() {
    super(/* ... same ai provider config ... */);
    // Zero configuration needed - SES is always used
    // Maximum security is guaranteed for all executions
  }
}
```

**Security Benefits**: 
- **Zero Configuration**: No security settings needed - SES is the only mode
- **Maximum Security**: All AI-generated code runs in isolated SES compartments
- **Production Ready**: Same security in development and production
- **Built-in**: SES library included - no additional dependencies

## Conversation History Management

### Context-Based History (New in v2.0.0)

AgentLoop v2.0.0 introduces a new context-based approach for conversation history that gives you complete control:

```typescript
// Manage conversation history as array
const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [];

// First turn
const result1 = await agent.run({
  userPrompt: "Calculate 10 + 5",
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
  { role: 'user', message: "Calculate 10 + 5" },
  { role: 'agent', message: result1.agentResponse?.args }
);

// Continue conversation
const result2 = await agent.run({
  userPrompt: "Now multiply that by 2",
  ...(conversationHistory.length > 0 && {
    context: {
      "Conversation History": conversationHistory
        .map(entry => `${entry.role}: ${entry.message}`)
        .join('\n'),
      "User Preferences": "show steps" // Add any additional context
    }
  })
});

// After getting response, update history
conversationHistory.push(
  { role: 'user', message: "Now multiply that by 2" },
  { role: 'agent', message: result2.agentResponse?.args }
);
```

### Benefits of Context-Based History

✅ **Full Control**: Format history exactly how you want  
✅ **Flexible**: Include any additional context data  
✅ **Stateless**: AgentLoop doesn't store anything internally  
✅ **Scalable**: Easy to persist and manage conversation state  
✅ **Custom**: Support any format (plain text, JSON, structured, etc.)  

### Migration from `prevInteractionHistory`

**Before (v1.x):**
```typescript
const result = await agent.run({
  userPrompt: "Hello",
  prevInteractionHistory: interactions // Complex object array
});
```

**After (v2.0.0):**
```typescript
// Using array pattern (recommended)
const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [
  { role: 'user', message: 'Hi' },
  { role: 'agent', message: 'Hello there!' }
];

const result = await agent.run({
  userPrompt: "Hello",
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
  { role: 'user', message: "Hello" },
  { role: 'agent', message: result.agentResponse?.args }
);
```

## Advanced Features

### XML Literal Blocks (New in v2.0.0)

AgentLoop v2.0.0 includes XML parser integration for handling large content efficiently:

```typescript
// AI can reference large content using LiteralLoader
// Example AI response:
callTools([
  {
    name: "process_data",
    args: {
      data: LiteralLoader("data-123") // Reference to XML block below
    }
  }
]);

// XML literal block (parsed automatically)
/*
<literals>
  <literal id="data-123">
    Large content goes here...
    This content is extracted and injected
    automatically by the XML parser.
  </literal>
</literals>
*/
```

**Benefits**:
- **Performance**: Large content doesn't bloat the JavaScript execution
- **Clean Code**: Separates large data from logic
- **Cross-Platform**: Works in Node.js and browsers
- **Automatic**: Zero configuration - parsing happens transparently

## Next Steps

1. **Check out [Examples](./examples.md)** for real-world use cases
2. **Review [Security Modes](./security-modes.md)** to understand AgentLoop's SES-only security architecture
3. **Read [API Reference](./api-reference.md)** for complete configuration options
4. **Explore advanced patterns** with linearized data structures and XML literal blocks

## Common Issues

### API Key Errors
```
Error: Invalid API key
```
- Make sure your `.env` file is in the project root
- Verify your API key is correct and has proper permissions

### Tool Execution Errors
```
Error: Tool execution failed
```
- Check that your tool handler doesn't throw unhandled exceptions
- Add proper error handling in your tool implementations

### Import Errors
```
Error: Cannot find module 'agentloop'
```
- Make sure you installed AgentLoop: `npm install agentloop`
- Check that you're using the correct import paths

Ready to build more complex agents? Continue with the [Tool Development Guide](./tool-development.md)!