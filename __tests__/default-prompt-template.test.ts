import { DefaultPromptTemplate } from '../core/prompt/DefaultPromptTemplate';
import { FormatMode, BuildPromptParams, PromptOptions, Interaction, ToolCallReport, ToolCall } from '../core/types/types';
import { AgentError, AgentErrorType } from '../core/utils/AgentError';

describe('DefaultPromptTemplate', () => {
    let template: DefaultPromptTemplate;

    beforeEach(() => {
        template = new DefaultPromptTemplate(FormatMode.MD_STRUCT);
    });

    it('should initialize with default format', () => {
        expect(template.getResponseFormat()).toBe(FormatMode.MD_STRUCT);
    });

    it('should allow changing response format', () => {
        template.setResponseFormat(FormatMode.MD_STRUCT); // Only one format supported currently
        expect(template.getResponseFormat()).toBe(FormatMode.MD_STRUCT);
    });

    it('should throw error for unsupported format in buildResponseFormatSection', () => {
        // Force an unsupported format for testing
        (template as any).responseFormat = 'INVALID' as any;
        expect(() => (template as any).buildResponseFormatSection('self', 'final')).toThrow(AgentError);
    });

    describe('buildPrompt', () => {
        const defaultParams: BuildPromptParams = {
            systemPrompt: 'System prompt',
            userPrompt: 'User request',
            currentInteractionHistory: [],
            finalToolName: 'final_tool',
            reportToolName: 'self_reasoning',
            toolDefinitions: 'Tool definitions',
            goal: 'User goal',
            context: { 'Context Title': 'Context Content' },
            lastError: null,
            keepRetry: false,
        };

        const defaultOptions: PromptOptions = {
            includeContext: true,
        };

        it('should build a full prompt with all sections', () => {
            const prompt = template.buildPrompt(defaultParams, defaultOptions);
            expect(prompt).toContain('System prompt');
            expect(prompt).toContain('# CORE DIRECTIVE');
            expect(prompt).toContain('# RESPONSE FORMAT: MD-STRUCT');
            expect(prompt).toContain('# AVAILABLE TOOLS');
            expect(prompt).toContain('# CURRENT TASK PROGRESS');
            expect(prompt).toContain('# CONTEXT TITLE');
            expect(prompt).toContain('## CURRENT GOAL');
            expect(prompt).toContain('# FOCUS ON CURRENT TASK');
        });

        it('should handle missing system prompt', () => {
            const params = { ...defaultParams, systemPrompt: '' };
            const prompt = template.buildPrompt(params, defaultOptions);
            expect(prompt).not.toContain('System prompt');
        });

        it('should handle missing context or includeContext=false', () => {
            const prompt = template.buildPrompt(defaultParams, { includeContext: false });
            expect(prompt).not.toContain('# CONTEXT TITLE');
        });

        it('should include stagnation warning if present', () => {
            const params = { ...defaultParams, stagnationWarning: 'Stagnation warning message' };
            const prompt = template.buildPrompt(params, defaultOptions);
            expect(prompt).toContain('# ⚠️ CRITICAL WARNING');
            expect(prompt).toContain('Stagnation warning message');
        });

        it('should use USER REQUEST if goal is not provided', () => {
            const params = { ...defaultParams, goal: undefined };
            const prompt = template.buildPrompt(params, defaultOptions);
            expect(prompt).toContain('## USER REQUEST');
            expect(prompt).toContain('> User request');
        });

        it('should show PREVIOUS ACTION FAILED if lastError is present', () => {
            const lastError = new AgentError('Tool failed', AgentErrorType.TOOL_EXECUTION_ERROR);
            const params = { ...defaultParams, lastError };
            const prompt = template.buildPrompt(params, defaultOptions);
            expect(prompt).toContain('# PREVIOUS ACTION FAILED');
            expect(prompt).toContain('Tool failed');
        });

        it('should show execution history in CURRENT TASK PROGRESS', () => {
            const toolCalls: ToolCall[] = [
                {
                    taskId: '1',
                    type: 'tool_call',
                    timestamp: new Date().toISOString(),
                    toolName: 'self_reasoning',
                    args: { pending_action: 'Doing something', progress_summary: 'Step 1 done' },
                    success: true,
                },
                {
                    taskId: '1',
                    type: 'tool_call',
                    timestamp: new Date().toISOString(),
                    toolName: 'other_tool',
                    args: { param: 'value' },
                    success: true,
                },
            ];
            const history: Interaction[] = [
                {
                    report: 'Turn 1 report',
                    overallSuccess: true,
                    toolCalls: toolCalls,
                } as ToolCallReport,
            ];
            const params = { ...defaultParams, currentInteractionHistory: history };
            const prompt = template.buildPrompt(params, defaultOptions);
            expect(prompt).toContain('### Turn 1: Doing something');
            expect(prompt).toContain('- Tool `other_tool` -> SUCCESS');
            expect(prompt).toContain('## PROGRESS SUMMARY');
            expect(prompt).toContain('Step 1 done');
            expect(prompt).toContain('Doing something (success)');
        });

        it('should handle failed tool calls in history', () => {
            const toolCalls: ToolCall[] = [
                {
                    taskId: '1',
                    type: 'tool_call',
                    timestamp: new Date().toISOString(),
                    toolName: 'self_reasoning',
                    args: { pending_action: 'Doing something', progress_summary: 'Step 1 failed' },
                    success: true,
                },
                {
                    taskId: '1',
                    type: 'tool_call',
                    timestamp: new Date().toISOString(),
                    toolName: 'other_tool',
                    args: { param: 'value' },
                    success: false,
                    error: 'Some error',
                },
            ];
            const history: Interaction[] = [
                {
                    report: 'Turn 1 report',
                    overallSuccess: false,
                    toolCalls: toolCalls,
                } as ToolCallReport,
            ];
            const params = { ...defaultParams, currentInteractionHistory: history };
            const prompt = template.buildPrompt(params, defaultOptions);
            expect(prompt).toContain('- Tool `other_tool` -> FAILED: Error: Some error');
            expect(prompt).toContain('Step 1 failed');
            expect(prompt).toContain('Doing something (error)');
        });
    });
});
