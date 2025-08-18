
/**
 * Defines a simple logging interface that the AgentLoop can use.
 * This allows the host application to inject its own logger (e.g., electron-log, winston).
 * A standard `console` object satisfies this interface.
 */
export interface Logger {
    info(message: unknown, ...args: unknown[]): void;
    warn(message: unknown, ...args: unknown[]): void;
    error(message: unknown, ...args: unknown[]): void;
    debug(message: unknown, ...args: unknown[]): void;
}