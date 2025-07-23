import { AgentLoop } from '../../core/agents/AgentLoop';
import { FormatMode } from '../../core/types/types';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { AIConfig } from '../../core/types/types';
import { ToolHandlers } from './ToolHandlers';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ProviderConfig {
  service: string;
  apiKey: string;
  model: string;
}

/**
 * Simple File Manager Agent
 * 
 * A demonstration agent that provides basic file management capabilities:
 * - List directory contents
 * - Create files with content
 * - Read file contents
 * - Delete files
 * 
 * This agent showcases how to build a clean, focused agent using AgentLoop
 * with proper separation of concerns between agent logic and tool handlers.
 */
export class SimpleFileManagerAgent extends AgentLoop {
  protected systemPrompt = `You are FileBot - a friendly, helpful file management assistant! 👋

PERSONALITY:
- Warm and approachable, but efficient
- Use friendly greetings when appropriate
- Be encouraging and supportive
- Show enthusiasm for helping with file tasks

RESPONSE STYLE:
- Keep responses concise but friendly
- Use a conversational tone
- For unclear requests, ask politely what file operation they'd like help with
- Acknowledge greetings warmly before asking for clarification

CAPABILITIES:
- list_directory: Show directory contents
- create_file: Create/overwrite files with content  
- read_file: Read file contents
- delete_file: Remove files permanently

Always be helpful and respond to the user's communication style!`;

  private toolHandlers: ToolHandlers;

  constructor(providerConfig: ProviderConfig, basePath: string = process.cwd()) {
    // Configure AI provider
    const aiConfig: AIConfig = {
      service: providerConfig.service as any,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      temperature: 0.1,

    };

    const aiProvider = new DefaultAIProvider(aiConfig);
    
    super(aiProvider, {
      formatMode: FormatMode.YAML,
      parallelExecution: false
    });

    this.toolHandlers = new ToolHandlers(basePath);
    this.initializeTools();
  }



  private initializeTools() {
    // List Directory Tool
    this.defineTool((z) => ({
      name: 'list_directory',
      description: 'List the contents of a directory. Shows files and subdirectories with their types and sizes.',
      argsSchema: z.object({
        path: z.string().describe('The directory path to list. Use "." for current directory or provide relative/absolute path.')
      }),
      handler: this.toolHandlers.listDirectory.bind(this.toolHandlers)
    }));

    // Create File Tool
    this.defineTool((z) => ({
      name: 'create_file',
      description: 'Create a new file with the specified content. Will overwrite existing files.',
      argsSchema: z.object({
        path: z.string().describe('The file path where to create the file (relative or absolute)'),
        content: z.string().describe('The content to write to the file')
      }),
      handler: this.toolHandlers.createFile.bind(this.toolHandlers)
    }));

    // Read File Tool
    this.defineTool((z) => ({
      name: 'read_file',
      description: 'Read the contents of a file and return them as text.',
      argsSchema: z.object({
        path: z.string().describe('The file path to read (relative or absolute)')
      }),
      handler: this.toolHandlers.readFile.bind(this.toolHandlers)
    }));

    // Delete File Tool
    this.defineTool((z) => ({
      name: 'delete_file',
      description: 'Delete a file from the filesystem. Use with caution as this cannot be undone.',
      argsSchema: z.object({
        path: z.string().describe('The file path to delete (relative or absolute)')
      }),
      handler: this.toolHandlers.deleteFile.bind(this.toolHandlers)
    }));

    this.defineTool((z) => ({
      name: 'final',
      description: `Provide friendly final response when task is complete or cannot be completed.`,
      argsSchema: z.object({
        value: z.string().describe("Warm, friendly summary of results or helpful explanation if unable to complete.")
      }),
      handler: this.toolHandlers.handleFinal.bind(this.toolHandlers)
    }));


  }

}