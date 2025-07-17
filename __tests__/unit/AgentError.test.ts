import { AgentError, AgentErrorType } from '../../core/utils/AgentError';

describe('AgentError', () => {
  it('should create an error with message and type', () => {
    const error = new AgentError('Test error', AgentErrorType.TOOL_NOT_FOUND);
    
    expect(error).toBeInstanceOf(AgentError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test error');
    expect(error.type).toBe(AgentErrorType.TOOL_NOT_FOUND);
    expect(error.name).toBe('AgentError');
  });

  it('should create an error with context', () => {
    const context = { toolName: 'missing_tool' };
    const error = new AgentError('Tool not found', AgentErrorType.TOOL_NOT_FOUND, context);
    
    expect(error.context).toEqual(context);
    expect(error.context.toolName).toBe('missing_tool');
  });

  it('should have a timestamp', () => {
    const error = new AgentError('Test error', AgentErrorType.UNKNOWN);
    
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should provide user-friendly messages', () => {
    const error = new AgentError('Raw error', AgentErrorType.TOOL_NOT_FOUND, { toolName: 'test_tool' });
    
    const userMessage = error.getUserMessage();
    expect(userMessage).toContain('test_tool');
    expect(userMessage).toContain('not available');
  });

  it('should identify recoverable errors', () => {
    const recoverableError = new AgentError('Recoverable', AgentErrorType.TOOL_EXECUTION_ERROR);
    const nonRecoverableError = new AgentError('Non-recoverable', AgentErrorType.CONFIGURATION_ERROR);
    
    expect(recoverableError.isRecoverable()).toBe(true);
    expect(nonRecoverableError.isRecoverable()).toBe(false);
  });
});