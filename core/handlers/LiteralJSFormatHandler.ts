/// <reference path="../types/ses.d.ts" />
import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCallTool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from "zod-to-json-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import * as beautify from 'js-beautify';
import { JSExecutionEngine, ExecutionMode } from './JSExecutionEngine';

/**
 * Handles Literal+JavaScript response format for tool calls
 * Expects AI to return a JavaScript function called `callTools` that returns an array of tool call objects
 * Supports literal blocks for large content via LiteralLoader references
 */
export class LiteralJSFormatHandler implements FormatHandler {
  private readonly executionTimeoutMs = 5000; // 5 second timeout for code execution
  private readonly executionEngine = new JSExecutionEngine();
  
  // Configurable execution mode - can be switched between 'eval' and 'ses'
  public executionMode: ExecutionMode = 'eval';

  // Timeout and execution methods moved to JSExecutionEngine

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    const schemaMap = tools.map(t => {
      // Convert Zod schema to JSON Schema first, then resolve $refs and convert back to Zod string
      const jsonSchema = zodToJsonSchema(t.argsSchema, t.name);
      
      // Resolve $ref if present by extracting the actual schema from definitions
      let resolvedSchema = jsonSchema;
      const schemaWithRef = jsonSchema as any;
      if (schemaWithRef.$ref && schemaWithRef.definitions) {
        const refKey = schemaWithRef.$ref.replace('#/definitions/', '');
        if (schemaWithRef.definitions[refKey]) {
          resolvedSchema = schemaWithRef.definitions[refKey];
        }
      }
      
      const zodSchemaString = jsonSchemaToZod(resolvedSchema as any);
      
      const beautifiedSchema = beautify.js(zodSchemaString, {
        indent_size: 2,
        space_in_empty_paren: true,
        preserve_newlines: true,
        max_preserve_newlines: 2,
        wrap_line_length: 100
      });
      
      return `## Tool Name: ${t.name}
## Tool Description: ${t.description}
## Tool Schema (Zod):
${beautifiedSchema}`;
    }).join("\n\n");

