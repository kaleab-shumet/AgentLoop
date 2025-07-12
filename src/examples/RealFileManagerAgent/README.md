# RealFileManagerAgent

A comprehensive, interactive file management agent built using the AgentLoop framework. This agent provides an advanced file management interface with natural language processing capabilities.

## 🌟 Features

### Core File Operations
- ✅ **File Management**: Create, read, write, and delete files
- ✅ **Directory Operations**: List, create, and manage directories  
- ✅ **Smart Search**: Search by filename patterns and file content
- ✅ **Path Navigation**: Change working directories safely
- ✅ **File Information**: Detailed file/directory metadata and statistics

### Advanced Capabilities
- 🔍 **Content Search**: Find text patterns within files
- 📊 **Recursive Listing**: Browse directory trees with depth control
- 🛡️ **Safety Features**: Path traversal protection, file size limits
- 💾 **Backup Support**: Automatic backups for file overwrites
- 📝 **Multiple Encodings**: Support for various text file encodings
- 🎯 **Smart File Detection**: Automatic text vs binary file handling

### Interactive Console Interface
- 💬 **Natural Language**: Use conversational commands and friendly greetings
- 🎮 **Interactive Shell**: Full-featured command-line interface
- 📋 **Help System**: Built-in help and command examples
- ⚡ **Real-time Feedback**: Live execution status and results
- 🔄 **Session Management**: Persistent working directory state
- 🐛 **Debug Mode**: Optional detailed logging with `--debug` flag
- 😊 **Conversational**: Responds naturally to greetings and casual interactions

## 🚀 Quick Start

### Installation
```bash
# Navigate to the AgentLoop project
cd /path/to/AgentLoop

# Install dependencies (if not already done)
npm install

# Set up your Gemini API key
export GEMINI_API_KEY="your-gemini-api-key"
```

### Interactive Console Mode
```bash
# Start the interactive file manager
npx ts-node src/examples/RealFileManagerAgent/console-interface.ts

# Start with debug mode for detailed logging
npx ts-node src/examples/RealFileManagerAgent/console-interface.ts --debug

# Specify a working directory
npx ts-node src/examples/RealFileManagerAgent/console-interface.ts /path/to/workspace

# Specify directory with debug mode
npx ts-node src/examples/RealFileManagerAgent/console-interface.ts /path/to/workspace --debug
```

### Programmatic Usage
```typescript
import { RealFileManagerAgent } from './RealFileManagerAgent';

const config = {
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.0-flash'
};

const agent = new RealFileManagerAgent(config, './workspace');

const result = await agent.run({
  userPrompt: "create a file called hello.txt with the content 'Hello, World!'",
  conversationHistory: [],
  toolCallHistory: []
});
```

### Demo and Testing
```bash
# Run automated demo (clean output)
npx ts-node src/examples/RealFileManagerAgent/demo.ts auto

# Run automated demo with debug output
npx ts-node src/examples/RealFileManagerAgent/demo.ts auto --debug

# Run interactive demo
npx ts-node src/examples/RealFileManagerAgent/demo.ts interactive

# Run performance tests (clean)
npx ts-node src/examples/RealFileManagerAgent/demo.ts performance

# Run performance tests with debug info
npx ts-node src/examples/RealFileManagerAgent/demo.ts performance --debug

# Run error handling tests
npx ts-node src/examples/RealFileManagerAgent/demo.ts errors

# Run all tests then interactive mode
npx ts-node src/examples/RealFileManagerAgent/demo.ts all

# Run all tests with debug output
npx ts-node src/examples/RealFileManagerAgent/demo.ts all --debug
```

## 💬 Example Commands

### Conversational Interactions
```
👋 "hello" or "hi" - Get a friendly greeting
😊 "good morning!" - Casual conversation
💬 "how are you?" - Natural chat before file operations
```

