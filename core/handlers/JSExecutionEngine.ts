import { ZodTypeAny } from "zod";
import { Tool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";

export type ExecutionMode = 'eval' | 'ses';

export interface JSExecutionOptions {
  mode: ExecutionMode;
  timeoutMs?: number;
}

export interface JSExecutionContext {
  toolSchemas: Record<string, any>;
  toolCalls: any[];
  z: any;
}

/**
 * JavaScript execution engine with pluggable security modes
 * Supports both direct eval and SES execution
 */
export class JSExecutionEngine {
  private sesInitialized = false;

  /**
   * Execute JavaScript code with the specified security mode
   */
  async execute(
    jsCode: string,
    tools: Tool<ZodTypeAny>[],
    options: JSExecutionOptions = { mode: 'eval', timeoutMs: 5000 }
  ): Promise<any[]> {
    const context = this.createExecutionContext(tools);
    
    let rawResults: any[];
    if (options.mode === 'ses') {
      rawResults = await this.executeWithSES(jsCode, context, options.timeoutMs || 5000);
    } else {
      rawResults = await this.executeWithEval(jsCode, context, options.timeoutMs || 5000);
    }

    // Now do the actual Zod parsing outside eval with preserved string values
    return this.parseToolCallsWithZod(rawResults, tools);
  }

  /**
   * Extract the body of the callTools function, preserving string literals
   */
  private extractCallToolsFunctionBody(jsCode: string): string {
    // Find the callTools function using balanced brace matching
    const functionMatch = jsCode.match(/function\s+callTools\s*\(\s*\)\s*\{/);
    if (!functionMatch || functionMatch.index === undefined) {
      throw new AgentError(
        "callTools function not found",
        AgentErrorType.INVALID_RESPONSE
      );
    }

    const startIndex = functionMatch.index;
    const startBraceIndex = startIndex + functionMatch[0].length - 1; // Position of opening brace
    
    // Find the matching closing brace
    let braceCount = 1;
    let i = startBraceIndex + 1;
    
    while (i < jsCode.length && braceCount > 0) {
      if (jsCode[i] === '{') {
        braceCount++;
      } else if (jsCode[i] === '}') {
        braceCount--;
      }
      i++;
    }
    
    if (braceCount !== 0) {
      throw new AgentError(
        "Unmatched braces in callTools function",
        AgentErrorType.INVALID_RESPONSE
      );
    }

    // Extract just the function body (everything between the braces)
    const functionBody = jsCode.substring(startBraceIndex + 1, i - 1);
    return functionBody.trim();
  }

  /**
   * Parse raw tool call data with actual Zod schemas (outside eval environment)
   */
  private parseToolCallsWithZod(rawResults: any[], tools: Tool<ZodTypeAny>[]): any[] {
    const { z } = require('zod');
    
    return rawResults.map((rawToolCall) => {
      if (!rawToolCall.toolName || typeof rawToolCall.toolName !== 'string') {
        throw new AgentError(
          "Missing toolName field in tool call",
          AgentErrorType.INVALID_RESPONSE
        );
      }

      const toolName = rawToolCall.toolName;
      const correspondingTool = tools.find(t => t.name === toolName);
      if (!correspondingTool) {
        throw new AgentError(
          `Tool not found: ${toolName}`,
          AgentErrorType.TOOL_NOT_FOUND
        );
      }

      // Extend schema with toolName default
      const extendedSchema = (correspondingTool.argsSchema as any).extend({ 
        toolName: z.string().default(toolName) 
      });
      
      // Use safeParse and let defaults be applied
      const result = extendedSchema.safeParse(rawToolCall);
      if (!result.success) {
        const errorDetails = result.error.errors.map((err: any) => 
          `${err.path.join('.')}: ${err.message}`
        ).join('; ');
        throw new AgentError(
          `Invalid args for ${toolName}: ${errorDetails}`,
          AgentErrorType.INVALID_INPUT
        );
      }

      return result.data;
    });
  }

  /**
   * Create execution context with tool schemas and utilities
   */
  private createExecutionContext(tools: Tool<ZodTypeAny>[]): JSExecutionContext {
    const { z } = require('zod');
    
    // Create wrapper objects that capture raw data instead of doing Zod parsing in eval
    const toolSchemas: Record<string, any> = {};
    for (const tool of tools) {
      toolSchemas[tool.name] = {
        parse: (data: any) => {
          // Just return the raw data with toolName added
          // Actual Zod parsing will happen outside eval
          return {
            ...data,
            toolName: tool.name
          };
        }
      };
    }

    return {
      toolSchemas,
      toolCalls: [],
      z
    };
  }

  /**
   * Execute with direct eval (fast, less secure)
   */
  private async executeWithEval(
    jsCode: string, 
    context: JSExecutionContext, 
    timeoutMs: number
  ): Promise<any[]> {
    return this.withTimeout(async () => {
      try {
        // Prepare variables for eval context
        const { toolSchemas, toolCalls, z } = context;

        // Extract only the callTools function body instead of dangerous regex stripping
        const functionBody = this.extractCallToolsFunctionBody(jsCode);
        
        // Make context available globally for eval
        // Store previous values to restore later
        const prevToolSchemas = (global as any).toolSchemas;
        const prevToolCalls = (global as any).toolCalls;
        const prevZ = (global as any).z;
        
        try {
          // Set global variables for eval execution
          (global as any).toolSchemas = toolSchemas;
          (global as any).toolCalls = toolCalls;
          (global as any).z = z;
          
          // Execute the code with extracted function body
          const executionCode = `
            (function() {
              function callTools() {
                ${functionBody}
              }
              return callTools();
            })();
          `;

          const result = eval(executionCode);

          if (!Array.isArray(result)) {
            throw new AgentError(
              "callTools must return array",
              AgentErrorType.INVALID_RESPONSE
            );
          }

          return result;
        } finally {
          // Restore previous global state
          if (prevToolSchemas !== undefined) {
            (global as any).toolSchemas = prevToolSchemas;
          } else {
            delete (global as any).toolSchemas;
          }
          if (prevToolCalls !== undefined) {
            (global as any).toolCalls = prevToolCalls;
          } else {
            delete (global as any).toolCalls;
          }
          if (prevZ !== undefined) {
            (global as any).z = prevZ;
          } else {
            delete (global as any).z;
          }
        }
      } catch (error) {
        throw new AgentError(
          `Eval execution error: ${error instanceof Error ? error.message : String(error)}`,
          AgentErrorType.INVALID_RESPONSE
        );
      }
    }, timeoutMs);
  }

  /**
   * Execute with SES (slower, more secure)
   */
  private async executeWithSES(
    jsCode: string,
    context: JSExecutionContext,
    timeoutMs: number
  ): Promise<any[]> {
    return this.withTimeout(async () => {
      try {
        // Lazy load SES to avoid dependency issues if not used
        const { lockdown, Compartment } = await import('ses');
        
        // Initialize SES if not already done
        this.initializeSES(lockdown);

        // Create secure endowments
        const endowments = this.createSESEndowments(context);

        // Create compartment
        const compartment = new Compartment(endowments);

        // Clean the code
        let cleanedJsCode = jsCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
        cleanedJsCode = cleanedJsCode.replace(/const\s+toolSchemas\s*=\s*\{[\s\S]*?\};?\s*/g, '');

        // Execute in compartment
        const executionCode = `
          ${cleanedJsCode}
          callTools();
        `;

        const result = compartment.evaluate(executionCode);

        if (!Array.isArray(result)) {
          throw new AgentError(
            "callTools must return array",
            AgentErrorType.INVALID_RESPONSE
          );
        }

        return result;
      } catch (error) {
        throw new AgentError(
          `SES execution error: ${error instanceof Error ? error.message : String(error)}`,
          AgentErrorType.INVALID_RESPONSE
        );
      }
    }, timeoutMs);
  }

  /**
   * Initialize SES security lockdown
   */
  private initializeSES(lockdown: any): void {
    if (!this.sesInitialized) {
      try {
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

  /**
   * Create secure endowments for SES compartment
   */
  private createSESEndowments(context: JSExecutionContext): Record<string, any> {
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
      
      // Execution context
      z: context.z,
      toolSchemas: context.toolSchemas,
      toolCalls: context.toolCalls,
      
      // Safe console
      console: Object.freeze({ 
        log: () => {}, 
        error: () => {}, 
        warn: () => {} 
      }),
    };
  }

  /**
   * Execute function with timeout protection
   */
  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new AgentError(
          `Execution timeout (${timeoutMs}ms)`,
          AgentErrorType.INVALID_RESPONSE
        ));
      }, timeoutMs);
    });

    const executionPromise = Promise.resolve().then(fn);

    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}