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
   * Generate core execution logic and decision framework
   */
  private getWorkflowRules(finalToolName: string): string {
    return `## DECISION FRAMEWORK

### Task Context & Priority
1. **Current Request Focus**: Complete the USER REQUEST section below as primary objective
2. **Task Separation**: Each task ID represents a separate conversation context
3. **History Hierarchy**: Current task history takes precedence over previous task references

### Execution Logic
4. **Data Assessment**: Check REPORTS AND RESULTS for current request relevance
5. **Tool Selection**: Execute tools needed for current request, even if similar data exists from previous different requests
6. **Report Protocol**: Include 'report' tool with every execution (except '${finalToolName}')
   - Format: "The user wants [user request]. I have already done [action1], [action2], [action3]..."

### Completion Rules
7. **Use '${finalToolName}' ONLY when**:
   - Complete request fulfilled with ALL steps done
   - All information available for final answer
   - Cannot proceed and need to explain limitations
8. **Multi-step handling**: Complete ALL operations before using '${finalToolName}'
9. **Capability limits**: Explain what you can/cannot do, summarize partial progress

### Critical Constraints
- ❌ NEVER combine '${finalToolName}' with other tools
- ❌ NEVER use '${finalToolName}' for partial completion
- ✅ Always check existing data before tool execution
- ✅ Use '${finalToolName}' standalone only when complete

## THINKING EXAMPLE
**Example Request**: "Get me the weather for New York"

**Step 1 - Analyze Request**: User wants weather data for New York
**Step 2 - Check Reports**: Look at REPORTS AND RESULTS section
  - If weather data already exists → Use '${finalToolName}' to present it
  - If no relevant data → Continue to Step 3
**Step 3 - Plan Tools**: Need weather API tool to get New York weather
**Step 4 - Execute**: Call weather tool + report tool together
**Step 5 - After Results**: Check if data is complete
  - If complete → Use '${finalToolName}' to present weather info
  - If incomplete → Call additional tools needed

**Key Thinking**: "Do I have what the user needs? If yes → '${finalToolName}'. If no → get it first."

### IMPORTANT: When No Tools Available
If you cannot complete a task because:
- No appropriate tools are available to perform the required action
- No relevant information exists in REPORTS AND RESULTS
- The task is beyond your current capabilities

**→ Use '${finalToolName}' immediately to explain:**
- What the user requested
- Why you cannot complete it

**Note**: When a user ask never say i have already done this. Just do what asked.

`;



  }

  /**
   * Generate execution strategy based on parallel/sequential mode
   */
  private getExecutionStrategy(parallelExecution: boolean): string {
    const mode = parallelExecution ? 'Parallel' : 'Sequential';
    const execution = parallelExecution 
      ? 'Tools execute concurrently, independent tools run simultaneously'
      : 'Tools execute in order, each waits for previous completion';
    
    return `### EXECUTION STRATEGY
**${mode} Mode**: ${execution}
- ✅ Call multiple tools in single response for efficiency
- ✅ Dependencies handled automatically`;
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
    return `# 🚨 CRITICAL: YOU MUST RESPOND WITH JSON CODE BLOCKS ONLY 🚨

${this.getWorkflowRules(finalToolName)}

${this.getExecutionStrategy(parallelExecution)}

## ⚠️ MANDATORY: NO PLAIN TEXT - ONLY JSON CODE BLOCKS ⚠️
🚨 **CRITICAL**: You MUST NOT respond with plain text. EVERY response MUST be a JSON code block.
🚨 **CRITICAL**: You MUST NOT write explanations outside of JSON code blocks.
🚨 **CRITICAL**: You MUST respond with \`\`\`json at the start of your response.

## 🚨 OUTPUT FORMAT REQUIREMENTS - REPORT TOOL IS MANDATORY 🚨
You MUST respond with JSON in code blocks. Follow these patterns exactly:

### JSON Format Patterns

**Tool Execution** (include 'report' tool):
\`\`\`json
{
  "functionCalls": [
    {"name": "your_tool", "arguments": "{\\"param\\": \\"value\\"}"},
    {"name": "report", "arguments": "{\\"report\\": \\"The user wants [describe request]. I have already done [list completed actions]...\\"}"}
  ]
}
\`\`\`

**Task Completion** (standalone only):
\`\`\`json
{
  "functionCall": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"Complete results summary\\"}"
  }
}
\`\`\`

### Formatting Requirements
- ❌ NEVER combine "${finalToolName}" with other tools
- ✅ Use "functionCalls" (plural) for tool execution + report
- ✅ Use "functionCall" (singular) for task completion only
- ✅ Arguments as JSON strings with escaped quotes
- ✅ Include ALL required parameters from schemas`;
  }

  private getYamlFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `# RESPONSE FORMAT: YAML CODE BLOCKS ONLY

## Core Rules
${this.getWorkflowRules(finalToolName)}

${this.getExecutionStrategy(parallelExecution)}

## Output Requirements
- ❌ NO plain text responses
- ✅ YAML code blocks only
- ✅ Use "${finalToolName}" for completion, other tools for execution
- Write YAML using | for all strings and indented (not inline) key-value style.

## YAML Format Patterns

**Tool Execution** (always include 'report'):
\`\`\`yaml
tool_calls:
  - name: tool_name
    args:
      param: |
        value
  - name: report
    args:
      report: |
        The user wants [describe request]. I have already done [list completed actions]...
\`\`\`

**Task Completion** (standalone only):
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      value: |
        Complete results
\`\`\`

## Format Rules
- ❌ NEVER combine "${finalToolName}" with other tools
- ✅ Use exact parameter names from schemas
- ✅ Include ALL required parameters
- ✅ Proper YAML indentation (2 spaces)
- ✅ Check existing data before tool execution`;
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
    sections.push(`🚨🚨🚨 CRITICAL: RESPOND ONLY WITH JSON CODE BLOCKS - NO PLAIN TEXT ALLOWED 🚨🚨🚨

${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}`);

    // 3. Tool definitions
    sections.push(`# AVAILABLE TOOLS
📋 **Schema Compliance Requirements:**
- Parameter names are CASE-SENSITIVE
- ALL required parameters MUST be included
- Follow exact data types specified in schemas
- Review tool descriptions for usage context

${toolDefinitions}`);

    // 4. Reports and results (if any exist in interaction history)
    sections.push(this.buildReportSection(currentInteractionHistory, finalToolName));

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
    sections.push(this.buildUserRequestSection(userPrompt, finalToolName));

    return sections.join('\n\n');
  }

  buildReportSection(interactionHistory: Interaction[], finalToolName: string): string {
    const toolCallReports = interactionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];

    if (toolCallReports.length === 0) {
      return `# REPORTS AND RESULTS
📋 **No reports available yet.**
🚨 **MANDATORY**: ALWAYS call the 'report' tool alongside every other tool execution
📝 **Report Format**: "The user wants [request]. I have already done [action1], [action2], [action3]..."`;
    }

    let formattedSection = `# REPORTS AND RESULTS

This section records the internal progress of fulfilling the user's request. Each time you call a tool, the system's response is captured and accumulated here. Use the collected results to decide which tool to call next.

This section is not visible to the user.

Tool outputs are stored here silently as internal context.

Once all necessary data has been gathered and processed, you must call the '${finalToolName}' tool to display the result to the user.

Do not expose intermediate data directly—only show the final output via the appropriate tool.


🚨 **MANDATORY**: ALWAYS call the 'report' tool alongside every other tool execution
📝 **Report Format**: "The user wants [request]. I have already done [action1], [action2], [action3]..."
📊 **IMPORTANT**: Only use data from here if it's relevant to the CURRENT user request below!
⚠️ **WARNING**: Old results may be from different requests - focus on what the current request needs!

## NOTES - Completed Reports Summary:
${toolCallReports.map((report, idx) => `${idx + 1}. ${report.report} - Status: ${report.overallSuccess ? 'SUCCESS' : 'FAILED'}`).join('\n')}

please review the notes carefully before deciding to call the next tool
`;

    toolCallReports.forEach((reportData, index) => {

      const isLast = index === toolCallReports.length - 1;

      const thinking = isLast ? `Wait, I need to analyze the JSON result above and what the user wants (review USER REQUEST). Then if I have all the necessary data for the CURRENT request, I will present to the user using ${finalToolName} tool because the user has not seen it yet, otherwise I will choose the next tool to call to fulfill the current request.**` : "";

      formattedSection += `## Report: ${reportData.report}, then i have found the following result. 
   **overall success**: ${reportData.overallSuccess}
   **error**: ${reportData.error || 'No error'}
   **result**: ${JSON.stringify(reportData.toolCalls, null, 2)}
   
   ${thinking}

`;
    });

    formattedSection += `💡 **Use this information to decide your next action for the CURRENT request. Re-execute tools if needed for new requests.`;

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

  buildUserRequestSection(userPrompt: string, finalToolName: string): string {
    return `# USER REQUEST
🎯 **Current request:** "${userPrompt}"

📋 **Decision process:**
1. Check if REPORTS has needed data for current request
2. If complete: Use '${finalToolName}' tool to present results
3. If partial: Continue with remaining steps + 'report'
4. If no data: Execute needed tools + 'report'
5. If lacking tools: Use '${finalToolName}' to explain limitations

⚡ **Focus**: What does THIS request need that hasn't been done?`;
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