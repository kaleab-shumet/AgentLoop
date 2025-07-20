import { Interaction, ChatEntry, PromptOptions } from '../types/types';
import { AgentError } from '../utils/AgentError';

/**
 * Response format types - function calling and YAML mode are supported
 */
export enum FormatType {
  FUNCTION_CALLING = 'function_calling',
  YAML = 'yaml'
}

/**
 * Default prompt template that implements the standard AgentLoop prompt structure
 * Supports function calling and YAML response formats
 */
export class DefaultPromptTemplate {
  private responseFormat: FormatType;

  constructor(responseFormat: FormatType = FormatType.FUNCTION_CALLING) {
    this.responseFormat = responseFormat;
  }

  /**
   * Set the response format (XML or Function Calling)
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
   * Generate clear, concise workflow and termination rules
   */
  private getWorkflowRules(finalToolName: string): string {
    return `**DECISION PROCESS:**
1. Review the interaction history to see what has been done
2. If the task is complete and you have the answer, use '${finalToolName}' to provide the final result
3. If the task needs more work, call the appropriate tool(s) to make progress
4. Avoid repeating identical tool calls - this triggers stagnation detection

**WHEN TO USE '${finalToolName}':**
- All required information has been gathered
- The user's request can be fully answered
- You're stuck and need to explain the limitation`;
  }

  /**
   * Generate tool execution strategy instructions
   */
  private getExecutionStrategy(parallelExecution: boolean): string {
    if (parallelExecution) {
      return `**EXECUTION:** Tools run in parallel - you can call multiple tools in one response for efficiency`;
    } else {
      return `**EXECUTION:** Tools run sequentially - you can still call multiple tools in one response`;
    }
  }

  private getFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    switch (this.responseFormat) {
      case FormatType.FUNCTION_CALLING:
        return this.getFunctionCallingFormatInstructions(finalToolName, parallelExecution);
      case FormatType.YAML:
        return this.getYamlFormatInstructions(finalToolName, parallelExecution);
      default:
        return this.getFunctionCallingFormatInstructions(finalToolName, parallelExecution);
    }
  }


  private getFunctionCallingFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `## FUNCTION CALLING FORMAT
Respond using JSON format in code blocks.

${this.getWorkflowRules(finalToolName)}

${this.getExecutionStrategy(parallelExecution)}

**Single tool call:**
\`\`\`json
{
  "functionCall": {
    "name": "tool_name",
    "arguments": "{\\"param1\\": \\"value1\\", \\"param2\\": \\"value2\\"}"
  }
}
\`\`\`

**Multiple tool calls:**
\`\`\`json
{
  "functionCalls": [
    {
      "name": "tool_name_1",
      "arguments": "{\\"param1\\": \\"value1\\"}"
    },
    {
      "name": "tool_name_2", 
      "arguments": "{\\"param2\\": \\"value2\\"}"
    }
  ]
}
\`\`\`

**Task completion:**
\`\`\`json
{
  "functionCall": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"Task completed. [Brief summary]\\"}"
  }
}
\`\`\``;
  }

  private getYamlFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `## YAML FORMAT
Respond using YAML format in code blocks.

${this.getWorkflowRules(finalToolName)}

${this.getExecutionStrategy(parallelExecution)}

**Schema Requirements:**
- Use exact parameter names from tool schemas (case-sensitive)
- Include all required parameters
- Use correct data types (strings in quotes, numbers without quotes)
- For multi-line content, use the | block style

**Single tool call:**
\`\`\`yaml
tool_calls:
  - name: tool_name
    args:
      param1: "value1"
      param2: "value2"
\`\`\`

**Multiple tool calls:**
\`\`\`yaml
tool_calls:
  - name: tool_name_1
    args:
      param1: "value1"
  - name: tool_name_2
    args:
      param2: "value2"
\`\`\`

**Multi-line content:**
\`\`\`yaml
tool_calls:
  - name: tool_name
    args:
      content: |
        This is multi-line content.
        It preserves formatting.
\`\`\`

**Task completion:**
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      value: "Task completed. [Brief summary]"
\`\`\``;
  }


  buildPrompt(
    systemPrompt: string,
    userPrompt: string,        
    context: Record<string, any>,
    oldAgentEventHistory: Interaction[],
    agentEventList: Interaction[],
    lastError: AgentError | null,
    keepRetry: boolean,
    finalToolName: string,
    toolDefinitions: string,
    options: PromptOptions,
    errorRecoveryInstructions?: string
  ): string {
    const sections: string[] = [];

    // 1. System prompt
    sections.push(systemPrompt);

    // 2. Format instructions
    sections.push(`# RESPONSE FORMAT\n${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}`);

    // 3. Tool definitions
    sections.push(`# AVAILABLE TOOLS\nFollow the tool schemas exactly - parameter names are case-sensitive and all required parameters must be included.\n\n${toolDefinitions}`);

    // Execution strategy is now included in format instructions

    // 5. Context
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // 5. Previous task history
    if (options.includePreviousTaskHistory && oldAgentEventHistory.length > 0) {
      sections.push(this.buildPreviousTaskHistory(oldAgentEventHistory, options));
    }

    // 6. Current task history
    if (options.includeCurrentTaskHistory) {
      sections.push(this.buildCurrentTaskHistory(agentEventList));
    }

    // 7. Error recovery
    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, lastError, keepRetry, errorRecoveryInstructions));
    }

    // 8. Custom sections
    if (options.customSections) {
      Object.entries(options.customSections).forEach(([name, content]) => {
        sections.push(`# ${name.toUpperCase()}\n${content}`);
      });
    }

    // 9. Current task
    sections.push(this.buildTaskSection(userPrompt, finalToolName));

    return sections.join('\n\n');
  }

  buildContextSection(context: Record<string, any>, options: PromptOptions): string {
    if (Object.keys(context).length === 0) {
      return '# CONTEXT\nNo background context provided.';
    }

    const contextLog = Object.entries(context)
      .map(([key, value]) => `**${key}**:\n${JSON.stringify(value)}`)
      .join('\n\n');

    return `# CONTEXT\n${contextLog}`;
  }

  buildPreviousTaskHistory(agentEventHistory: Interaction[], options: PromptOptions): string {
    const entries = options.maxPreviousTaskEntries
      ? agentEventHistory.slice(-options.maxPreviousTaskEntries)
      : agentEventHistory;

    return `# PREVIOUS TASK HISTORY\n${JSON.stringify(entries, null, 2)}`;
  }

  buildCurrentTaskHistory(agentEventList: Interaction[]): string {
    const historyLog = JSON.stringify(agentEventList, null, 2);
    return `# CURRENT TASK HISTORY\n${historyLog}`;
  }

  buildErrorRecoverySection(
    finalToolName: string,
    error: AgentError | null,
    keepRetry: boolean,
    errorRecoveryInstructions?: string
  ): string {
    if (!error) return '';

    const defaultRetryInstructions = "Analyze error and history, then retry with corrected approach. If same error persists, try alternatives.";
    const maxRetryMessage = `Maximum retries reached. Use '${finalToolName}' to terminate and report what you accomplished and what failed.`;

    const retryInstruction = keepRetry
      ? (errorRecoveryInstructions || defaultRetryInstructions)
      : maxRetryMessage;

    return `# ERROR RECOVERY\n**Last Error:** ${error.message}\n**Action:** ${retryInstruction}`;
  }

  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `# CURRENT TASK
Respond to: "${userPrompt}"`;
  }
}