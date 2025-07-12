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

  getFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    if (this.responseFormat === ResponseFormat.XML) {
      return this.getXmlFormatInstructions(finalToolName, parallelExecution);
    } else {
      return this.getFunctionCallingFormatInstructions(finalToolName, parallelExecution);
    }
  }

  private getXmlFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    const executionStrategy = parallelExecution ? 
      "Your tools can execute concurrently. You should call all necessary tools for a task in a single turn." : 
      "Your tools execute sequentially. If one tool fails, you must retry and fix it before continuing.";

    return `You MUST respond by calling one or more tools. Your entire output must be a single, valid XML block enclosed in \`\`\`xml ... \`\`\`. All tool calls must be children under a single <root> XML tag.

**CRITICAL TERMINATION RULES:**
1. **NEVER REPEAT SUCCESSFUL OPERATIONS:** Before making any tool call, check the tool call history. If a tool has already succeeded for the same purpose, DO NOT call it again.
2. **MANDATORY TERMINATION:** You MUST call the '${finalToolName}' tool when:
   - You have successfully completed the user's request
   - All required information has been gathered or operations completed
   - You can provide a complete answer to the user
3. **SINGLE FINAL TOOL:** When using '${finalToolName}', it must be the ONLY tool in your response.
4. **NO REDUNDANT WORK:** If the history shows a task is complete, immediately use '${finalToolName}' with the results.

**WORKFLOW DECISION PROCESS:**
- Check history → Identify what's been done → Determine what's still needed → Either do remaining work OR use '${finalToolName}' if complete

**Example of completing after successful operations:**
\`\`\`xml
<root>
  <${finalToolName}><name>${finalToolName}</name><value>I have successfully completed your request. [Summarize what was accomplished based on the history]</value></${finalToolName}>
</root>
\`\`\`

**Execution Strategy:** ${executionStrategy}`;
  }

  private getFunctionCallingFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    const executionStrategy = parallelExecution ? 
      "You can call multiple functions concurrently in a single response." : 
      "You should call functions sequentially. If one function fails, retry and fix it before continuing.";

    return `You MUST respond by calling one or more functions. Use the following JSON format enclosed in \`\`\`json ... \`\`\`.

**CRITICAL TERMINATION RULES:**
1. **NEVER REPEAT SUCCESSFUL OPERATIONS:** Before making any function call, check the function call history. If a function has already succeeded for the same purpose, DO NOT call it again.
2. **MANDATORY TERMINATION:** You MUST call the '${finalToolName}' function when:
   - You have successfully completed the user's request
   - All required information has been gathered or operations completed
   - You can provide a complete answer to the user
3. **SINGLE FINAL FUNCTION:** When using '${finalToolName}', it must be the ONLY function in your response.
4. **NO REDUNDANT WORK:** If the history shows a task is complete, immediately use '${finalToolName}' with the results.

**WORKFLOW DECISION PROCESS:**
- Check history → Identify what's been done → Determine what's still needed → Either do remaining work OR use '${finalToolName}' if complete

**Format for single function call:**
\`\`\`json
{
  "function_call": {
    "name": "function_name",
    "arguments": "{\\"param1\\": \\"value1\\", \\"param2\\": \\"value2\\"}"
  }
}
\`\`\`

**Format for multiple function calls:**
\`\`\`json
{
  "function_calls": [
    {
      "name": "function_name_1",
      "arguments": "{\\"param1\\": \\"value1\\"}"
    },
    {
      "name": "function_name_2", 
      "arguments": "{\\"param2\\": \\"value2\\"}"
    }
  ]
}
\`\`\`

**Example of completing after successful operations:**
\`\`\`json
{
  "function_call": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"I have successfully completed your request. [Summarize what was accomplished based on the history]\\"}"
  }
}
\`\`\`

**Execution Strategy:** ${executionStrategy}`;
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
    sections.push(`# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS\n${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}`);

    // 3. Tool definitions
    sections.push(`# AVAILABLE TOOLS\n${toolDefinitions}.`);

    // 4. Context
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
      statusSummary += `\n**SUCCESSFUL OPERATIONS (${successfulTools.length}):** ${successfulTools.map(t => t.toolname).join(', ')}`;
    }
    if (failedTools.length > 0) {
      statusSummary += `\n**FAILED OPERATIONS (${failedTools.length}):** ${failedTools.map(t => t.toolname).join(', ')}`;
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
    
    const defaultRetryInstructions = "You have more attempts. Analyze the error and history, then retry with a corrected approach. If the same error persists, try alternative approaches.";
    const maxRetryMessage = `⚠️ You have reached the maximum retry limit. You MUST IMMEDIATELY use the '${finalToolName}' tool terminate, report what you accomplished and explain what went wrong. DO NOT attempt more tool calls.`;
    
    const retryInstruction = keepRetry 
      ? (errorRecoveryInstructions || defaultRetryInstructions)
      : maxRetryMessage;
    
    return `# ERROR RECOVERY\n- **Last Error:** ${error.message}\n- **Recovery Instruction:** ${retryInstruction}`;
  }

  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `# CURRENT TASK
Based on all the information above, use your tools to respond to this user request:
"${userPrompt}"

**CRITICAL DECISION POINT:**
Before proceeding, analyze the tool call history above:
1. **If the task is already complete** (all required operations succeeded): Call ONLY the '${finalToolName}' tool with a summary of what was accomplished.
2. **If work remains**: Call only the tools needed to complete the remaining work.
3. **Never repeat successful operations** - this wastes iterations and delays completion.

Remember: Your goal is efficient task completion, not tool repetition.`;
  }
}