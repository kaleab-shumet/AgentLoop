# Examples

This document provides practical examples of building AI agents with AgentLoop for various use cases.

## Basic Examples

### Simple Calculator Agent

A basic agent that can perform mathematical calculations:

```typescript
import { AgentLoop, Tool } from 'agentloop';
import { DefaultAIProvider } from 'agentloop/providers';
import { z } from 'zod';

class CalculatorAgent extends AgentLoop {
  protected systemPrompt = "You are a helpful calculator assistant. Use the calculate tool to perform mathematical operations and provide clear explanations.";

  constructor() {
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4'
    }));

    this.setupTools();
  }

  private setupTools() {
    this.defineTool(z => ({
      name: 'calculate',
      description: 'Perform safe mathematical calculations',
      argsSchema: z.object({
        expression: z.string().describe('Mathematical expression (e.g., "2 + 2", "Math.sqrt(16)")')
      }),
      handler: async ({ args }) => {
        try {
          // Safe evaluation using Function constructor
          const result = Function(`"use strict"; return (${args.expression})`)();
          return { result, expression: args.expression, success: true };
        } catch (error) {
          return { error: 'Invalid expression', success: false };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'final_response',
      description: 'Provide the final answer to the user',
      argsSchema: z.object({
        answer: z.string().describe('The final answer with explanation')
      }),
      handler: async ({ args }) => ({ message: args.answer, final: true })
    }));
  }
}

// Usage
const agent = new CalculatorAgent();
// Manage conversation history as array
const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [];

// Push user message first
conversationHistory.push({ role: 'user', message: "What's the square root of 144 plus 5 times 3?" });

const result = await agent.run({
  userPrompt: "What's the square root of 144 plus 5 times 3?",
  ...(conversationHistory.length > 1 && {
    context: {
      "Conversation History": conversationHistory
        .slice(0, -1) // Exclude current user message
        .map(entry => `${entry.role}: ${entry.message}`)
        .join('\n')
    }
  })
});

// Push agent response after receiving it
if (result.agentResponse) {
  conversationHistory.push({
    role: 'agent',
    message: String((result.agentResponse.args as Record<string, unknown>)?.value) || ""
  });
}
```

### Todo List Agent

An agent that manages a simple todo list:

```typescript
class TodoAgent extends AgentLoop {
  private todos: { id: number; text: string; completed: boolean }[] = [];
  private nextId = 1;

  protected systemPrompt = "You are a todo list assistant. Help users manage their tasks efficiently.";

  constructor() {
    super(new DefaultAIProvider({
      service: 'google',
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-2.0-flash'
    }));

    this.setupTools();
  }

  private setupTools() {
    this.defineTool(z => ({
      name: 'add_todo',
      description: 'Add a new todo item',
      argsSchema: z.object({
        text: z.string().describe('The todo item text')
      }),
      handler: async ({ args }) => {
        const todo = { id: this.nextId++, text: args.text, completed: false };
        this.todos.push(todo);
        return { todo, message: `Added: ${args.text}`, success: true };
      }
    }));

    this.defineTool(z => ({
      name: 'list_todos',
      description: 'List all todo items',
      argsSchema: z.object({}),
      handler: async () => {
        return { todos: this.todos, count: this.todos.length, success: true };
      }
    }));

    this.defineTool(z => ({
      name: 'complete_todo',
      description: 'Mark a todo item as completed',
      argsSchema: z.object({
        id: z.number().describe('The todo item ID')
      }),
      handler: async ({ args }) => {
        const todo = this.todos.find(t => t.id === args.id);
        if (!todo) {
          return { error: 'Todo not found', success: false };
        }
        todo.completed = true;
        return { todo, message: `Completed: ${todo.text}`, success: true };
      }
    }));

    this.defineTool(z => ({
      name: 'remove_todo',
      description: 'Remove a todo item',
      argsSchema: z.object({
        id: z.number().describe('The todo item ID')
      }),
      handler: async ({ args }) => {
        const index = this.todos.findIndex(t => t.id === args.id);
        if (index === -1) {
          return { error: 'Todo not found', success: false };
        }
        const removed = this.todos.splice(index, 1)[0];
        return { removed, message: `Removed: ${removed.text}`, success: true };
      }
    }));
  }
}
```

