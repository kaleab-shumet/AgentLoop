import { runAllTests } from './test-function-calling';
import { runAdvancedTests } from './test-function-calling-advanced';

/**
 * Comprehensive Function Calling Test Suite
 * Runs all function calling tests in sequence
 */

async function runFullFunctionCallingSuite(): Promise<void> {
  console.log('🎯 Function Calling Test Suite');
  console.log('===============================');
  console.log('Running comprehensive tests for AgentLoop function calling...\n');
  
  const startTime = Date.now();
  
  try {
    // Run basic tests
    console.log('📋 Phase 1: Basic Function Calling Tests');
    console.log('----------------------------------------');
    await runAllTests();
    
    console.log('\n📋 Phase 2: Advanced Function Calling Tests');
    console.log('--------------------------------------------');
    await runAdvancedTests();
    
    const totalTime = Date.now() - startTime;
    
    console.log('\n🏆 Test Suite Results');
    console.log('=====================');
    console.log('✅ All function calling tests passed!');
    console.log(`⏱️  Total execution time: ${totalTime}ms`);
    console.log('📊 Test Coverage:');
    console.log('   ✓ Basic function calling');
    console.log('   ✓ Multiple tool calls');
    console.log('   ✓ Complex JSON arguments');
    console.log('   ✓ Error handling');
    console.log('   ✓ Invalid JSON parsing');
    console.log('   ✓ Parallel execution');
    console.log('   ✓ Chain of dependencies');
    console.log('   ✓ Conditional logic with failures');
    console.log('   ✓ Nested data structures');
    console.log('   ✓ Timeout and retry logic');
    console.log('   ✓ Large scale parallel processing');
    console.log('   ✓ Edge cases and malformed responses');
    
    console.log('\n🎉 Function calling implementation is robust and ready for production!');
    
  } catch (error: any) {
    console.error('❌ Function calling test suite failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the full suite if this file is executed directly
if (require.main === module) {
  runFullFunctionCallingSuite().catch(error => {
    console.error('❌ Test suite execution failed:', error);
    process.exit(1);
  });
}

export { runFullFunctionCallingSuite };