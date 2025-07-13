import { StagnationDetector } from '../core/utils/StagnationDetector';
import { PendingToolCall, ToolResult } from '../core/types/types';

// Test forced termination thresholds
function testForcedTerminationThresholds() {
  console.log('🛑 Testing Forced Termination Thresholds...');

  const detector = new StagnationDetector({
    windowSize: 10,
    similarityThreshold: 0.8,
    enableTimeBasedDetection: false
  });

  console.log('\n📊 Testing Confidence Thresholds:');
  console.log('   70-89%: Warning only (continue execution)');
  console.log('   90%+:   Forced termination');

  // Test 1: 75% confidence - should warn but not force termination
  console.log('\n1️⃣ Testing 75% confidence (2 repeated calls)...');
  const repeatedCall: PendingToolCall = { name: 'get_weather', location: 'New York' };
  const twoRepeats: ToolResult[] = [
    { toolName: 'get_weather', success: true, output: { temp: '20C' } },
    { toolName: 'get_weather', success: true, output: { temp: '20C' } }
  ];

  const result75 = detector.isStagnant(repeatedCall, twoRepeats, 3);
  console.log('🟡 75% confidence result:', result75);
  console.log(`   Action: ${result75.confidence >= 0.90 ? 'FORCE TERMINATION' : 'WARNING ONLY'}`);

  // Test 2: 100% confidence - should force termination
  console.log('\n2️⃣ Testing 100% confidence (3+ repeated calls)...');
  const threeRepeats: ToolResult[] = [
    { toolName: 'get_weather', success: true, output: { temp: '20C' } },
    { toolName: 'get_weather', success: true, output: { temp: '20C' } },
    { toolName: 'get_weather', success: true, output: { temp: '20C' } }
  ];

  const result100 = detector.isStagnant(repeatedCall, threeRepeats, 4);
  console.log('🔴 100% confidence result:', result100);
  console.log(`   Action: ${result100.confidence >= 0.90 ? 'FORCE TERMINATION' : 'WARNING ONLY'}`);

  // Test 3: Error loop with 85% confidence - should force termination
  console.log('\n3️⃣ Testing error loop (2 repeated errors)...');
  const errorCall: PendingToolCall = { name: 'failing_tool', data: 'test' };
  const twoErrors: ToolResult[] = [
    { toolName: 'failing_tool', success: false, error: 'Connection timeout' },
    { toolName: 'failing_tool', success: false, error: 'Connection timeout' }
  ];

  const resultError = detector.isStagnant(errorCall, twoErrors, 3);
  console.log('💥 Error loop result:', resultError);
  console.log(`   Action: ${resultError.confidence >= 0.90 ? 'FORCE TERMINATION' : 'WARNING ONLY'}`);

  console.log('\n📋 Summary:');
  console.log(`   - 75% confidence: ${result75.confidence >= 0.90 ? '🔴 FORCE' : '🟡 WARN'}`);
  console.log(`   - 100% confidence: ${result100.confidence >= 0.90 ? '🔴 FORCE' : '🟡 WARN'}`);
  console.log(`   - Error loop: ${resultError.confidence >= 0.90 ? '🔴 FORCE' : '🟡 WARN'}`);

  console.log('\n✅ Forced termination threshold tests completed!');
  console.log('   This ensures agents don\'t get stuck in infinite loops.');
}

if (require.main === module) {
  testForcedTerminationThresholds();
}

export { testForcedTerminationThresholds };