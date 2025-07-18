import { ToolResult, PendingToolCall, ChatEntry, AgentRunInput } from '../../core/types/types';

describe('Types', () => {
  it('should create valid ToolResult', () => {
    const toolResult: ToolResult = {
      toolName: 'test_tool',
      success: true,
      output: 'test output'
    };

    expect(toolResult.toolName).toBe('test_tool');
    expect(toolResult.success).toBe(true);
    expect(toolResult.output).toBe('test output');
  });

  it('should create valid PendingToolCall', () => {
    const pendingCall: PendingToolCall = {
      toolName: 'test_tool',
      args: { input: 'test input' }
    };

    expect(pendingCall.toolName).toBe('test_tool');
    expect(pendingCall.args.input).toBe('test input');
  });

  it('should create valid ChatEntry', () => {
    const chatEntry: ChatEntry = {
      sender: 'user',
      message: 'Hello, how are you?'
    };

    expect(chatEntry.sender).toBe('user');
    expect(chatEntry.message).toBe('Hello, how are you?');
  });

  it('should create valid AgentRunInput', () => {
    const agentInput: AgentRunInput = {
      userPrompt: 'Test prompt',
      conversationHistory: [{
        sender: 'user',
        message: 'Previous message'
      }],
      toolCallHistory: [{
        toolName: 'previous_tool',
        success: true,
        output: 'previous result'
      }],
      context: { key: 'value' }
    };

    expect(agentInput.userPrompt).toBe('Test prompt');
    expect(agentInput.conversationHistory).toHaveLength(1);
    expect(agentInput.toolCallHistory).toHaveLength(1);
    expect(agentInput.context?.key).toBe('value');
  });
});