import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, ResponseHandler, FunctionCall, FunctionDefinition } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from 'zod-to-json-schema';

/**
 * Handles OpenAI-style function calling format
 */
export class FunctionCallingResponseHandler implements ResponseHandler {
  parseResponse(response: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
    // Try to parse as JSON first (direct function call format)
    let functionCalls: FunctionCall[] = [];
    
    try {
      // Check if response contains function calls in JSON format
      const jsonMatch = response.match(/```json\s*\n([\s\S]+?)\n?```/);
      if (jsonMatch) {
        const jsonContent = jsonMatch[1].trim();
        const parsed = JSON.parse(jsonContent);
        
        // Handle both single function call and array of function calls
        if (parsed.function_call) {
          functionCalls = [parsed.function_call];
        } else if (parsed.function_calls) {
          functionCalls = parsed.function_calls;
        } else if (Array.isArray(parsed)) {
          functionCalls = parsed;
        } else if (parsed.name && parsed.arguments) {
          functionCalls = [parsed];
        }
      } else {
        // Try to extract function calls from structured response
        const directMatch = response.match(/\[FUNCTION_CALLS?\]\s*([\s\S]+?)\s*\[\/FUNCTION_CALLS?\]/);
        if (directMatch) {
          const callsContent = directMatch[1].trim();
          const parsed = JSON.parse(callsContent);
          functionCalls = Array.isArray(parsed) ? parsed : [parsed];
        }
      }
    } catch (error) {
      throw new AgentError(
        `[FunctionCallingResponseHandler] Failed to parse function calls from response. Error: ${error}. Response: ${response.slice(0, 200)}...`,
        AgentErrorType.INVALID_RESPONSE
      );
    }

    if (functionCalls.length === 0) {
      throw new AgentError(
        `[FunctionCallingResponseHandler] No function calls found in response. Expected JSON format with function_call or function_calls. Response: ${response.slice(0, 200)}...`,
        AgentErrorType.TOOL_NOT_FOUND
      );
    }

    const validToolCalls: PendingToolCall[] = [];

    for (const call of functionCalls) {
      if (!call.name || typeof call.name !== 'string') {
        throw new AgentError(
          `[FunctionCallingResponseHandler] Function call is missing a valid 'name' property. Call: ${JSON.stringify(call)}`,
          AgentErrorType.MALFORMED_TOOL_FOUND
        );
      }

      const toolDef = tools.find(t => t.name === call.name);
      if (!toolDef) {
        throw new AgentError(
          `[FunctionCallingResponseHandler] Function "${call.name}" does not exist. Available tools: ${tools.map(t => t.name).join(", ")}`,
          AgentErrorType.TOOL_NOT_FOUND
        );
      }

      let parsedArgs: any;
      try {
        parsedArgs = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      } catch (error) {
        throw new AgentError(
          `[FunctionCallingResponseHandler] Invalid arguments for function "${call.name}". Arguments must be valid JSON. Error: ${error}`,
          AgentErrorType.MALFORMED_TOOL_FOUND
        );
      }

      // Add the name to the parsed arguments to match Tool interface expectations
      const toolCallData = { name: call.name, ...parsedArgs };

      const validation = toolDef.responseSchema.safeParse(toolCallData);
      if (!validation.success) {
        throw new AgentError(
          `[FunctionCallingResponseHandler] Function "${call.name}" has invalid arguments. Validation errors: ${JSON.stringify(validation.error?.issues)}`,
          AgentErrorType.TOOL_NOT_FOUND
        );
      }

      validToolCalls.push(validation.data as PendingToolCall);
    }

    return validToolCalls;
  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    const functionDefinitions: FunctionDefinition[] = tools.map(tool => {
      const jsonSchema = zodToJsonSchema(tool.responseSchema, tool.name) as any;
      
      // Remove the 'name' property from parameters since it's handled separately
      const parameters = { ...jsonSchema };
      if (parameters.properties && typeof parameters.properties === 'object' && parameters.properties.name) {
        delete parameters.properties.name;
      }
      if (parameters.required && Array.isArray(parameters.required)) {
        parameters.required = parameters.required.filter((req: string) => req !== 'name');
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: parameters.properties || {},
          required: parameters.required || []
        }
      };
    });

    return JSON.stringify(functionDefinitions, null, 2);
  }

  getFormatInstructions(tools: Tool<ZodTypeAny>[], finalToolName: string, parallelExecution: boolean): string {
    const executionStrategyPrompt = parallelExecution ? 
      "You can call multiple functions concurrently in a single response." : 
      "You should call functions sequentially. If one function fails, retry and fix it before continuing.";

    return `You MUST respond by calling one or more functions. Use the following JSON format enclosed in \`\`\`json ... \`\`\`. 

**CRITICAL TERMINATION RULES:**
1. **NEVER REPEAT SUCCESSFUL OPERATIONS:** Before making any function call, check the function call history. If a function has already succeeded for the same purpose, DO NOT call it again.
2. **MANDATORY TERMINATION:** You MUST call the '${finalToolName}' function when:
   - You have successfully completed the user's request
   - All required information has been gathered or operations completed
   - You can provide a complete answer to the user
3. **SINGLE FINAL FUNCTION:** When using '${finalToolName}', it must be the ONLY function in your response.
4. **NO REDUNDANT WORK:** If the history shows a task is complete, immediately use '${finalToolName}' with the results.

**WORKFLOW DECISION PROCESS:**
- Check history → Identify what's been done → Determine what's still needed → Either do remaining work OR use '${finalToolName}' if complete

**Format for single function call:**
\`\`\`json
{
  "function_call": {
    "name": "function_name",
    "arguments": "{\"param1\": \"value1\", \"param2\": \"value2\"}"
  }
}
\`\`\`

**Example of completing after successful operations:**
\`\`\`json
{
  "function_call": {
    "name": "${finalToolName}",
    "arguments": "{\"value\": \"I have successfully completed your request. [Summarize what was accomplished based on the history]\"}"
  }
}
\`\`\`

- **Execution Strategy:** ${executionStrategyPrompt}`;
  }
}