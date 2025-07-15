import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, ResponseHandler, FunctionCall, FunctionDefinition } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from 'zod-to-json-schema';

/**
 * Handles OpenAI-style function calling format
 */
export class FunctionCallingResponseHandler implements ResponseHandler {


  parseFunctionCall(functionData: any, tools: Tool<ZodTypeAny>[]): PendingToolCall {
    // Handle both single function call and the case where this is called on individual items from an array
    let functionCall = functionData.function_call || functionData.functionCall;
    
    // If this is already a function call object with name and arguments, use it directly
    if (functionData.name && functionData.arguments) {
      functionCall = functionData;
    }
    
    if (!functionCall || typeof functionCall.arguments !== 'string' || typeof functionCall.name !== 'string') {
      throw new AgentError("Invalid function call format", AgentErrorType.INVALID_RESPONSE);
    }

    const functionCallArgs: string = functionCall.arguments;
    const functionName: string = functionCall.name;

    const correspondingTool = tools.find(t => t.name === functionName);
    if (!correspondingTool) {
      throw new AgentError(`No tool found for function name: ${functionName}`, AgentErrorType.TOOL_NOT_FOUND);
    }

    const candidatePendingTool = this.parseWithRetry(functionCallArgs);

    if(typeof candidatePendingTool === "string"){
        console.log("candidatePendingTool: ", candidatePendingTool)
    }

    const result = correspondingTool.argsSchema.safeParse(candidatePendingTool);

    if (!result.success) {
      throw new AgentError(
        `Invalid arguments for function "${functionName}": ${JSON.stringify(result.error.issues)}`,
        AgentErrorType.INVALID_SCHEMA
      );
    }

    candidatePendingTool.name = functionName;


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

    throw new AgentError("No function call json found in response", AgentErrorType.INVALID_RESPONSE);

  }

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    const functionDefinitions: FunctionDefinition[] = tools.map(tool => {
      const jsonSchema = zodToJsonSchema(tool.argsSchema, tool.name) as any;

      // Extract the actual schema from definitions if using $ref structure
      let actualSchema = jsonSchema;
      if (jsonSchema.$ref && jsonSchema.definitions && jsonSchema.definitions[tool.name]) {
        actualSchema = jsonSchema.definitions[tool.name];
      }

      // Remove the 'name' property from parameters since it's handled separately
      const properties = { ...actualSchema.properties || {} };
      if (properties.name) {
        delete properties.name;
      }

      let required = actualSchema.required || [];
      if (Array.isArray(required)) {
        required = required.filter((req: string) => req !== 'name');
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: properties,
          required: required
        }
      };
    });

    return JSON.stringify(functionDefinitions, null, 2);
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
    while (typeof jsVal === "string" && c < 20) {
      try {
        jsVal = JSON.parse(jsVal)
      }
      catch {
        jsVal = JSON.stringify(jsVal)
        c = c/2
      }
      c++;
    }
    return jsVal;

  }







}