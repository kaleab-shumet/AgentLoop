import { describe, it, expect, beforeEach } from '@jest/globals';
import z, { ZodTypeAny } from 'zod';
import { MDStructFormatHandler } from '../core/handlers/MDStructFormatHandler';
import { Tool } from '../core/types/types';

describe('MDStructFormatHandler', () => {
    let handler: MDStructFormatHandler;
    let testTools: Tool[];

    beforeEach(() => {
        handler = new MDStructFormatHandler();
        testTools = [
            {
                name: 'read_file',
                description: 'Read contents of a file',
                argsSchema: z.object({
                    filename: z.string().describe('Path to the file to read'),
                    encoding: z.string().optional().describe('File encoding (default: utf8)')
                }),
                handler: async () => ({ toolName: 'read_file', success: true })
            },
            {
                name: 'write_file',
                description: 'Write content to a file',
                argsSchema: z.object({
                    filename: z.string().describe('Path to the file to write'),
                    content: z.string().describe('Content to write to the file'),
                    mode: z.enum(['append', 'overwrite']).default('overwrite')
                }),
                handler: async () => ({ toolName: 'write_file', success: true })
            }
        ];
    });

    describe('formatToolDefinitions', () => {
        it('should format tool definitions in MD-Struct style', () => {
            const formatted = handler.formatToolDefinitions(testTools);

            expect(formatted).toContain('## TOOL: read_file');
            expect(formatted).toContain('## TOOL: write_file');
            expect(formatted).toContain('**Description**:');
            expect(formatted).toContain('**Arguments**:');
            expect(formatted).toContain('### filename (ZodString)');
        });
    });

    describe('parseResponse', () => {
        it('should parse simple MD-Struct with single tool call', async () => {
            const response = `
# read_file
## filename
/path/to/file.txt
## encoding
utf8
`;

            const result = await handler.parseResponse(response, testTools);

            expect(result).toHaveLength(1);
            expect(result[0].toolName).toBe('read_file');
            expect(result[0].filename).toBe('/path/to/file.txt');
            expect(result[0].encoding).toBe('utf8');
        });

        it('should parse MD-Struct with multiple tool calls', async () => {
            const response = `
# read_file
## filename
/input.txt

# write_file
## filename
/output.txt
## content
Hello World
## mode
overwrite
`;

            const result = await handler.parseResponse(response, testTools);

            expect(result).toHaveLength(2);
            expect(result[0].toolName).toBe('read_file');
            expect(result[0].filename).toBe('/input.txt');
            expect(result[1].toolName).toBe('write_file');
            expect(result[1].filename).toBe('/output.txt');
            expect(result[1].content).toBe('Hello World');
            expect(result[1].mode).toBe('overwrite');
        });

        it('should parse MD-Struct with code blocks', async () => {
            const response = `
# write_file
## filename
script.js
## content
\`\`\`javascript
console.log("hello");
\`\`\`
## mode
overwrite
`;

            const result = await handler.parseResponse(response, testTools);

            expect(result).toHaveLength(1);
            expect(result[0].toolName).toBe('write_file');
            expect(result[0].filename).toBe('script.js');
            expect(result[0].content).toBe('console.log("hello");');
        });

        it('should parse MD-Struct with lists (arrays)', async () => {
            const toolWithArray: Tool = {
                name: 'process_list',
                description: 'Process a list of items',
                argsSchema: z.object({
                    items: z.array(z.string())
                }),
                handler: async () => ({ toolName: 'process_list', success: true })
            };

            const response = `
# process_list
## items
- item1
- item2
- item3
`;

            const result = await handler.parseResponse(response, [toolWithArray]);

            expect(result).toHaveLength(1);
            expect(result[0].toolName).toBe('process_list');
            expect(result[0].items).toEqual(['item1', 'item2', 'item3']);
        });

        it('should infer types correctly (numbers and booleans)', async () => {
            const toolWithTypes: Tool = {
                name: 'test_types',
                description: 'Test type inference',
                argsSchema: z.object({
                    num: z.number(),
                    bool: z.boolean(),
                    str: z.string()
                }),
                handler: async () => ({ toolName: 'test_types', success: true })
            };

            const response = `
# test_types
## num
42
## bool
true
## str
hello
`;

            const result = await handler.parseResponse(response, [toolWithTypes]);

            expect(result).toHaveLength(1);
            expect(result[0].num).toBe(42);
            expect(result[0].bool).toBe(true);
            expect(result[0].str).toBe('hello');
        });

        it('should validate tool arguments against schema', async () => {
            const response = `
# read_file
## filename
123
`;

            await expect(async () => {
                await handler.parseResponse(response, testTools);
            }).rejects.toThrow('Invalid args for read_file');
        });

        it('should throw error when tool not found', async () => {
            const response = `
# nonexistent_tool
## arg
value
`;

            await expect(async () => {
                await handler.parseResponse(response, testTools);
            }).rejects.toThrow('Tool not found: nonexistent_tool');
        });

        it('should parse inline heading values (robustness)', async () => {
            const response = `
# read_file
## filename: /path/to/file.txt
## encoding: utf8
`;

            const result = await handler.parseResponse(response, testTools);

            expect(result).toHaveLength(1);
            expect(result[0].toolName).toBe('read_file');
            expect(result[0].filename).toBe('/path/to/file.txt');
            expect(result[0].encoding).toBe('utf8');
        });

        it('should parse list-based arguments (robustness)', async () => {
            const response = `
# read_file
- filename: /path/to/file.txt
- encoding: utf8
`;

            const result = await handler.parseResponse(response, testTools);

            expect(result).toHaveLength(1);
            expect(result[0].toolName).toBe('read_file');
            expect(result[0].filename).toBe('/path/to/file.txt');
            expect(result[0].encoding).toBe('utf8');
        });

        it('should handle array-to-string conversion (smart conversion)', async () => {
            const toolWithString: Tool = {
                name: 'process_text',
                description: 'Process some text',
                argsSchema: z.object({
                    text: z.string()
                }),
                handler: async () => ({ toolName: 'process_text', success: true })
            };

            const response = `
# process_text
## text
- line 1
- line 2
- line 3
`;

            const result = await handler.parseResponse(response, [toolWithString]);

            expect(result).toHaveLength(1);
            expect(result[0].toolName).toBe('process_text');
            expect(result[0].text).toBe('line 1\nline 2\nline 3');
        });
        it('should parse nested code blocks correctly', async () => {
            const response = `
# final_tool
## value
\`\`\`markdown
Hello!
\`\`\`json
{
  "key": "value"
}
\`\`\`
Bye!
\`\`\`
`;
            const tools: Tool<ZodTypeAny>[] = [
                {
                    name: 'final_tool',
                    description: 'Final tool',
                    argsSchema: z.object({
                        value: z.string()
                    }),
                    handler: async () => ({})
                }
            ];

            const result = await handler.parseResponse(response, tools);
            expect(result).toHaveLength(1);
            expect(result[0].toolName).toBe('final_tool');
            expect(result[0].value).toContain('Hello!');
            expect(result[0].value).toContain('\`\`\`json');
            expect(result[0].value).toContain('Bye!');
        });

        it('should handle mixed content and not overwrite values', async () => {
            const response = `
# my_tool
## arg1
First part
\`\`\`
code part
\`\`\`
Last part
`;
            const tools: Tool<ZodTypeAny>[] = [
                {
                    name: 'my_tool',
                    description: 'My tool',
                    argsSchema: z.object({
                        arg1: z.string()
                    }),
                    handler: async () => ({})
                }
            ];

            const result = await handler.parseResponse(response, tools);
            expect(result).toHaveLength(1);
            expect(result[0].arg1).toContain('First part');
            expect(result[0].arg1).toContain('code part');
            expect(result[0].arg1).toContain('Last part');
        });
    });
});
