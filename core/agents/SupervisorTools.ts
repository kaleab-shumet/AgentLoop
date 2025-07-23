import { Tool, HandlerParams, ToolCallContext } from '../types/types';
import { ZodTypeAny } from 'zod';
import z from 'zod';

/**
 * Creates supervisor tools for coordinating between user and worker agent
 */
export function createSupervisorTools(): Tool<ZodTypeAny>[] {
  
  const talkToUserTool: Tool<ZodTypeAny> = {
    name: 'talk_to_user',
    description: 'Communicate directly with the user. Use this to ask for clarification, provide updates, or present final results. This tool handles all user communication including final responses.',
    argsSchema: z.object({
      message: z.string().describe('The message to send to the user')
    }),
    handler: async ({ name, args }: HandlerParams<ZodTypeAny>): Promise<ToolCallContext> => {
      return {
        toolName: name,
        success: true,
        message: args.message,
        userMessage: args.message // This will be displayed to the user
      };
    }
  };

  const commandWorkerTool: Tool<ZodTypeAny> = {
    name: 'command_worker',
    description: 'Send a command to the worker agent for execution. The worker agent will execute the command and report back with results.',
    argsSchema: z.object({
      command: z.string().describe('The specific command or instruction for the worker agent'),
      context: z.string().optional().describe('Additional context or expected outcome for the worker agent')
    }),
    handler: async ({ name, args }: HandlerParams<ZodTypeAny>): Promise<ToolCallContext> => {
      return {
        toolName: name,
        success: true,
        command: args.command,
        context: args.context,
        message: `Command sent to worker agent: "${args.command}"`
      };
    }
  };

  const supervisorReportTool: Tool<ZodTypeAny> = {
    name: 'supervisor_report',
    description: 'Create a progress report tracking the overall task completion status. Use this to document what has been accomplished and what remains to be done.',
    argsSchema: z.object({
      report: z.string().describe('Comprehensive progress report including user request, completed actions, current status, and next steps')
    }),
    handler: async ({ name, args }: HandlerParams<ZodTypeAny>): Promise<ToolCallContext> => {
      return {
        toolName: name,
        success: true,
        report: args.report,
      };
    }
  };

  return [talkToUserTool, commandWorkerTool, supervisorReportTool];
}