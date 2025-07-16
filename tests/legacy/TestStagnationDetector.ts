import { StagnationDetector } from '../core/utils/StagnationDetector';
import { PendingToolCall, ToolResult } from '../core/types/types';

// Test the StagnationDetector functionality
function testStagnationDetector() {
  console.log('🔍 Testing StagnationDetector...');

  const detector = new StagnationDetector({
    windowSize: 10,
    similarityThreshold: 0.8,
    enableTimeBasedDetection: false // Disable for testing
  });

  // Test 1: No stagnation with different calls
  console.log('\n1️⃣ Testing no stagnation (different calls)...');
  const call1: PendingToolCall = { name: 'get_weather', location: 'New York' };
  const call2: PendingToolCall = { name: 'get_forecast', location: 'London' };
  const history1: ToolResult[] = [
    { toolName: 'get_weather', success: true, output: { temp: '20C' } },
    { toolName: 'get_forecast', success: true, output: { forecast: 'sunny' } }
  ];

  const result1 = detector.isStagnant(call1, history1, 1);
  console.log('✅ No stagnation result:', result1);

  // Test 2: Repeated calls should trigger stagnation
  console.log('\n2️⃣ Testing repeated calls stagnation...');
  const repeatedCall: PendingToolCall = { name: 'get_weather', location: 'New York' };
  const repeatedHistory: ToolResult[] = [
    { toolName: 'get_weather', success: true, output: { temp: '20C' } },
    { toolName: 'get_weather', success: true, output: { temp: '20C' } },
    { toolName: 'get_weather', success: true, output: { temp: '20C' } },
    { toolName: 'get_weather', success: true, output: { temp: '20C' } }
  ];

  const result2 = detector.isStagnant(repeatedCall, repeatedHistory, 5);
  console.log('🔥 Repeated calls result:', result2);

  // Test 3: Error loops
  console.log('\n3️⃣ Testing error loops...');
  const errorCall: PendingToolCall = { name: 'failing_tool', data: 'test' };
  const errorHistory: ToolResult[] = [
    { toolName: 'failing_tool', success: false, error: 'Connection timeout' },
    { toolName: 'failing_tool', success: false, error: 'Connection timeout' },
    { toolName: 'failing_tool', success: false, error: 'Connection timeout' },
    { toolName: 'other_tool', success: true, output: { result: 'ok' } }
  ];

  const result3 = detector.isStagnant(errorCall, errorHistory, 3);
  console.log('💥 Error loop result:', result3);

  // Test 4: Cyclic patterns
  console.log('\n4️⃣ Testing cyclic patterns...');
  const cyclicCall: PendingToolCall = { name: 'tool_a', step: 1 };
  const cyclicHistory: ToolResult[] = [
    { toolName: 'tool_a', success: true, output: { step: 1 } },
    { toolName: 'tool_b', success: true, output: { step: 2 } },
    { toolName: 'tool_c', success: true, output: { step: 3 } },
    { toolName: 'tool_a', success: true, output: { step: 1 } },
    { toolName: 'tool_b', success: true, output: { step: 2 } },
    { toolName: 'tool_c', success: true, output: { step: 3 } },
    { toolName: 'tool_a', success: true, output: { step: 1 } }
  ];

  const result4 = detector.isStagnant(cyclicCall, cyclicHistory, 8);
  console.log('🔄 Cyclic pattern result:', result4);

  // Test 5: No progress (low success rate)
  console.log('\n5️⃣ Testing no progress detection...');
  const noProgressCall: PendingToolCall = { name: 'unreliable_tool', attempt: 5 };
  const noProgressHistory: ToolResult[] = [
    { toolName: 'unreliable_tool', success: false, error: 'Failed' },
    { toolName: 'unreliable_tool', success: false, error: 'Failed again' },
    { toolName: 'unreliable_tool', success: false, error: 'Still failed' },
    { toolName: 'unreliable_tool', success: false, error: 'Failed' },
    { toolName: 'unreliable_tool', success: false, error: 'Failed' }
  ];

  const result5 = detector.isStagnant(noProgressCall, noProgressHistory, 6);
  console.log('📉 No progress result:', result5);

  // Test 6: Diagnostics
  console.log('\n6️⃣ Testing diagnostics...');
  const diagnostics = detector.getDiagnostics(cyclicHistory);
  console.log('📊 Diagnostics:', {
    recentCallsCount: diagnostics.recentCalls.length,
    uniqueTools: diagnostics.callFrequency.size,
    successRate: diagnostics.successRate
  });

  console.log('\n🎉 All StagnationDetector tests completed!');
}

// Test the configuration options
function testStagnationDetectorConfig() {
  console.log('\n🔧 Testing StagnationDetector configuration...');

  // Test with different window sizes
  const smallWindow = new StagnationDetector({ windowSize: 3 });
  const largeWindow = new StagnationDetector({ windowSize: 20 });

  // Test with different similarity thresholds
  const strictSimilarity = new StagnationDetector({ similarityThreshold: 0.95 });
  const looseSimilarity = new StagnationDetector({ similarityThreshold: 0.5 });

  console.log('✅ Configuration variations created successfully');
}

if (require.main === module) {
  testStagnationDetector();
  testStagnationDetectorConfig();
}

export { testStagnationDetector, testStagnationDetectorConfig };