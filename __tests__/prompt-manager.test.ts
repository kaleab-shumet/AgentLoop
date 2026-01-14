import { PromptManager } from '../core/prompt/PromptManager';
import { DefaultPromptTemplate } from '../core/prompt/DefaultPromptTemplate';
import { FormatMode, BuildPromptParams, PromptOptions } from '../core/types/types';
import { AgentError } from '../core/utils/AgentError';

describe('PromptManager', () => {
    const systemPrompt = 'System prompt';

    it('should initialize with default template', () => {
        const manager = new PromptManager(systemPrompt);
        expect(manager.isUsingCustomTemplate()).toBe(false);
        expect(manager.getResponseFormat()).toBe(FormatMode.MD_STRUCT);
    });

    it('should initialize with custom template', () => {
        const customTemplate = new DefaultPromptTemplate(FormatMode.MD_STRUCT);
        const manager = new PromptManager(systemPrompt, { customTemplate });
        expect(manager.isUsingCustomTemplate()).toBe(true);
        expect(manager.getResponseFormat()).toBe(null);
    });

    it('should set and get response format', () => {
        const manager = new PromptManager(systemPrompt);
        manager.setResponseFormat(FormatMode.MD_STRUCT);
        expect(manager.getResponseFormat()).toBe(FormatMode.MD_STRUCT);
    });

    it('should throw error when setting format on custom template', () => {
        const customTemplate = new DefaultPromptTemplate(FormatMode.MD_STRUCT);
        const manager = new PromptManager(systemPrompt, { customTemplate });
        expect(() => manager.setResponseFormat(FormatMode.MD_STRUCT)).toThrow(AgentError);
    });

    it('should switch between custom and default templates', () => {
        const manager = new PromptManager(systemPrompt);
        const customTemplate = new DefaultPromptTemplate(FormatMode.MD_STRUCT);

        manager.setCustomTemplate(customTemplate);
        expect(manager.isUsingCustomTemplate()).toBe(true);

        manager.setDefaultTemplate(FormatMode.MD_STRUCT);
        expect(manager.isUsingCustomTemplate()).toBe(false);
        expect(manager.getResponseFormat()).toBe(FormatMode.MD_STRUCT);
    });

    it('should configure prompt options', () => {
        const manager = new PromptManager(systemPrompt);
        manager.configure({ includeContext: false });
        expect(manager.getPromptOptions().includeContext).toBe(false);
    });

    it('should set error recovery instructions', () => {
        const manager = new PromptManager(systemPrompt);
        manager.setErrorRecoveryInstructions('Fix it!');
        // No getter for this, but we can check if it's set internally if needed
        // or just assume it works if no error.
    });

    it('should build prompt using template', () => {
        const manager = new PromptManager(systemPrompt);
        const params: BuildPromptParams = {
            systemPrompt: 'System',
            userPrompt: 'User',
            context: {},
            currentInteractionHistory: [],
            lastError: null,
            keepRetry: false,
            finalToolName: 'final',
            reportToolName: 'report',
            toolDefinitions: 'Tools',
        };
        const prompt = manager.buildPrompt(params);
        expect(prompt).toContain('System');
        expect(prompt).toContain('# CORE DIRECTIVE');
    });
});