## File Management Examples

### File Operations Agent

An agent that can read, write, and manage files:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

class FileManagerAgent extends AgentLoop {
  constructor(private basePath: string = process.cwd()) {
    super(new DefaultAIProvider({
      service: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-5-sonnet-20241022'
    }));

    this.setupTools();
  }

  private resolvePath(filepath: string): string {
    return path.resolve(this.basePath, filepath);
  }

  private setupTools() {
    this.defineTool(z => ({
      name: 'read_file',
      description: 'Read the contents of a file',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file to read')
      }),
      handler: async ({ args }) => {
        try {
          const fullPath = this.resolvePath(args.filepath);
          const content = await fs.readFile(fullPath, 'utf8');
          const stats = await fs.stat(fullPath);
          return { 
            content, 
            filepath: args.filepath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            success: true 
          };
        } catch (error) {
          return { 
            error: error.message, 
            filepath: args.filepath,
            success: false 
          };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'write_file',
      description: 'Write content to a file',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file'),
        append: z.boolean().optional().describe('Whether to append instead of overwrite')
      }),
      handler: async ({ args }) => {
        try {
          const fullPath = this.resolvePath(args.filepath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          
          if (args.append) {
            await fs.appendFile(fullPath, args.content);
          } else {
            await fs.writeFile(fullPath, args.content);
          }
          
          return { 
            filepath: args.filepath,
            bytesWritten: Buffer.byteLength(args.content, 'utf8'),
            action: args.append ? 'appended' : 'written',
            success: true 
          };
        } catch (error) {
          return { 
            error: error.message, 
            filepath: args.filepath,
            success: false 
          };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'list_directory',
      description: 'List files and directories in a path',
      argsSchema: z.object({
        dirpath: z.string().optional().describe('Directory path (default: current directory)')
      }),
      handler: async ({ args }) => {
        try {
          const fullPath = this.resolvePath(args.dirpath || '.');
          const entries = await fs.readdir(fullPath, { withFileTypes: true });
          
          const items = await Promise.all(entries.map(async (entry) => {
            const itemPath = path.join(fullPath, entry.name);
            const stats = await fs.stat(itemPath);
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime.toISOString()
            };
          }));

          return { 
            path: args.dirpath || '.',
            items,
            count: items.length,
            success: true 
          };
        } catch (error) {
          return { 
            error: error.message, 
            path: args.dirpath,
            success: false 
          };
        }
      }
    }));
  }
}
```

### Project Generator Agent

An agent that can create project structures:

```typescript
class ProjectGeneratorAgent extends AgentLoop {
  protected systemPrompt = `You are a project generator assistant. You can create various types of projects with proper structure and configuration files.

Available project types:
- react: React TypeScript project
- node: Node.js TypeScript project  
- express: Express.js API project
- nextjs: Next.js project

Always create a complete project structure with proper configuration files.`;