### Basic File Operations
```
📝 "create a file called notes.txt with my todo list"
📖 "read the contents of package.json"
✏️ "write some JavaScript code to app.js"
🗑️ "delete the temporary files"
```

### Directory Management
```
📁 "list all files in the current directory"
🔍 "show me everything in the src folder recursively"
➕ "create a directory called output"
📊 "show hidden files and detailed information"
```

### Advanced Search
```
🔎 "search for all .js files"
📝 "find files containing 'console.log'"
🎯 "search for *.json files in the config directory"
🔍 "find files with 'error' in their content"
```

### File Information
```
ℹ️ "get detailed info about package.json"
📊 "show statistics for the src directory"
📋 "what files are in the current folder?"
🔍 "tell me about the size and permissions of this file"
```

### Debug and Special Commands
```
🐛 "debug on" - Enable detailed logging and debug information
🐛 "debug off" - Disable debug mode for cleaner output
📍 "pwd" - Show current working directory
📂 "cd /path/to/directory" - Change working directory
🆘 "help" - Show comprehensive help information
🚪 "exit" - Close the file manager
```

## 🛠️ Available Tools

The agent has access to these specialized tools:

| Tool | Description |
|------|-------------|
| `list_directory` | List directory contents with detailed information |
| `read_file` | Read text files with encoding support and partial reading |
| `write_file` | Create/write files with backup options |
| `create_directory` | Create directories and nested structures |
| `search_files` | Search by filename patterns and file content |
| `get_file_info` | Get detailed file/directory metadata |
| `change_directory` | Change the current working directory |
| `delete_item` | Delete files or directories (with confirmation) |

## 🛡️ Safety Features

### Path Security
- ✅ Prevents directory traversal attacks
- ✅ Restricts operations to safe working directory
- ✅ Validates all file paths before operations

### File Protection
- ✅ File size limits (10MB default) for read operations
- ✅ Binary file detection and safe handling
- ✅ Backup creation for file overwrites
- ✅ Confirmation required for delete operations

### Error Handling
- ✅ Graceful error recovery and user feedback
- ✅ Detailed error messages with context
- ✅ Safe handling of permission issues
- ✅ Robust file system error management

## 📊 Library Usage Experience Report

### Positive Aspects of AgentLoop

#### 1. **Excellent Architecture & Flexibility**
- ✅ **Clean Agent Pattern**: The abstract `AgentLoop` class provides excellent structure
- ✅ **Tool System**: The `defineTool()` pattern with Zod validation is intuitive and robust
- ✅ **Execution Modes**: Support for both XML and Function Calling modes
- ✅ **Lifecycle Hooks**: Comprehensive hook system for monitoring and customization
- ✅ **Error Handling**: Well-structured error system with `AgentError` types

#### 2. **Developer Experience**
- ✅ **TypeScript Support**: Excellent type safety throughout the framework
- ✅ **Zod Integration**: Schema validation makes tool definition safe and clear
- ✅ **Provider Abstraction**: Easy to swap AI providers (tested with Gemini)
- ✅ **Documentation**: Code is well-documented with helpful examples

#### 3. **Operational Excellence**
- ✅ **Stateless Design**: Makes the agent scalable and easy to integrate
- ✅ **Tool Dependency Management**: Handles complex tool workflows effectively
- ✅ **Retry Logic**: Built-in retry mechanisms for reliability
- ✅ **Safety Features**: Good timeout handling and error recovery

### Areas for Improvement

#### 1. **Missing Features** 
- ❌ **Streaming Support**: No built-in streaming for long-running operations
- ❌ **Tool Caching**: No caching mechanism for expensive tool operations
- ❌ **Parallel Tool Execution**: Limited parallel execution capabilities
- ❌ **Memory Management**: No conversation memory management utilities

#### 2. **Developer Experience Gaps**
- ⚠️ **Debugging Tools**: Limited debugging and inspection capabilities
- ⚠️ **Configuration Management**: Could use better configuration management
- ⚠️ **Template System**: More flexible prompt template system needed
- ⚠️ **Tool Discovery**: No runtime tool discovery or dynamic tool loading

