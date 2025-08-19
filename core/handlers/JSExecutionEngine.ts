import { ZodTypeAny } from "zod";
import { Tool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { nanoid } from "nanoid";

export type ExecutionMode = 'eval' | 'ses' | 'websandbox';

// Optional security engine interfaces
interface SESEngine {
  lockdown: () => void;
  Compartment: any; // Use any to avoid complex typing issues
}

interface WebSandboxEngine {
  create: (api?: Record<string, any>) => {
    promise: Promise<{
      run: (code: string | Function) => any;
      injectStyle?: (css: string) => void;
    }>;
  };
}

export interface JSExecutionOptions {
  mode: ExecutionMode;
  timeoutMs?: number;
}

export interface JSExecutionContext {
  toolSchemas: Record<string, { parse: (data: unknown) => Record<string, unknown> }>;
  toolCalls: Record<string, unknown>[];
  z: typeof import('zod');
}

/**
 * JavaScript execution engine with pluggable security modes
 * Supports both direct eval and SES execution
 */
// Global SES initialization state - shared across all instances
let globalSESInitialized = false;

// Preserve Date.now before any SES operations
const originalDateNow = Date.now;

export class JSExecutionEngine {

  /**
   * Detect available security engines
   */
  private async detectSecurityEngines(): Promise<{
    ses?: SESEngine;
    websandbox?: WebSandboxEngine;
  }> {
    const engines: { ses?: SESEngine; websandbox?: WebSandboxEngine } = {};

    // Try to load SES (Node.js environments)
    try {
      const sesModule = await import('ses');
      engines.ses = {
        lockdown: sesModule.lockdown || (globalThis as any).lockdown,
        Compartment: sesModule.Compartment || (globalThis as any).Compartment
      };
    } catch {
      // SES not available
    }

    // Try to load WebSandbox (Browser environments)
    try {
      const wsModule = await Function('return import("@jetbrains/websandbox")')() as any;
      engines.websandbox = wsModule.default || wsModule;
    } catch {
      // WebSandbox not available
    }

    return engines;
  }

  /**
   * Validate that the requested execution mode is available
   */
  private async validateExecutionMode(requestedMode: ExecutionMode): Promise<void> {
    if (requestedMode === 'eval') {
      // Eval is always available
      return;
    }

    const engines = await this.detectSecurityEngines();
    
    if (requestedMode === 'ses' && !engines.ses) {
      throw new AgentError(
        'SES execution mode requested but SES is not installed. Install "ses" package or use mode: "eval"',
        AgentErrorType.CONFIGURATION_ERROR
      );
    }
    
    if (requestedMode === 'websandbox' && !engines.websandbox) {
      throw new AgentError(
        'WebSandbox execution mode requested but WebSandbox is not installed. Install "@jetbrains/websandbox" package or use mode: "eval"',
        AgentErrorType.CONFIGURATION_ERROR
      );
    }
  }

  /**
   * Execute JavaScript code with the specified security mode
   */
  async execute(
    jsCode: string,
    tools: Tool<ZodTypeAny>[],
    options: JSExecutionOptions = { mode: 'eval', timeoutMs: 5000 }
  ): Promise<Record<string, unknown>[]> {
    const context = this.createExecutionContext(tools);
    
    // Validate that the requested mode is available
    await this.validateExecutionMode(options.mode);
    
    let rawResults: Record<string, unknown>[];
    switch (options.mode) {
      case 'ses':
        rawResults = await this.executeWithSES(jsCode, context, options.timeoutMs ?? 5000);
        break;
      case 'websandbox':
        rawResults = await this.executeWithWebSandbox(jsCode, context, options.timeoutMs ?? 5000);
        break;
      case 'eval':
        rawResults = await this.executeWithEval(jsCode, context, options.timeoutMs ?? 5000);
        break;
    }

    // Now do the actual Zod parsing outside eval with preserved string values
    return this.parseToolCallsWithZod(rawResults, tools);
  }

  /**
   * Extract the body of the callTools function using Babel AST parser
   */
  private extractCallToolsFunctionBody(jsCode: string): string {
    try {
      // Parse the JavaScript code into an AST
      const ast = parse(jsCode, {
        sourceType: "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: ["jsx", "typescript"]
      });

      let callToolsFunctionBody: string | null = null;

      // Traverse the AST to find the callTools function
      traverse(ast, {
        FunctionDeclaration(path) {
          if (t.isIdentifier(path.node.id) && path.node.id.name === "callTools") {
            // Extract the function body as source code
            const body = path.node.body;
            if (t.isBlockStatement(body)) {
              // Get the source location of the function body
              const start = body.start;
              const end = body.end;
              if (start !== null && start !== undefined && end !== null && end !== undefined) {
                // Extract body content (without the braces)
                const bodyWithBraces = jsCode.substring(start, end);
                callToolsFunctionBody = bodyWithBraces.slice(1, -1).trim(); // Remove { and }
              }
            }
          }
        }
      });

      if (!callToolsFunctionBody) {
        throw new AgentError(
          "callTools function not found",
          AgentErrorType.INVALID_RESPONSE
        );
      }

      return callToolsFunctionBody;
    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError(
        `Failed to parse JavaScript code: ${error instanceof Error ? error.message : String(error)}`,
        AgentErrorType.INVALID_RESPONSE
      );
    }
  }

  /**
   * Parse raw tool call data with actual Zod schemas (outside eval environment)
   */
  private parseToolCallsWithZod(rawResults: Record<string, unknown>[], tools: Tool<ZodTypeAny>[]): Record<string, unknown>[] {
    const { z } = require('zod');
    
    return rawResults.map((rawToolCall: Record<string, unknown>) => {
      if (!rawToolCall || typeof rawToolCall !== 'object' || !rawToolCall.toolName || typeof rawToolCall.toolName !== 'string') {
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

      // Extend schema with toolName default - we know argsSchema has extend method from Zod
      const extendedSchema = (correspondingTool.argsSchema as ZodTypeAny & { extend: (obj: Record<string, unknown>) => ZodTypeAny }).extend({ 
        toolName: z.string().default(toolName) 
      });
      
      // Use safeParse and let defaults be applied
      const result = extendedSchema.safeParse(rawToolCall);
      if (!result.success) {
        const errorDetails = result.error.errors.map((err: { path: (string | number)[]; message: string }) => {
          const path = Array.isArray(err.path) ? err.path.join('.') : 'unknown';
          return `${path}: ${err.message}`;
        }
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
    const toolSchemas: Record<string, { parse: (data: unknown) => Record<string, unknown> }> = {};
    for (const tool of tools) {
      toolSchemas[tool.name] = {
        parse: (data: unknown): Record<string, unknown> => {
          // Just return the raw data with toolName added
          // Actual Zod parsing will happen outside eval
          return {
            ...(data as Record<string, unknown>),
            toolName: tool.name
          };
        }
      };
    }

    return {
      toolSchemas,
      toolCalls: [],
      z: z as typeof import('zod')
    };
  }

  /**
   * Execute with direct eval (fast, less secure)
   */
  private async executeWithEval(
    jsCode: string, 
    context: JSExecutionContext, 
    timeoutMs: number
  ): Promise<Record<string, unknown>[]> {
    return this.withTimeout(() => Promise.resolve().then(() => {
      try {
        // Prepare variables for eval context
        const { toolSchemas, toolCalls, z } = context;

        // Extract only the callTools function body instead of dangerous regex stripping
        const functionBody = this.extractCallToolsFunctionBody(jsCode);
        
        // Make context available globally for eval
        // Store previous values to restore later
        const prevToolSchemas = (global as Record<string, unknown>).toolSchemas;
        const prevToolCalls = (global as Record<string, unknown>).toolCalls;
        const prevZ = (global as Record<string, unknown>).z;
        
        try {
          // Set global variables for eval execution
          (global as Record<string, unknown>).toolSchemas = toolSchemas;
          (global as Record<string, unknown>).toolCalls = toolCalls;
          (global as Record<string, unknown>).z = z;
          
          // Execute the code with extracted function body
          const executionCode = `
            (function() {
              function callTools() {
                ${functionBody}
              }
              return callTools();
            })();
          `;

          // Intentional use of eval for secure JavaScript execution engine
          // This code runs in a SES compartment for security
          const result = eval(executionCode) as unknown;

          if (!Array.isArray(result)) {
            throw new AgentError(
              "callTools must return array",
              AgentErrorType.INVALID_RESPONSE
            );
          }

          return result as Record<string, unknown>[];
        } finally {
          // Restore previous global state
          if (prevToolSchemas !== undefined) {
            (global as Record<string, unknown>).toolSchemas = prevToolSchemas;
          } else {
            delete (global as Record<string, unknown>).toolSchemas;
          }
          if (prevToolCalls !== undefined) {
            (global as Record<string, unknown>).toolCalls = prevToolCalls;
          } else {
            delete (global as Record<string, unknown>).toolCalls;
          }
          if (prevZ !== undefined) {
            (global as Record<string, unknown>).z = prevZ;
          } else {
            delete (global as Record<string, unknown>).z;
          }
        }
      } catch (error) {
        throw new AgentError(
          `Eval execution error: ${error instanceof Error ? error.message : String(error)}`,
          AgentErrorType.INVALID_RESPONSE
        );
      }
    }), timeoutMs);
  }

  /**
   * Execute with SES (slower, more secure)
   */
  private async executeWithSES(
    jsCode: string,
    context: JSExecutionContext,
    timeoutMs: number
  ): Promise<Record<string, unknown>[]> {
    return this.withTimeout(async () => {
      try {
        // SES is now imported at the top of the file
        
        const engines = await this.detectSecurityEngines();
        if (!engines.ses) {
          throw new Error('SES not available');
        }
        
        // Initialize SES if not already done
        await this.initializeSES(engines.ses);

        // Create secure endowments
        const endowments = this.createSESEndowments(context);

        // Create compartment
        const compartment = new engines.ses.Compartment(endowments);

        // Extract only the callTools function body using Babel (strips imports automatically)
        const functionBody = this.extractCallToolsFunctionBody(jsCode);
        
        // Extract strings to avoid SES restrictions on import/eval/require in string literals
        const { cleanCode: cleanFunctionBody, stringMap } = this.extractStringsToIds(functionBody);

        // Execute in compartment - wrap the clean function body
        const executionCode = `
          function callTools() {
            ${cleanFunctionBody}
          }
          callTools();
        `;

        const rawResult = compartment.evaluate(executionCode) as unknown;

        if (!Array.isArray(rawResult)) {
          throw new AgentError(
            "callTools must return array",
            AgentErrorType.INVALID_RESPONSE
          );
        }

        // Restore original strings from IDs
        const result = this.restoreStringsFromIds(rawResult, stringMap);

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
   * Execute with WebSandbox (browser-friendly, lightweight security)
   */
  private async executeWithWebSandbox(
    jsCode: string,
    context: JSExecutionContext,
    timeoutMs: number
  ): Promise<Record<string, unknown>[]> {
    return this.withTimeout(async () => {
      try {
        const engines = await this.detectSecurityEngines();
        if (!engines.websandbox) {
          throw new Error('WebSandbox not available');
        }

        // Extract function body and prepare API
        const functionBody = this.extractCallToolsFunctionBody(jsCode);
        const { cleanCode: cleanFunctionBody, stringMap } = this.extractStringsToIds(functionBody);

        // Prepare API for sandbox communication
        const sandboxApi = {
          // Execution context
          z: context.z,
          toolSchemas: context.toolSchemas,
          toolCalls: context.toolCalls,
          Array: Array,
          Object: Object,
          String: String,
          Number: Number,
          Boolean: Boolean,
          Math: Math,
          JSON: JSON,
        };

        // Create sandbox
        const sandbox = await engines.websandbox.create(sandboxApi).promise;

        // Create execution function with clean code
        const executionFunction = new Function('', `
          function callTools() {
            ${cleanFunctionBody}
          }
          return callTools();
        `);

        // Execute in sandbox
        const result = sandbox.run(executionFunction);

        // Restore string values
        let resultStr = JSON.stringify(result);
        for (const [id, originalString] of Object.entries(stringMap)) {
          resultStr = resultStr.replace(new RegExp(id, 'g'), originalString);
        }

        return JSON.parse(resultStr) as Record<string, unknown>[];
      } catch (error) {
        throw new AgentError(
          `WebSandbox execution error: ${error instanceof Error ? error.message : String(error)}`,
          AgentErrorType.INVALID_RESPONSE
        );
      }
    }, timeoutMs);
  }

  /**
   * Initialize SES security lockdown (global, runs only once)
   */
  private async initializeSES(sesEngine: SESEngine): Promise<void> {
    if (!globalSESInitialized) {
      try {
        // Use basic lockdown
        sesEngine.lockdown();
        
        globalSESInitialized = true;
        console.log('[JSExecutionEngine] SES lockdown initialized successfully');
      } catch (error) {
        // SES lockdown failed, but mark as initialized to prevent retries
        globalSESInitialized = true;
        console.log('[JSExecutionEngine] SES already locked down or failed:', error instanceof Error ? error.message : String(error));
        
        // Don't throw error - continue with SES compartment creation
        // The compartment will still work even if lockdown failed
      } finally {
        // Always restore Date.now regardless of lockdown success/failure
        if (typeof Date.now !== 'function' || isNaN(Date.now())) {
          console.log('[JSExecutionEngine] Restoring Date.now functionality');
          Date.now = originalDateNow;
        }
      }
    }
  }

  /**
   * Create secure endowments for SES compartment
   */
  private createSESEndowments(context: JSExecutionContext): Record<string, unknown> {
    return {
      // Safe constructors
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      
      // Safe utilities - no Date to avoid read-only issues
      Math: Math,
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
   * Extract all string literals and replace with unique IDs to avoid SES restrictions
   */
  private extractStringsToIds(jsCode: string): { cleanCode: string; stringMap: Record<string, string> } {
    try {
      const ast = parse(jsCode, {
        sourceType: "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: ["jsx", "typescript"]
      });

      const stringMap: Record<string, string> = {};

      traverse(ast, {
        StringLiteral(path) {
          const id = `__STRING_ID_${nanoid()}__`;
          stringMap[id] = path.node.value;
          path.node.value = id;
        },
        TemplateLiteral(path) {
          // Handle template literals too
          path.node.quasis.forEach(quasi => {
            if (quasi.value.raw.trim()) {
              const id = `__STRING_ID_${nanoid()}__`;
              stringMap[id] = quasi.value.raw;
              quasi.value = { raw: id, cooked: id };
            }
          });
        }
      });

      const cleanCode = generate(ast).code;
      return { cleanCode, stringMap };
    } catch (error) {
      // If parsing fails, return original code (fallback)
      return { cleanCode: jsCode, stringMap: {} };
    }
  }

  /**
   * Restore original strings from IDs in the execution results
   */
  private restoreStringsFromIds(results: Record<string, unknown>[], stringMap: Record<string, string>): Record<string, unknown>[] {
    if (Object.keys(stringMap).length === 0) {
      return results; // No strings were extracted
    }

    try {
      // Convert to JSON string, replace all IDs, then parse back
      const jsonString = JSON.stringify(results);
      const restoredJsonString = jsonString.replace(
        /__STRING_ID_[A-Za-z0-9_-]+__/g,
        (match) => {
          const originalString = stringMap[match];
          if (originalString !== undefined) {
            // Re-escape the string for JSON
            return JSON.stringify(originalString).slice(1, -1); // Remove surrounding quotes
          }
          return match; // Keep ID if not found (shouldn't happen)
        }
      );
      return JSON.parse(restoredJsonString);
    } catch (error) {
      // If restoration fails, return original results
      console.warn('[JSExecutionEngine] String restoration failed:', error);
      return results;
    }
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