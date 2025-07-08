import { XMLParser } from 'fast-xml-parser';
import { BaseParser, IPendingToolCall } from "../agent-library/parsers/BaseParser"; // Adjust path if needed
import { randomUUID } from "crypto";

/**
 * The specific shape of our tool call, extending the base type.
 */
export type PendingToolCall = IPendingToolCall & {
    value: string;
};




// Raw object structure comment is fine.

export class DataAnalystParser extends BaseParser<PendingToolCall> {
    private readonly parser: XMLParser;

    constructor() {
        super();

        // Your parser options are PERFECT. Do not change them.
        const options = {
            ignoreAttributes: true,
            trimValues: true,
            // This correctly ensures that <tool> elements are always in an array.
            isArray: (_tagName: string, jPath: string) => jPath === "tool_list.tool",
            // It's good practice to prevent type coercion for IDs
            parseTagValue: false, 
        };

        this.parser = new XMLParser(options);
    }

    public parseLLMResponse(llmResponse: string): PendingToolCall[] {
        console.log("Raw LLM Response:", llmResponse);

        let parsedResult: any;
        try {
            // Using a fallback for non-XML content like a final answer.
            if (!llmResponse.trim().startsWith('<tool_list>')) {
                // If the response is just a simple string, treat it as a final answer.
                return [{
                    id: `tool-call-${Date.now()}-${randomUUID()}`,
                    name: 'final', // Or another appropriate default name
                    value: llmResponse.trim()
                }];
            }
            parsedResult = this.parser.parse(llmResponse.trim());
        } catch (error) {
            console.error("XML parsing failed:", error);
            // It's possible the LLM responded with malformed XML.
            // We can treat the raw string as a final answer as a fallback.
            return [{
                id: `tool-call-${Date.now()}-${randomUUID()}`,
                name: 'final',
                value: llmResponse.trim()
            }];
        }

       
        // --- START OF FIX ---

        // 1. Validate the structure down to the 'tool' array.
        //    The 'tool' property itself should be an array due to our parser options.
        if (!parsedResult || !parsedResult.tool_list || !Array.isArray(parsedResult.tool_list.tool)) {
            console.warn("Parsed result is missing 'tool_list.tool' array.", parsedResult);
            return [];
        }

        // 2. Directly access the array of tools. This is the main fix.
        const toolItems: any[] = parsedResult.tool_list.tool;

        // 3. The mapping logic is mostly correct, but we add robustness for types.
        const pendingCalls: PendingToolCall[] = toolItems
            .filter((tool: any) =>
                tool &&
                typeof tool.id !== "undefined" &&
                typeof tool.name === "string" &&
                // Check for the existence of value, even if its content can vary.
                typeof tool.value !== "undefined"
            )
            .map((tool: any) => ({
                // The 'id' might be parsed as a number; robustly convert it to a string.
                id: String(tool.id),
                name: tool.name,
                // The value can also be other types (e.g., a number if it's just '123').
                // Ensure it's a string to match the PendingToolCall type.
                value: String(tool.value)
            }));

        // --- END OF FIX ---

        return pendingCalls;
    }
}