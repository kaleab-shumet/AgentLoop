import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, ResponseHandler } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from 'zod-to-json-schema';
import { JsonSchemaXmlParser } from '../utils/JsonSchemaXmlParser';

/**
 * Handles XML-based tool calling (original AgentLoop format)
 */
export class XmlResponseHandler implements ResponseHandler {
  parseResponse(response: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
    const xmlContent = this.extractCode(response, 'xml');
    if (!xmlContent) {
      throw new AgentError(
        "[XmlResponseHandler] No XML code block found in LLM response. Possible reasons: missing or invalid XML code block, or incorrect response format. Hint: Ensure your prompt requests XML output wrapped in triple backticks.",
        AgentErrorType.INVALID_RESPONSE
      );
    }

    let parsedJs;
    try {
      parsedJs = this.parseXmlToJs(xmlContent, tools);
    } catch (error: any) {
      throw new AgentError(
        `[XmlResponseHandler] Failed to parse XML. Details: ${error.message}. Possible causes: malformed XML syntax or unexpected structure. Hint: Check the LLM's XML output for errors.`,
        AgentErrorType.INVALID_RESPONSE
      );
    }

    const root = parsedJs?.root;
    if (!root || Object.keys(root).length === 0) {
      throw new AgentError(
        `[XmlResponseHandler] No tool calls found in the parsed XML. The <root> element may be empty or missing tool definitions. Hint: Ensure the LLM response includes at least one valid tool call inside <root>.`,
        AgentErrorType.TOOL_NOT_FOUND
      );
    }

    const validToolCalls: PendingToolCall[] = [];

    // Extract tool calls from XML tag names
    for (const [tagName, tagValue] of Object.entries(root)) {
      // Handle both single calls and arrays of calls with the same tag name
      const calls = Array.isArray(tagValue) ? tagValue : [tagValue];

      for (const call of calls) {
        // Tool name comes from XML tag name
        console.log(tools.length)
        const toolDef = tools.find(t => t.name === tagName);
        if (!toolDef) {
          throw new AgentError(
            `[XmlResponseHandler] Tool "${tagName}" does not exist. Available tools: ${tools.map(t => t.name).join(", ")}. Hint: Check for typos or update your tool definitions.`,
            AgentErrorType.TOOL_NOT_FOUND
          );
        }
        console.log("Call: ", call)
        const validation = toolDef.argsSchema.safeParse(call);
        if (!validation.success) {
          throw new AgentError(
            `[XmlResponseHandler] Tool "${tagName}" has an invalid schema. Validation errors: ${JSON.stringify(validation.error?.issues)}. Hint: Ensure the tool call matches the expected schema for "${tagName}".`,
            AgentErrorType.TOOL_NOT_FOUND
          );
        }

        validToolCalls.push({ ...validation.data, name: tagName } as PendingToolCall);
      }
    }

    return validToolCalls;
  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    return tools.map(tool => {
      const jsonSchema = zodToJsonSchema(tool.argsSchema, tool.name);
      return `Tool: ${tool.name}
Description: ${tool.description}
Schema: ${JSON.stringify(jsonSchema, null, 2)}`;
    }).join('\n\n');
  }

  getFormatInstructions(finalToolName: string): string {
    // Format instructions are now centralized in PromptTemplates
    // This handler just needs to specify that it uses XML format
    // The actual instructions are provided by PromptManager
    return 'XML_FORMAT'; // Marker for prompt manager to use XML format instructions
  }

  private extractCode(content: string, language: string = 'xml'): string | null {
    const regex = new RegExp("```" + language + "\\s*\\n([\\s\\S]+?)\\n?```");
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  private parseXmlToJs(xml: string, tools: Tool<ZodTypeAny>[]): any {
    const parser = new JsonSchemaXmlParser({
      ignoreAttributes: true,
      parseAttributeValue: false
    });
    return parser.parse(xml, tools);
  }
}