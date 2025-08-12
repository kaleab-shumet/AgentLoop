import { AgentLoop, FormatMode } from '../core';
import { DefaultAIProvider } from '../core/providers/DefaultAIProvider';
import z from 'zod';

// Example agent using the new JSObject format
class JSObjectExampleAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful assistant that uses JavaScript functions to call tools.
When you need to use tools, write a JavaScript function called 'callTools' that returns an array of tool call objects.
Each object should have a 'toolName' property and the required arguments for that tool.`;

  constructor() {
    // Initialize with JSObject format mode
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
      model: 'gpt-4'
    }), {
      formatMode: FormatMode.JSOBJECT,
      maxIterations: 3
    });

    // Define example tools
    this.defineTool(z => ({
      name: 'read_file',
      description: 'Read the contents of a file',
      argsSchema: z.object({
        filename: z.string().describe('Path to the file to read'),
        encoding: z.string().optional().describe('File encoding (default: utf8)')
      }),
      handler: async ({ args }) => {
        console.log(`Reading file: ${args.filename}`);
        return {
          toolName: 'read_file',
          success: true,
          content: `Contents of ${args.filename}`,
          filename: args.filename
        };
      }
    }));

    this.defineTool(z => ({
      name: 'write_file',
      description: 'Write content to a file',
      argsSchema: z.object({
        filename: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write'),
        mode: z.enum(['append', 'overwrite']).default('overwrite')
      }),
      handler: async ({ args }) => {
        console.log(`Writing to file: ${args.filename}`);
        return {
          toolName: 'write_file',
          success: true,
          filename: args.filename,
          bytesWritten: args.content.length
        };
      }
    }));
  }
}

// Example usage
async function runExample() {
  const agent = new JSObjectExampleAgent();
  
  console.log('=== JSObject Format Example ===');
  console.log('The agent will respond with JavaScript functions that call tools.\n');

  const result = await agent.run({
    userPrompt: 'Read the file "config.json" and then write a backup copy to "config.backup.json"',
    prevInteractionHistory: []
  });

  console.log('Final result:', result.agentResponse?.context);
}

// Example of what the AI should return when using JSObject format:
const exampleAIResponse = `
I'll help you read the config file and create a backup. Let me call the necessary tools:

\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  // First, read the original config file
  calledToolsList.push({
    toolName: "read_file",
    filename: "config.json",
    encoding: "utf8"
  });
  
  // Always pair with self_reasoning_tool tool
  calledToolsList.push({
    toolName: "self_reasoning_tool",
    goal: "Read config file and create backup",
    report: "Action: Reading config.json file. Expected: Get file contents for backup creation.",
    nextTasks: "1. Create backup copy with write_file tool 2. Use final tool to confirm both files exist"
  });
  
  return calledToolsList;
}
\`\`\`
`;

// Example of complete workflow with JSObject format
const fullWorkflowExample = `
## First Response (Data Gathering):
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "read_file",
    filename: "config.json",
    encoding: "utf8"
  });
  
  calledToolsList.push({
    toolName: "self_reasoning_tool",
    goal: "Read config file and create backup",
    report: "Action: Reading config.json file. Expected: Get file contents for backup.",
    nextTasks: "1. Write backup file with retrieved content 2. Use final tool to confirm completion"
  });
  
  return calledToolsList;
}
\`\`\`

## Second Response (Final Answer):
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "write_file", 
    filename: "config.backup.json",
    content: "{\\"database\\": {\\"host\\": \\"localhost\\"}}",
    mode: "overwrite"
  });
  
  calledToolsList.push({
    toolName: "final",
    value: "Successfully read config.json and created backup at config.backup.json. Both files are now available."
  });
  
  calledToolsList.push({
    toolName: "self_reasoning_tool",
    goal: "Read config file and create backup", 
    report: "Task complete. Both config.json read and backup created successfully.",
    nextTasks: "Task is complete."
  });
  
  return calledToolsList;
}
\`\`\`
`;

console.log('=== JSObject Format Examples ===');
console.log('Single iteration example:', exampleAIResponse);
console.log('\n=== Complete Workflow Example ===');
console.log(fullWorkflowExample);

export { JSObjectExampleAgent };