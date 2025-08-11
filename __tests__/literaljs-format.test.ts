import { describe, it, expect } from '@jest/globals';
import z from 'zod';
import { LiteralJSFormatHandler } from '../core/handlers/LiteralJSFormatHandler';
import { Tool } from '../core/types/types';

describe('LiteralJSFormatHandler', () => {
  let handler: LiteralJSFormatHandler;
  let testTools: Tool[];

  beforeEach(() => {
    handler = new LiteralJSFormatHandler();
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
    it('should format tool definitions with Zod schemas only', () => {
      const formatted = handler.formatToolDefinitions(testTools);
      
      expect(formatted).toContain('## Tool Name: read_file');
      expect(formatted).toContain('## Tool Name: write_file');
      expect(formatted).toContain('## Tool Description:');
      expect(formatted).toContain('## Tool Schema (Zod):');
      // Should not contain prompt instructions anymore
      expect(formatted).not.toContain('function callTools()');
      expect(formatted).not.toContain('Available tools and their');
    });

    it('should include only tool schema information', () => {
      const formatted = handler.formatToolDefinitions(testTools);
      
      // Should only contain schema information, no prompt instructions
      expect(formatted).toContain('## Tool Schema (Zod):');
      expect(formatted).not.toContain('No external libraries or imports allowed');
      expect(formatted).not.toContain('Pure vanilla JavaScript only');
      expect(formatted).not.toContain('Single function implementation');
      expect(formatted).not.toContain('returns an array of one or two example objects');
    });
  });

  describe('parseResponse', () => {
    it('should parse JavaScript function with single tool call', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "read_file",
    filename: "/path/to/file.txt",
    encoding: "utf8"
  });
  
  return calledToolsList;
}
\`\`\``;

      const result = await handler.parseResponse(response, testTools);
      
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('read_file');
      expect(result[0].filename).toBe('/path/to/file.txt');
      expect(result[0].encoding).toBe('utf8');
    });

    it('should parse JavaScript function with multiple tool calls', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "read_file",
    filename: "/input.txt"
  });
  
  calledToolsList.push({
    toolName: "write_file",
    filename: "/output.txt",
    content: "Hello World",
    mode: "overwrite"
  });
  
  return calledToolsList;
}
\`\`\``;

      const result = await handler.parseResponse(response, testTools);
      
      expect(result).toHaveLength(2);
      expect(result[0].toolName).toBe('read_file');
      expect(result[0].filename).toBe('/input.txt');
      expect(result[1].toolName).toBe('write_file');
      expect(result[1].filename).toBe('/output.txt');
      expect(result[1].content).toBe('Hello World');
      expect(result[1].mode).toBe('overwrite');
    });

    it('should parse function without code blocks', async () => {
      const response = `
Here's the function:

function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "read_file",
    filename: "test.txt"
  });
  
  return calledToolsList;
}

That should work!`;

      const result = await handler.parseResponse(response, testTools);
      
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('read_file');
      expect(result[0].filename).toBe('test.txt');
    });

    it('should validate tool arguments against schema', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "read_file",
    filename: 123 // Invalid: should be string
  });
  
  return calledToolsList;
}
\`\`\``;

      await expect(async () => {
        await handler.parseResponse(response, testTools);
      }).rejects.toThrow('Invalid arguments for tool "read_file"');
    });

    it('should throw error when tool not found', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "nonexistent_tool",
    arg: "value"
  });
  
  return calledToolsList;
}
\`\`\``;

      await expect(async () => {
        await handler.parseResponse(response, testTools);
      }).rejects.toThrow('No tool found for name: nonexistent_tool');
    });

    it('should throw error when toolName is missing', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    filename: "test.txt"
    // Missing toolName
  });
  
  return calledToolsList;
}
\`\`\``;

      await expect(async () => {
        await handler.parseResponse(response, testTools);
      }).rejects.toThrow("Tool call missing required 'toolName' field");
    });

    it('should throw error when function does not return array', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  return "not an array";
}
\`\`\``;

      await expect(async () => {
        await handler.parseResponse(response, testTools);
      }).rejects.toThrow('callTools function must return an array');
    });

    it('should throw error when no callTools function found', async () => {
      const response = `
This is just some text without a callTools function.
`;

      await expect(async () => {
        await handler.parseResponse(response, testTools);
      }).rejects.toThrow('No JavaScript callTools function found in response');
    });

    it('should throw error when JavaScript function has syntax errors', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "read_file",
    filename: "test.txt"
  });
  
  return calledToolsList
  // Missing semicolon and closing brace
\`\`\``;

      await expect(async () => {
        await handler.parseResponse(response, testTools);
      }).rejects.toThrow('Error executing callTools function');
    });

    it('should handle functions with complex logic', async () => {
      const response = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  // Add some logic
  const files = ["file1.txt", "file2.txt"];
  
  for (let i = 0; i < files.length; i++) {
    if (i === 0) {
      calledToolsList.push({
        toolName: "read_file",
        filename: files[i],
        encoding: "utf8"
      });
    }
  }
  
  return calledToolsList;
}
\`\`\``;

      const result = await handler.parseResponse(response, testTools);
      
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('read_file');
      expect(result[0].filename).toBe('file1.txt');
      expect(result[0].encoding).toBe('utf8');
    });
  });
});