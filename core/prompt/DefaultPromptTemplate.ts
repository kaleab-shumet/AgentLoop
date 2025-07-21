import { Interaction, PromptOptions } from '../types/types';
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
3. **Action Protocol**: When user requests an action → execute tools immediately
4. **Information Gathering**: Always use tools for current/real-time data - never assume or guess
5. **Tool Usage Mandate**: Every user action request MUST trigger tool usage for fresh results

### Completion Criteria
6. **Task Completion**: Use '${finalToolName}' ONLY when:
   - ✅ User's request is completely fulfilled
   - ✅ You have all necessary information
   - ✅ All required operations are finished
   - ⚠️ You cannot proceed and need to explain why

### CRITICAL CONSTRAINTS
- ❌ NEVER use '${finalToolName}' with other tools in same response
- ❌ NEVER say "already done" - always execute fresh tool calls
- ✅ '${finalToolName}' terminates the conversation - use standalone only
- ✅ Use previous history for context (names, preferences) when relevant`;
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
- ✅ Independent tools run simultaneously`;
    } else {
      return `### EXECUTION STRATEGY
**Sequential Mode**: Tools execute in order
- ✅ Call multiple tools in single response
- ✅ Tools execute one after another
- ✅ Each tool waits for previous completion`;
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

### Multiple Tool Execution
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
- ✅ Use "functionCall" (singular) for one tool
- ✅ Use "functionCalls" (plural) for multiple tools  
- ✅ Arguments must be JSON strings (escaped quotes)
- ✅ Include ALL required parameters from tool schemas`;
  }

  private getYamlFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `# ⚠️ MANDATORY RESPONSE FORMAT: YAML TOOL CALLS ONLY ⚠️

${this.getWorkflowRules(finalToolName)}

${this.getExecutionStrategy(parallelExecution)}

## 🚨 CRITICAL: YOU MUST ONLY RESPOND WITH YAML CODE BLOCKS - NO PLAIN TEXT 🚨

### ✅ REQUIRED FORMAT - USE THIS EXACT STRUCTURE:

For greeting or unclear requests:
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      value: |
        Hello! I'm here to help. What would you like me to do?
\`\`\`

For tool operations:
\`\`\`yaml
tool_calls:
  - name: tool_name
    args:
      parameter_name: |
        parameter_value
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

### Multiple Tool Execution
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
- ✅ For greetings/unclear requests, use "${finalToolName}" tool with appropriate response`;
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

    // Execution strategy is now included in format instructions

    // 5. Context
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // 5. Previous task history
    if (options.includePreviousTaskHistory && prevInteractionHistory.length > 0) {
      sections.push(this.buildPreviousTaskHistory(prevInteractionHistory, options));
    }

    // 6. Current task history
    sections.push(this.buildCurrentTaskHistory(currentInteractionHistory));


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

  buildCurrentTaskHistory(currentTaskInteraction: Interaction[]): string {
    const historyLog = JSON.stringify(currentTaskInteraction, null, 2);
    const interactionCount = currentTaskInteraction.length;
    
    return `# CURRENT TASK HISTORY
🔄 **Your Working Memory for This Task** (${interactionCount} interactions)
✅ **Success Indicator**: When tool results show "success": true, the operation completed successfully
🎯 **Priority**: This is your PRIMARY context - use this to track progress and avoid repetition

${historyLog}`;
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

  buildTaskSection(userPrompt: string, finalToolName: string): string {
    return `# CURRENT TASK
🎯 **User Request:** "${userPrompt}"

💡 **Your Mission:**
1. Understand the user's specific request
2. Execute appropriate tools to fulfill the request  
3. Provide accurate, current information
4. Complete the task fully before using '${finalToolName}'

⚡ **Action Required:** Analyze the request and execute tools immediately - no assumptions, get fresh data!`;
  }
}