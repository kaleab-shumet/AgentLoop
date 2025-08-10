import { describe, it, expect } from '@jest/globals';
import { DefaultPromptTemplate } from '../core/prompt/DefaultPromptTemplate';
import { FormatMode, BuildPromptParams } from '../core/types/types';

describe('DefaultPromptTemplate JSObject Format', () => {
  let template: DefaultPromptTemplate;

  beforeEach(() => {
    template = new DefaultPromptTemplate(FormatMode.JSOBJECT);
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
        reportToolName: 'report_action',
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
        reportToolName: 'report_action',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should contain both format examples
      expect(prompt).toContain('### FORMAT 1: Data Gathering');
      expect(prompt).toContain('### FORMAT 2: Final Answer');
      
      // Should reference the correct tool names
      expect(prompt).toContain('toolName: "final"');
      expect(prompt).toContain('toolName: "report_action"');
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
        reportToolName: 'report_action',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should contain JSObject-specific requirements
      expect(prompt).toContain('Write ONLY a JavaScript function named `callTools`');
      expect(prompt).toContain('Function must return an array named `calledToolsList`');
      expect(prompt).toContain('Each object in array must have `toolName` property');
      expect(prompt).toContain('No external libraries or imports allowed');
      expect(prompt).toContain('Pure vanilla JavaScript only');
      expect(prompt).toContain('Use realistic, human-readable values');
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
        reportToolName: 'report_action',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should enforce tool pairing rules
      expect(prompt).toContain('NEVER call report_action alone');
      expect(prompt).toContain('Always add a report on your progress');
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
        reportToolName: 'custom_report',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      const prompt = template.buildPrompt(params);

      // Should use custom tool names in format examples
      expect(prompt).toContain('toolName: "custom_final"');
      expect(prompt).toContain('toolName: "custom_report"');
      expect(prompt).toContain('Use custom_final to deliver the final result');
      expect(prompt).toContain('NEVER call custom_report alone');
    });
  });

  describe('Format mode switching', () => {
    it('should switch between format modes correctly', () => {
      // Start with JSObject
      template.setResponseFormat(FormatMode.JSOBJECT);
      expect(template.getResponseFormat()).toBe(FormatMode.JSOBJECT);

      // Switch back to JSObject (only format supported)
      template.setResponseFormat(FormatMode.JSOBJECT);
      expect(template.getResponseFormat()).toBe(FormatMode.JSOBJECT);
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
        reportToolName: 'report_action',
        toolDefinitions: 'Test tool definitions',
        options: {},
        conversationEntries: [],
        conversationLimitNote: ''
      };

      // JSObject format
      template.setResponseFormat(FormatMode.JSOBJECT);
      const jsObjectPrompt = template.buildPrompt(params);
      expect(jsObjectPrompt).toContain('JAVASCRIPT \'callTools\' FUNCTION');
      expect(jsObjectPrompt).toContain('function callTools()');

      // Only JSOBJECT format is supported now
      template.setResponseFormat(FormatMode.JSOBJECT);
      const jsObjectPrompt2 = template.buildPrompt(params);
      expect(jsObjectPrompt2).toContain('callTools');
      expect(jsObjectPrompt2).toContain('import { LiteralLoader }');
    });
  });
});