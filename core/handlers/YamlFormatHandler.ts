import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCallTool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { parse as parseYaml } from "yaml";
import zodToJsonSchema from "zod-to-json-schema";

/**
 * Handles YAML-based response format for tool calls
 */
export class YamlFormatHandler implements FormatHandler {
  
  /**
   * Recursively trim all string values in an object or array
   */
  private trimStringsRecursively(obj: any): any {
    if (typeof obj === 'string') {
      return obj.trim();
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.trimStringsRecursively(item));
    } else if (obj && typeof obj === 'object') {
      const trimmed: any = {};
      for (const [key, value] of Object.entries(obj)) {
        trimmed[key] = this.trimStringsRecursively(value);
      }
      return trimmed;
    }
    return obj;
  }
  
  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    const schemaMap = tools.map(t => {

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

    return schemaMap

  }


parseResponse(response: string, tools: Tool < ZodTypeAny > []): PendingToolCall[] {
  // Look for YAML blocks in the response
  const yamlMatch = response.match(/```ya?ml\s*\n([\s\S]+?)\n?```/);
  if (!yamlMatch) {
    throw new AgentError(
      "No YAML block found in response", 
      AgentErrorType.INVALID_RESPONSE,
      { response: response.substring(0, 500) + (response.length > 500 ? '...' : '') }
    );
  }

  const yamlContent = yamlMatch[1].trim();

  try {
    const parsedYaml = parseYaml(yamlContent);
    
    // Trim all string values recursively to handle | block style whitespace
    const trimmedParsedYaml = this.trimStringsRecursively(parsedYaml);

    // Handle different YAML structures
    let toolCalls: any[] = [];

    if (Array.isArray(trimmedParsedYaml)) {
      // Direct array of tool calls
      toolCalls = trimmedParsedYaml;
    } else if (trimmedParsedYaml.tools && Array.isArray(trimmedParsedYaml.tools)) {
      // Tools wrapped in a tools array
      toolCalls = trimmedParsedYaml.tools;
    } else if (trimmedParsedYaml.tool_calls && Array.isArray(trimmedParsedYaml.tool_calls)) {
      // Tools wrapped in a tool_calls array
      toolCalls = trimmedParsedYaml.tool_calls;
    } else if (trimmedParsedYaml.name) {
      // Single tool call object
      toolCalls = [trimmedParsedYaml];
    } else {
      throw new AgentError(
        "Invalid YAML structure for tool calls - expected array of tools or single tool with 'name' field", 
        AgentErrorType.INVALID_RESPONSE,
        { parsedYaml: trimmedParsedYaml, expectedStructure: 'array of tools or single tool with name field' }
      );
    }

    const pendingToolCalls: PendingToolCall[] = toolCalls.map((toolCall: any) => {
      if (!toolCall.name || typeof toolCall.name !== 'string') {
        throw new AgentError(
          "Tool call missing required 'name' field", 
          AgentErrorType.INVALID_RESPONSE,
          { toolCall, expectedFormat: 'object with string name field' }
        );
      }

      const toolName = toolCall.name;
      const correspondingTool = tools.find(t => t.name === toolName);
      if (!correspondingTool) {
        throw new AgentError(
          `No tool found for name: ${toolName}`, 
          AgentErrorType.TOOL_NOT_FOUND,
          { toolName, availableTools: tools.map(t => t.name) }
        );
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
          AgentErrorType.INVALID_INPUT,
          { 
            toolName, 
            validationErrors: result.error.issues,
            receivedArgs: toolArgs,
            expectedSchema: correspondingTool.argsSchema
          }
        );
      }

      return {
        toolName: toolName,
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
      AgentErrorType.INVALID_RESPONSE,
      { 
        originalError: error instanceof Error ? error.message : String(error),
        yamlContent: yamlContent.substring(0, 500) + (yamlContent.length > 500 ? '...' : '')
      }
    );
  }
}
}