  constructor() {
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4'
    }));

    this.setupTools();
  }

  private setupTools() {
    this.defineTool(z => ({
      name: 'create_project',
      description: 'Create a new project with the specified type and structure',
      argsSchema: z.object({
        name: z.string().describe('Project name'),
        type: z.enum(['react', 'node', 'express', 'nextjs']).describe('Project type'),
        description: z.string().optional().describe('Project description')
      }),
      handler: async ({ args }) => {
        const projectPath = path.resolve(args.name);
        
        try {
          await fs.mkdir(projectPath, { recursive: true });

          const templates = this.getProjectTemplate(args.type, args.name, args.description);
          
          for (const [filepath, content] of Object.entries(templates)) {
            const fullPath = path.join(projectPath, filepath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content);
          }

          return {
            projectName: args.name,
            projectType: args.type,
            projectPath,
            filesCreated: Object.keys(templates).length,
            success: true
          };
        } catch (error) {
          return { error: error.message, success: false };
        }
      }
    }));
  }

  private getProjectTemplate(type: string, name: string, description?: string): Record<string, string> {
    const packageJson = {
      name,
      version: '2.0.0',
      description: description || `A ${type} project`,
      main: 'index.js',
      scripts: {},
      dependencies: {},
      devDependencies: {}
    };

    switch (type) {
      case 'react':
        return {
          'package.json': JSON.stringify({
            ...packageJson,
            scripts: {
              start: 'react-scripts start',
              build: 'react-scripts build',
              test: 'react-scripts test',
              eject: 'react-scripts eject'
            },
            dependencies: {
              'react': '^18.0.0',
              'react-dom': '^18.0.0',
              'react-scripts': '^5.0.0'
            },
            devDependencies: {
              '@types/react': '^18.0.0',
              '@types/react-dom': '^18.0.0',
              'typescript': '^5.0.0'
            }
          }, null, 2),
          'src/App.tsx': `import React from 'react';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to ${name}</h1>
        <p>Your React TypeScript app is ready!</p>
      </header>
    </div>
  );
}

export default App;`,
          'src/index.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
          'public/index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`,
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'es5',
              lib: ['dom', 'dom.iterable', 'es6'],
              allowJs: true,
              skipLibCheck: true,
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
              strict: true,
              forceConsistentCasingInFileNames: true,
              module: 'esnext',
              moduleResolution: 'node',
              resolveJsonModule: true,
              isolatedModules: true,
              noEmit: true,
              jsx: 'react-jsx'
            },
            include: ['src']
          }, null, 2)
        };

      case 'node':
        return {
          'package.json': JSON.stringify({
            ...packageJson,
            scripts: {
              start: 'node dist/index.js',
              dev: 'ts-node src/index.ts',
              build: 'tsc',
              test: 'jest'
            },
            dependencies: {},
            devDependencies: {
              '@types/node': '^20.0.0',
              'ts-node': '^10.0.0',
              'typescript': '^5.0.0',
              'jest': '^29.0.0',
              '@types/jest': '^29.0.0'
            }
          }, null, 2),
          'src/index.ts': `console.log('Hello from ${name}!');

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`,
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'es2020',
              module: 'commonjs',
              outDir: './dist',
              rootDir: './src',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist']
          }, null, 2)
        };

      case 'express':
        return {
          'package.json': JSON.stringify({
            ...packageJson,
            scripts: {
              start: 'node dist/server.js',
              dev: 'ts-node src/server.ts',
              build: 'tsc'
            },
            dependencies: {
              'express': '^4.18.0',
              'cors': '^2.8.5'
            },
            devDependencies: {
              '@types/node': '^20.0.0',
              '@types/express': '^4.17.0',
              '@types/cors': '^2.8.0',
              'ts-node': '^10.0.0',
              'typescript': '^5.0.0'
            }
          }, null, 2),
          'src/server.ts': `import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to ${name} API!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(\`🚀 Server running on port \${port}\`);
});`,
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'es2020',
              module: 'commonjs',
              outDir: './dist',
              rootDir: './src',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist']
          }, null, 2)
        };

      default:
        return {};
    }
  }
}
```

## Additional Examples

### Code Analysis Agent

An agent that can analyze code files and provide insights:

```typescript
class CodeAnalysisAgent extends AgentLoop {
  protected systemPrompt = "You are a code analysis expert. Analyze code files for quality, complexity, patterns, and potential improvements.";

  constructor() {
    super(new DefaultAIProvider({
      service: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-5-sonnet-20241022'
    }));

    this.setupTools();
  }

