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
- create_files: Create multiple files with content (prevents overwriting)
- read_files: Read multiple file contents
- edit_files: Edit files using line-based operations (replace/insert lines)
- delete_files: Remove one or more files permanently (supports batch deletion)

Always be helpful and respond to the user's communication style!`;

  private toolHandlers: ToolHandlers;

  constructor(providerConfig: ProviderConfig & { baseURL?: string }, basePath: string = process.cwd()) {
    // Configure AI provider
    const aiConfig: AIConfig = {
      service: providerConfig.service as any,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      temperature: 0,
      baseURL: providerConfig.baseURL,

    };

    const aiProvider = new DefaultAIProvider(aiConfig);
    
    super(aiProvider, {
      formatMode: FormatMode.YAML,
      parallelExecution: true,
      batchMode: true,
      sleepBetweenIterationsMs: 3000,
      connectionRetryAttempts: 10,
      
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

    // Create Files Tool
    this.defineTool((z) => ({
      name: 'create_files',
      description: 'Create one or more files with specified content. Prevents overwriting existing files.',
      argsSchema: z.object({
        files: z.array(z.object({
          path: z.string().describe('The file path where to create the file (relative or absolute)'),
          content: z.string().describe('The content to write to the file')
        })).describe('Array of files to create. Each file needs a path and content.')
      }),
      handler: this.toolHandlers.createFiles.bind(this.toolHandlers)
    }));

    // Read Files Tool
    this.defineTool((z) => ({
      name: 'read_files',
      description: 'Read the contents of one or more files and return them as text.',
      argsSchema: z.object({
        paths: z.array(z.string()).describe('Array of file paths to read (relative or absolute). Can be a single file or multiple files.')
      }),
      handler: this.toolHandlers.readFiles.bind(this.toolHandlers)
    }));

    // Edit Files Tool
    this.defineTool((z) => ({
      name: 'edit_files',
      description: 'Edit a file by replacing its entire content with new content.',
      argsSchema: z.object({
        path: z.string().describe('The file path to edit (relative or absolute)'),
        content: z.string().describe('The new complete content to write to the file')
      }),
      handler: this.toolHandlers.editFiles.bind(this.toolHandlers)
    }));

    // Delete Files Tool (supports multiple files)
    this.defineTool((z) => ({
      name: 'delete_files',
      description: 'Delete one or more files from the filesystem. Use with caution as this cannot be undone. Note: Never use this tool without user confirmation, always you must ask if the user really wants to continue the operation',
      argsSchema: z.object({
        paths: z.array(z.string()).describe('Array of file paths to delete (relative or absolute). Can be a single file or multiple files.'),
        askedForConfirmation: z.boolean().default(false).describe("Only set this to true after explicitly asking the user to confirm the deletion. Do not set it to true without confirming deletion for ALL specified paths.")
      }),
      handler: this.toolHandlers.deleteFiles.bind(this.toolHandlers)
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