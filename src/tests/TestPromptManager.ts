import { PromptManager, DefaultPromptTemplateBuilder } from '../core/prompt/PromptManager';

// Simple test to verify PromptManager functionality
function testPromptManager() {
  console.log('🧪 Testing PromptManager...');

  const systemPrompt = "You are a helpful assistant.";
  const promptManager = new PromptManager(systemPrompt);

  // Test basic prompt construction
  const testPrompt = promptManager.constructPrompt(
    "What's the weather?",
    { location: "New York" },
    null, // no error
    [], // no conversation history
    [], // no tool history
    true, // keep retry
    [], // no tools
    "final",
    "Use JSON format",
    "No tools available"
  );

  console.log('✅ Basic prompt construction successful');
  console.log('📝 Generated prompt length:', testPrompt.length);

  // Test with custom builder
  class TestBuilder extends DefaultPromptTemplateBuilder {
    buildSystemPrompt(): string {
      return "🤖 Custom Assistant";
    }
  }

  const customBuilder = new TestBuilder(systemPrompt);
  const customPromptManager = new PromptManager(systemPrompt, customBuilder);

  const customSystemPrompt = customPromptManager.buildSystemPrompt();
  console.log('✅ Custom builder test successful');
  console.log('🎯 Custom system prompt:', customSystemPrompt);

  // Test configuration
  promptManager.setConfig({
    includeContext: false,
    maxHistoryEntries: 5
  });

  const config = promptManager.getConfig();
  console.log('✅ Configuration test successful');
  console.log('⚙️ Updated config:', config);

  console.log('🎉 All PromptManager tests passed!');
}

if (require.main === module) {
  testPromptManager();
}