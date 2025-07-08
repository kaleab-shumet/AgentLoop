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
      console.error("[LLMDataHandler] No XML code block found in LLM response.");
      return [];
    }

    let parsedJs;
    try {
      parsedJs = this.parseXmlToJs(xmlContent);
    } catch (error: any) {
      console.error("[LLMDataHandler] Failed to parse XML.", { error: error.message });
      return [];
    }

    let toolCalls = parsedJs?.root?.tool;
    if (!toolCalls) {
      console.warn("[LLMDataHandler] Parsed XML but found no <tool> elements under <root>.");
      return [];
    }

    if (!Array.isArray(toolCalls)) {
      toolCalls = [toolCalls];
    }

    const validToolCalls: PendingToolCall[] = [];

    for (const call of toolCalls) {
      if (!call || typeof call.name !== 'string') {
        console.warn("[LLMDataHandler] Skipping malformed tool call object:", call);
        continue;
      }

      const toolDef = tools.find(t => t.name === call.name);
      if (!toolDef) {
        console.warn(`[LLMDataHandler] LLM requested a non-existent tool: '${call.name}'.`);
        // Still add it so the loop can handle the error properly
        validToolCalls.push(call);
        continue;
      }

      const validation = toolDef.responseSchema.safeParse(call);
      if (!validation.success) {
        console.error(`[LLMDataHandler] Schema validation failed for tool '${call.name}'.`, {
          errors: validation.error.flatten(),
          data: call,
        });
        continue;
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
      console.error("Error calling LLM provider:", error.message);
      throw new AgentError(
        `Error communicating with LLM: ${error.message}`,
        AgentErrorType.INVALID_RESPONSE,
        { originalError: error }
      );
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

