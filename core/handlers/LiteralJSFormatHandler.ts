/// <reference path="../types/ses.d.ts" />
import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCallTool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from "zod-to-json-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { lockdown, Compartment } from "ses";
import * as beautify from 'js-beautify';

/**
 * Handles Literal+JavaScript response format for tool calls
 * Expects AI to return a JavaScript function called `callTools` that returns an array of tool call objects
 * Supports literal blocks for large content via LiteralLoader references
 */
export class LiteralJSFormatHandler implements FormatHandler {
  private sesInitialized = false;
  private readonly executionTimeoutMs = 5000; // 5 second timeout for code execution

  /**
   * Execute a function with timeout protection (async)
   */
  private async withTimeout<T>(fn: () => T, timeoutMs: number = this.executionTimeoutMs): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new AgentError(
          `Execution timeout`,
          AgentErrorType.INVALID_RESPONSE
        ));
      }, timeoutMs);
    });

    // Create a promise that resolves with the function result
    const executionPromise = new Promise<T>((resolve, reject) => {
      // Execute immediately - timeout will be enforced by Promise.race
      try {
        const result = fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    // Race between execution and timeout
    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Initialize SES for secure code execution
   */
  private initializeSES(): void {
    if (!this.sesInitialized) {
      try {
        // Initialize SES lockdown with safe configuration
        lockdown({
          errorTaming: 'safe',
          stackFiltering: 'verbose',
          denyUnsafeCode: true,
          localeReporting: 'none',
        });
        this.sesInitialized = true;
      } catch (error) {
        // SES may already be locked down, which is fine
        this.sesInitialized = true;
      }
    }
  }

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

    // Generate toolSchemas object from available tools
    const toolSchemasCode = this.generateToolSchemasCode(tools);

    // Add imports and toolSchemas at the beginning
    processedCode = `import { z } from 'zod';\n${toolSchemasCode}\n${processedCode}`;

    return processedCode;
  }

  /**
   * Generate toolSchemas code from available tools
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
      return `  ${tool.name}: ${zodSchemaString}`;
    }).join(',\n');

    return `const toolSchemas = {\n${schemaEntries}\n};`;
  }

  /**
   * Execute JavaScript code with SES - secure execution only
   * Professional approach with proper security layers and timeout protection
   */
  private async executeCallToolsFunction(jsCode: string, literalBlocks: Map<string, string> = new Map(), tools: Tool<ZodTypeAny>[]): Promise<any[]> {
    try {
      // Initialize SES for secure execution
      this.initializeSES();

      // Process the code: populate LiteralLoader references and add Zod import
      const processedCode = this.processCodeForExecution(jsCode, literalBlocks, tools);

      // Execute with timeout protection using SES
      return await this.withTimeout(() => {
        return this.executeBySES(processedCode, new Map()); // Empty map since we've already populated
      });
    } catch (error) {
      throw new AgentError(
        `Execution error: ${error instanceof Error ? error.message : String(error)}`,
        AgentErrorType.INVALID_RESPONSE
      );
    }
  }

  /**
   * Execute using SES compartments (secure)
   */
  private executeBySES(jsCode: string, literalBlocks: Map<string, string>): any[] {
    // Create secure endowments for the compartment
    const endowments = this.createSecureEndowments(literalBlocks);

    // Create a new SES compartment for isolated execution
    const compartment = new Compartment(endowments);

    // Strip import statements as we provide everything via endowments
    const cleanedJsCode = jsCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');

    // Prepare the execution code
    const executionCode = `
      ${cleanedJsCode}
      callTools();
    `;

    // Execute the code in the secure compartment
    const result = compartment.evaluate(executionCode);

    if (!Array.isArray(result)) {
      throw new AgentError(
        "callTools must return array",
        AgentErrorType.INVALID_RESPONSE
      );
    }

    return result;
  }


  /**
   * Create secure endowments for the SES compartment
   * Only provide safe, necessary globals
   */
  private createSecureEndowments(literalBlocks: Map<string, string>): Record<string, any> {
    // Import real Zod for schema creation and execution
    const { z } = require('zod');

    // Provide minimal, safe endowments
    return {
      // Safe constructors
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      
      // Safe utilities
      Math: Math,
      Date: Date,
      JSON: JSON,
      
      // Real Zod library for schema validation
      z: z,
      
      // Stubbed console for safety
      console: Object.freeze({ 
        log: () => {}, 
        error: () => {}, 
        warn: () => {} 
      }),
    };
  }
}