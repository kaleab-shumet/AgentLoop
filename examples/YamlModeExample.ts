import { AgentLoop } from '../core/agents/AgentLoop';
import { DefaultAIProvider } from '../core/providers/DefaultAIProvider';
import { FormatMode } from '../core/types/types';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple example demonstrating YAML_MODE usage
 */
class YamlModeExampleAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful assistant that demonstrates YAML mode execution.
You have access to tools for file operations and calculations.
Always use the YAML format as specified in the instructions.

When performing tasks:
- Use tools efficiently and in logical order
- Provide clear, helpful responses
- Use the YAML format for all tool calls
- Complete tasks thoroughly before using the final tool`;

  constructor() {
    const provider = new DefaultAIProvider({
      apiKey: process.env.GEMINI_API_KEY || 'your-api-key-here',
      service: 'google',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      max_tokens: 1000
    });

    super(provider, {
      formatMode: FormatMode.YAML_MODE,
      maxIterations: 5,
      parallelExecution: true
    });

    this.setupTools();
  }

  private setupTools() {
    // File reading tool
    this.defineTool((z) => ({
      name: 'read_file',
      description: 'Read the contents of a file',
      argsSchema: z.object({
        path: z.string().describe('The path to the file to read')
      }),
      handler: async (name: string, args: any) => {
        try {
          // Try to read actual file, fallback to demo content
          let content: string;
          if (fs.existsSync(args.path)) {
            content = fs.readFileSync(args.path, 'utf8');
          } else {
            content = `Demo content for ${args.path}:\nThis is a sample file.\nLine 2\nLine 3`;
          }
          
          return {
            toolName: name,
            success: true,
            output: { content, path: args.path }
          };
        } catch (error) {
          return {
            toolName: name,
            success: false,
            error: `Failed to read file: ${error}`
          };
        }
      }
    }));

    // Calculator tool
    this.defineTool((z) => ({
      name: 'calculate',
      description: 'Perform mathematical calculations',
      argsSchema: z.object({
        expression: z.string().describe('Mathematical expression to evaluate (basic operations: +, -, *, /, parentheses)')
      }),
      handler: async (name: string, args: any) => {
        try {
          // Simple math evaluation (safer than eval)
          const sanitized = args.expression.replace(/[^0-9+\-*/().\s]/g, '');
          const result = Function(`"use strict"; return (${sanitized})`)();
          
          return {
            toolName: name,
            success: true,
            output: { 
              expression: args.expression,
              result: result.toString() 
            }
          };
        } catch (error) {
          return {
            toolName: name,
            success: false,
            error: `Invalid expression: ${error}`
          };
        }
      }
    }));

    // List files tool
    this.defineTool((z) => ({
      name: 'list_files',
      description: 'List files in a directory',
      argsSchema: z.object({
        directory: z.string().describe('Directory path to list files from')
      }),
      handler: async (name: string, args: any) => {
        try {
          // Try to read actual directory, fallback to demo content
          let files: string[];
          if (fs.existsSync(args.directory)) {
            files = fs.readdirSync(args.directory);
          } else {
            files = ['demo-file1.txt', 'demo-file2.js', 'demo-data.json', 'README.md'];
          }
          
          return {
            toolName: name,
            success: true,
            output: { files, directory: args.directory, count: files.length }
          };
        } catch (error) {
          return {
            toolName: name,
            success: false,
            error: `Failed to list directory: ${error}`
          };
        }
      }
    }));

    // Write file tool
    this.defineTool((z) => ({
      name: 'write_file',
      description: 'Write content to a file',
      argsSchema: z.object({
        path: z.string().describe('The path to the file to write'),
        content: z.string().describe('The content to write to the file')
      }),
      handler: async (name: string, args: any) => {
        try {
          // Create temp directory if it doesn't exist
          const dir = path.dirname(args.path);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          fs.writeFileSync(args.path, args.content);
          
          return {
            toolName: name,
            success: true,
            output: { 
              path: args.path, 
              bytesWritten: args.content.length,
              message: 'File written successfully' 
            }
          };
        } catch (error) {
          return {
            toolName: name,
            success: false,
            error: `Failed to write file: ${error}`
          };
        }
      }
    }));
  }
}

// Example usage
async function runYamlExample() {
  console.log('=== YAML Mode Example ===\\n');

  // Check if API key is available
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️  Set GEMINI_API_KEY environment variable to run with real LLM');
    console.log('   For demo purposes, showing tool structure only\\n');
  }

  const agent = new YamlModeExampleAgent();

  console.log('Current format mode:', agent.formatMode);
  console.log('Available tools:', agent.getAvailableTools());
  console.log('\\nThis example demonstrates how AgentLoop works with YAML_MODE:');
  console.log('- LLM responses are expected in YAML format');
  console.log('- Tool calls are parsed from YAML blocks');
  console.log('- Multiple tools can be called in sequence or parallel\\n');

  // Test various user prompts to demonstrate YAML mode
  const testPrompts = [
    'Calculate 15 * 8 + 3',
    'List files in the current directory',
    'Read the package.json file and calculate 100 / 4',
    'Create a temp file with some content and then read it back',
    'Help me understand what files are in the examples directory and calculate the sum of 45 + 67'
  ];

  // Only run actual tests if API key is available
  if (process.env.GEMINI_API_KEY) {
    for (let i = 0; i < testPrompts.length; i++) {
      const prompt = testPrompts[i];
      console.log(`\\n--- Test ${i + 1}: "${prompt}" ---`);
      
      try {
        const result = await agent.run({
          userPrompt: prompt,
          conversationHistory: [],
          toolCallHistory: []
        });

        console.log('Final Answer:', result.finalAnswer?.output?.value || 'No final answer');
        console.log('Tool calls made:', result.toolCallHistory.length);
        
        // Show successful tool calls
        const successfulCalls = result.toolCallHistory.filter(call => call.success);
        if (successfulCalls.length > 0) {
          console.log('Successful operations:');
          successfulCalls.forEach(call => {
            console.log(`  - ${call.toolName}: ${JSON.stringify(call.output).substring(0, 100)}...`);
          });
        }

      } catch (error) {
        console.error('Error running agent:', error);
      }
    }
  } else {
    console.log('\\n--- Demo Mode (No API Key) ---');
    console.log('Example YAML responses that the LLM would generate:');
    console.log('\\n1. Single tool call:');
    console.log('```yaml');
    console.log('name: calculate');
    console.log('expression: "15 * 8 + 3"');
    console.log('```');
    console.log('\\n2. Multiple tool calls:');
    console.log('```yaml');
    console.log('tools:');
    console.log('  - name: list_files');
    console.log('    directory: "./examples"');
    console.log('  - name: calculate');
    console.log('    expression: "45 + 67"');
    console.log('```');
    console.log('\\n3. Final answer:');
    console.log('```yaml');
    console.log('name: final');
    console.log('value: "Task completed successfully. Results: calculation = 123, files listed = 4"');
    console.log('```');
  }

  console.log('\\n=== YAML Mode Example Complete ===');
}

// Real example demonstrating YAML mode with actual LLM calls

if (require.main === module) {
  runYamlExample().catch(console.error);
}

export { YamlModeExampleAgent };