  private setupTools() {
    this.defineTool(z => ({
      name: 'analyze_code',
      description: 'Analyze code quality, complexity, and provide insights',
      dependencies: ['read_file'],
      argsSchema: z.object({
        filepath: z.string().describe('Path to the code file to analyze')
      }),
      handler: async ({ args, dependencies }) => {
        const fileData = dependencies?.read_file?.result;
        if (!fileData?.success || !fileData.content) {
          return { error: 'Could not read file', success: false };
        }

        const content = fileData.content as string;
        const analysis = this.performCodeAnalysis(content, args.filepath);
        
        return { 
          filepath: args.filepath,
          analysis,
          success: true 
        };
      }
    }));

    // Include read_file tool
    this.defineTool(z => ({
      name: 'read_file',
      description: 'Read a file for analysis',
      argsSchema: z.object({
        filepath: z.string().describe('Path to the file')
      }),
      handler: async ({ args }) => {
        try {
          const content = await fs.readFile(args.filepath, 'utf8');
          return { content, filepath: args.filepath, success: true };
        } catch (error) {
          return { error: error.message, success: false };
        }
      }
    }));
  }

  private performCodeAnalysis(content: string, filepath: string) {
    const lines = content.split('\n');
    const language = this.detectLanguage(filepath);
    
    return {
      language,
      metrics: {
        totalLines: lines.length,
        codeLines: lines.filter(line => line.trim() && !line.trim().startsWith('//')).length,
        commentLines: lines.filter(line => line.trim().startsWith('//')).length,
        blankLines: lines.filter(line => !line.trim()).length,
        averageLineLength: lines.reduce((sum, line) => sum + line.length, 0) / lines.length
      },
      complexity: this.calculateComplexity(content),
      patterns: this.detectPatterns(content, language),
      suggestions: this.generateSuggestions(content, language)
    };
  }

  private detectLanguage(filepath: string): string {
    const ext = path.extname(filepath).toLowerCase();
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.go': 'go',
      '.rs': 'rust'
    };
    return langMap[ext] || 'unknown';
  }

  private calculateComplexity(content: string): object {
    const cyclomaticComplexity = (content.match(/if|while|for|case|catch/g) || []).length + 1;
    const functionCount = (content.match(/function|def|func/g) || []).length;
    const classCount = (content.match(/class/g) || []).length;
    
    return {
      cyclomaticComplexity,
      functionCount,
      classCount,
      nestingLevel: this.calculateMaxNesting(content)
    };
  }

  private calculateMaxNesting(content: string): number {
    let maxNesting = 0;
    let currentNesting = 0;
    
    for (const char of content) {
      if (char === '{') currentNesting++;
      if (char === '}') currentNesting--;
      maxNesting = Math.max(maxNesting, currentNesting);
    }
    
    return maxNesting;
  }

  private detectPatterns(content: string, language: string): string[] {
    const patterns: string[] = [];
    
    if (content.includes('async') && content.includes('await')) {
      patterns.push('async/await pattern');
    }
    if (content.includes('Promise')) {
      patterns.push('Promise usage');
    }
    if (content.includes('class') && content.includes('extends')) {
      patterns.push('inheritance');
    }
    if (content.includes('interface') || content.includes('type')) {
      patterns.push('type definitions');
    }
    
    return patterns;
  }

  private generateSuggestions(content: string, language: string): string[] {
    const suggestions: string[] = [];
    
    if (content.split('\n').length > 200) {
      suggestions.push('Consider breaking this file into smaller modules');
    }
    if ((content.match(/function/g) || []).length > 10) {
      suggestions.push('High function count - consider organizing into classes or modules');
    }
    if (this.calculateMaxNesting(content) > 4) {
      suggestions.push('High nesting level - consider refactoring for better readability');
    }
    if (!content.includes('//') && !content.includes('/*')) {
      suggestions.push('Consider adding comments for better code documentation');
    }
    
    return suggestions;
  }
}
```

### Multi-Step Workflow Agent

An agent that can execute complex multi-step workflows:

```typescript
class WorkflowAgent extends AgentLoop {
  protected systemPrompt = `You are a workflow automation assistant. You can execute complex multi-step processes efficiently.
  
Break down complex tasks into smaller steps and execute them systematically. Always provide progress updates.`;

