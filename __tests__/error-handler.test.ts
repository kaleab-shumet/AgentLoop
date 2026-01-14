import { ErrorHandler } from '../core/utils/ErrorHandler';
import { AgentError, AgentErrorType } from '../core/utils/AgentError';
import { RetryContext } from '../core/types/types';

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;

    beforeEach(() => {
        errorHandler = new ErrorHandler(3);
    });

    it('should convert unknown error to AgentError', () => {
        const error = new Error('Normal error');
        const result = errorHandler.handleError(error);
        expect(result.actualError).toBeInstanceOf(AgentError);
        expect(result.actualError.type).toBe(AgentErrorType.UNKNOWN);
        expect(result.actualError.message).toBe('Normal error');
    });

    it('should use provided AgentError', () => {
        const agentError = new AgentError('Agent error', AgentErrorType.INVALID_RESPONSE);
        const result = errorHandler.handleError(agentError);
        expect(result.actualError).toBe(agentError);
    });

    it('should use provided retry context', () => {
        const retryContext: RetryContext = {
            connectionRetryCount: 1,
            connectionRetryLimit: 5,
            toolExecutionRetryCount: 2,
            toolExecutionRetryLimit: 10,
        };
        const result = errorHandler.handleError(new Error('error'), retryContext);
        expect(result.retryContext).toEqual(retryContext);
    });

    describe('Error Policies', () => {
        const testPolicy = (type: AgentErrorType, retryContext: Partial<RetryContext> = {}) => {
            const error = new AgentError('error', type);
            const fullContext: RetryContext = {
                connectionRetryCount: 0,
                connectionRetryLimit: 3,
                toolExecutionRetryCount: 0,
                toolExecutionRetryLimit: 3,
                ...retryContext
            };
            return errorHandler.handleError(error, fullContext);
        };

        it('should terminate immediately for CONNECTION_ERROR', () => {
            const result = testPolicy(AgentErrorType.CONNECTION_ERROR);
            expect(result.shouldTerminate).toBe(true);
            expect(result.feedbackToLLM).toBe(false);
        });

        it('should terminate after retries for UNKNOWN error', () => {
            expect(testPolicy(AgentErrorType.UNKNOWN, { connectionRetryCount: 0 }).shouldTerminate).toBe(false);
            expect(testPolicy(AgentErrorType.UNKNOWN, { connectionRetryCount: 3 }).shouldTerminate).toBe(true);
            expect(testPolicy(AgentErrorType.UNKNOWN).feedbackToLLM).toBe(false);
        });

        it('should provide feedback to LLM for INVALID_RESPONSE', () => {
            const result = testPolicy(AgentErrorType.INVALID_RESPONSE);
            expect(result.feedbackToLLM).toBe(true);
            expect(result.shouldTerminate).toBe(false);
        });

        it('should terminate after retries for TOOL_EXECUTION_ERROR', () => {
            expect(testPolicy(AgentErrorType.TOOL_EXECUTION_ERROR, { toolExecutionRetryCount: 0 }).shouldTerminate).toBe(false);
            expect(testPolicy(AgentErrorType.TOOL_EXECUTION_ERROR, { toolExecutionRetryCount: 3 }).shouldTerminate).toBe(true);
            expect(testPolicy(AgentErrorType.TOOL_EXECUTION_ERROR).feedbackToLLM).toBe(true);
        });

        it('should handle STAGNATION_ERROR based on context', () => {
            const error1 = new AgentError('stuck', AgentErrorType.STAGNATION_ERROR, { isLastChance: false });
            expect(errorHandler.handleError(error1).shouldTerminate).toBe(false);

            const error2 = new AgentError('stuck', AgentErrorType.STAGNATION_ERROR, { isLastChance: true });
            expect(errorHandler.handleError(error2).shouldTerminate).toBe(true);
            expect(errorHandler.handleError(error2).feedbackToLLM).toBe(true);
        });

        it('should terminate immediately for MAX_ITERATIONS_REACHED', () => {
            const result = testPolicy(AgentErrorType.MAX_ITERATIONS_REACHED);
            expect(result.shouldTerminate).toBe(true);
            expect(result.feedbackToLLM).toBe(false);
        });

        it('should terminate immediately for configuration errors', () => {
            expect(testPolicy(AgentErrorType.CONFIGURATION_ERROR).shouldTerminate).toBe(true);
            expect(testPolicy(AgentErrorType.RESERVED_TOOL_NAME).shouldTerminate).toBe(true);
        });

        it('should use default policy for unhandled error types', () => {
            const result = testPolicy('OTHER' as any, { connectionRetryCount: 3 });
            expect(result.shouldTerminate).toBe(true);
            expect(result.feedbackToLLM).toBe(false);
        });
    });

    it('should have a static handle method', () => {
        const result = ErrorHandler.handle(new Error('static'));
        expect(result.actualError.message).toBe('static');
    });

    it('should handle invalid timestamp in AgentError', () => {
        const error = new AgentError('msg', AgentErrorType.UNKNOWN);
        (error as any).timestamp = 'invalid';
        const result = errorHandler.handleError(error);
        const parsed = JSON.parse(result.errorString);
        expect(parsed.timestamp).toBeDefined();
    });
});
