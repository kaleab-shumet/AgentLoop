import { AIDataHandler } from '../core/handlers/AIDataHandler';
import { FormatHandlerFactory } from '../core/handlers/FormatHandlerFactory';
import { FormatMode, FormatHandler, Tool, PendingToolCall } from '../core/types/types';
import { AgentError } from '../core/utils/AgentError';
import { MDStructFormatHandler } from '../core/handlers/MDStructFormatHandler';
import { z } from 'zod';

describe('Handlers', () => {
    beforeEach(() => {
        FormatHandlerFactory.clearHandlers();
    });

    describe('FormatHandlerFactory', () => {
        it('should return MDStructFormatHandler for MD_STRUCT mode', () => {
            const handler = FormatHandlerFactory.getHandler(FormatMode.MD_STRUCT);
            expect(handler).toBeInstanceOf(MDStructFormatHandler);
        });

        it('should reuse handlers', () => {
            const handler1 = FormatHandlerFactory.getHandler(FormatMode.MD_STRUCT);
            const handler2 = FormatHandlerFactory.getHandler(FormatMode.MD_STRUCT);
            expect(handler1).toBe(handler2);
        });

        it('should throw error for unsupported mode', () => {
            expect(() => FormatHandlerFactory.getHandler('INVALID' as any)).toThrow(AgentError);
        });

        it('should allow registering custom handlers', () => {
            const customHandler: FormatHandler = {
                parseResponse: jest.fn(),
                formatToolDefinitions: jest.fn(),
            };
            FormatHandlerFactory.registerHandler('CUSTOM' as any, customHandler);
            expect(FormatHandlerFactory.getHandler('CUSTOM' as any)).toBe(customHandler);
        });

        it('should throw error if handler is missing after get (internal safety check)', () => {
            // This is hard to trigger normally, but we can mock the Map
            const originalHandlers = (FormatHandlerFactory as any).handlers;
            (FormatHandlerFactory as any).handlers = {
                has: () => true,
                get: () => undefined,
                set: () => { },
                clear: () => { }
            };
            expect(() => FormatHandlerFactory.getHandler(FormatMode.MD_STRUCT)).toThrow(AgentError);
            (FormatHandlerFactory as any).handlers = originalHandlers;
        });
    });

    describe('AIDataHandler', () => {
        it('should use specified format mode', () => {
            const handler = new AIDataHandler(FormatMode.MD_STRUCT);
            expect((handler as any).formatHandler).toBeInstanceOf(MDStructFormatHandler);
        });

        it('should call parseResponse on format handler', async () => {
            const customHandler: FormatHandler = {
                parseResponse: jest.fn().mockResolvedValue([{ toolName: 'test' }]),
                formatToolDefinitions: jest.fn().mockReturnValue('defs'),
            };
            FormatHandlerFactory.registerHandler(FormatMode.MD_STRUCT, customHandler);

            const handler = new AIDataHandler(FormatMode.MD_STRUCT);
            const result = await handler.parseAndValidate('response', []);

            expect(customHandler.parseResponse).toHaveBeenCalledWith('response', []);
            expect(result).toEqual([{ toolName: 'test' }]);
        });

        it('should call formatToolDefinitions on format handler', () => {
            const customHandler: FormatHandler = {
                parseResponse: jest.fn(),
                formatToolDefinitions: jest.fn().mockReturnValue('defs'),
            };
            FormatHandlerFactory.registerHandler(FormatMode.MD_STRUCT, customHandler);

            const handler = new AIDataHandler(FormatMode.MD_STRUCT);
            const result = handler.formatToolDefinitions([]);

            expect(customHandler.formatToolDefinitions).toHaveBeenCalledWith([]);
            expect(result).toBe('defs');
        });
    });
});
