#!/usr/bin/env ts-node

/**
 * Function Calling Test Runner
 * 
 * This script runs comprehensive tests for the AgentLoop function calling functionality.
 * 
 * Usage:
 *   npm run test:function-calling
 *   or
 *   npx ts-node run-function-calling-tests.ts
 */

import { runFullFunctionCallingSuite } from './tests/unit/test-function-calling-suite';

async function main() {
  try {
    console.log('🚀 Starting Function Calling Test Suite...\n');
    await runFullFunctionCallingSuite();
    console.log('\n✅ All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

main();