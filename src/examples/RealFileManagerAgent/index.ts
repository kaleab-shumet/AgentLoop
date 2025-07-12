/**
 * RealFileManagerAgent - A comprehensive file management agent using AgentLoop
 * 
 * This module provides a complete file management solution with:
 * - Natural language file operations
 * - Interactive console interface
 * - Comprehensive safety features
 * - Advanced search capabilities
 */

export { RealFileManagerAgent } from './RealFileManagerAgent';
export { FileManagerConsole, startFileManagerConsole } from './console-interface';
export { 
  runDemo, 
  runAutomatedDemo, 
  runInteractiveDemo, 
  runPerformanceTest, 
  runErrorHandlingTest 
} from './demo';
export { runSimpleTest } from './test-simple';

// Re-export types for convenience
export type { AgentRunInput, AgentRunOutput } from '../../core';

/**
 * Quick start function for new users
 */
export async function quickStart(apiKey?: string, workingDir?: string): Promise<void> {
  const { startFileManagerConsole } = await import('./console-interface');
  
  if (apiKey) {
    process.env.GEMINI_API_KEY = apiKey;
  }
  
  console.log('🚀 Starting RealFileManagerAgent...');
  await startFileManagerConsole();
}