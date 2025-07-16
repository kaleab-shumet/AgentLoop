# YAML Mode Example

This example demonstrates how to use AgentLoop with YAML_MODE execution mode.

## Features

- **YAML Response Format**: LLM responses are expected in YAML format instead of JSON function calls
- **File Operations**: Read, write, and list files
- **Mathematical Calculations**: Perform basic arithmetic operations
- **Tool Chaining**: Multiple tools can be called in sequence or parallel

## Usage

1. Set your API key:
   ```bash
   export GEMINI_API_KEY=your_api_key_here
   ```

2. Run the example:
   ```bash
   npx ts-node examples/YamlModeExample.ts
   ```

## YAML Format Examples

### Single Tool Call
```yaml
name: calculate
expression: "15 * 8 + 3"
```

### Multiple Tool Calls
```yaml
tools:
  - name: list_files
    directory: "./examples"
  - name: calculate
    expression: "45 + 67"
```

### Final Answer
```yaml
name: final
value: "Task completed successfully. Results: calculation = 123, files listed = 4"
```

## Available Tools

- `read_file`: Read contents of a file
- `write_file`: Write content to a file
- `list_files`: List files in a directory
- `calculate`: Perform mathematical calculations
- `final`: Provide final answer and terminate execution

## How It Works

1. **Execution Mode**: Set to `ExecutionMode.YAML_MODE`
2. **Response Parsing**: The `YamlResponseHandler` parses YAML blocks from LLM responses
3. **Tool Validation**: Arguments are validated against Zod schemas
4. **Tool Execution**: Tools are executed based on parsed YAML calls
5. **Result Formatting**: Results are structured consistently for the agent

This example shows how YAML mode provides a more human-readable alternative to JSON function calls while maintaining the same functionality and performance.