  constructor() {
    super(new DefaultAIProvider({
      service: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4'
    }), {
      maxIterations: 20,
      parallelExecution: false // Execute steps sequentially
    });

    this.setupTools();
  }

  private setupTools() {
    this.defineTool(z => ({
      name: 'execute_step',
      description: 'Execute a single step in the workflow',
      argsSchema: z.object({
        stepNumber: z.number().describe('Current step number'),
        description: z.string().describe('Description of what this step does'),
        action: z.enum(['file_operation', 'calculation', 'analysis', 'completion']).describe('Type of action to perform'),
        parameters: z.record(z.any()).describe('Parameters for the action')
      }),
      handler: async ({ args }) => {
        console.log(`📋 Step ${args.stepNumber}: ${args.description}`);
        
        try {
          let result;
          switch (args.action) {
            case 'file_operation':
              result = await this.handleFileOperation(args.parameters);
              break;
            case 'calculation':
              result = await this.handleCalculation(args.parameters);
              break;
            case 'analysis':
              result = await this.handleAnalysis(args.parameters);
              break;
            case 'completion':
              result = { message: 'Workflow completed', final: true };
              break;
            default:
              result = { error: 'Unknown action type' };
          }
          
          return {
            stepNumber: args.stepNumber,
            description: args.description,
            result,
            success: true,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            stepNumber: args.stepNumber,
            error: error.message,
            success: false
          };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'workflow_progress',
      description: 'Report progress on the current workflow',
      argsSchema: z.object({
        completedSteps: z.number().describe('Number of completed steps'),
        totalSteps: z.number().describe('Total number of steps'),
        currentTask: z.string().describe('Description of current task'),
        estimatedTimeRemaining: z.string().optional().describe('Estimated time to completion')
      }),
      handler: async ({ args }) => {
        const progress = Math.round((args.completedSteps / args.totalSteps) * 100);
        
        console.log(`🔄 Progress: ${progress}% (${args.completedSteps}/${args.totalSteps})`);
        console.log(`📋 Current: ${args.currentTask}`);
        if (args.estimatedTimeRemaining) {
          console.log(`⏱️  ETA: ${args.estimatedTimeRemaining}`);
        }
        
        return {
          progress,
          completedSteps: args.completedSteps,
          totalSteps: args.totalSteps,
          currentTask: args.currentTask,
          success: true
        };
      }
    }));
  }

  private async handleFileOperation(params: Record<string, any>): Promise<any> {
    // Handle file operations based on parameters
    const { operation, filepath, content } = params;
    
    switch (operation) {
      case 'read':
        const readContent = await fs.readFile(filepath, 'utf8');
        return { operation, filepath, content: readContent };
      case 'write':
        await fs.writeFile(filepath, content);
        return { operation, filepath, bytesWritten: Buffer.byteLength(content) };
      case 'list':
        const entries = await fs.readdir(filepath);
        return { operation, filepath, entries };
      default:
        throw new Error(`Unknown file operation: ${operation}`);
    }
  }

  private async handleCalculation(params: Record<string, any>): Promise<any> {
    const { expression, type } = params;
    
    try {
      let result;
      if (type === 'math') {
        // This executes in the secure host environment
        result = Function(`"use strict"; return (${expression})`)();
      } else if (type === 'statistical') {
        // Handle statistical calculations
        const data = params.data as number[];
        result = {
          mean: data.reduce((a, b) => a + b, 0) / data.length,
          max: Math.max(...data),
          min: Math.min(...data),
          count: data.length
        };
      }
      
      return { type, expression, result };
    } catch (error) {
      throw new Error(`Calculation failed: ${error.message}`);
    }
  }

  private async handleAnalysis(params: Record<string, any>): Promise<any> {
    const { type, data } = params;
    
    switch (type) {
      case 'text':
        return {
          wordCount: data.split(/\s+/).length,
          charCount: data.length,
          lineCount: data.split('\n').length
        };
      case 'array':
        return {
          length: data.length,
          unique: [...new Set(data)].length,
          duplicates: data.length - [...new Set(data)].length
        };
      default:
        throw new Error(`Unknown analysis type: ${type}`);
    }
  }
}

// Usage example for complex workflow
const agent = new WorkflowAgent();
// Manage conversation history as array
const conversationHistory: Array<{role: 'user' | 'agent', message: string}> = [];

const userMessage = `Create a project analysis workflow:
  1. Read all TypeScript files in the src directory
  2. Analyze each file for complexity and patterns  
  3. Calculate overall project statistics
  4. Generate a summary report
  5. Save the report to analysis-report.md`;

// Push user message first
conversationHistory.push({ role: 'user', message: userMessage });

const result = await agent.run({
  userPrompt: userMessage,
  ...(conversationHistory.length > 1 && {
    context: {
      "Conversation History": conversationHistory
        .slice(0, -1) // Exclude current user message
        .map(entry => `${entry.role}: ${entry.message}`)
        .join('\n')
    }
  })
});

// Push agent response after receiving it
if (result.agentResponse) {
  conversationHistory.push({
    role: 'agent',
    message: String((result.agentResponse.args as Record<string, unknown>)?.value) || ""
  });
}
```

## Security Examples

### Secure Execution Agent

An agent configured for secure production environments:

```typescript
class SecureAgent extends AgentLoop {
  constructor() {
    super(new DefaultAIProvider({
      service: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-5-sonnet-20241022'
    }), {
      globalToolTimeoutMs: 10000, // 10 second timeout
      toolExecutionRetryAttempts: 2,
      maxIterations: 5,
      // Configure secure execution mode via options
      jsExecutionMode: process.env.NODE_ENV === 'production' ? 'ses' : 'eval'
    });

    this.setupSecureTools();
  }

  private setupSecureTools() {
    // Only include safe, validated tools
    this.defineTool(z => ({
      name: 'safe_calculation',
      description: 'Perform safe mathematical calculations',
      timeout: 5000,
      argsSchema: z.object({
        expression: z.string().regex(/^[0-9+\-*/().\s]+$/, 'Only basic math operations allowed')
      }),
      handler: async ({ args }) => {
        try {
          const result = Function(`"use strict"; return (${args.expression})`)();
          return { result, safe: true };
        } catch (error) {
          return { error: 'Invalid expression', safe: false };
        }
      }
    }));

    this.defineTool(z => ({
      name: 'validate_input',
      description: 'Validate and sanitize user input',
      argsSchema: z.object({
        input: z.string().max(1000).describe('Input to validate'),
        type: z.enum(['email', 'url', 'text']).describe('Type of validation')
      }),
      handler: async ({ args }) => {
        const { input, type } = args;
        
        let isValid = false;
        let sanitized = input.trim();
        
        switch (type) {
          case 'email':
            isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
            break;
          case 'url':
            try {
              new URL(input);
              isValid = true;
            } catch {
              isValid = false;
            }
            break;
          case 'text':
            sanitized = input.replace(/<[^>]*>/g, ''); // Remove HTML tags
            isValid = sanitized.length > 0;
            break;
        }
        
        return { isValid, sanitized, type };
      }
    }));
  }
}
```

## Security Notes

AgentLoop v2.0.0 provides maximum security by default:

- **Zero Configuration**: No security settings needed - SES is always used
- **Maximum Protection**: All AI-generated code runs in isolated SES compartments
- **Production Ready**: Same security in development and production environments
- **Tool Safety**: Tool handlers run in the secure host environment

These examples demonstrate the flexibility and power of AgentLoop for building various types of AI agents. Each example can be extended and customized based on your specific requirements.