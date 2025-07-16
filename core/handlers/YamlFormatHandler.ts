import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { parse as parseYaml } from "yaml";
import zodToJsonSchema from "zod-to-json-schema";

/**
 * Handles YAML-based response format for tool calls
 */
export class YamlFormatHandler implements FormatHandler {
  
  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    const schemMap = tools.map(t => {

      const zodSchema = zodToJsonSchema(t.argsSchema, t.name)

      return (`
      ----------------------------
      ## Tool Name: ${t.name}
      ## Tool Description: ${t.description}
      ## Tool Schema Below
      ${JSON.stringify(zodSchema, null, 2)}
      ---------------------------
      `)
    }).join("\n\n")

    return schemMap

  }


parseResponse(response: string, tools: Tool < ZodTypeAny > []): PendingToolCall[] {
  // Look for YAML blocks in the response
  const yamlMatch = response.match(/```ya?ml\s*\n([\s\S]+?)\n?```/);
  if (!yamlMatch) {
    throw new AgentError("No YAML block found in response", AgentErrorType.INVALID_RESPONSE);
  }

  const yamlContent = yamlMatch[1].trim();

  try {
    const parsedYaml = parseYaml(yamlContent);

    // Handle different YAML structures
    let toolCalls: any[] = [];

    if (Array.isArray(parsedYaml)) {
      // Direct array of tool calls
      toolCalls = parsedYaml;
    } else if (parsedYaml.tools && Array.isArray(parsedYaml.tools)) {
      // Tools wrapped in a tools array
      toolCalls = parsedYaml.tools;
    } else if (parsedYaml.tool_calls && Array.isArray(parsedYaml.tool_calls)) {
      // Tools wrapped in a tool_calls array
      toolCalls = parsedYaml.tool_calls;
    } else if (parsedYaml.name) {
      // Single tool call object
      toolCalls = [parsedYaml];
    } else {
      throw new AgentError("Invalid YAML structure for tool calls", AgentErrorType.INVALID_RESPONSE);
    }

    const pendingToolCalls: PendingToolCall[] = toolCalls.map((toolCall: any) => {
      if (!toolCall.name || typeof toolCall.name !== 'string') {
        throw new AgentError("Tool call missing required 'name' field", AgentErrorType.INVALID_RESPONSE);
      }

      const toolName = toolCall.name;
      const correspondingTool = tools.find(t => t.name === toolName);
      if (!correspondingTool) {
        throw new AgentError(`No tool found for name: ${toolName}`, AgentErrorType.TOOL_NOT_FOUND);
      }

      // Extract arguments (everything except 'name')
      const { name, ...args } = toolCall;

      // If args are nested under 'args' property, extract them
      const toolArgs = args.args || args;



      // Validate arguments against tool schema
      const result = correspondingTool.argsSchema.safeParse(toolArgs);
      if (!result.success) {
        throw new AgentError(
          `Invalid arguments for tool "${toolName}": ${JSON.stringify(result.error.issues)}`,
          AgentErrorType.INVALID_SCHEMA
        );
      }

      return {
        name: toolName,
        ...toolArgs
      };
    });

    return pendingToolCalls;

  } catch (error) {
    if (error instanceof AgentError) {
      throw error;
    }
    throw new AgentError(
      `Failed to parse YAML response: ${error instanceof Error ? error.message : String(error)}`,
      AgentErrorType.INVALID_RESPONSE
    );
  }
}


}