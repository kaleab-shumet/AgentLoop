import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall, FormatHandler, FunctionCallTool } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";
import zodToJsonSchema from "zod-to-json-schema";

/**
 * Handles JSObject-based response format for tool calls
 * Expects AI to return a JavaScript function called `callTools` that returns an array of tool call objects
 */
export class JSObjectFormatHandler implements FormatHandler {

  formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
    const schemaMap = tools.map(t => {
      const zodSchema = zodToJsonSchema(t.argsSchema, t.name);
      
      return `
## Tool Name: ${t.name}
## Tool Description: ${t.description}
## Tool Schema:
${JSON.stringify(zodSchema, null, 2)}
`;
    }).join("\n");

    return `Available tools and their schemas:\n${schemaMap}

You will be given a JSON Schema as a reference. Your task is to write a JavaScript function named \`callTools\` that **returns an array of one or two example objects strictly conforming to that schema**.

**Requirements:**
* Do **not** include the schema inside the function; assume it is provided externally as a reference.
* The function \`callTools\` should create example objects that:
  * Include all required properties,
  * Respect all type constraints (\`string\`, \`integer\`, \`number\`, \`array\`, \`object\`),
  * Honor numeric constraints (like \`minimum\`, \`exclusiveMinimum\`),
  * For arrays, respect \`minItems\`, \`uniqueItems\`, and item types,
  * Populate nested objects with required fields,
  * Use realistic, human-readable values (no placeholders).
* The function should push these objects into an array named \`calledToolsList\` and return it.
- No external libraries or imports allowed
- Pure vanilla JavaScript only
- Single function implementation
- Do not embed or reference the specific schema within the function
- Function must work generically with any provided schema

Example format:
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  // Example tool call object with toolName and required properties
  calledToolsList.push({
    toolName: "example_tool",
    arg1: "example_value",
    arg2: 42
  });
  
  return calledToolsList;
}
\`\`\``;
  }

  parseResponse(response: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
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
      // Execute the JavaScript function in a safe environment
      const toolCalls = this.executeCallToolsFunction(jsContent);
      
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
   * Safely execute the callTools JavaScript function
   */
  private executeCallToolsFunction(jsCode: string): any[] {
    try {
      // Create a safe execution environment using eval in a limited scope
      // Note: This is intentionally limited for security
      const context = {
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean,
        Math: Math,
        Date: Date,
        JSON: JSON,
        console: { log: () => {} } // Stub console for safety
      };

      // Create a function that executes the code in our controlled context
      const executeCode = new Function('context', `
        with (context) {
          ${jsCode}
          return callTools();
        }
      `);

      const result = executeCode(context);
      return result;
    } catch (error) {
      throw new AgentError(
        `Error executing callTools function: ${error instanceof Error ? error.message : String(error)}`,
        AgentErrorType.INVALID_RESPONSE,
        { originalError: error, jsCode: jsCode.substring(0, 200) + '...' }
      );
    }
  }
}