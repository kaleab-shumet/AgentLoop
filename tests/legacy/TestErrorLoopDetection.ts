import { StagnationDetector } from '../core/utils/StagnationDetector';
import { PendingToolCall, ToolResult } from '../core/types/types';

// Test error loop detection specifically
function testErrorLoopDetection() {
  console.log('💥 Testing Error Loop Detection...');

  const detector = new StagnationDetector({
    windowSize: 10,
    similarityThreshold: 0.8,
    enableTimeBasedDetection: false
  });

  // Test with different current call to avoid repeated call detection
  console.log('\n1️⃣ Testing error loop with different current call...');
  const currentCall: PendingToolCall = { name: 'other_tool', data: 'different' };
  const errorHistory: ToolResult[] = [
    { toolName: 'failing_tool', success: false, error: 'Connection timeout' },
    { toolName: 'failing_tool', success: false, error: 'Connection timeout' }
  ];

  const result1 = detector.isStagnant(currentCall, errorHistory, 3);
  console.log('🎯 Error loop detection:', result1);

  // Test with exact same error pattern
  console.log('\n2️⃣ Testing error loop with same current call...');
  const errorCall: PendingToolCall = { name: 'failing_tool', data: 'test' };
  const result2 = detector.isStagnant(errorCall, errorHistory, 3);
  console.log('🎯 Same tool error detection:', result2);

  console.log('\n📋 Analysis:');
  console.log(`   - Different current call: ${result1.reason}`);
  console.log(`   - Same current call: ${result2.reason}`);
  console.log('   Note: Both should detect the pattern, but may use different detection methods');

  console.log('\n✅ Error loop detection test completed!');
}

if (require.main === module) {
  testErrorLoopDetection();
}

export { testErrorLoopDetection };