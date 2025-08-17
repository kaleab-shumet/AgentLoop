import { describe, it, expect } from '@jest/globals';
import { DefaultPromptTemplate } from '../core/prompt/DefaultPromptTemplate';
import { FormatMode, BuildPromptParams } from '../core/types/types';

describe('DefaultPromptTemplate JSObject Format', () => {
  let template: DefaultPromptTemplate;

  beforeEach(() => {
    template = new DefaultPromptTemplate(FormatMode.LITERAL_JS);
  });

  describe('JSObject format integration', () => {
    it('should include JSObject format instructions in prompt', () => {
      const params: BuildPromptParams = {
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user request',
        context: {},
        currentInteractionHistory: [],
        prevInteractionHistory: [],
        lastError: null,
        keepRetry: false,
        finalToolName: 'final',
        reportToolName: 'self_reasoning_tool',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should contain JSObject format section
      expect(prompt).toContain('# RESPONSE FORMAT: JAVASCRIPT \'callTools\' FUNCTION');
      expect(prompt).toContain('function callTools()');
      expect(prompt).toContain('const calledToolsList = []');
      expect(prompt).toContain('toolName:');
      expect(prompt).toContain('return calledToolsList');
    });

    it('should include both data gathering and final answer formats', () => {
      const params: BuildPromptParams = {
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user request',
        context: {},
        currentInteractionHistory: [],
        prevInteractionHistory: [],
        lastError: null,
        keepRetry: false,
        finalToolName: 'final',
        reportToolName: 'self_reasoning_tool',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should contain scenario examples
      expect(prompt).toContain('### Scenario 1: Intermediate Steps');
      expect(prompt).toContain('### Scenario 2: Final Answer');
      
      // Should reference the correct tool names
      expect(prompt).toContain('toolName: "final"');
      expect(prompt).toContain('toolName: "self_reasoning_tool"');
    });

    it('should include JSObject-specific requirements', () => {
      const params: BuildPromptParams = {
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user request',
        context: {},
        currentInteractionHistory: [],
        prevInteractionHistory: [],
        lastError: null,
        keepRetry: false,
        finalToolName: 'final',
        reportToolName: 'self_reasoning_tool',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should contain JSObject-specific requirements
      expect(prompt).toContain('JavaScript `callTools()` function returning an array');
      expect(prompt).toContain('MANDATORY:** Start code with `import { LiteralLoader }');
      expect(prompt).toContain('Use valid JS syntax');
      expect(prompt).toContain('Use exact tool parameter names/types');
      expect(prompt).toContain('No placeholders; use real values');
    });

    it('should maintain consistent tool pairing rules across formats', () => {
      const params: BuildPromptParams = {
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user request',
        context: {},
        currentInteractionHistory: [],
        prevInteractionHistory: [],
        lastError: null,
        keepRetry: false,
        finalToolName: 'final',
        reportToolName: 'self_reasoning_tool',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should enforce tool pairing rules
      expect(prompt).toContain('NEVER call self_reasoning_tool alone');
      expect(prompt).toContain('ALWAYS pair tool calls with self_reasoning_tool');
    });

    it('should work with custom tool names', () => {
      const params: BuildPromptParams = {
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user request',
        context: {},
        currentInteractionHistory: [],
        prevInteractionHistory: [],
        lastError: null,
        keepRetry: false,
        finalToolName: 'custom_final',
        reportToolName: 'custom_self_reasoning',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should use custom tool names in format examples
      expect(prompt).toContain('toolName: "custom_final"');
      expect(prompt).toContain('toolName: "custom_self_reasoning"');
      expect(prompt).toContain('Deliver final answer with \'custom_final\'');
      expect(prompt).toContain('NEVER call custom_self_reasoning alone');
    });
  });

  describe('Format mode switching', () => {
    it('should switch between format modes correctly', () => {
      // Start with JSObject
      template.setResponseFormat(FormatMode.LITERAL_JS);
      expect(template.getResponseFormat()).toBe(FormatMode.LITERAL_JS);

      // Switch back to JSObject (only format supported)
      template.setResponseFormat(FormatMode.LITERAL_JS);
      expect(template.getResponseFormat()).toBe(FormatMode.LITERAL_JS);
    });

    it('should generate different format instructions for different modes', () => {
      const params: BuildPromptParams = {
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user request',
        context: {},
        currentInteractionHistory: [],
        prevInteractionHistory: [],
        lastError: null,
        keepRetry: false,
        finalToolName: 'final',
        reportToolName: 'self_reasoning_tool',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      // JSObject format
      template.setResponseFormat(FormatMode.LITERAL_JS);
      const jsObjectPrompt = template.buildPrompt(params);
      expect(jsObjectPrompt).toContain('JAVASCRIPT \'callTools\' FUNCTION');
      expect(jsObjectPrompt).toContain('function callTools()');

      // Only JSOBJECT format is supported now
      template.setResponseFormat(FormatMode.LITERAL_JS);
      const jsObjectPrompt2 = template.buildPrompt(params);
      expect(jsObjectPrompt2).toContain('callTools');
      expect(jsObjectPrompt2).toContain('import { LiteralLoader }');
    });
  });
});