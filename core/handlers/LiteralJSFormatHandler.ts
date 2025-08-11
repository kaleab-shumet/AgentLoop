/// <reference path="../types/ses.d.ts" />
import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCallTool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from "zod-to-json-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { lockdown, Compartment } from "ses";

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
          `Code execution timed out after ${timeoutMs}ms`,
          AgentErrorType.INVALID_RESPONSE,
          { timeoutMs }
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
      
      return `## Tool Name: ${t.name}
## Tool Description: ${t.description}
## Tool Schema (Zod):
${zodSchemaString}`;
    }).join("\n\n");

    return schemaMap;
  }

  async parseResponse(response: string, tools: Tool<ZodTypeAny>[]): Promise<PendingToolCall[]> {
    // First, extract any literal blocks from the response
    const literalBlocks = this.extractLiteralBlocks(response);
    
    // Look for JavaScript function blocks in the response
    let jsMatch = response.match(/```javascript\s*\n([\s\S]+?)\n?```/);
    let jsContent: string;
    
    if (jsMatch) {
      jsContent = jsMatch[1].trim();
    } else {
      // Try to find function without code block markers
      // Use a more sophisticated regex to capture the complete function including nested braces
      const functionMatch = this.extractFunctionFromText(response);
      if (functionMatch) {
        jsContent = functionMatch;
      } else {
        throw new AgentError(
          "No JavaScript callTools function found in response", 
          AgentErrorType.INVALID_RESPONSE,
          { response: response.substring(0, 500) + (response.length > 500 ? '...' : '') }
        );
      }
    }

    try {
      // Use secure execution method with timeout (fallback handled internally)
      const toolCalls = await this.executeCallToolsFunction(jsContent, literalBlocks);
      
      if (!Array.isArray(toolCalls)) {
        throw new AgentError(
          "callTools function must return an array", 
          AgentErrorType.INVALID_RESPONSE,
          { returnedType: typeof toolCalls, expected: 'array' }
        );
      }

      const pendingToolCalls: PendingToolCall[] = toolCalls.map((toolCall: any) => {
        if (!toolCall.toolName || typeof toolCall.toolName !== 'string') {
          throw new AgentError(
            "Tool call missing required 'toolName' field", 
            AgentErrorType.INVALID_RESPONSE,
            { toolCall, expectedFormat: 'object with string toolName field' }
          );
        }

        const toolName = toolCall.toolName;
        const correspondingTool = tools.find(t => t.name === toolName);
        if (!correspondingTool) {
          throw new AgentError(
            `No tool found for name: ${toolName}`, 
            AgentErrorType.TOOL_NOT_FOUND,
            { toolName, availableTools: tools.map(t => t.name) }
          );
        }

        // Extract arguments (everything except 'toolName')
        const { toolName: _, ...args } = toolCall;

        // Validate arguments against tool schema
        const result = correspondingTool.argsSchema.safeParse(args);
        if (!result.success) {
          throw new AgentError(
            `Invalid arguments for tool "${toolName}": ${result.error.message}`,
            AgentErrorType.INVALID_INPUT,
            { 
              toolName, 
              validationErrors: result.error.issues,
              receivedArgs: args,
              expectedSchema: correspondingTool.argsSchema
            }
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
        `Failed to execute JavaScript callTools function: ${error instanceof Error ? error.message : String(error)}`,
        AgentErrorType.INVALID_RESPONSE,
        { 
          originalError: error instanceof Error ? error.message : String(error),
          jsContent: jsContent.substring(0, 500) + (jsContent.length > 500 ? '...' : '')
        }
      );
    }
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
   * Execute JavaScript code with SES - secure execution only
   * Professional approach with proper security layers and timeout protection
   */
  private async executeCallToolsFunction(jsCode: string, literalBlocks: Map<string, string> = new Map()): Promise<any[]> {
    try {
      // Initialize SES for secure execution
      this.initializeSES();

      // Execute with timeout protection using SES
      return await this.withTimeout(() => {
        return this.executeBySES(jsCode, literalBlocks);
      });
    } catch (error) {
      throw new AgentError(
        `Error executing callTools function: ${error instanceof Error ? error.message : String(error)}`,
        AgentErrorType.INVALID_RESPONSE,
        { originalError: error, jsCode: jsCode.substring(0, 200) + '...' }
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
        "callTools function must return an array",
        AgentErrorType.INVALID_RESPONSE,
        { returnedType: typeof result, expected: 'array' }
      );
    }

    return result;
  }


  /**
   * Create secure endowments for the SES compartment
   * Only provide safe, necessary globals
   */
  private createSecureEndowments(literalBlocks: Map<string, string>): Record<string, any> {
    // Create secure LiteralLoader function
    const LiteralLoader = (id: string): string => {
      if (!literalBlocks.has(id)) {
        throw new AgentError(
          `Literal block with id "${id}" not found`,
          AgentErrorType.INVALID_RESPONSE,
          { literalId: id, availableLiterals: Array.from(literalBlocks.keys()) }
        );
      }
      return literalBlocks.get(id)!;
    };

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
      
      // Custom secure function
      LiteralLoader: LiteralLoader,
      
      // Stubbed console for safety
      console: Object.freeze({ 
        log: () => {}, 
        error: () => {}, 
        warn: () => {} 
      }),
    };
  }
}