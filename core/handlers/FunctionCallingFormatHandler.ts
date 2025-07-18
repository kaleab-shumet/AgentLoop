import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCall, FunctionDefinition, FunctionCallingTool } from "../types/types";
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
        `Invalid arguments for function "${functionName}": ${JSON.stringify(result.error.issues)}`,
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
        functionCallList = [parsedJson];
      } else {
        // Assume it's a single function call object
        functionCallList = [parsedJson];
      }

      const fclist: PendingToolCall[] = functionCallList.map((fc: any) => this.parseFunctionCall(fc, tools))
      return fclist

    }

    throw new AgentError(
      "No function call json found in response", 
      AgentErrorType.INVALID_RESPONSE,
      { response: response.substring(0, 500) + (response.length > 500 ? '...' : '') }
    );

  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): FunctionCallingTool[] {
    return tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.argsSchema // Keep original Zod schema for direct use
      }
    }));

  }


  getFormatInstructions(finalToolName: string): string {
    // Format instructions are now centralized in PromptTemplates
    // This handler just needs to specify that it uses function calling format
    // The actual instructions are provided by PromptManager
    return 'FUNCTION_FORMAT'; // Marker for prompt manager to use function format instructions
  }


  parseWithRetry(jsonStr: string): any {

    let jsVal = JSON.stringify(jsonStr)
    let c = 0;
    while (typeof jsVal === "string" && c < 2) {
      try {
        jsVal = JSON.parse(jsVal)
      }
      catch {
        break;
      }
      c++;
    }
    return jsVal;

  }







}