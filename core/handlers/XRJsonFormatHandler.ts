import { ZodTypeAny } from "zod";
import { FormatHandler, PendingToolCall, Tool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { parseXrjson, XrjsonError } from 'xrjson';
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Handler for XRJSON format - JSON with external XML literal references
 * Designed to solve JSON generation errors in LLMs by separating complex content from JSON structure
 */
export class XRJsonFormatHandler implements FormatHandler {

  /**
   * Format tool definitions for XRJSON - returns string description for the prompt
   */
  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    return tools.map(t => {
      const zodSchema = zodToJsonSchema(t.argsSchema, t.name);

      return `
## Tool Name: ${t.name}
## Tool Description: ${t.description}
## Tool Schema:
${JSON.stringify(zodSchema, null, 2)}
`;
    }).join("\n");
  }

  /**
   * Parse XRJSON response and validate tool calls
   */
  parseResponse(response: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
    try {
      // xrjson library handles code block cleaning automatically
      const parsedData = parseXrjson(response);

      // Validate that we have tools array
      if (!parsedData.tools || !Array.isArray(parsedData.tools)) {
        throw new AgentError(
          "Missing 'tools' array",
          AgentErrorType.INVALID_RESPONSE,
          { parsedData }
        );
      }

      // Validate and convert to PendingToolCall format
      const pendingToolCalls: PendingToolCall[] = [];

      for (let i = 0; i < parsedData.tools.length; i++) {
        const toolCall = parsedData.tools[i];

        // Validate tool call structure
        if (!toolCall || typeof toolCall !== 'object') {
          throw new AgentError(
            `Tool ${i}: must be object`,
            AgentErrorType.INVALID_RESPONSE,
            { toolCall, index: i }
          );
        }

        if (!toolCall.toolName || typeof toolCall.toolName !== 'string') {
          throw new AgentError(
            `Tool ${i}: missing toolName`,
            AgentErrorType.INVALID_RESPONSE,
            { toolCall, index: i }
          );
        }

        // Find the corresponding tool definition
        const toolDef = tools.find(t => t.name === toolCall.toolName);
        if (!toolDef) {
          throw new AgentError(
            `Unknown tool: ${toolCall.toolName}`,
            AgentErrorType.INVALID_RESPONSE,
            { availableTools: tools.map(t => t.name), requestedTool: toolCall.toolName }
          );
        }

        // Extract arguments (all properties except toolName)
        const { toolName, ...args } = toolCall;

        // Validate arguments against schema
        const validationResult = toolDef.argsSchema.safeParse(args);
        if (!validationResult.success) {
          // Use Zod's flatten method for concise errors
          const flatErrors = validationResult.error.flatten();
          const firstFieldError = Object.entries(flatErrors.fieldErrors)[0];
          const firstFormError = flatErrors.formErrors[0];
          
          let errorMsg: string;
          if (firstFieldError) {
            const [field, errors] = firstFieldError;
            errorMsg = `${field}: ${errors?.[0] || 'invalid'}`;
          } else if (firstFormError) {
            errorMsg = firstFormError;
          } else {
            errorMsg = 'invalid args';
          }

          throw new AgentError(
            `${toolName}: ${errorMsg}`,
            AgentErrorType.INVALID_RESPONSE,
            {
              toolName,
              providedArgs: args
            }
          );
        }

        pendingToolCalls.push({
          toolName: toolCall.toolName,
          ...validationResult.data
        });
      }

      return pendingToolCalls;

    } catch (error) {
      if (error instanceof XrjsonError) {
        throw new AgentError(
          `XRJSON: ${error.message}`,
          AgentErrorType.INVALID_RESPONSE,
          { originalError: error }
        );
      }

      if (error instanceof AgentError) {
        throw error;
      }

      // Handle JSON parsing or other unexpected errors
      throw new AgentError(
        `Parse error: ${error instanceof Error ? error.message : 'Unknown'}`,
        AgentErrorType.INVALID_RESPONSE,
        { originalError: error }
      );
    }
  }
}