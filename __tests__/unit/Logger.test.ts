import { Logger } from '../../core/utils/Logger';

describe('Logger Interface', () => {
  it('should work with console as logger', () => {
    const logger: Logger = console;
    
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it('should work with custom logger implementation', () => {
    const mockLogger: Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockLogger.info('Test message');
    mockLogger.warn('Warning message');
    mockLogger.error('Error message');
    mockLogger.debug('Debug message');

    expect(mockLogger.info).toHaveBeenCalledWith('Test message');
    expect(mockLogger.warn).toHaveBeenCalledWith('Warning message');
    expect(mockLogger.error).toHaveBeenCalledWith('Error message');
    expect(mockLogger.debug).toHaveBeenCalledWith('Debug message');
  });

  it('should handle multiple arguments', () => {
    const mockLogger: Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const testObj = { key: 'value' };
    mockLogger.info('Message:', testObj, 123);

    expect(mockLogger.info).toHaveBeenCalledWith('Message:', testObj, 123);
  });
});