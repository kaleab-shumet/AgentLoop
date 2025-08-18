import { CodeEditorAgent } from './CodeEditorAgent.js';
import * as path from 'path';

async function runDemo() {
  // Create a demo directory
  const demoPath = path.join(process.cwd(), 'demo-project');
  const agent = new CodeEditorAgent(demoPath);

  console.log('🚀 Starting Code Editor Agent Demo\n');

  try {
    // Demo 1: Create a simple React component
    console.log('📝 Demo 1: Creating a React Button component...');
    const result1 = await agent.run({
      userPrompt: 'Create a React Button component in TypeScript with props for text, onClick, and optional disabled state. Include proper TypeScript types and export it.',
      prevInteractionHistory: []
    });

    if (result1.agentResponse && !result1.agentResponse.error) {
      console.log('✅ React component created successfully!\n');
    } else {
      console.log('❌ Failed to create React component\n');
    }

    // Demo 2: Create a utility function
    console.log('📝 Demo 2: Creating utility functions...');
    const result2 = await agent.run({
      userPrompt: 'Create a utils.ts file with helper functions for formatting dates, validating emails, and generating random IDs. Include proper JSDoc comments.',
      prevInteractionHistory: result1.interactionHistory
    });

    if (result2.agentResponse && !result2.agentResponse.error) {
      console.log('✅ Utility functions created successfully!\n');
    } else {
      console.log('❌ Failed to create utility functions\n');
    }

    // Demo 3: Create project structure
    console.log('📝 Demo 3: Setting up project structure...');
    const result3 = await agent.run({
      userPrompt: 'Create a proper Node.js project structure with src/, tests/, and docs/ folders. Add a package.json with common dependencies for a TypeScript Node.js project.',
      prevInteractionHistory: result2.interactionHistory
    });

    if (result3.agentResponse && !result3.agentResponse.error) {
      console.log('✅ Project structure created successfully!\n');
    } else {
      console.log('❌ Failed to create project structure\n');
    }

    // Demo 4: Initialize Git and install dependencies
    console.log('📝 Demo 4: Setting up Git and dependencies...');
    const result4 = await agent.run({
      userPrompt: 'Initialize a Git repository, install the dependencies from package.json, and make an initial commit with all the created files.',
      prevInteractionHistory: result3.interactionHistory
    });

    if (result4.agentResponse && !result4.agentResponse.error) {
      console.log('✅ Git setup and dependencies installed!\n');
    } else {
      console.log('❌ Failed to setup Git and dependencies\n');
    }

    // Demo 5: Run build and tests
    console.log('📝 Demo 5: Running build and tests...');
    const result5 = await agent.run({
      userPrompt: 'Run the TypeScript compiler to check for any errors, then run any available tests. Provide a summary of the results.',
      prevInteractionHistory: result4.interactionHistory
    });

    if (result5.agentResponse && !result5.agentResponse.error) {
      console.log('✅ Build and test completed!\n');
      
      // Display final summary
      if (result5.agentResponse.context && typeof result5.agentResponse.context === 'object' && 'value' in result5.agentResponse.context) {
        console.log('📋 Final Summary:');
        console.log(result5.agentResponse.context.value);
      } else if (result5.agentResponse.context) {
        console.log('📋 Final Summary:');
        const context = typeof result5.agentResponse.context === 'string' 
          ? result5.agentResponse.context 
          : JSON.stringify(result5.agentResponse.context);
        console.log(context);
      }
    } else {
      console.log('❌ Failed to run build and tests\n');
    }

  } catch (error) {
    console.error('💥 Demo failed:', error);
  }

  console.log('\n🎉 Demo completed! Check the demo-project folder to see the generated files.');
}

// Run demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

export { runDemo };