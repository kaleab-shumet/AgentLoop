import { describe, it, expect } from '@jest/globals';
import { AIDataHandler } from '../core/handlers/AIDataHandler';
import { FormatMode } from '../core/types/types';
import { DefaultPromptTemplate } from '../core/prompt/DefaultPromptTemplate';
import z from 'zod';

describe('JSObject Integration Test', () => {
  it('should use JSObject format handler correctly', () => {
    // Create AIDataHandler with JSObject format
    const aiDataHandler = new AIDataHandler(FormatMode.JSOBJECT);
    
    // Create sample tools
    const tools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        argsSchema: z.object({
          message: z.string()
        }),
        handler: async () => ({ toolName: 'test_tool', success: true })
      }
    ];

    // Test formatToolDefinitions returns JSObject instructions
    const toolDefinitions = aiDataHandler.formatToolDefinitions(tools);
    expect(typeof toolDefinitions).toBe('string');
    expect(toolDefinitions).toContain('function callTools()');
    expect(toolDefinitions).toContain('calledToolsList = []');
    expect(toolDefinitions).toContain('test_tool');
  });

  it('should parse JSObject response correctly', () => {
    const aiDataHandler = new AIDataHandler(FormatMode.JSOBJECT);
    
    const tools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        argsSchema: z.object({
          message: z.string()
        }),
        handler: async () => ({ toolName: 'test_tool', success: true })
      }
    ];

    const jsObjectResponse = `
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  calledToolsList.push({
    toolName: "test_tool",
    message: "Hello World"
  });
  
  return calledToolsList;
}
\`\`\``;

    const result = aiDataHandler.parseAndValidate(jsObjectResponse, tools);
    expect(result).toHaveLength(1);
    expect(result[0].toolName).toBe('test_tool');
    expect(result[0].message).toBe('Hello World');
  });

  it('should create prompt with JSObject format instructions', () => {
    const template = new DefaultPromptTemplate(FormatMode.JSOBJECT);
    
    const buildParams = {
      systemPrompt: 'Test system prompt',
      userPrompt: 'Test user request',
      context: {},
      currentInteractionHistory: [],
      prevInteractionHistory: [],
      lastError: null,
      keepRetry: false,
      finalToolName: 'final',
      reportToolName: 'report_action',
      toolDefinitions: 'Test tool definitions',
      options: {},
      conversationEntries: [],
      conversationLimitNote: ''
    };

    const prompt = template.buildPrompt(buildParams);
    
    // Should contain JSObject format instructions
    expect(prompt).toContain('# RESPONSE FORMAT: JAVASCRIPT \'callTools\' FUNCTION');
    expect(prompt).toContain('function callTools()');
    expect(prompt).toContain('const calledToolsList = []');
    expect(prompt).toContain('return calledToolsList');
  });

  it('should not contain function calling format when using JSObject', () => {
    const template = new DefaultPromptTemplate(FormatMode.JSOBJECT);
    
    const buildParams = {
      systemPrompt: 'Test system prompt',
      userPrompt: 'Test user request',
      context: {},
      currentInteractionHistory: [],
      prevInteractionHistory: [],
      lastError: null,
      keepRetry: false,
      finalToolName: 'final',
      reportToolName: 'report_action',
      toolDefinitions: 'Test tool definitions',
      options: {},
      conversationEntries: [],
      conversationLimitNote: ''
    };

    const prompt = template.buildPrompt(buildParams);
    
    // Should NOT contain function calling format
    expect(prompt).not.toContain('# RESPONSE FORMAT: JSON ONLY');
    expect(prompt).not.toContain('functionCalls');
    expect(prompt).not.toContain('arguments');
  });
});