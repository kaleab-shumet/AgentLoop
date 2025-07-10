// Enhanced LLMDataHandler.ts

import LLM from "@themaximalist/llm.js"
import { AIProvider } from "./AIProvider";
import { ZodTypeAny } from "zod";
import { Tool, PendingToolCall } from "./types";
import { XMLParser } from 'fast-xml-parser';
import { AgentError, AgentErrorType } from "./AgentError";

export interface LLMConfig {
    apiKey: string;
    model?: string;
    service?: string;
    temperature?: number;
    maxTokens?: number;
}

export class LLMDataHandler implements AIProvider {
    private config: LLMConfig;

    constructor(config: LLMConfig) {
        this.config = {
            model: "gemini-1.5-flash",
            service: "google",
            temperature: 0.7,
            maxTokens: 4000,
            ...config
        };
    }

    /**
     * Enhanced parsing and validation with better error handling
     */
    parseAndValidate(llmResponse: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
        const xmlContent = this.extractCode(llmResponse, 'xml');
        if (!xmlContent) {
            throw new AgentError("[LLMDataHandler] No XML code block found in LLM response. Possible reasons: missing or invalid XML code block, or incorrect response format. Hint: Ensure your prompt requests XML output wrapped in triple backticks.", AgentErrorType.INVALID_RESPONSE)
        }

        let parsedJs;
        try {
            parsedJs = this.parseXmlToJs(xmlContent);
        } catch (error: any) {
            console.error("[LLMDataHandler] Failed to parse XML.", { error: error.message });
            throw new AgentError(`[LLMDataHandler] Failed to parse XML. Details: ${error.message}. Possible causes: malformed XML syntax or unexpected structure. Hint: Check the LLM's XML output for errors.`, AgentErrorType.INVALID_RESPONSE)
        }

        const root = parsedJs?.root;

        let toolCalls: Array<any> = [];

        for (const value of Object.values(root)) {
            if (Array.isArray(value)) {
                toolCalls.push(...value);
            } else {
                toolCalls.push(value);
            }
        }


        if (!toolCalls) {
            throw new AgentError(`[LLMDataHandler] No tool calls found in the parsed XML. The <root> element may be empty or missing tool definitions. Hint: Ensure the LLM response includes at least one valid tool call inside <root>.`, AgentErrorType.TOOL_NOT_FOUND)    
        }


        const validToolCalls: PendingToolCall[] = [];

        for (const call of toolCalls) {


            if (typeof call.name !== 'string') {
                throw new AgentError(`[LLMDataHandler] Tool call is missing a valid 'name' property or is malformed. Offending tool: ${JSON.stringify(call)}. Hint: Each tool call must have a 'name' property matching a known tool.`, AgentErrorType.MALFORMED_TOOL_FOUND)    
            }

            const toolDef = tools.find(t => t.name === call.name);
            if (!toolDef) {
                throw new AgentError(`[LLMDataHandler] Tool "${call.name}" does not exist. Available tools: ${tools.map(t => t.name).join(", ")}. Hint: Check for typos or update your tool definitions.`, AgentErrorType.TOOL_NOT_FOUND)    
            }

            const validation = toolDef.responseSchema.safeParse(call);
            if (!validation.success) {
                throw new AgentError(`[LLMDataHandler] Tool "${call.name}" has an invalid schema. Validation errors: ${JSON.stringify(validation.error?.issues)}. Hint: Ensure the tool call matches the expected schema for "${call.name}".`, AgentErrorType.TOOL_NOT_FOUND)   
            }

            validToolCalls.push(validation.data as PendingToolCall);
        }

        return validToolCalls;
    }

    /**
     * Enhanced completion with better error handling and configuration
     */
    async getCompletion(prompt: string): Promise<string> {
        console.log("\n[LLMDataHandler] Sending prompt to LLM... (showing first 500 chars)");
        console.log(prompt.substring(0, 500) + '...');
        console.log("----------------------------------\n");

        try {
            if (!this.config.apiKey || this.config.apiKey === "YOUR_API_KEY_HERE") {
                throw new AgentError(
                    "API key not configured. Please set the apiKey in your agent configuration.",
                    AgentErrorType.INVALID_RESPONSE
                );
            }

            let res = "";
            const response = await LLM(prompt, {
                model: this.config.model,
                service: this.config.service,
                apiKey: this.config.apiKey,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
            });

            for await (const message of response) {
                res += message;
            }

            console.log("\n[LLMDataHandler] Received response from LLM:");
            console.log(res);
            console.log("----------------------------------\n");

            return res;
        } catch (error: any) {

            throw error;
        }
    }

    /**
     * Extract code block from markdown
     */
    private extractCode(content: string, language: string = 'xml'): string | null {
        const regex = new RegExp("```" + language + "\\s*\\n([\\s\\S]+?)\\n?```");
        const match = content.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Parse XML to JavaScript object
     */
    private parseXmlToJs(xml: string): any {
        const parser = new XMLParser({
            ignoreAttributes: true,
            removeNSPrefix: true,
            parseAttributeValue: false,
            trimValues: true,
        });
        return parser.parse(xml);
    }
}

