import z, { ZodTypeAny } from "zod";
import { FormatHandler, Tool, PendingToolCall } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";

export class MDStructFormatHandler implements FormatHandler {
    /**
     * Formats tool definitions as Markdown headings and descriptions.
     */
    /**
     * Formats tool definitions in a clear, MD-Struct friendly way.
     */
    formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
        return tools
            .map((tool) => {
                const schema = (tool.argsSchema as any).shape || {};
                const args = Object.entries(schema).map(([key, value]: [string, any]) => {
                    const description = value.description || "";
                    const type = value._def?.typeName || "any";
                    return `### ${key} (${type})\n${description}`;
                }).join("\n\n");

                return `## TOOL: ${tool.name}\n**Description**: ${tool.description}\n\n**Arguments**:\n${args}`;
            })
            .join("\n\n---\n\n");
    }

    /**
     * Parses the AI's MD-Struct response into tool calls.
     */
    async parseResponse(response: string, tools: Tool<ZodTypeAny>[]): Promise<PendingToolCall[]> {
        const lines = response.split(/\r?\n/);
        const toolCalls: PendingToolCall[] = [];

        let currentToolCall: any = null;
        let stack: { level: number; obj: any }[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();
            if (!line && !line.startsWith("```")) continue;

            // Heading
            const headingMatch = line.match(/^(#+)\s*(.+)$/);
            if (headingMatch) {
                const hashes = headingMatch[1];
                let content = headingMatch[2].trim();
                const level = hashes.length;

                // Check for inline value: ## key: value
                let inlineValue: string | null = null;
                const colonIndex = content.indexOf(":");
                if (colonIndex !== -1 && level > 1) {
                    inlineValue = content.substring(colonIndex + 1).trim();
                    content = content.substring(0, colonIndex).trim();
                }

                if (level === 1) {
                    // New tool call (top-level heading)
                    if (currentToolCall) {
                        toolCalls.push(this.validateAndCompleteToolCall(currentToolCall, tools, response));
                    }
                    currentToolCall = { toolName: content };
                    stack = [{ level: 1, obj: currentToolCall }];
                } else {
                    // Nested key or argument
                    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                        stack.pop();
                    }
                    if (stack.length > 0) {
                        const parent = stack[stack.length - 1].obj;
                        if (inlineValue !== null) {
                            parent[content] = this._inferType(inlineValue);
                        } else {
                            parent[content] = {}; // Placeholder for potential nesting
                            stack.push({ level, obj: parent[content] });
                        }
                    }
                }
                continue;
            }

            // List item
            const listMatch = line.match(/^-\s+(.+)$/);
            if (listMatch) {
                const content = listMatch[1].trim();

                // Check for key: value in list item (robustness for some LLM styles)
                const colonIndex = content.indexOf(":");
                if (colonIndex !== -1 && stack.length === 1) {
                    const key = content.substring(0, colonIndex).trim();
                    const value = content.substring(colonIndex + 1).trim();
                    currentToolCall[key] = this._inferType(value);
                    continue;
                }

                const item = this._inferType(content);
                if (stack.length > 0) {
                    const parentObj = stack.length > 1 ? stack[stack.length - 2].obj : null;
                    if (parentObj) {
                        const keys = Object.keys(parentObj);
                        const lastKey = keys[keys.length - 1];
                        if (!Array.isArray(parentObj[lastKey])) {
                            parentObj[lastKey] = [item];
                        } else {
                            parentObj[lastKey].push(item);
                        }
                    }
                }
                continue;
            }

            // Code block
            if (line.trim().startsWith("```")) {
                const codeLines: string[] = [];
                let nestingLevel = 1;
                i++;
                while (i < lines.length) {
                    const currentLine = lines[i].trim();
                    if (currentLine.startsWith("```")) {
                        // Check if it's an opening or closing block
                        // In MD-Struct, we assume the first ``` is opening, 
                        // and we count nesting if we see more ``` before the closing one.
                        // However, a simpler approach for nested blocks (like markdown in markdown)
                        // is to look for the matching closing block.
                        // For robustness, we'll just look for the next ``` that isn't followed by more content on the same line if it's a closing one.
                        if (currentLine === "```") {
                            nestingLevel--;
                            if (nestingLevel === 0) break;
                        } else {
                            nestingLevel++;
                        }
                    }
                    codeLines.push(lines[i]);
                    i++;
                }
                const value = codeLines.join("\n");
                this._assignValue(stack, value);
                continue;
            }

            // Paragraph (scalar value)
            if (line.trim()) {
                const valueLines: string[] = [line.trim()];
                i++;
                while (i < lines.length) {
                    const nextLine = lines[i].trimEnd();
                    if (!nextLine || nextLine.match(/^(#+)\s*/) || nextLine.match(/^- \s+/) || nextLine.trim().startsWith("```")) {
                        i--; // Back up
                        break;
                    }
                    valueLines.push(nextLine.trim());
                    i++;
                }
                const value = this._inferType(valueLines.join("\n"));
                this._assignValue(stack, value);
            }
        }

        if (currentToolCall) {
            toolCalls.push(this.validateAndCompleteToolCall(currentToolCall, tools, response));
        }

        return toolCalls;
    }

    private validateAndCompleteToolCall(partialCall: any, tools: Tool<ZodTypeAny>[], rawResponse: string): PendingToolCall {
        if (!partialCall.toolName) {
            throw new AgentError('Missing toolName in MD-Struct', AgentErrorType.INVALID_RESPONSE, { rawResponse });
        }

        const tool = tools.find(t => t.name === partialCall.toolName);
        if (!tool) {
            throw new AgentError(`Tool not found: ${partialCall.toolName}`, AgentErrorType.TOOL_NOT_FOUND, { rawResponse });
        }

        const { toolName, ...args } = partialCall;

        // Smart conversion: if schema expects string but we got array, join it
        if (tool.argsSchema instanceof z.ZodObject) {
            const shape = tool.argsSchema.shape;
            for (const key of Object.keys(args)) {
                if (Array.isArray(args[key]) && shape[key] instanceof z.ZodString) {
                    args[key] = args[key].join('\n');
                }
            }
        }

        try {
            const validatedArgs = tool.argsSchema.parse(args);
            return {
                toolName,
                ...validatedArgs
            } as PendingToolCall;
        } catch (error: any) {
            throw new AgentError(
                `Invalid args for ${toolName}: ${error.message}`,
                AgentErrorType.INVALID_RESPONSE,
                { toolName, errors: error.errors, rawResponse }
            );
        }
    }

    private _assignValue(stack: { level: number; obj: any }[], value: any) {
        if (stack.length > 1) {
            const parent = stack[stack.length - 2].obj;
            const keys = Object.keys(parent);
            const lastKey = keys[keys.length - 1];
            if (lastKey) {
                if (typeof parent[lastKey] === 'string' && typeof value === 'string') {
                    parent[lastKey] = (parent[lastKey] ? parent[lastKey] + '\n' : '') + value;
                } else if (parent[lastKey] === undefined || Object.keys(parent[lastKey]).length === 0) {
                    parent[lastKey] = value;
                }
            }
        }
    }

    private _inferType(value: string): any {
        const v = value.trim();
        if (v.toLowerCase() === "true") return true;
        if (v.toLowerCase() === "false") return false;
        if (!isNaN(Number(v)) && v !== "" && !v.includes("\n")) return Number(v);
        return v;
    }
}
