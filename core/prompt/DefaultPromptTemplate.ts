import { Interaction, ChatEntry, PromptOptions } from '../types/types';
import { AgentError } from '../utils/AgentError';

/**
 * Response format types - function calling and YAML mode are supported
 */
export enum FormatType {
  FUNCTION_CALLING = 'function_calling',
  YAML_MODE = 'yaml_mode'
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
   * CORRECTED: Generate shared termination and workflow rules with clearer, less aggressive logic.
   */
  private getSharedTerminationRules(finalToolName: string): string {
    return `**🚨 CRITICAL TERMINATION RULES (MUST FOLLOW):**
1. Review the tool call history to understand what has already been done.
2. NEVER repeat a tool call that has already succeeded.
3. Once ALL parts of the user's request have been successfully completed and you have the final answer, you MUST use the '${finalToolName}' tool.
4. The '${finalToolName}' tool call must be the ONLY tool in your response.
5. If you get stuck in a loop or cannot make progress, use '${finalToolName}' to explain the issue.

**WORKFLOW:**
1. Carefully read the user's request, old interaction history and new interaction histroy.
2. Determine what the next logical step is to answer the user request.
3. If you have executed tool and have enough data to answer the user task, call the '${finalToolName}' tool with a summary of the results.
4. If the task is NOT complete, call the necessary tool(s) to make progress. Do not call '${finalToolName}'.

**WARNING:** Repeating same exact tool over and over continously will activate the stagnation detector`;
  }

  /**
   * Generate shared batching instructions
   */
  private getSharedBatchingRules(): string {
    return `**BATCHING REQUIRED:** Call ALL related tools in ONE response for efficiency
- Think about ALL needed tools before responding
- Batch multiple operations together whenever possible`;
  }

