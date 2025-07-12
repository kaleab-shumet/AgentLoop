import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, ResponseHandler } from "../types/types";
import { XMLParser } from 'fast-xml-parser';
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from 'zod-to-json-schema';
import { convertJsonSchemaToXsd } from '../utils/JsonToXsd';

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
      parsedJs = this.parseXmlToJs(xmlContent);
    } catch (error: any) {
      throw new AgentError(
        `[XmlResponseHandler] Failed to parse XML. Details: ${error.message}. Possible causes: malformed XML syntax or unexpected structure. Hint: Check the LLM's XML output for errors.`,
        AgentErrorType.INVALID_RESPONSE
      );
    }

    const root = parsedJs?.root;
    let toolCalls: Array<any> = [];

    for (const value of Object.values(root)) {
      if (Array.isArray(value)) {
        toolCalls.push(...value);
      } else {
        toolCalls.push(value);
      }
    }

    if (!toolCalls || toolCalls.length === 0) {
      throw new AgentError(
        `[XmlResponseHandler] No tool calls found in the parsed XML. The <root> element may be empty or missing tool definitions. Hint: Ensure the LLM response includes at least one valid tool call inside <root>.`,
        AgentErrorType.TOOL_NOT_FOUND
      );
    }

    const validToolCalls: PendingToolCall[] = [];

    for (const call of toolCalls) {
      if (typeof call.name !== 'string') {
        throw new AgentError(
          `[XmlResponseHandler] Tool call is missing a valid 'name' property or is malformed. Offending tool: ${JSON.stringify(call)}. Hint: Each tool call must have a 'name' property matching a known tool.`,
          AgentErrorType.MALFORMED_TOOL_FOUND
        );
      }

      const toolDef = tools.find(t => t.name === call.name);
      if (!toolDef) {
        throw new AgentError(
          `[XmlResponseHandler] Tool "${call.name}" does not exist. Available tools: ${tools.map(t => t.name).join(", ")}. Hint: Check for typos or update your tool definitions.`,
          AgentErrorType.TOOL_NOT_FOUND
        );
      }

      const validation = toolDef.responseSchema.safeParse(call);
      if (!validation.success) {
        throw new AgentError(
          `[XmlResponseHandler] Tool "${call.name}" has an invalid schema. Validation errors: ${JSON.stringify(validation.error?.issues)}. Hint: Ensure the tool call matches the expected schema for "${call.name}".`,
          AgentErrorType.TOOL_NOT_FOUND
        );
      }

      validToolCalls.push(validation.data as PendingToolCall);
    }

    return validToolCalls;
  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    return tools.map(tool => {
      const jsonSchema = zodToJsonSchema(tool.responseSchema, tool.name);
      const xsdSchema = convertJsonSchemaToXsd(jsonSchema as any, { rootElementName: 'tool' });
      return `\n${xsdSchema}`;
    }).join('\n\n');
  }

  getFormatInstructions(tools: Tool<ZodTypeAny>[], finalToolName: string, parallelExecution: boolean): string {
    const executionStrategyPrompt = parallelExecution ? 
      "Your tools can execute concurrently. You should call all necessary tools for a task in a single turn." : 
      "Your tools execute sequentially. If one tool fails, you must retry and fix it before continuing.";

    return `You MUST respond by calling one or more tools. Your entire output must be a single, valid XML block enclosed in \`\`\`xml ... \`\`\`. All tool calls must be children under a single <root> XML tag. 

**CRITICAL TERMINATION RULES:**
1. **NEVER REPEAT SUCCESSFUL OPERATIONS:** Before making any tool call, check the tool call history. If a tool has already succeeded for the same purpose, DO NOT call it again.
2. **MANDATORY TERMINATION:** You MUST call the '${finalToolName}' tool when:
   - You have successfully completed the user's request
   - All required information has been gathered or operations completed
   - You can provide a complete answer to the user
3. **SINGLE FINAL TOOL:** When using '${finalToolName}', it must be the ONLY tool in your response.
4. **NO REDUNDANT WORK:** If the history shows a task is complete, immediately use '${finalToolName}' with the results.

**WORKFLOW DECISION PROCESS:**
- Check history → Identify what's been done → Determine what's still needed → Either do remaining work OR use '${finalToolName}' if complete

**Example of completing after successful operations:**
\`\`\`xml
<root>
  <${finalToolName}><name>${finalToolName}</name><value>I have successfully completed your request. [Summarize what was accomplished based on the history]</value></${finalToolName}>
</root>
\`\`\`

- **Execution Strategy:** ${executionStrategyPrompt}`;
  }

  private extractCode(content: string, language: string = 'xml'): string | null {
    const regex = new RegExp("```" + language + "\\s*\\n([\\s\\S]+?)\\n?```");
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  private parseXmlToJs(xml: string): any {
    const parser = new XMLParser({
      ignoreAttributes: true,
      removeNSPrefix: true,
      parseAttributeValue: false,
      trimValues: true,
    });
    return parser.parse(xml);
  }
}