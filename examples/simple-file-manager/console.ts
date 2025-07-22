import { SimpleFileManagerAgent } from './SimpleFileManagerAgent';
import { Interaction } from '../../core/types/types';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

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
    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY environment variable is required');
      process.exit(1);
    }

    // Create agent
    this.agent = new SimpleFileManagerAgent({
      service: 'google',
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.0-flash'
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
    console.log('🗂️  Simple File Manager Agent with Memory');
    console.log('Type your file management requests or "exit" to quit.');
    console.log('');
    console.log('Examples:');
    console.log('  - "list this directory"');
    console.log('  - "create a file called test.txt with hello world"');
    console.log('  - "read the contents of package.json"');
    console.log('  - "delete the file test.txt"');
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
            workingDirectory: process.cwd(),
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
          const response = context?.value || context;
          console.log('🤖 Agent:', response);
        } else {
          console.log('🤖 Agent: Task completed, but no response was provided.');
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