import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCallTool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";

import * as TOML from "@iarna/toml";
import zodToJsonSchema from "zod-to-json-schema";

/**
 * Handles TOML-based response format for tool calls
 */
export class TomlFormatHandler implements FormatHandler {
  
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
  // Look for TOML blocks in the response (with or without code block markers)
  let tomlMatch = response.match(/```toml\s*\n([\s\S]+?)\n?```/);
  let tomlContent: string;
  
  if (tomlMatch) {
    tomlContent = tomlMatch[1].trim();
  } else if (response.trim().includes('tool_calls') || response.includes('[[tool_calls]]')) {
    // Handle raw TOML without code block markers
    tomlContent = response.trim();
  } else {
    throw new AgentError(
      "No TOML block found in response", 
      AgentErrorType.INVALID_RESPONSE,
      { response: response.substring(0, 500) + (response.length > 500 ? '...' : '') }
    );
  }

  const sanitizedTomlContent = tomlContent;

  try {
    const parsedToml = TOML.parse(sanitizedTomlContent);
    

    // Handle different TOML structures
    let toolCalls: any[] = [];

    if (Array.isArray(parsedToml)) {
      // Direct array of tool calls
      toolCalls = parsedToml;
    } else if (parsedToml.tools && Array.isArray(parsedToml.tools)) {
      // Tools wrapped in a tools array
      toolCalls = parsedToml.tools;
    } else if (parsedToml.tool_calls && Array.isArray(parsedToml.tool_calls)) {
      // Tools wrapped in a tool_calls array
      toolCalls = parsedToml.tool_calls;
    } else if (parsedToml.name) {
      // Single tool call object
      toolCalls = [parsedToml];
    } else {
      throw new AgentError(
        "Invalid TOML structure - expected tools array or single tool with 'name'", 
        AgentErrorType.INVALID_RESPONSE,
        { parsedToml: parsedToml, expectedStructure: 'array of tools or single tool with name field' }
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
          `Invalid arguments for tool "${toolName}": ${result.error.message}`,
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
      `Failed to parse TOML response: ${error instanceof Error ? error.message : String(error)}`,
      AgentErrorType.INVALID_RESPONSE,
      { 
        originalError: error instanceof Error ? error.message : String(error),
        tomlContent: tomlContent.substring(0, 500) + (tomlContent.length > 500 ? '...' : '')
      }
    );
  }
}

private removeLastNewlineFromString(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }
  return str.replace(/(\r?\n)$/, "");
}

private recursiveRemoveLastNewline(data: any): any {
  // Handle null and undefined explicitly
  if (data === null || data === undefined) {
    return data;
  }
  
  // Handle strings
  if (typeof data === "string") {
    return this.removeLastNewlineFromString(data);
  } 
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => this.recursiveRemoveLastNewline(item));
  } 
  
  // Handle objects (but not Date, RegExp, etc.)
  if (typeof data === "object" && data.constructor === Object) {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = this.recursiveRemoveLastNewline(value);
    }
    return result;
  }
  
  // For other types (number, boolean, Date, RegExp, etc.), return as is
  return data;
}

}