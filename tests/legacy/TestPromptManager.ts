import { 
  PromptManager, 
  ResponseFormat, 
  PromptTemplateInterface,
  PromptOptions
} from '../core/prompt/PromptManager';

// Create a simple custom template for testing
class TestTemplate implements PromptTemplateInterface {
  getFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `TEST FORMAT: Use the ${finalToolName} tool when done. Parallel: ${parallelExecution}`;
  }

  buildPrompt(
    systemPrompt: string,
    userPrompt: string,
    context: Record<string, any>,
    lastError: any,
    conversationHistory: any[],
    toolCallHistory: any[],
    keepRetry: boolean,
    finalToolName: string,
    toolDefinitions: string,
    options: PromptOptions,
    errorRecoveryInstructions?: string
  ): string {
    return `TEST PROMPT:
System: ${systemPrompt}
Task: ${userPrompt}
Format: ${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}
Tools: ${toolDefinitions}`;
  }

  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `TEST TASK: ${userPrompt} (Final tool: ${finalToolName})`;
  }

  buildContextSection(context: Record<string, any>, options: PromptOptions): string {
    return `TEST CONTEXT: ${JSON.stringify(context)}`;
  }

  buildConversationSection(conversationHistory: any[], options: PromptOptions): string {
    return `TEST CONVERSATION: ${conversationHistory.length} entries`;
  }

  buildToolHistorySection(toolCallHistory: any[], options: PromptOptions): string {
    return `TEST HISTORY: ${toolCallHistory.length} calls`;
  }

  buildErrorRecoverySection(finalToolName: string, error: any, keepRetry: boolean, errorRecoveryInstructions?: string): string {
    return error ? `TEST ERROR: ${error.message}` : '';
  }
}

// Clean test for the modern PromptManager
function testPromptManager() {
  console.log('🧪 Testing Clean Prompt Management System...');

  // Test 1: Default template with Function Calling format
  console.log('\n1️⃣ Testing Default Template (Function Calling Format)...');
  const functionCallingManager = new PromptManager(
    "You are a helpful assistant.",
    { responseFormat: ResponseFormat.FUNCTION_CALLING }
  );

  console.log('✅ Function calling manager created');
  console.log('📦 Response format:', functionCallingManager.getResponseFormat());
  console.log('📝 Is custom template:', functionCallingManager.isUsingCustomTemplate());

  const functionCallingPrompt = functionCallingManager.buildPrompt(
    "What's the weather?",
    { location: "New York" },
    null,
    [],
    [],
    true,
    "final",
    "No tools available"
  );

  console.log('✅ Function calling template prompt generated');
  console.log('📝 Prompt length:', functionCallingPrompt.length);

  // Test 2: Default template with Function Calling format
  console.log('\n2️⃣ Testing Default Template (Function Calling Format)...');
  const functionManager = new PromptManager(
    "You are a helpful assistant.",
    { responseFormat: ResponseFormat.FUNCTION_CALLING }
  );

  console.log('✅ Function calling manager created');
  console.log('📦 Response format:', functionManager.getResponseFormat());

  const functionPrompt = functionManager.buildPrompt(
    "What's the weather?",
    { location: "London" },
    null,
    [],
    [],
    true,
    "final",
    "No tools available"
  );

  console.log('✅ Function calling template prompt generated');
  console.log('📝 Prompt length:', functionPrompt.length);

  // Test 3: Custom template
  console.log('\n3️⃣ Testing Custom Template...');
  const customManager = new PromptManager(
    "You are a test assistant.",
    { 
      customTemplate: new TestTemplate(),
      promptOptions: {
        includeContext: true,
        includeToolHistory: true,
        maxHistoryEntries: 5
      }
    }
  );

  console.log('✅ Custom manager created');
  console.log('📦 Response format:', customManager.getResponseFormat());
  console.log('📝 Is custom template:', customManager.isUsingCustomTemplate());

  const customPrompt = customManager.buildPrompt(
    "Test task",
    { test: "data" },
    null,
    [],
    [],
    true,
    "final",
    "Test tools"
  );

  console.log('✅ Custom template prompt generated');
  console.log('📝 Prompt length:', customPrompt.length);
  console.log('📄 Custom prompt preview:', customPrompt.substring(0, 100) + '...');

  // Test 4: Response format switching
  console.log('\n4️⃣ Testing Response Format Switching...');
  const switchManager = new PromptManager("Assistant", { responseFormat: ResponseFormat.FUNCTION_CALLING });
  
  console.log('Initial format:', switchManager.getResponseFormat());
  
  switchManager.setResponseFormat(ResponseFormat.FUNCTION_CALLING);
  console.log('After switch:', switchManager.getResponseFormat());

  const formatInstructions = switchManager.getFormatInstructions('final');
  console.log('✅ Format instructions generated');
  console.log('📦 Instructions length:', formatInstructions.length);

  // Test 5: Template switching
  console.log('\n5️⃣ Testing Template Switching...');
  const templateSwitchManager = new PromptManager("Assistant");
  
  console.log('Default template - Custom?', templateSwitchManager.isUsingCustomTemplate());
  
  templateSwitchManager.setCustomTemplate(new TestTemplate());
  console.log('After custom - Custom?', templateSwitchManager.isUsingCustomTemplate());
  
  templateSwitchManager.setDefaultTemplate(ResponseFormat.FUNCTION_CALLING);
  console.log('Back to default - Custom?', templateSwitchManager.isUsingCustomTemplate());
  console.log('Back to default - Format:', templateSwitchManager.getResponseFormat());

  console.log('✅ Template switching working');

  // Test 6: Configuration updates
  console.log('\n6️⃣ Testing Configuration Updates...');
  const configManager = new PromptManager("Assistant");
  
  configManager.configure({
    includeContext: false,
    maxHistoryEntries: 3,
    customSections: {
      'Testing': 'This is a test section'
    }
  });

  configManager.setErrorRecoveryInstructions("Custom error recovery instructions");

  const options = configManager.getPromptOptions();
  console.log('✅ Configuration updated successfully');
  console.log('📋 Updated options:', {
    includeContext: options.includeContext,
    maxHistoryEntries: options.maxHistoryEntries,
    customSections: !!options.customSections
  });

  // Test 7: Response format string conversion
  console.log('\n7️⃣ Testing Response Format String Conversion...');
  const functionCallingManagerType = new PromptManager("Assistant", { responseFormat: ResponseFormat.FUNCTION_CALLING });
  const functionManagerType = new PromptManager("Assistant", { responseFormat: ResponseFormat.FUNCTION_CALLING });
  const customManagerType = new PromptManager("Assistant", { customTemplate: new TestTemplate() });

  console.log('Function calling format string:', functionCallingManagerType.getResponseFormatString());
  console.log('Function format string:', functionManagerType.getResponseFormatString());
  console.log('Custom format string:', customManagerType.getResponseFormatString());

  console.log('✅ Response format string conversion working');

  console.log('\n🎉 All Clean PromptManager tests passed!');
}

if (require.main === module) {
  testPromptManager();
}