import { StagnationDetector } from '../core/utils/StagnationDetector';
import { PendingToolCall, ToolResult } from '../core/types/types';

// Test the improved StagnationDetector with lower thresholds
function testImprovedStagnationDetection() {
  console.log('🔧 Testing Improved StagnationDetector Thresholds...');

  const detector = new StagnationDetector({
    windowSize: 10,
    similarityThreshold: 0.8,
    enableTimeBasedDetection: false
  });

  // Test 1: Two repeated calls should now trigger stagnation (previously required 3)
  console.log('\n1️⃣ Testing lower threshold (2 repeated calls)...');
  const repeatedCall: PendingToolCall = { name: 'get_weather', location: 'New York' };
  const twoRepeats: ToolResult[] = [
    { toolname: 'get_weather', success: true, output: { temp: '20C' } },
    { toolname: 'get_weather', success: true, output: { temp: '20C' } }
  ];

  const result1 = detector.isStagnant(repeatedCall, twoRepeats, 3);
  console.log('🎯 Two repeats result:', result1);
  console.log(`   Expected: Stagnant=true, Confidence=0.75`);

  // Test 2: Two error repeats should trigger with high confidence (85%)
  console.log('\n2️⃣ Testing lower error threshold (2 repeated errors)...');
  const errorCall: PendingToolCall = { name: 'failing_tool', data: 'test' };
  const twoErrors: ToolResult[] = [
    { toolname: 'failing_tool', success: false, error: 'Connection timeout' },
    { toolname: 'failing_tool', success: false, error: 'Connection timeout' }
  ];

  const result2 = detector.isStagnant(errorCall, twoErrors, 3);
  console.log('💥 Two errors result:', result2);
  console.log(`   Expected: Stagnant=true, Confidence=0.85`);

  // Test 3: Three repeated calls should have full confidence
  console.log('\n3️⃣ Testing three repeated calls (full confidence)...');
  const threeRepeats: ToolResult[] = [
    { toolname: 'get_weather', success: true, output: { temp: '20C' } },
    { toolname: 'get_weather', success: true, output: { temp: '20C' } },
    { toolname: 'get_weather', success: true, output: { temp: '20C' } }
  ];

  const result3 = detector.isStagnant(repeatedCall, threeRepeats, 4);
  console.log('🔥 Three repeats result:', result3);
  console.log(`   Expected: Stagnant=true, Confidence=1.0`);

  // Test 4: Verify no false positives with single calls
  console.log('\n4️⃣ Testing no false positives (single calls)...');
  const singleCall: ToolResult[] = [
    { toolname: 'get_weather', success: true, output: { temp: '20C' } }
  ];

  const result4 = detector.isStagnant(repeatedCall, singleCall, 2);
  console.log('✅ Single call result:', result4);
  console.log(`   Expected: Stagnant=false, Confidence=0`);

  console.log('\n🎉 Improved stagnation detection tests completed!');
  console.log('\n📋 Summary:');
  console.log(`   - 2x repeated calls: ${result1.isStagnant ? '✅' : '❌'} (confidence: ${result1.confidence})`);
  console.log(`   - 2x repeated errors: ${result2.isStagnant ? '✅' : '❌'} (confidence: ${result2.confidence})`);
  console.log(`   - 3x repeated calls: ${result3.isStagnant ? '✅' : '❌'} (confidence: ${result3.confidence})`);
  console.log(`   - Single call: ${!result4.isStagnant ? '✅' : '❌'} (no false positive)`);
}

if (require.main === module) {
  testImprovedStagnationDetection();
}

export { testImprovedStagnationDetection };