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
    
    if (options.mode === 'ses') {
      return this.executeWithSES(jsCode, context, options.timeoutMs || 5000);
    } else {
      return this.executeWithEval(jsCode, context, options.timeoutMs || 5000);
    }
  }

  /**
   * Create execution context with tool schemas and utilities
   */
  private createExecutionContext(tools: Tool<ZodTypeAny>[]): JSExecutionContext {
    const { z } = require('zod');
    
    // Generate toolSchemas object
    const toolSchemas: Record<string, any> = {};
    for (const tool of tools) {
      const schema = tool.argsSchema as any;
      if (schema.extend) {
        toolSchemas[tool.name] = schema.extend({ 
          toolName: z.string().default(tool.name) 
        });
      } else {
        // Fallback for schemas that don't support extend
        toolSchemas[tool.name] = z.object({
          ...schema._def?.shape || {},
          toolName: z.string().default(tool.name)
        });
      }
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

        // Strip import statements
        const cleanedJsCode = jsCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
        
        // Execute with available context
        const executionCode = `
          (function() {
            ${cleanedJsCode}
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