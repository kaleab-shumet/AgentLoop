import { describe, it, expect, beforeEach } from '@jest/globals';
import z from 'zod';
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

            expect(formatted).toContain('## Tool Name: read_file');
            expect(formatted).toContain('## Tool Name: write_file');
            expect(formatted).toContain('## Tool Description:');
            expect(formatted).toContain('## Tool Schema (Zod):');
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
    });
});
