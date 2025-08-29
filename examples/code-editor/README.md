# Code Editor Agent

A fully functional AI-powered coding assistant built with AgentLoop that can manage entire codebases, create projects, and assist with software development tasks.

## Features

### File Operations
- ✅ **Create Files**: Generate new files with content, components, modules
- ✅ **Read Files**: Analyze existing code, read specific line ranges  
- ✅ **Edit Files**: Precise string-based replacements with validation
- ✅ **Delete Files**: Remove files and directories with optional backup
- ✅ **Search Files**: Find content across codebases by name or content

### Command Execution
- ✅ **Run Commands**: Execute shell commands with timeout protection
- ✅ **Package Management**: npm install, pip install, yarn, etc.
- ✅ **Version Control**: git commands for commits, pushes, pulls
- ✅ **Build & Test**: Run build scripts, test suites, linting
- ✅ **Development Tools**: Start dev servers, run databases, deploy

### Development Capabilities
- ✅ **Multi-Language Support**: JavaScript, TypeScript, Python, and more
- ✅ **Framework Expertise**: React, Vue, Node.js, Express, etc.
- ✅ **Project Structure**: Create proper directory hierarchies
- ✅ **Code Quality**: Follow best practices and conventions
- ✅ **Documentation**: Generate comments and documentation

### Smart Features
- ✅ **Context Awareness**: Understands existing codebase patterns
- ✅ **Error Recovery**: Robust error handling and retry logic
- ✅ **Progress Tracking**: Clear feedback on operations performed
- ✅ **Sequential Operations**: Ensures file operations don't conflict

## Quick Start

### Interactive Console
```bash
# Start interactive console in current directory
npm run build && node dist/examples/code-editor/console.js

# Or specify a different directory
npm run build && node dist/examples/code-editor/console.js /path/to/project
```

### Programmatic Usage
```typescript
import { CodeEditorAgent } from './CodeEditorAgent';

const agent = new CodeEditorAgent('/path/to/project');

// Manage conversation history as array
const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [];

const result = await agent.run({
  userPrompt: 'Create a React component called Button with TypeScript',
  ...(conversationHistory.length > 0 && {
    context: {
      'Conversation History': conversationHistory
        .map(entry => `${entry.role}: ${entry.message}`)
        .join('\n')
    }
  })
});

// After getting response, update history
conversationHistory.push(
  { role: 'user', message: 'Create a React component called Button with TypeScript' },
  { role: 'agent', message: result.agentResponse?.args }
);

console.log(result.agentResponse?.args);
```

### Demo Script
```bash
# Run automated demo
npm run build && node dist/examples/code-editor/demo.js
```

## Usage Examples

### Create Components
```
"Create a React Button component with TypeScript props"
"Generate a Vue.js header component with navigation"
"Build a Python class for user authentication"
```

### Project Setup
```
"Create a Node.js API project structure"
"Set up a React TypeScript project with common folders"
"Initialize a Python Flask application"
```

### Code Analysis
```
"Read and explain the main.ts file"
"Search for TODO comments in all JavaScript files"
"Find all functions that contain 'async' in their name"
```

### Development Workflow
```
"Initialize a new Node.js project and install dependencies"
"Run the test suite and fix any failing tests"
"Build the project and deploy to staging"
"Install eslint and fix all linting errors"
"Commit all changes with a descriptive message"
```

### Refactoring
```
"Update all console.log statements to use a proper logger"
"Convert this JavaScript file to TypeScript"
"Add error handling to all async functions"
```

## Configuration

The agent can be configured during initialization:

```typescript
const agent = new CodeEditorAgent(basePath, {
  maxIterations: 15,                    // Maximum reasoning iterations
  parallelExecution: false,             // Sequential file operations
  sleepBetweenIterationsMs: 5000,      // Delay between iterations
  maxInteractionHistoryCharsLimit: 100000  // Token cost control
});
```

## Architecture

Built on the AgentLoop framework with:

- **JSExecutionEngine**: Secure JavaScript execution with SES compartments (secure by default)
- **Tool System**: Robust file operation tools with error handling
- **LLM Integration**: Support for multiple AI providers (OpenAI, Azure, Google, etc.)
- **Memory Management**: Configurable interaction history limits for cost control

## Error Handling

The agent includes comprehensive error handling:

- **File Operation Errors**: Clear messages for permission issues, missing files
- **Validation Errors**: Precise feedback on string matching failures  
- **Recovery Mechanisms**: Retry logic for transient failures
- **User Guidance**: Helpful suggestions for fixing common issues

## Best Practices

The agent follows software engineering best practices:

- **Code Style**: Maintains consistent formatting and conventions
- **Documentation**: Adds appropriate comments and JSDoc
- **Testing**: Suggests test structures and validation
- **Security**: Validates inputs and handles errors safely
- **Performance**: Considers optimization opportunities

## Development

### Building
```bash
npm run build
```

### Testing
```bash
npm test
```

### Environment Variables
```bash
# For Azure OpenAI
export AZURE_OPENAI_API_KEY="your-key"
export AZURE_OPENAI_RESOURCE_NAME="your-resource"

# For Google Gemini  
export GEMINI_API_KEY="your-key"

# For OpenAI
export OPENAI_API_KEY="your-key"
```

## License

ISC License - See main project LICENSE file.