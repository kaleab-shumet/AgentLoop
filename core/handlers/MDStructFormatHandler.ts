import { ZodTypeAny } from "zod";
import { FormatHandler, Tool, PendingToolCall } from "../types/types";
import { AgentError, AgentErrorType } from "../utils/AgentError";

export class MDStructFormatHandler implements FormatHandler {
    /**
     * Formats tool definitions as Markdown headings and descriptions.
     */
    formatToolDefinitions(tools: Tool<ZodTypeAny>[]): string {
        return tools
            .map((tool) => {
                return `## Tool Name: ${tool.name}\n## Tool Description: ${tool.description}\n\n## Tool Schema (Zod):\n\`\`\`json\n${JSON.stringify(tool.argsSchema, null, 2)}\n\`\`\``;
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
                const key = headingMatch[2].trim();
                const level = hashes.length;

                if (level === 1) {
                    // New tool call (top-level heading)
                    if (currentToolCall) {
                        toolCalls.push(this.validateAndCompleteToolCall(currentToolCall, tools));
                    }
                    currentToolCall = { toolName: key };
                    stack = [{ level: 1, obj: currentToolCall }];
                } else {
                    // Nested key or argument
                    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                        stack.pop();
                    }
                    if (stack.length > 0) {
                        const parent = stack[stack.length - 1].obj;
                        parent[key] = {}; // Placeholder
                        stack.push({ level, obj: parent[key] });
                    }
                }
                continue;
            }

            // List item
            const listMatch = line.match(/^-\s+(.+)$/);
            if (listMatch) {
                const item = this._inferType(listMatch[1].trim());
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
                i++;
                while (i < lines.length) {
                    if (lines[i].trim().startsWith("```")) {
                        break;
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
            toolCalls.push(this.validateAndCompleteToolCall(currentToolCall, tools));
        }

        return toolCalls;
    }

    private validateAndCompleteToolCall(partialCall: any, tools: Tool<ZodTypeAny>[]): PendingToolCall {
        if (!partialCall.toolName) {
            throw new AgentError('Missing toolName in MD-Struct', AgentErrorType.INVALID_RESPONSE);
        }

        const tool = tools.find(t => t.name === partialCall.toolName);
        if (!tool) {
            throw new AgentError(`Tool not found: ${partialCall.toolName}`, AgentErrorType.TOOL_NOT_FOUND);
        }

        const { toolName, ...args } = partialCall;

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
                { toolName, errors: error.errors }
            );
        }
    }

    private _assignValue(stack: { level: number; obj: any }[], value: any) {
        if (stack.length > 1) {
            const parent = stack[stack.length - 2].obj;
            const keys = Object.keys(parent);
            const lastKey = keys[keys.length - 1];
            if (lastKey) {
                parent[lastKey] = value;
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
