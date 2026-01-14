import { AgentLoop, FailureHandlingMode } from '../core/agents/AgentLoop';
import { AIProvider } from '../core/providers/AIProvider';
import { AICompletionResponse, AgentRunInput, Interaction, ToolCallReport, Tool } from '../core/types/types';
import { z, ZodTypeAny } from 'zod';

// Mock AI Provider
class MockAIProvider implements AIProvider {
    async getCompletion(prompt: string): Promise<AICompletionResponse> {
        return { text: '# final_tool\n## value\nDefault' };
    }
    getConfig() { return { service: 'openai' } as any; }
}

class TestAgent extends AgentLoop {
    protected systemPrompt = 'Test system prompt';

    public publicDefineTool(fn: (schema: typeof z) => Tool<ZodTypeAny>): void {
        this.defineTool(fn);
    }
}

describe('AgentLoop', () => {
    let provider: MockAIProvider;
    let agent: TestAgent;

    beforeEach(() => {
        provider = new MockAIProvider();
        agent = new TestAgent(provider, {
            maxIterations: 5,
        });
        // Spy on console.log and redirect to console.error for visibility in jest
        jest.spyOn(console, 'log').mockImplementation((...args) => {
            console.error(...args);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should run until final_tool is called', async () => {
        let callCount = 0;
        jest.spyOn(provider, 'getCompletion').mockImplementation(async (prompt) => {
            callCount++;
            if (callCount === 1) {
                return { text: '# self_reasoning_tool\n## goal\nTest\n## goal_status\npending\n## pending_action\nStep 1\n## progress_summary\n- Start\n\n# dummy_tool' };
            }
            return { text: '# self_reasoning_tool\n## goal\nTest\n## goal_status\nsuccess\n## pending_action\nDone\n## progress_summary\n- Finish\n\n# final_tool\n## value\nSuccess' };
        });

        agent.publicDefineTool((z) => ({
            name: 'dummy_tool',
            description: 'Dummy',
            argsSchema: z.object({}).passthrough(),
            handler: async ({ name }) => ({ toolName: name, success: true, ok: true }),
        }));

        const result = await agent.run({ userPrompt: 'Go' });
        expect(result.agentResponse?.args).toEqual({ toolName: 'final_tool', value: 'Success' });
        expect(callCount).toBe(2);
    });

    it('should stop at max iterations', async () => {
        agent = new TestAgent(provider, { maxIterations: 1 });
        agent.publicDefineTool((z) => ({
            name: 'dummy_tool',
            description: 'Dummy',
            argsSchema: z.object({}).passthrough(),
            handler: async ({ name }) => ({ toolName: name, success: true, ok: true }),
        }));

        jest.spyOn(provider, 'getCompletion').mockResolvedValue({
            text: '# self_reasoning_tool\n## goal\nTest\n## goal_status\npending\n## pending_action\nStep\n## progress_summary\n- Step\n\n# dummy_tool'
        });

        const result = await agent.run({ userPrompt: 'Go' });
        const lastInteraction = result.interactionHistory[result.interactionHistory.length - 1];
        expect('report' in lastInteraction).toBe(true);
        const report = lastInteraction as ToolCallReport;
        expect(report.overallSuccess).toBe(false);
        expect(report.error).toContain('Maximum iterations reached');
    });

    it('should detect stagnation and terminate', async () => {
        agent = new TestAgent(provider, {
            maxIterations: 5,
            stagnationTerminationThreshold: 2
        });
        agent.publicDefineTool((z) => ({
            name: 'dummy_tool',
            description: 'Dummy',
            argsSchema: z.object({}).passthrough(),
            handler: async ({ name }) => ({ toolName: name, success: true, ok: true }),
        }));

        // Return identical progress summary
        jest.spyOn(provider, 'getCompletion').mockResolvedValue({
            text: '# self_reasoning_tool\n## goal\nTest\n## goal_status\npending\n## pending_action\nStep\n## progress_summary\n- Same\n\n# dummy_tool'
        });

        const result = await agent.run({ userPrompt: 'Go' });
        const lastInteraction = result.interactionHistory[result.interactionHistory.length - 1] as ToolCallReport;
        expect(lastInteraction.error).toContain('Stagnation detected');
    });
});
