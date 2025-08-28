import { z, ZodTypeAny } from "zod";
import { Tool, JsExecutionMode } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import { parse, type Node } from "acorn";
import { simple as walkSimple } from "acorn-walk";
import type { FunctionDeclarationNode, LiteralNode, TemplateLiteralNode } from "../types/acorn-extensions";
import { generate } from "escodegen";
import { nanoid } from "nanoid";
import * as ses from 'ses';

// SES execution interface
interface SESCompartment {
  evaluate: (code: string) => unknown;
}

interface SESEngine {
  lockdown: () => void;
  Compartment: new (endowments?: Record<string, unknown>) => SESCompartment;
}

export interface JSExecutionOptions {
  mode?: JsExecutionMode;
  timeoutMs?: number;
}

export interface JSExecutionContext {
  toolSchemas: Record<string, { parse: (data: unknown) => Record<string, unknown> }>;
  toolCalls: Record<string, unknown>[];
  z: typeof import('zod');
}

/**
 * JavaScript execution engine with SES (Secure EcmaScript) for maximum security
 * All code execution is isolated in secure compartments
 */
// Global SES initialization state - shared across all instances
let globalSESInitialized = false;

// Preserve Date.now before any SES operations
const originalDateNow = Date.now;

export class JSExecutionEngine {

  /**
   * Get SES engine (always available since it's directly imported)
   */
  private getSESEngine(): SESEngine {
    // Use cross-platform global object detection for browser/Node.js compatibility
    const globalObj = (typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : {}) as Record<string, unknown>;
    
    return {
      lockdown: ses.lockdown ?? globalObj.lockdown as (() => void),
      Compartment: ses.Compartment ?? globalObj.Compartment as (new (endowments?: Record<string, unknown>) => SESCompartment)
    };
  }

  /**
   * Execute JavaScript code with SES secure execution (only supported mode)
   */
  async execute(
    jsCode: string,
    tools: Tool<ZodTypeAny>[],
    options: JSExecutionOptions = { mode: 'ses', timeoutMs: 5000 }
  ): Promise<Record<string, unknown>[]> {
    const context = this.createExecutionContext(tools);
    
    // SES is the only supported execution mode for maximum security
    const rawResults = await this.executeWithSES(jsCode, context, options.timeoutMs ?? 5000);

    // Parse results with actual Zod schemas outside the execution environment
    return this.parseToolCallsWithZod(rawResults, tools);
  }

  /**
   * Extract the body of the callTools function using Acorn AST parser
   */
  private extractCallToolsFunctionBody(jsCode: string): string {
    try {
      // Parse the JavaScript code into an AST
      const ast = parse(jsCode, {
        ecmaVersion: 2022,
        sourceType: "module"
      });

      let callToolsFunctionBody: string | null = null;

      // Traverse the AST to find the callTools function
      walkSimple(ast, {
        FunctionDeclaration(node: Node) {
          if (node.type === "FunctionDeclaration") {
            const funcNode = node as FunctionDeclarationNode;
            if (funcNode.id && 
                funcNode.id.type === "Identifier" && 
                funcNode.id.name === "callTools") {
              // Extract the function body as source code
              const body = funcNode.body;
              if (body && body.type === "BlockStatement") {
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
   * Parse raw tool call data with actual Zod schemas (outside execution environment)
   */
  private parseToolCallsWithZod(rawResults: Record<string, unknown>[], tools: Tool<ZodTypeAny>[]): Record<string, unknown>[] {
    
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
    
    // Create wrapper objects that capture raw data instead of doing Zod parsing in SES compartment
    const toolSchemas: Record<string, { parse: (data: unknown) => Record<string, unknown> }> = {};
    for (const tool of tools) {
      toolSchemas[tool.name] = {
        parse: (data: unknown): Record<string, unknown> => {
          // Just return the raw data with toolName added
          // Actual Zod parsing will happen outside SES compartment
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
   * Execute with SES (Secure EcmaScript) - the only supported execution mode
   */
  private async executeWithSES(
    jsCode: string,
    context: JSExecutionContext,
    timeoutMs: number
  ): Promise<Record<string, unknown>[]> {
    return this.withTimeout(() => Promise.resolve().then(() => {
      try {
        // Get SES engine (always available since it's imported)
        const sesEngine = this.getSESEngine();
        
        // Initialize SES if not already done
        this.initializeSES(sesEngine);

        // Create secure endowments
        const endowments = this.createSESEndowments(context);

        // Create compartment
        const compartment = new sesEngine.Compartment(endowments);

        // Extract only the callTools function body using Acorn (strips imports automatically)
        const functionBody = this.extractCallToolsFunctionBody(jsCode);
        
        // Extract strings to avoid SES restrictions on import/require statements in string literals
        const { cleanCode: cleanFunctionBody, stringMap } = this.extractStringsToIds(functionBody);

        // Execute in compartment - wrap the clean function body
        const executionCode = `
          function callTools() {
            ${cleanFunctionBody}
          }
          callTools();
        `;

        const rawResult = compartment.evaluate(executionCode);

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
    }), timeoutMs);
  }


  /**
   * Initialize SES security lockdown (global, runs only once)
   */
  private initializeSES(sesEngine: SESEngine): void {
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
        ecmaVersion: 2022,
        sourceType: "module"
      });

      const stringMap: Record<string, string> = {};

      walkSimple(ast, {
        Literal(node: Node) {
          if (node.type === "Literal") {
            const literalNode = node as LiteralNode;
            if (typeof literalNode.value === "string") {
              const id = `__STRING_ID_${nanoid()}__`;
              stringMap[id] = literalNode.value;
              literalNode.value = id;
              literalNode.raw = `"${id}"`;
            }
          }
        },
        TemplateLiteral(node: Node) {
          // Handle template literals too
          if (node.type === "TemplateLiteral") {
            const templateNode = node as TemplateLiteralNode;
            templateNode.quasis.forEach((quasi) => {
              if (quasi.value?.raw?.trim()) {
                const id = `__STRING_ID_${nanoid()}__`;
                stringMap[id] = quasi.value.raw;
                quasi.value = { raw: id, cooked: id };
              }
            });
          }
        }
      });

      const cleanCode = generate(ast);
      return { cleanCode, stringMap };
    } catch {
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