#### 3. **Documentation & Examples**
- ⚠️ **Real-world Examples**: Need more comprehensive, production-ready examples
- ⚠️ **Best Practices**: Missing guidance on tool design patterns
- ⚠️ **Performance Tuning**: Limited documentation on optimization
- ⚠️ **Testing Utilities**: No built-in testing framework for agents

### Implementation Challenges Encountered

#### 1. **Tool Response Formatting**
**Challenge**: The tool handler return format was initially unclear
```typescript
// Had to figure out the correct ToolResult format
return {
  toolname: name,
  success: true,
  output: { /* results */ }
};
```
**Solution**: Created consistent response formatting patterns

#### 2. **Error Handling Complexity**
**Challenge**: Managing different types of errors across file operations
```typescript
// Need to handle file system errors, permission issues, etc.
try {
  // file operation
} catch (error: any) {
  return {
    toolname: name,
    success: false,
    error: `Failed to ${operation}: ${error.message}`
  };
}
```
**Solution**: Implemented comprehensive error categorization

#### 3. **Path Security**
**Challenge**: Ensuring secure file operations without directory traversal
```typescript
private isPathSafe(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(this.workingDirectory);
}
```
**Solution**: Created path validation utilities

### Suggested Framework Enhancements

#### 1. **Tool Utilities Package**
```typescript
// Suggested: Built-in tool utilities
import { createFileSystemTools, createWebTools } from '@agentloop/tools';

class MyAgent extends AgentLoop {
  constructor() {
    super(provider);
    this.addToolSet(createFileSystemTools({ 
      workingDir: './workspace',
      maxFileSize: '10MB',
      allowedExtensions: ['.txt', '.js']
    }));
  }
}
```

#### 2. **Enhanced Debugging**
```typescript
// Suggested: Built-in debugging tools
const agent = new MyAgent();
agent.enableDebugMode({
  logToolCalls: true,
  logPrompts: true,
  saveConversations: true
});
```

#### 3. **Conversation Memory**
```typescript
// Suggested: Memory management utilities
import { ConversationMemory } from '@agentloop/memory';

const memory = new ConversationMemory({
  maxEntries: 100,
  summarizeOlder: true
});

const result = await agent.run({
  userPrompt: prompt,
  conversationHistory: memory.getHistory(),
  toolCallHistory: memory.getToolHistory()
});

memory.addEntry(result);
```

## 🎯 Recommendations for New Users

### 1. **Start Simple**
- Begin with basic tool definitions
- Use the provided examples as templates  
- Test tools individually before complex workflows

### 2. **Follow Patterns**
- Use consistent error handling patterns
- Implement proper input validation with Zod
- Structure tool responses consistently

### 3. **Leverage Framework Features**
- Use lifecycle hooks for monitoring
- Implement proper retry logic
- Take advantage of the type system

### 4. **Security First**
- Always validate file paths and inputs
- Implement proper permission checks
- Use safe defaults for operations

## 📈 Performance Characteristics

Based on testing with the file manager agent:

- **Tool Execution**: ~200-500ms per tool call
- **LLM Response**: ~1-3 seconds depending on complexity
- **File Operations**: Near-instant for small files (<1MB)
- **Search Operations**: ~100-300ms for typical directories
- **Memory Usage**: Minimal, stateless design keeps memory low

## 🔮 Future Enhancements

Potential improvements for the RealFileManagerAgent:

1. **Advanced Search**: Regex patterns, fuzzy matching
2. **File Compression**: Built-in zip/unzip capabilities  
3. **Remote Files**: Support for network file operations
4. **Version Control**: Basic git integration
5. **File Watching**: Real-time file system monitoring
6. **Bulk Operations**: Batch file processing capabilities

## 📝 License

Part of the AgentLoop project. See the main project license for details.