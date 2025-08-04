import { SimpleFileManagerAgent } from './SimpleFileManagerAgent';
import { Interaction } from '../../core/types/types';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import * as path from 'path';

// Load environment variables
dotenv.config();

/**
 * Simple Console for File Manager Agent with Memory
 * 
 * Provides a command-line interface where users can type natural language
 * commands. Maintains conversation history across multiple interactions.
 */
export class FileManagerConsole {
  private agent: SimpleFileManagerAgent;
  private rl: readline.Interface;
  private conversationHistory: Interaction[] = [];

  constructor() {
    // Check for Azure OpenAI environment variables
    if (!process.env.AZURE_OPENAI_API_KEY) {
      console.error('❌ AZURE_OPENAI_API_KEY environment variable is required');
      process.exit(1);
    }
    if (!process.env.AZURE_OPENAI_RESOURCE_NAME) {
      console.error('❌ AZURE_OPENAI_RESOURCE_NAME environment variable is required');
      process.exit(1);
    }

    // Create agent
    // this.agent = new SimpleFileManagerAgent({
    //   service: 'azure',
    //   apiKey: process.env.AZURE_OPENAI_API_KEY,
    //   baseURL: process.env.AZURE_OPENAI_RESOURCE_NAME,
    //   model: 'gpt-4.1-mini'
    // });

    this.agent = new SimpleFileManagerAgent({
      service: 'google',
      apiKey: process.env.GEMINI_API_KEY || "gemin-api-key",
      model: 'gemini-1.5-flash'
    });

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Start the interactive console
   */
  async start() {
    console.log('🗂️  Simple File Manager Agent with Memory (JSObject Format)');
    console.log('Type your file management requests or "exit" to quit.');
    console.log('');
    console.log('ℹ️  This agent uses the JSObject format - AI responds with JavaScript functions!');
    console.log('');
    console.log('Examples:');
    console.log('  - "list this directory"');
    console.log('  - "create files: test1.txt with content A, test2.txt with content B"');
    console.log('  - "read the contents of package.json and tsconfig.json"');
    console.log('  - "edit file test.txt: replace lines 5-7 with new content"');
    console.log('  - "delete files test1.txt and test2.txt"');
    console.log('');
    console.log('Special commands:');
    console.log('  - "memory" - Show conversation history');
    console.log('  - "clear" - Clear conversation memory');
    console.log('---');

    this.askQuestion();
  }

  private askQuestion() {
    this.rl.question('\n💬 You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        this.rl.close();
        return;
      }

      if (input.trim() === '') {
        this.askQuestion();
        return;
      }

      // Handle special commands
      if (input.toLowerCase() === 'memory') {
        this.showMemory();
        this.askQuestion();
        return;
      }

      if (input.toLowerCase() === 'clear') {
        this.clearMemory();
        this.askQuestion();
        return;
      }

      try {
        console.log('🤖 Agent: Working...');

        const result = await this.agent.run({
          userPrompt: input,
          prevInteractionHistory: this.conversationHistory,
          context: {
            workingDirectory: path.join(process.cwd(), 'testfolder'),
            timestamp: new Date().toISOString()
          }
        });

        // Update conversation history with new interactions
        if (result.interactionHistory) {
          this.conversationHistory.push(...result.interactionHistory);
        }

        if (result.agentResponse) {
          this.conversationHistory.push(result.agentResponse);
          const context = result.agentResponse.context;
          
          // Handle different response types
          if (result.agentResponse.error) {
            console.log('❌ Agent Error:', result.agentResponse.error);
          } else if (context === undefined) {
            console.log('❌ Error: Agent response context is undefined');
          } else {
            const response = context?.value || context;
            console.log('🤖 Agent:', response);
          }
        } else {
          console.log('🤖 Agent: Task completed, but no response was provided.');
        }

        // Display total token usage for this run
        const tokenUsage = this.agent.getRunTokenUsage();
        if (tokenUsage.totalTokens > 0) {
          console.log(`\n📊 Token Usage Summary:`);
          console.log(`   Prompt Tokens: ${tokenUsage.promptTokens}`);
          console.log(`   Completion Tokens: ${tokenUsage.completionTokens}`);
          console.log(`   Total Tokens: ${tokenUsage.totalTokens}`);
        }

      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      }

      this.askQuestion();
    });
  }

  /**
   * Show conversation memory
   */
  private showMemory() {
    console.log('\n📚 Conversation Memory:');
    if (this.conversationHistory.length === 0) {
      console.log('  No conversation history yet.');
      return;
    }

    this.conversationHistory.forEach((interaction, index) => {
      if ('type' in interaction) {
        if (interaction.type === 'user_prompt') {
          console.log(`  ${index + 1}. 👤 User: ${interaction.context}`);
        } else if (interaction.type === 'agent_response') {
          const context = interaction.context;
          const response = context?.value || context || 'No response';
          const errorMsg = interaction.error ? ` (Error: ${interaction.error})` : '';
          console.log(`  ${index + 1}. 🤖 Agent: ${response}${errorMsg}`);
        }
      } else {
        // Handle ToolCallReport
        const report = interaction as any;
        if (report.report) {
          console.log(`  ${index + 1}. 📋 Report: ${report.report}`);
        }
      }
    });
    console.log('');
  }

  /**
   * Clear conversation memory
   */
  private clearMemory() {
    this.conversationHistory = [];
    console.log('💭 Memory cleared! Starting fresh conversation.');
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const console_app = new FileManagerConsole();
  console_app.start().catch(console.error);
}