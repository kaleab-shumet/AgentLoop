import { BasePromptTemplate, WorkerPromptParams } from './BasePromptTemplate';

/**
 * Response format types - function calling and YAML mode are supported
 */
export enum FormatType {
  FUNCTION_CALLING = 'function_calling',
  YAML = 'yaml'
}

/**
 * Worker prompt template for executing commands from supervisor
 * Focused on tool execution and reporting back results
 */
export class WorkerPromptTemplate implements BasePromptTemplate {
  private responseFormat: FormatType;

  constructor(responseFormat: FormatType = FormatType.FUNCTION_CALLING) {
    this.responseFormat = responseFormat;
  }

  /**
   * Set the response format (Function Calling or YAML)
   */
  setResponseFormat(format: FormatType): void {
    this.responseFormat = format;
  }

  /**
   * Get the current response format
   */
  getResponseFormat(): FormatType {
    return this.responseFormat;
  }

  /**
   * Generate worker execution logic focused on tool execution
   */
  private getWorkerRules(): string {
    return `
## WORKER AGENT EXECUTION FRAMEWORK

### Your Role as Worker Agent
You are a worker agent that executes specific tasks assigned by a supervisor agent. Your primary responsibility is to:
1. **Execute tools** to complete the assigned task
2. **Report results** back to the supervisor using the 'report' tool
3. **Focus on execution**, not decision-making or user communication

### Execution Logic
1. **Analyze the Command**: Understand what specific task the supervisor wants you to execute
2. **Execute Required Tools**: Use the available tools to complete the task
3. **Report Results**: Always use the 'report' tool to summarize what you accomplished

### Report Protocol
- **MANDATORY**: Always include the 'report' tool with every execution
- **Format**: "I have executed [tool1], [tool2], [tool3] to [accomplish the task]. Results: [detailed summary of what was accomplished]"
- **Be Specific**: Include concrete details about what was done and any results obtained

### Critical Constraints
- ❌ DO NOT make decisions about what the user ultimately needs
- ❌ DO NOT communicate directly with the user
- ✅ FOCUS on executing the assigned task efficiently
- ✅ ALWAYS report back with detailed results
- ✅ Execute tools as instructed by the supervisor

### Worker Mindset
Think: "The supervisor asked me to do X. I will execute the necessary tools to do X and report back the results."

`;



  }

  /**
   * Generate execution strategy based on parallel/sequential mode
   */


  private getFormatInstructions(): string {
    switch (this.responseFormat) {
      case FormatType.FUNCTION_CALLING:
        return this.getFunctionCallingFormatInstructions();
      case FormatType.YAML:
        return this.getYamlFormatInstructions();
      default:
        return this.getFunctionCallingFormatInstructions();
    }
  }


  private getFunctionCallingFormatInstructions(): string {
    return `# 🚨 CRITICAL: WORKER AGENT - RESPOND WITH JSON CODE BLOCKS ONLY 🚨

${this.getWorkerRules()}


## ⚠️ MANDATORY: NO PLAIN TEXT - ONLY JSON CODE BLOCKS ⚠️
🚨 **CRITICAL**: You MUST NOT respond with plain text. EVERY response MUST be a JSON code block.
🚨 **CRITICAL**: You MUST NOT write explanations outside of JSON code blocks.
🚨 **CRITICAL**: You MUST respond with \`\`\`json at the start of your response.

## 🚨 OUTPUT FORMAT REQUIREMENTS - REPORT TOOL IS MANDATORY 🚨
You MUST respond with JSON in code blocks. Follow these patterns exactly:

### JSON Format Pattern

**Tool Execution with Report** (ALWAYS include 'report' tool):
\`\`\`json
{
  "functionCalls": [
    {"name": "required_tool", "arguments": "{\\"param\\": \\"value\\"}"},
    {"name": "report", "arguments": "{\\"report\\": \\"I have executed [tool_name] to [accomplish task]. Results: [detailed summary of results obtained]\\"}"} 
  ]
}
\`\`\`

### Formatting Requirements
- ✅ Use "functionCalls" (plural) for tool execution + report
- ✅ Arguments as JSON strings with escaped quotes  
- ✅ Include ALL required parameters from schemas
- ✅ ALWAYS include the 'report' tool to summarize execution results`;
  }

  private getYamlFormatInstructions(): string {
    return `# RESPONSE FORMAT: YAML CODE BLOCKS ONLY

## Core Rules
${this.getWorkerRules()}

## Output Requirements
- ❌ NO plain text responses
- ✅ YAML code blocks only
- ✅ Always include the 'report' tool with execution
- Write YAML using | for all strings and indented (not inline) key-value style.

## YAML Format Patterns

**Tool Execution with Report** (always include 'report'):
\`\`\`yaml
tool_calls:
  - name: required_tool
    args:
      param: |
        value
  - name: report
    args:
      report: |
        I have executed [tool_name] to [accomplish task]. Results: [detailed summary of results obtained]
\`\`\`

## Format Rules
- ✅ Use exact parameter names from schemas
- ✅ Include ALL required parameters
- ✅ Proper YAML indentation (2 spaces)
- ✅ ALWAYS include the 'report' tool to summarize execution results`;
  }


  buildPrompt(params: WorkerPromptParams): string {
    return this.buildWorkerPrompt(params);
  }

  private buildWorkerPrompt(params: WorkerPromptParams): string {
    const { systemPrompt, supervisorCommand, toolDefinitions } = params;

    return `${this.getSystemSection(systemPrompt)}

${this.getFormatInstructions()}

${this.getToolsSection(toolDefinitions)}

${this.getCommandSection(supervisorCommand)}

${this.getExecutionSection()}`;
  }

  private getSystemSection(systemPrompt: string): string {
    return `${systemPrompt}

# 🚨 WORKER AGENT EXECUTION MODE 🚨

${this.getWorkerRules()}`;
  }

  private getToolsSection(toolDefinitions: string): string {
    return `# AVAILABLE WORKER TOOLS
📋 **Tools you can execute:**

${toolDefinitions}`;
  }

  private getCommandSection(supervisorCommand: string): string {
    return `# SUPERVISOR COMMAND
🎯 **Command from supervisor:** "${supervisorCommand}"`;
  }

  private getExecutionSection(): string {
    return `📋 **Your Task:**
1. Understand what the supervisor is asking you to execute
2. Execute the required tools to complete the task
3. Use the 'report' tool to summarize what you accomplished
4. Focus on execution, not decision-making

⚡ **Execute**: What tools do I need to run to complete this command?`;
  }


  buildSupervisorCommandSection(supervisorCommand: string): string {
    return `# SUPERVISOR COMMAND
🎯 **Command from supervisor:** "${supervisorCommand}"

📋 **Worker Instructions:**
1. Understand what the supervisor is asking you to execute
2. Execute the required tools to complete the task
3. Use the 'report' tool to summarize what you accomplished
4. Focus on execution, not decision-making

⚡ **Execute**: What tools do I need to run to complete this command?`;
  }

}