    return schemaMap;
  }

  async parseResponse(response: string, tools: Tool<ZodTypeAny>[]): Promise<PendingToolCall[]> {
    // First, extract any literal blocks from the response
    const literalBlocks = this.extractLiteralBlocks(response);
    
    // Remove literal blocks from response to get clean text for JS extraction
    let cleanResponse = this.removeLiteralBlocks(response);
    
    // Look for JavaScript function blocks in the clean response
    let jsMatch = cleanResponse.match(/```javascript\s*\n([\s\S]+?)\n?```/);
    let jsContent: string;
    
    if (jsMatch) {
      // Extract only the JavaScript content, not the literals
      jsContent = jsMatch[1].trim();
    } else {
      // Try to find function without code block markers
      const functionMatch = this.extractFunctionFromText(cleanResponse);
      if (functionMatch) {
        jsContent = functionMatch;
      } else {
        throw new AgentError(
          "No callTools function found", 
          AgentErrorType.INVALID_RESPONSE
        );
      }
    }

    try {
      // Use secure execution method with timeout (fallback handled internally)
      const toolCalls = await this.executeCallToolsFunction(jsContent, literalBlocks, tools);
      
      if (!Array.isArray(toolCalls)) {
        throw new AgentError(
          "callTools must return array", 
          AgentErrorType.INVALID_RESPONSE
        );
      }

      const pendingToolCalls: PendingToolCall[] = toolCalls.map((toolCall: any) => {
        // Handle new format: { toolName, ...args } directly from Zod parsing
        if (!toolCall.toolName || typeof toolCall.toolName !== 'string') {
          throw new AgentError(
            "Missing toolName field", 
            AgentErrorType.INVALID_RESPONSE
          );
        }

        const toolName = toolCall.toolName;
        const correspondingTool = tools.find(t => t.name === toolName);
        if (!correspondingTool) {
          throw new AgentError(
            `Tool not found: ${toolName}`, 
            AgentErrorType.TOOL_NOT_FOUND
          );
        }

        // Extract arguments (everything except 'toolName')
        const { toolName: _, ...args } = toolCall;

        // Validate arguments against tool schema
        const result = correspondingTool.argsSchema.safeParse(args);
        if (!result.success) {
          const errorDetails = result.error.errors.map(err => 
            `${err.path.join('.')}: ${err.message}`
          ).join('; ');
          throw new AgentError(
            `Invalid args for ${toolName}: ${errorDetails}`,
            AgentErrorType.INVALID_INPUT
          );
        }

        return {
          toolName: toolName,
          ...args
        };
      });

      return pendingToolCalls;

    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError(
        `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
        AgentErrorType.INVALID_RESPONSE
      );
    }
  }

  /**
   * Remove literal blocks from response to get clean text for JavaScript extraction
   */
  private removeLiteralBlocks(response: string): string {
    // Remove the entire <literals>...</literals> section
    let cleanResponse = response.replace(/<literals\s*>[\s\S]*?<\/literals>/g, '');
    
    // Also remove any standalone literal blocks (fallback)
    cleanResponse = cleanResponse.replace(/<literal\s+id="[^"]+"\s*>[\s\S]*?<\/literal>/g, '');
    
    return cleanResponse;
  }

  /**
   * Extract literal blocks from response
   */
  private extractLiteralBlocks(response: string): Map<string, string> {
    const literalBlocks = new Map<string, string>();
    
    // First try to find literals inside a <literals> root tag
    const literalsBlockMatch = response.match(/<literals\s*>([\s\S]*?)<\/literals>/);
    if (literalsBlockMatch) {
      // Extract individual literal blocks from within the literals container
      const literalsContent = literalsBlockMatch[1];
      const literalRegex = /<literal\s+id="([^"]+)"\s*>([\s\S]*?)<\/literal>/g;
      
      let match;
      while ((match = literalRegex.exec(literalsContent)) !== null) {
        const id = match[1];
        const content = match[2];
        literalBlocks.set(id, content);
      }
    } else {
      // Fallback: look for standalone literal blocks (for backward compatibility)
      const literalRegex = /<literal\s+id="([^"]+)"\s*>([\s\S]*?)<\/literal>/g;
      
      let match;
      while ((match = literalRegex.exec(response)) !== null) {
        const id = match[1];
        const content = match[2];
        literalBlocks.set(id, content);
      }
    }
    
    return literalBlocks;
  }

  /**
   * Extract function from text using balanced brace matching
   */
  private extractFunctionFromText(text: string): string | null {
    const functionStart = text.match(/function\s+callTools\s*\(\s*\)\s*\{/);
    if (!functionStart || functionStart.index === undefined) {
      return null;
    }

    const startIndex = functionStart.index;
    const startBraceIndex = startIndex + functionStart[0].length - 1; // Position of opening brace
    
    // Find the matching closing brace
    let braceCount = 1;
    let i = startBraceIndex + 1;
    
    while (i < text.length && braceCount > 0) {
      if (text[i] === '{') {
        braceCount++;
      } else if (text[i] === '}') {
        braceCount--;
      }
      i++;
    }
    
    if (braceCount === 0) {
      return text.substring(startIndex, i);
    }
    
    return null;
  }

  /**
   * Process the extracted function: populate LiteralLoader references and add imports
   */
  private processCodeForExecution(jsCode: string, literalBlocks: Map<string, string>, tools: Tool<ZodTypeAny>[]): string {
    let processedCode = jsCode;

    // Replace all LiteralLoader("id") calls with actual string literals
    for (const [id, content] of literalBlocks) {
      // Escape the content for safe insertion into JavaScript string literal
      const escapedContent = JSON.stringify(content);
      // Replace LiteralLoader("id") with the actual content
      const loaderPattern = new RegExp(`LiteralLoader\\s*\\(\\s*["'\`]${id}["'\`]\\s*\\)`, 'g');
      processedCode = processedCode.replace(loaderPattern, escapedContent);
    }

    // Note: Function body extraction in JSExecutionEngine handles imports
    processedCode = `import { z } from 'zod';\n${processedCode}`;

    return processedCode;
  }

  /**
   * Fix unescaped single quotes in double-quoted string literals to prevent JavaScript parsing errors
   */
  private fixStringLiteralEscaping(jsCode: string): string {
    // Match double-quoted strings that contain unescaped single quotes
    // This regex finds: "any content with ' single quotes"
    return jsCode.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, content) => {
      // Check if the string contains unescaped single quotes
      if (content.includes("'")) {
        // Escape single quotes that aren't already escaped
        const escapedContent = content.replace(/(?<!\\)'/g, "\\'");
        return `"${escapedContent}"`;
      }
      return match; // Return unchanged if no single quotes
    });
  }

  /**
   * Generate toolSchemas code from available tools with toolName defaults
   */
  private generateToolSchemasCode(tools: Tool<ZodTypeAny>[]): string {
    const schemaEntries = tools.map(tool => {
      // Convert Zod schema to JSON Schema first, then resolve $refs and convert back to Zod string
      const jsonSchema = zodToJsonSchema(tool.argsSchema, tool.name);
      
      // Resolve $ref if present by extracting the actual schema from definitions
      let resolvedSchema = jsonSchema;
      const schemaWithRef = jsonSchema as any;
      if (schemaWithRef.$ref && schemaWithRef.definitions) {
        const refKey = schemaWithRef.$ref.replace('#/definitions/', '');
        if (schemaWithRef.definitions[refKey]) {
          resolvedSchema = schemaWithRef.definitions[refKey];
        }
      }
      
      const zodSchemaString = jsonSchemaToZod(resolvedSchema as any);
      
      // Extend the schema with toolName default
      return `  ${tool.name}: ${zodSchemaString}.extend({ toolName: z.string().default("${tool.name}") })`;
    }).join(',\n');

    return `const toolSchemas = {\n${schemaEntries}\n};`;
  }

  // Schema generation moved to JSExecutionEngine

  /**
   * Execute JavaScript code using the pluggable execution engine
   */
  private async executeCallToolsFunction(jsCode: string, literalBlocks: Map<string, string> = new Map(), tools: Tool<ZodTypeAny>[]): Promise<any[]> {
    try {
      // Process the code: populate LiteralLoader references
      const processedCode = this.processCodeForExecution(jsCode, literalBlocks, tools);

      // Execute using the configurable execution engine
      return await this.executionEngine.execute(processedCode, tools, {
        mode: this.executionMode,
        timeoutMs: this.executionTimeoutMs
      });
    } catch (error) {
      throw new AgentError(
        `Execution error: ${error instanceof Error ? error.message : String(error)}`,
        AgentErrorType.INVALID_RESPONSE
      );
    }
  }

  // Execution methods moved to JSExecutionEngine
}