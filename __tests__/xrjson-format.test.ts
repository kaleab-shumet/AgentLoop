import { XRJsonFormatHandler } from '../core/handlers/XRJsonFormatHandler';
import { Tool } from '../core/types/types';
import { z } from 'zod';

describe('XRJsonFormatHandler', () => {
  let handler: XRJsonFormatHandler;
  let mockTools: Tool<any>[];

  beforeEach(() => {
    handler = new XRJsonFormatHandler();
    mockTools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        argsSchema: z.object({
          message: z.string(),
          count: z.number()
        }),
        handler: jest.fn()
      },
      {
        name: 'final',
        description: 'Final response tool',
        argsSchema: z.object({
          value: z.string()
        }),
        handler: jest.fn()
      }
    ];
  });

  describe('parseResponse', () => {
    it('should parse basic XRJSON response correctly', () => {
      const response = `{
  "tools": [
    {
      "toolName": "test_tool",
      "message": "Hello World",
      "count": 42
    },
    {
      "toolName": "final",
      "value": "Task complete"
    }
  ]
}`;

      const result = handler.parseResponse(response, mockTools);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        toolName: 'test_tool',
        message: 'Hello World', 
        count: 42
      });
      expect(result[1]).toEqual({
        toolName: 'final',
        value: 'Task complete'
      });
    });

    it('should parse XRJSON response with external references', () => {
      const response = `{
  "tools": [
    {
      "toolName": "final",
      "value": "xrjson('long_content')"
    }
  ]
}

<literals>
<literal id="long_content">
This is a long piece of content
that spans multiple lines
and contains various characters: !@#$%^&*()
</literal>
</literals>`;

      const result = handler.parseResponse(response, mockTools);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        toolName: 'final',
        value: `
This is a long piece of content
that spans multiple lines
and contains various characters: !@#$%^&*()
`
      });
    });

    it('should throw error for missing tools array', () => {
      const response = `{
  "notTools": []
}`;

      expect(() => handler.parseResponse(response, mockTools))
        .toThrow("Response must contain a 'tools' array at the root level");
    });

    it('should throw error for unknown tool', () => {
      const response = `{
  "tools": [
    {
      "toolName": "unknown_tool",
      "param": "value"
    }
  ]
}`;

      expect(() => handler.parseResponse(response, mockTools))
        .toThrow("Unknown tool: unknown_tool");
    });

    it('should throw error for invalid arguments', () => {
      const response = `{
  "tools": [
    {
      "toolName": "test_tool",
      "message": "Hello",
      "count": "not_a_number"
    }
  ]
}`;

      expect(() => handler.parseResponse(response, mockTools))
        .toThrow("Invalid arguments for tool 'test_tool'");
    });

    it('should handle markdown-wrapped XRJSON (handled by xrjson library)', () => {
      const response = `\`\`\`xrjson
{
  "tools": [
    {
      "toolName": "final",
      "value": "Hello World"
    }
  ]
}
\`\`\``;

      const result = handler.parseResponse(response, mockTools);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        toolName: 'final',
        value: 'Hello World'
      });
    });
  });

  describe('formatToolDefinitions', () => {
    it('should format tool definitions correctly', () => {
      const result = handler.formatToolDefinitions(mockTools);
      
      expect(result).toContain('test_tool');
      expect(result).toContain('A test tool');
      expect(result).toContain('final');
      expect(result).toContain('Final response tool');
      expect(result).toContain('Tool Schema:');
    });
  });
});