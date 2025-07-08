import LLM from "@themaximalist/llm.js"
import { BaseParser} from "./parsers/BaseParser";
import { AIProvider } from "./AIProvider";
import { ZodTypeAny } from "zod";
import { Tool } from "./types";
import { PendingToolCall } from "../DataAnalystParser";
import { XMLParser } from 'fast-xml-parser';


/**
 * Represents a single parsed code block.
 */
interface CodeBlock {
    /** The language identifier found (e.g., 'javascript', 'python'). Null if not specified. */
    language: string | null;
    /** The raw code content inside the block. */
    code: string;
  }
  
  /**
   * A robust parser that finds and extracts the first fenced code block from a string.
   *
   * - If a `language` is specified, it finds the first block matching that language (case-insensitive).
   * - If no `language` is specified, it finds the very first code block it encounters.
   *
   * @param content The markdown string to parse.
   * @param language Optional: The language identifier to search for (e.g., 'javascript', 'c++').
   * @returns A CodeBlock object if a match is found, otherwise null.
   */
  function extractCodeBlock(
    content: string,
    language?: string
  ): CodeBlock | null {
    // This general-purpose regex finds any fenced code block.
    // 'g' flag allows us to iterate through matches if needed.
    // ```: Matches the opening fence.
    // (\S*): Captures the language identifier (any non-whitespace characters). This is Group 1.
    // \s*\n: Matches optional whitespace and a required newline.
    // ([\s\S]+?): Lazily captures the code content until the closing fence. This is Group 2.
    // \n?```: Matches the closing fence.
    const regex = /```(\S*)\s*\n([\s\S]+?)\n?```/g;
  
    // Use the iterator created by `matchAll` to find the correct block efficiently.
    for (const match of content.matchAll(regex)) {
      const foundLanguage = match[1] || null; // Group 1 is the language.
      const code = match[2].trim();          // Group 2 is the code.
  
      if (language) {
        // If a specific language is requested, we must find the first match.
        if (foundLanguage?.toLowerCase() === language.toLowerCase()) {
          // Found the first block with the correct language. Stop searching and return.
          return { language: foundLanguage, code };
        }
        // If it's not the right language, the loop continues to the next code block.
      } else {
        // If no language is specified, the very first block is the one we want.
        return { language: foundLanguage, code };
      }
    }
  
    // If the loop completes, no suitable code block was found.
    return null;
  }

// Implement the xml parser using fast-xml-parser
function parseXmlToJs(xml: string): any {
  const parser = new XMLParser({ ignoreAttributes: false });
  return parser.parse(xml);
}

// Example usage: extract XML code block from markdown and parse to JS
function extractAndParseXmlFromMarkdown(markdown: string): any | null {
  const xmlBlock = extractCodeBlock(markdown, 'xml');
  if (!xmlBlock) return null;
  return parseXmlToJs(xmlBlock.code);
}


export class LLMDataHandler extends BaseParser implements AIProvider {


    parseLLMResponse(llmResponse: string, tools: Tool<ZodTypeAny>[]): PendingToolCall[] {
        console.log("llmResponse: ", llmResponse);


        const parseRes =  extractAndParseXmlFromMarkdown(llmResponse)

        let parsedTools = parseRes?.root?.tool;
        if (!parsedTools) return [];
        if (!Array.isArray(parsedTools)) {
          parsedTools = [parsedTools];
        }
        parsedTools = parsedTools.filter(Boolean); // Remove undefined/null
        console.log(parsedTools);
        // match parsed name to -> tool based on name
        const validToolCalls: PendingToolCall[] = parsedTools.filter((parsedTool: any) => {
          const toolDef = tools.find(t => t.name === parsedTool.name);
          if (!toolDef) return false;
          const validation = toolDef.responseSchema.safeParse(parsedTool);
          if (!validation.success) {
            console.error('Validation failed for tool', parsedTool.name, validation.error);
            return false;
          }
          return true;
        }).map((e: any) => ({
          ...e
        }));
        return validToolCalls;
    }

    async getCompletion(prompt: string): Promise<string> {

        let res = "";

        const response = await LLM(prompt, { model: "gemini-2.0-flash", service: "google", apiKey: "AIzaSyBBvprrxsMRaS7I1RTrX7IhH8-qBWs_S7A" });
        for await (const message of response) {
            res += message
        }

        return res;

    }



}