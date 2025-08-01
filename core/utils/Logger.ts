
/**
 * Defines a simple logging interface that the AgentLoop can use.
 * This allows the host application to inject its own logger (e.g., electron-log, winston).
 * A standard `console` object satisfies this interface.
 */
export interface Logger {
    info(message: any, ...args: any[]): void;
    warn(message: any, ...args: any[]): void;
    error(message: any, ...args: any[]): void;
    debug(message: any, ...args: any[]): void;
}