  private getFormatInstructions(finalToolName: string): string {
    switch (this.responseFormat) {
      case FormatType.FUNCTION_CALLING:
        return this.getFunctionCallingFormatInstructions(finalToolName);
      case FormatType.YAML_MODE:
        return this.getYamlFormatInstructions(finalToolName);
      default:
        return this.getFunctionCallingFormatInstructions(finalToolName);
    }
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

  private getYamlFormatInstructions(finalToolName: string): string {
    return `## YAML FORMAT
Respond by calling tools using YAML format in code blocks.

${this.getSharedTerminationRules(finalToolName)}

${this.getSharedBatchingRules()}

### 🚨 STRICT SCHEMA COMPLIANCE REQUIRED 🚨
**CRITICAL:** You MUST follow the exact tool schema definitions. Any deviation will cause failures.

**Schema Validation Rules:**
1. **ONLY use parameter names defined in the tool schema** - never invent your own parameter names
2. **Include ALL required parameters** - missing required params will cause validation errors
3. **Use correct data types** - strings must be quoted, numbers unquoted, arrays use proper YAML syntax
4. **Follow exact parameter spelling** - case-sensitive parameter names from schema
5. **Do not add extra parameters** - only use what's defined in the schema

**YAML Syntax Requirements:**
- Use double quotes (") for simple, single-line strings without special characters.
- If the string contains quotes, backslashes, or newlines, escape all special characters properly inside the quotes.
- Never wrap arbitrary text in double quotes without escaping — this causes invalid YAML.
- To include multi-line text (e.g. a message or CODE ), use the | block scalar style. This preserves newlines and formatting exactly as written.
- if you use the | block scalar style u do not need to escape characters
- Parameter names are case-sensitive and must match schema exactly
- Use proper YAML indentation (2 spaces)
- Arrays use YAML list syntax with dashes

### Examples (Templates Only - Follow Tool Schema Exactly)
**Multiline string usage**
⚠️ If your message includes code, JSON, XML, or any text with line breaks, colons, or quotes, you must use the | multi-line block style.
Do not try to squeeze these into a single-line string — YAML will break or require escaping that violates the schema rules.
tool_calls:
  - name: <exact_tool_name_from_schema>
    args:
      value: |
        This is a multi-line string.
        It preserves all line breaks,
        spaces, and formatting exactly.
        You can write a code here.



**Single tool call:**
\`\`\`yaml
tool_calls:
  - name: <exact_tool_name_from_schema>
    args:
      <exact_param_name>: "<value>" # Must match schema parameter name exactly
      <optional_param>: "<value>" # Only if defined in schema
\`\`\`

**Multiple (batched) tool calls:**
\`\`\`yaml
tool_calls:
  - name: <exact_tool_name_1>
    args:
      <schema_param_1>: "<value>"
      <schema_param_2>: 123 # Number example
  
  - name: <exact_tool_name_2>
    args:
      <schema_param_name>: "<value>"
\`\`\`

**Final tool completion:**
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      # CRITICAL: Check the ${finalToolName} tool schema above for ALL required parameters
      # Include EVERY required parameter with exact names from the schema
      # Example structure (replace with actual schema parameters):
      <required_param_1>: "<value_1>"
      <required_param_2>: "<value_2>"
      <optional_param_3>: "<value_3>" # Only if defined in schema
\`\`\`

### ⚠️ VALIDATION WARNING ⚠️
If your YAML doesn't match the tool schema exactly, the system will reject it with a validation error. Always check:
- Parameter names match schema exactly
- All required parameters are included
- Data types are correct
- YAML syntax is valid
`;
  }

  getExecutionStrategySection(parallelExecution: boolean): string {
    const strategy = parallelExecution
      ? "Tools run concurrently - batch multiple tools in single responses."
      : "Tools run sequentially - still batch multiple calls together.";

    return `# EXECUTION STRATEGY
${strategy}
${this.getSharedBatchingRules()}`;
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
    sections.push(`# OUTPUT FORMAT AND TOOL CALLING INSTRUCTIONS\n${this.getFormatInstructions(finalToolName)}`);

    // 3. Tool definitions
    sections.push(`# AVAILABLE TOOLS\n## 🔍 SCHEMA ANALYSIS REQUIRED\n**CRITICAL:** Before calling ANY tool, you MUST:\n1. Read the tool schema carefully\n2. Identify ALL required parameters\n3. Use EXACT parameter names (case-sensitive)\n4. Never add extra parameters not in schema\n5. Follow the data types specified\n\n${toolDefinitions}\n\n⚠️ **VALIDATION:** The system will reject calls that don't match these schemas exactly.`);

    // 4. Tool execution strategy
    if (options.includeExecutionStrategy) {
      sections.push(this.getExecutionStrategySection(options.parallelExecution || false));
    }

    // 5. Context
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // 5. Conversation history
    if (options.includeConversationHistory && oldAgentEventHistory.length > 0) {
      sections.push(this.buildAgentEventHistory(oldAgentEventHistory, options));
    }

    // 6. Tool call history
    if (options.includeToolHistory) {
      sections.push(this.buildAgentEventList(agentEventList));
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

  buildAgentEventHistory(agentEventHistory: Interaction[], options: PromptOptions): string {
    const entries = options.maxHistoryEntries
      ? agentEventHistory.slice(-options.maxHistoryEntries)
      : agentEventHistory;

    return `# OLD Tasks Interaction HISTORY\n${JSON.stringify(entries, null, 2)}`;
  }

  buildAgentEventList(agentEventList: Interaction[]): string {

    const historyLog = JSON.stringify(agentEventList, null, 2);

    return `# Current Task Agent Interaction List:\n${historyLog}`;
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

  /**
   * CORRECTED: The decision process is now clearer and guides the AI correctly.
   */
  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `# CURRENT TASK
Respond to: "${userPrompt}"

**Your Decision Process:**
1. Review the history to see what has been done.
2. If the answer is already in the history, call '${finalToolName}' with a complete answer.
3. If the answer is not in the history, call the next tool needed to get closer to the answer.
4. Do not call '${finalToolName}' unless the entire task is finished.`;
  }
}