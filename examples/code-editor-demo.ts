import { CodeEditorAgent } from './code-editor-agent';

/**
 * Demo script showing all file management capabilities
 * Run with: npx ts-node examples/code-editor-demo.ts
 */
async function runCodeEditorDemo() {
  const editor = new CodeEditorAgent();
  
  console.log('🗂️  Code Editor Agent - Full File Management Demo');
  console.log('================================================\n');

  try {
    // Demo 1: Create a new project structure
    console.log('📁 Creating project structure...');
    await editor.run({
      userPrompt: 'Create a directory called "my-project" and then create a basic package.json file inside it',
      prevInteractionHistory: []
    });

    // Demo 2: Create multiple files
    console.log('\n📝 Creating source files...');
    await editor.run({
      userPrompt: `Create these files in the my-project directory:
      1. src/index.ts with a simple "Hello World" TypeScript program
      2. src/utils.ts with a few utility functions
      3. README.md with basic project information
      4. .gitignore with common Node.js ignore patterns`,
      prevInteractionHistory: []
    });

    // Demo 3: Read and display files
    console.log('\n👁️  Reading file contents...');
    await editor.run({
      userPrompt: 'Read the contents of my-project/src/index.ts and my-project/README.md',
      prevInteractionHistory: []
    });

    // Demo 4: Edit existing files
    console.log('\n✏️  Editing files...');
    await editor.run({
      userPrompt: `Edit my-project/src/index.ts to:
      1. Add proper imports from utils.ts
      2. Add a main function that uses the utility functions
      3. Add some console.log statements`,
      prevInteractionHistory: []
    });

    // Demo 5: List all files in the project
    console.log('\n📋 Listing all project files...');
    await editor.run({
      userPrompt: 'List all files in the my-project directory recursively with details',
      prevInteractionHistory: []
    });

    // Demo 6: Search for content
    console.log('\n🔍 Searching files...');
    await editor.run({
      userPrompt: 'Search for the word "function" in all TypeScript files in the my-project directory',
      prevInteractionHistory: []
    });

    // Demo 7: Create backup and demonstrate deletion
    console.log('\n🗑️  Demonstrating safe deletion...');
    await editor.run({
      userPrompt: 'Create a backup of src/utils.ts, then delete the original file (with confirmation)',
      prevInteractionHistory: []
    });

    console.log('\n🎉 Demo completed! The agent can:');
    console.log('   ✅ Create files and directories');
    console.log('   ✅ Read file contents (full or specific lines)');
    console.log('   ✅ Edit files (replace, insert, append, find/replace)');
    console.log('   ✅ Delete files and directories safely');
    console.log('   ✅ List and search files with patterns');
    console.log('   ✅ Create backups before destructive operations');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Example prompts you can use with the Code Editor Agent:
const examplePrompts = {
  // File Creation
  createFiles: [
    "Create a new React component file at src/components/Header.tsx with TypeScript",
    "Create a new Python script called data_processor.py with basic functions",
    "Create package.json for a Node.js project with common dependencies"
  ],

  // File Reading
  readFiles: [
    "Read the contents of src/index.js",
    "Show me lines 10-25 of config.ts", 
    "Read all .env files in the project"
  ],

  // File Editing
  editFiles: [
    "Replace the entire content of config.js with new configuration",
    "Insert a new import statement at the top of src/app.ts",
    "Append a new function to utils.js",
    "Find and replace all instances of 'oldFunction' with 'newFunction' in src/main.ts",
    "Replace lines 15-20 in index.html with new HTML content"
  ],

  // File Deletion
  deleteFiles: [
    "Delete the temporary file temp.txt",
    "Remove the old-components directory and all its contents",
    "Delete all .log files in the project"
  ],

  // File Management
  fileManagement: [
    "List all JavaScript files in the src directory",
    "Find all files containing 'TODO' comments",
    "Search for the function 'getUserData' in all TypeScript files",
    "Create a backup of the entire src directory",
    "Show me all files larger than 1MB"
  ],

  // Project Operations
  projectOps: [
    "Create a new React project structure with components, pages, and utils folders",
    "Set up a Node.js API project with routes, middleware, and models directories",
    "Create a Python project with src, tests, and docs folders"
  ]
};

// Display example prompts
console.log('\n💡 Example prompts you can try:');
Object.entries(examplePrompts).forEach(([category, prompts]) => {
  console.log(`\n${category.toUpperCase()}:`);
  prompts.forEach((prompt, index) => {
    console.log(`  ${index + 1}. "${prompt}"`);
  });
});

// Run the demo if this file is executed directly
if (require.main === module) {
  runCodeEditorDemo().catch(console.error);
}

export { runCodeEditorDemo, examplePrompts };