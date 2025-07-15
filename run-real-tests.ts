#!/usr/bin/env ts-node

/**
 * Real Function Calling Test Runner
 * 
 * This script runs real function calling tests using your Gemini API key.
 * 
 * Usage:
 *   GEMINI_API_KEY=your_key_here npm run test:real
 *   or
 *   GEMINI_API_KEY=your_key_here npx ts-node run-real-tests.ts
 */

import { runRealFunctionCallingTests } from './tests/unit/test-real-function-calling';

async function main() {
  try {
    console.log('🚀 Starting Real Function Calling Tests...\n');
    await runRealFunctionCallingTests();
    console.log('\n✅ All real tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Real test suite failed:', error);
    process.exit(1);
  }
}

main();