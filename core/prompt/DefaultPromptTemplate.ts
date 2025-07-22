import { Interaction, PromptOptions, ToolCallReport } from '../types/types';
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
    return `## DECISION FRAMEWORK

### Task Context Understanding
1. **Task ID Separation**: Each task has a unique ID. Different task IDs = completely separate conversations.
2. **History Priority**: 
   - PRIMARY: Current task history (same task ID) - your immediate working context
   - SECONDARY: Previous task history - reference only, unless user explicitly mentions past conversations

### Execution Requirements
3. **Action Protocol**: When user requests information → check REPORTS AND RESULTS first
4. **Information Gathering**: If data exists in REPORTS AND RESULTS, use 'final' tool to present it clearly
5. **Tool Usage Mandate**: Only execute new tools if the requested data is NOT in REPORTS AND RESULTS
6. **Report Requirement**: ALWAYS call the 'report' tool alongside every other tool execution (except 'final')

### Completion Criteria
7. **Task Completion**: Use '${finalToolName}' ONLY when:
   - ✅ User's request is completely fulfilled with data from REPORTS AND RESULTS
   - ✅ You have all necessary information to answer the user
   - ✅ All required operations are finished
   - ⚠️ You cannot proceed and need to explain why
8. **Answer Source**: Base your final answer on actual results from REPORTS AND RESULTS, not assumptions

### CRITICAL CONSTRAINTS
- ❌ NEVER use '${finalToolName}' with other tools in same response
- ❌ NEVER re-execute tools if data exists in REPORTS AND RESULTS - just present the data
- ❌ NEVER say "I have already done this" - extract and show the actual results using '${finalToolName}'
- ✅ '${finalToolName}' terminates the conversation - use standalone only
- ✅ Check REPORTS AND RESULTS before executing any tools
- ✅ If user asks for data that exists in REPORTS AND RESULTS, use '${finalToolName}' to present it
- 🚨 ALWAYS include 'report' tool with every other tool call (except '${finalToolName}')`;
  }

  /**
   * Generate tool execution strategy instructions
   */
  private getExecutionStrategy(parallelExecution: boolean): string {
    if (parallelExecution) {
      return `### EXECUTION STRATEGY
**Parallel Mode**: Tools execute concurrently
- ✅ Call multiple tools in single response for efficiency
- ✅ Tools with dependencies will wait for prerequisites  
- ✅ Independent tools run simultaneously
- 🚨 ALWAYS include 'report' tool with every tool execution`;
    } else {
      return `### EXECUTION STRATEGY
**Sequential Mode**: Tools execute in order
- ✅ Call multiple tools in single response
- ✅ Tools execute one after another
- ✅ Each tool waits for previous completion
- 🚨 ALWAYS include 'report' tool with every tool execution`;
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
    return `# RESPONSE FORMAT: JSON FUNCTION CALLING

${this.getWorkflowRules(finalToolName)}

${this.getExecutionStrategy(parallelExecution)}

## OUTPUT FORMAT REQUIREMENTS
You MUST respond with JSON in code blocks. Follow these patterns exactly:

### Single Tool Execution
\`\`\`json
{
  "functionCall": {
    "name": "tool_name",
    "arguments": "{\\"param1\\": \\"value1\\", \\"param2\\": \\"value2\\"}"
  }
}
\`\`\`

### Multiple Tool Execution (ALWAYS include 'report' tool)
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
    },
    {
      "name": "report",
      "arguments": "{\\"report\\": \\"I have called tools tool_name_1, tool_name_2 because I need to [reason for calling these tools]\\"}"
    }
  ]
}
\`\`\`

### Task Completion (STANDALONE ONLY)
\`\`\`json
{
  "functionCall": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"[Complete summary of results and accomplishments]\\"}"
  }
}
\`\`\`

### ⚠️ CRITICAL FORMATTING RULES
- ❌ NEVER combine "${finalToolName}" with other tools
- ✅ Use "functionCall" (singular) for one tool + report tool
- ✅ Use "functionCalls" (plural) for multiple tools + report tool
- ✅ Arguments must be JSON strings (escaped quotes)
- ✅ Include ALL required parameters from tool schemas
- 🚨 ALWAYS include "report" tool in every response (except when using "${finalToolName}")`;
  }

  private getYamlFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `# ⚠️ MANDATORY RESPONSE FORMAT: YAML TOOL CALLS ONLY ⚠️

${this.getWorkflowRules(finalToolName)}

${this.getExecutionStrategy(parallelExecution)}

## 🚨 CRITICAL: YOU MUST ONLY RESPOND WITH YAML CODE BLOCKS - NO PLAIN TEXT 🚨

### ✅ REQUIRED FORMAT - USE THIS EXACT STRUCTURE:

🚨 **CRITICAL DISTINCTION**:
- **TASK COMPLETION**: Use "${finalToolName}" when you have completed the task or need to respond without using other tools
- **TOOL EXECUTION**: Use appropriate available tools when you need to perform actions or gather information

For task completion responses:
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      value: |
        [Your complete response based on available data or explanation]
\`\`\`

For tool execution (example with hypothetical tools):
\`\`\`yaml
tool_calls:
  - name: example_tool
    args:
      param1: |
        value1
  - name: report
    args:
      report: |
        I have called tools example_tool because I need to [accomplish specific goal]
\`\`\`

### Schema Compliance Rules
- ✅ Use EXACT parameter names from tool schemas (case-sensitive)
- ✅ Include ALL required parameters  
- ✅ Use | block style for string values
- ✅ Numbers without quotes, strings with | block syntax

### Single Tool Execution
\`\`\`yaml
tool_calls:
  - name: tool_name
    args:
      param1: |
        value1
      param2: |
        value2
\`\`\`

### Multiple Tool Execution (ALWAYS include 'report' tool)
\`\`\`yaml
tool_calls:
  - name: tool_name_1
    args:
      param1: |
        value1
  - name: tool_name_2
    args:
      param2: |
        value2
  - name: report
    args:
      report: |
        I have called tools tool_name_1, tool_name_2 because I need to [reason for calling these tools]
\`\`\`

### Task Completion (STANDALONE ONLY)
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      value: |
        [Complete summary of results and accomplishments]
\`\`\`

### 🚨 ABSOLUTE REQUIREMENTS 🚨
- ❌ NEVER respond with plain text - ALWAYS use YAML code blocks
- ❌ NEVER combine "${finalToolName}" with other tools
- ✅ Always use "tool_calls:" as root element
- ✅ Each tool is array item with "name:" and "args:"
- ✅ Use | block style for all string arguments
- ✅ Maintain proper YAML indentation (2 spaces)
- ✅ Use "${finalToolName}" when task is complete or you need to respond without other tools
- ✅ Use available tools when you need to perform actions or gather information
- 🚨 Always check REPORTS AND RESULTS first - use "${finalToolName}" if data already exists
- 🚨 ALWAYS include "report" tool in every tool_calls list (except when using "${finalToolName}")`;
  }


  buildPrompt(
    systemPrompt: string,
    userPrompt: string,
    context: Record<string, any>,
    currentInteractionHistory: Interaction[],
    prevInteractionHistory: Interaction[],
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

    // 2. Format instructions - CRITICAL FIRST
    sections.push(`🚨 MANDATORY: You MUST respond using the exact format specified below. No exceptions. 🚨\n\n${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}`);

    // 3. Tool definitions
    sections.push(`# AVAILABLE TOOLS
📋 **Schema Compliance Requirements:**
- Parameter names are CASE-SENSITIVE
- ALL required parameters MUST be included
- Follow exact data types specified in schemas
- Review tool descriptions for usage context

${toolDefinitions}`);

    // 4. Reports and results (if any exist in interaction history)
    sections.push(this.buildReportSection(currentInteractionHistory));

    // 5. Context
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // 6. Previous task history
    if (options.includePreviousTaskHistory && prevInteractionHistory.length > 0) {
      sections.push(this.buildPreviousTaskHistory(prevInteractionHistory, options));
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

    // 9. User Request
    sections.push(this.buildUserRequestSection(userPrompt));

    return sections.join('\n\n');
  }

  buildReportSection(interactionHistory: Interaction[]): string {
    const toolCallReports = interactionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    
    if (toolCallReports.length === 0) {
      return `# REPORTS AND RESULTS
📋 **No reports available yet.**
🚨 **MANDATORY**: ALWAYS call the 'report' tool alongside every other tool execution`;
    }

    let formattedSection = `# REPORTS AND RESULTS
🚨 **MANDATORY**: ALWAYS call the 'report' tool alongside every other tool execution
📊 **IMPORTANT**: Check this section FIRST before executing any tools - data might already be here!

`;

    toolCallReports.forEach((reportData, index) => {
      formattedSection += `## Report: ${reportData.report}
   **overall success**: ${reportData.overallSuccess}
   **error**: ${reportData.error || 'No error'}
   **result**: ${JSON.stringify(reportData.toolCalls, null, 2)}

`;
    });

    formattedSection += `💡 **Use this information to decide your next action and avoid repeating work.`;

    return formattedSection;
  }

  buildContextSection(context: Record<string, any>, options: PromptOptions): string {
    if (Object.keys(context).length === 0) {
      return `# CONTEXT
📋 No additional context provided for this task.`;
    }

    const contextEntries = Object.entries(context)
      .map(([key, value]) => {
        const displayValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return `### ${key}\n${displayValue}`;
      })
      .join('\n\n');

    return `# CONTEXT
🔍 **Available Context Data:**

${contextEntries}`;
  }

  buildPreviousTaskHistory(prevInteractionHistory: Interaction[], options: PromptOptions): string {
    const entries = options.maxPreviousTaskEntries
      ? prevInteractionHistory.slice(-options.maxPreviousTaskEntries)
      : prevInteractionHistory;

    const entryCount = entries.length;
    const limitNote = options.maxPreviousTaskEntries 
      ? ` (showing last ${Math.min(entryCount, options.maxPreviousTaskEntries)} entries)`
      : '';

    return `# PREVIOUS TASK HISTORY
📚 **Reference Information from Past Conversations**${limitNote}
⚠️ Use this for context only - focus on current task unless user explicitly references past work

${JSON.stringify(entries, null, 2)}`;
  }

  buildUserRequestSection(userPrompt: string): string {
    return `# USER REQUEST
🎯 **What the user wants:** "${userPrompt}"

📋 **DECISION PROCESS:**
1. **FIRST**: Check if REPORTS AND RESULTS above contains the data the user wants
2. **If data exists**: Use 'final' tool to extract and present the data clearly to the user
3. **If data missing**: Execute the needed tools + 'report' tool to get the data
4. **NEVER re-execute tools** if the data is already in REPORTS AND RESULTS

⚡ **Action Required:** Make your decision based on the REPORTS AND RESULTS section above!`;
  }

  buildErrorRecoverySection(
    finalToolName: string,
    error: AgentError | null,
    keepRetry: boolean,
    errorRecoveryInstructions?: string
  ): string {
    if (!error) return '';

    const defaultRetryInstructions = "📋 **Recovery Steps:**\n1. Analyze error details and task history\n2. Identify root cause of failure\n3. Modify approach to avoid same error\n4. Retry with corrected parameters/strategy\n5. If same error persists, try alternative methods";
    
    const maxRetryMessage = `🚫 **Maximum Retries Exceeded**\nUse '${finalToolName}' to:\n- Summarize what was successfully accomplished\n- Explain what failed and why\n- Provide partial results if any`;

    const retryInstruction = keepRetry
      ? (errorRecoveryInstructions || defaultRetryInstructions)
      : maxRetryMessage;

    const errorType = error.type ? ` (${error.type})` : '';

    return `# ERROR RECOVERY
⚠️ **Last Error Encountered**${errorType}: ${error.message}

${retryInstruction}`;
  }

}