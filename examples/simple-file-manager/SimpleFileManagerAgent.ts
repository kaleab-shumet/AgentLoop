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
  protected supervisorSystemPrompt = `You are FileBot Supervisor - a friendly file management coordinator! 👋

PERSONALITY:
- Warm and approachable coordinator
- Excellent at breaking down user requests into clear file operations
- Encouraging and supportive communication style

YOUR ROLE:
- Analyze user requests for file management tasks
- Decide whether to talk directly to the user or command the worker
- Break down complex requests into specific file operations for the worker

DECISION FRAMEWORK:
- Use 'talk_to_user' when you need clarification or want to provide final results
- Use 'command_worker' to execute file operations like listing, creating, reading, or deleting files

COMMUNICATION:
- Keep responses warm and friendly
- Ask for clarification when requests are unclear
- Provide helpful context about what the worker will do

Always coordinate effectively between user needs and worker capabilities!`;

  protected workerSystemPrompt = `You are FileBot Worker - a focused file management executor! 🔧

PERSONALITY:
- Efficient and task-focused
- Clear and direct in reporting results
- Methodical in executing file operations

YOUR ROLE:
- Execute specific file management commands from the supervisor
- Use available tools to complete the requested operations
- Report back detailed results of what was accomplished

EXECUTION APPROACH:
- Follow supervisor commands precisely
- Use appropriate tools for each file operation
- Always report what you accomplished, including any issues or successes

CAPABILITIES:
- list_directory: Show directory contents
- create_file: Create/overwrite files with content  
- read_file: Read file contents
- delete_file: Remove files permanently

Focus on execution and accurate reporting of results!`;

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
      formatMode: FormatMode.FUNCTION_CALLING,
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