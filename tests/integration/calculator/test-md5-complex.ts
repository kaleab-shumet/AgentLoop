import { MD5HashAgent } from './md5-hash-agent';

async function testComplexStrings() {
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'your-api-key-here',
    service: 'google',
    model: 'gemini-2.0-flash'
  };

  const agent = new MD5HashAgent(config);

  console.log('🧪 Testing MD5HashAgent with Complex Strings');
  console.log('='.repeat(50));

  const complexTestCases = [
    /*
    {
      description: "Very long string (10,000 chars)",
      prompt: `Generate MD5 hash for this very long string: ${'A'.repeat(10000)}`
    },
    {
      description: "Unicode and special characters",
      prompt: "Generate MD5 hash for: 🚀🔥💎🌟 Hello 世界 ñoño café résumé naïve"
    },
    {
      description: "JSON-like structure",
      prompt: `Generate MD5 hash for: {"users":[{"id":1,"name":"John","data":{"nested":{"value":123.45}}}],"timestamp":"2024-01-01T00:00:00Z"}`
    },
    {
      description: "SQL injection attempt",
      prompt: "Generate MD5 hash for: '; DROP TABLE users; --"
    },
    {
      description: "Base64 encoded data",
      prompt: "Generate MD5 hash for: SGVsbG8gV29ybGQhIFRoaXMgaXMgYSBsb25nIGJhc2U2NCBlbmNvZGVkIHN0cmluZyB0aGF0IGNvbnRhaW5zIHZhcmlvdXMgY2hhcmFjdGVycw=="
    },
    {
      description: "Multiple newlines and tabs",
      prompt: `Generate MD5 hash for text with complex whitespace:
Line 1
	Tabbed line
		Double tabbed
			
Empty line above
Final line`
    },*/
    {
      description: "Batch processing complex strings",
      prompt: "Generate MD5 hashes for multiple complex strings: 'password123!@#', '🔐secure🔐', '{\"api\":\"key\"}'"
    }
  ];

  for (let i = 0; i < complexTestCases.length; i++) {
    const testCase = complexTestCases[i];
    console.log(`\n--- Test ${i + 1}: ${testCase.description} ---`);

    try {
      const startTime = Date.now();
      
      const result = await agent.run({
        userPrompt: testCase.prompt,
        conversationHistory: [],
        toolCallHistory: []
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('✅ Success!');
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log('Final Answer:', result.finalAnswer?.output?.value || 'No final answer');
      
      // Show detailed tool results
      result.toolCallHistory.forEach((tool, index) => {
        if (tool.success && tool.output) {
          console.log(`\n${index + 1}. ${tool.toolName}:`);
          if (tool.output.md5Hash) {
            console.log(`   Hash: ${tool.output.md5Hash}`);
            console.log(`   Input Length: ${tool.output.originalText?.length || 'N/A'} chars`);
          }
          if (tool.output.results) {
            console.log(`   Batch Results: ${tool.output.results.length} hashes generated`);
            tool.output.results.forEach((r: any, idx: number) => {
              console.log(`     ${idx + 1}. ${r.md5Hash} (${r.textLength} chars)`);
            });
          }
        } else if (!tool.success) {
          console.log(`❌ ${tool.toolName} failed: ${tool.error}`);
        }
      });

    } catch (error) {
      console.log(`❌ Test failed: ${error}`);
    }
  }

  // Additional stress test
  console.log('\n--- Stress Test: Multiple operations ---');
  try {
    const result = await agent.run({
      userPrompt: `Perform multiple operations:
1. Generate hash for 'test123'
2. Validate if '5d41402abc4b2a76b9719d911017c592' is a valid MD5 hash
3. Compare '5d41402abc4b2a76b9719d911017c592' with '5d41402abc4b2a76b9719d911017c592'
4. Tell me about MD5 security considerations`,
      conversationHistory: [],
      toolCallHistory: []
    });

    console.log('✅ Stress test completed!');
    console.log('Tools used:', result.toolCallHistory.length);
    console.log('Final Answer:', result.finalAnswer?.output?.value);

  } catch (error) {
    console.log(`❌ Stress test failed: ${error}`);
  }
}

// Run the test
if (require.main === module) {
  testComplexStrings().catch(console.error);
}

export { testComplexStrings };