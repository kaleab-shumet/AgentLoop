import { PromptTemplateInterface, PromptOptions } from './PromptTemplateInterface';
import { ChatEntry, ToolResult } from '../types/types';
import { AgentError } from '../utils/AgentError';

/**
 * Response format types supported by the default template
 */
export enum ResponseFormat {
  XML = 'xml',
  FUNCTION_CALLING = 'function_calling'
}

/**
 * Default prompt template that implements the standard AgentLoop prompt structure
 * Supports both XML and Function Calling response formats
 */
export class DefaultPromptTemplate implements PromptTemplateInterface {
  private responseFormat: ResponseFormat;

  constructor(responseFormat: ResponseFormat = ResponseFormat.XML) {
    this.responseFormat = responseFormat;
  }

  /**
   * Set the response format (XML or Function Calling)
   */
  setResponseFormat(format: ResponseFormat): void {
    this.responseFormat = format;
  }

  /**
   * Get the current response format
   */
  getResponseFormat(): ResponseFormat {
    return this.responseFormat;
  }

  /**
   * Generate shared termination and workflow rules
   */
  private getSharedTerminationRules(finalToolName: string): string {
    return `**TERMINATION RULES:**
1. NEVER repeat successful operations - check tool call history first
2. Use '${finalToolName}' when task is complete or all required information gathered
3. When using '${finalToolName}', it must be the ONLY tool in your response
4. If history shows task completion, immediately use '${finalToolName}' with results

**WORKFLOW:**
Check history → Identify gaps → Either complete remaining work OR use '${finalToolName}'`;
  }

  /**
   * Generate shared batching instructions
   */
  private getSharedBatchingRules(): string {
    return `**BATCHING REQUIRED:** Call ALL related tools in ONE response for efficiency
- Think about ALL needed tools before responding
- Batch multiple operations together whenever possible`;
  }

  getFormatInstructions(finalToolName: string): string {
    if (this.responseFormat === ResponseFormat.XML) {
      return this.getXmlFormatInstructions(finalToolName);
    } else {
      return this.getFunctionCallingFormatInstructions(finalToolName);
    }
  }

  private getXmlFormatInstructions(finalToolName: string): string {
    return `## XML RESPONSE FORMAT
Respond ONLY with XML code block - no text before or after.

**Format:**
\`\`\`xml
<root>
  <tool_name>
    <param1>value1</param1>
    <param2>value2</param2>
  </tool_name>
</root>
\`\`\`

**Requirements:**
- Start immediately with \`\`\`xml
- End immediately with \`\`\`
- All tool calls inside <root> tags
- Tool names as XML tag names
- Use 'final' tool for conversational responses

${this.getSharedTerminationRules(finalToolName)}

${this.getSharedBatchingRules()}

**Completion Example:**
\`\`\`xml
<root>
  <${finalToolName}>
    <value>Task completed. [Brief summary of accomplishments]</value>
  </${finalToolName}>
</root>
\`\`\``;
  }

  private getFunctionCallingFormatInstructions(finalToolName: string): string {
    return `## FUNCTION CALLING FORMAT
Respond by calling functions using JSON format in code blocks.

${this.getSharedTerminationRules(finalToolName)}

${this.getSharedBatchingRules()}

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

**Completion example:**
\`\`\`json
{
  "functionCall": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"Task completed. [Brief summary]\\"}"
  }
}
\`\`\``;
  }

  getExecutionStrategySection(parallelExecution: boolean): string {
    const strategy = parallelExecution
    ? "Tools run concurrently - batch multiple tools in single responses."
    : "Tools run sequentially - still batch multiple calls together.";
  
    return `# EXECUTION STRATEGY
${strategy}

${this.getSharedBatchingRules()}

**Example - Multiple tools:**
\`\`\`xml
<root>
  <read_file><path>file1.txt</path></read_file>
  <read_file><path>file2.txt</path></read_file>
  <search_code><pattern>function</pattern></search_code>
</root>
\`\`\``;
  }

  buildPrompt(
    systemPrompt: string,
    userPrompt: string,
    context: Record<string, any>,
    lastError: AgentError | null,
    conversationHistory: ChatEntry[],
    toolCallHistory: ToolResult[],
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
    sections.push(`# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS\n${this.getFormatInstructions(finalToolName)}`);

    // 3. Tool definitions
    sections.push(`# AVAILABLE TOOLS\n${toolDefinitions}.`);

    // 4. Tool execution strategy
    if (options.includeExecutionStrategy) {
      sections.push(this.getExecutionStrategySection(options.parallelExecution || false));
    }

    // 5. Context
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // 5. Conversation history
    if (options.includeConversationHistory && conversationHistory.length > 0) {
      sections.push(this.buildConversationSection(conversationHistory, options));
    }

    // 6. Tool call history
    if (options.includeToolHistory) {
      sections.push(this.buildToolHistorySection(toolCallHistory, options));
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

  buildConversationSection(conversationHistory: ChatEntry[], options: PromptOptions): string {
    return `# CONVERSATION HISTORY\n${JSON.stringify(conversationHistory, null, 2)}`;
  }

  buildToolHistorySection(toolCallHistory: ToolResult[], options: PromptOptions): string {
    const entries = options.maxHistoryEntries
      ? toolCallHistory.slice(-options.maxHistoryEntries)
      : toolCallHistory;

    if (entries.length === 0) {
      return '# TOOL CALL HISTORY\nNo tool calls have been made yet.';
    }

    // Analyze completion status
    const successfulTools = entries.filter(entry => entry.success);
    const failedTools = entries.filter(entry => !entry.success);

    let statusSummary = '';
    if (successfulTools.length > 0) {
      statusSummary += `\n**SUCCESSFUL OPERATIONS (${successfulTools.length}):** ${successfulTools.map(t => t.toolName).join(', ')}`;
    }
    if (failedTools.length > 0) {
      statusSummary += `\n**FAILED OPERATIONS (${failedTools.length}):** ${failedTools.map(t => t.toolName).join(', ')}`;
    }

    const historyLog = JSON.stringify(entries, null, 2);

    return `# TOOL CALL HISTORY${statusSummary}\n\n${historyLog}`;
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
Respond to: "${userPrompt}"

**Decision Process:**
1. Check tool history - is task complete?
2. If complete: Use '${finalToolName}' with summary
3. If incomplete: Call needed tools only
4. Never repeat successful operations`;
  }
}