import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCall, FunctionDefinition, FunctionCallTool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from 'zod-to-json-schema';

/**
 * Handles OpenAI-style function calling format
 */
export class FunctionCallingFormatHandler implements FormatHandler {


  parseFunctionCall(functionData: any, tools: Tool<ZodTypeAny>[]): PendingToolCall {
    // Handle both single function call and the case where this is called on individual items from an array
    let functionCall = functionData.function_call || functionData.functionCall;

    // If this is already a function call object with name and arguments, use it directly
    if (functionData.name && functionData.arguments) {
      functionCall = functionData;
    }

    if (!functionCall || typeof functionCall.arguments !== 'string' || typeof functionCall.name !== 'string') {
      throw new AgentError(
        "Invalid function call format - missing required fields or invalid types", 
        AgentErrorType.INVALID_RESPONSE,
        { functionCall, expectedFormat: { name: 'string', arguments: 'string' } }
      );
    }

    const functionCallArgs: string = functionCall.arguments;
    const functionName: string = functionCall.name;

    const correspondingTool = tools.find(t => t.name === functionName);
    if (!correspondingTool) {
      throw new AgentError(
        `No tool found for function name: ${functionName}`, 
        AgentErrorType.TOOL_NOT_FOUND,
        { toolName: functionName, availableTools: tools.map(t => t.name) }
      );
    }

    const candidatePendingTool = this.parseWithRetry(functionCallArgs);

    if (typeof candidatePendingTool === "string") {
      // Remove debug logging - not needed in production
    }

    const result = correspondingTool.argsSchema.safeParse(candidatePendingTool);

    if (!result.success) {
      throw new AgentError(
        `Invalid arguments for function "${functionName}": ${result.error.message}`,
        AgentErrorType.INVALID_INPUT,
        { 
          toolName: functionName, 
          validationErrors: result.error.issues,
          receivedArgs: candidatePendingTool,
          expectedSchema: correspondingTool.argsSchema
        }
      );
    }

    candidatePendingTool.toolName = functionName;

    return candidatePendingTool;

  }


  parseResponse(response: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {

    // Check if response contains function calls in JSON format
    const jsonMatch = response.match(/```json\s*\n([\s\S]+?)\n?```/);
    if (jsonMatch) {
      const jsonContent = jsonMatch[1].trim();

      let parsedJson = JSON.parse(jsonContent);
      let functionCallList: any[] = [];

      // Handle different response formats from Gemini
      if (Array.isArray(parsedJson)) {
        // Direct array of function calls
        functionCallList = parsedJson;
      } else if (parsedJson.functionCalls && Array.isArray(parsedJson.functionCalls)) {
        // Multiple function calls: { "functionCalls": [...] }
        functionCallList = parsedJson.functionCalls;
      } else if (parsedJson.functionCall) {
        // Single function call: { "functionCall": {...} }
        functionCallList = [parsedJson.functionCall];
      } else {
        // Assume it's a single function call object
        functionCallList = [parsedJson];
      }

      const fclist: PendingToolCall[] = functionCallList.map((fc: any) => this.parseFunctionCall(fc, tools))
      return fclist

    }

    throw new AgentError(
      "No function calling json found in response", 
      AgentErrorType.INVALID_RESPONSE,
      { response: response.substring(0, 500) + (response.length > 500 ? '...' : '') }
    );

  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): FunctionCallTool[] {
    return tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.argsSchema // Keep original Zod schema for direct use
      }
    }));

  }


  private getFormatInstructions(finalToolName: string): string {
    // Format instructions are now centralized in PromptTemplates
    // This handler just needs to specify that it uses function calling format
    // The actual instructions are provided by PromptManager
    return 'FUNCTION_FORMAT'; // Marker for prompt manager to use function format instructions
  }


  parseWithRetry(jsonStr: string): any {
    try {
      // First, try to parse the string directly
      return JSON.parse(jsonStr);
    } catch (error) {
      // If that fails, check if it's already a JavaScript object
      if (typeof jsonStr !== 'string') {
        return jsonStr;
      }
      
      // Try to handle double-encoded JSON (string inside string)
      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed === 'string') {
          return JSON.parse(parsed);
        }
        return parsed;
      } catch (secondError) {
        // If all parsing attempts fail, throw the original error
        throw new AgentError(
          `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
          AgentErrorType.INVALID_RESPONSE,
          { originalInput: jsonStr, parseError: error }
        );
      }
    }
  }







}