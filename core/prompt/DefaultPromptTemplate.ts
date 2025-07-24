import { Interaction, PromptOptions, ToolCallReport } from '../types/types';
import { AgentError } from '../utils/AgentError';

export enum FormatType {
  FUNCTION_CALLING = 'function_calling',
  YAML = 'yaml'
}

export class DefaultPromptTemplate {
  private responseFormat: FormatType;

  constructor(responseFormat: FormatType = FormatType.FUNCTION_CALLING) {
    this.responseFormat = responseFormat;
  }

  setResponseFormat(format: FormatType): void {
    this.responseFormat = format;
  }

  getResponseFormat(): FormatType {
    return this.responseFormat;
  }

  /**
   * (CORRECTED) Defines the 'report' tool as an internal-only monologue.
   */
  private getWorkflowRules(finalToolName: string): string {
    return `
## 🧠 CORE INSTRUCTIONS & THINKING PROCESS

### CORE MISSION
Your primary objective is to successfully fulfill the user's request by intelligently using the available tools. You must operate in a loop of thinking, acting, and observing until the request is complete.

### The Internal Monologue (Using the 'report' tool)
- Think of the \`report\` tool as your private internal monologue or a lab notebook. **It is NOT seen by the user.**
- Its sole purpose is to document your reasoning for the tools you are calling *in this specific turn*.
- Be direct and technical in your report. Example: "My reasoning: The user requested a file list. I am now calling \`list_directory\` on path \`.\` to get the data."

### STEP-BY-STEP THINKING PROCESS
1.  **ANALYZE THE REQUEST**: What is the user's ultimate goal?
2.  **REVIEW YOUR INTERNAL LOG**: Examine the "REPORTS AND RESULTS" section to see what you've already done.
3.  **FORM A PLAN FOR THE NEXT STEP**:
    *   **CRITICAL SANITY CHECK**: Is the action you're planning already completed in your log? If yes, **DO NOT REPEAT IT**. Move to the next logical step.
    *   **If all steps are complete**: The task is done. Your plan is to use the \`${finalToolName}\` tool to give the final answer to the user.
    *   **If steps remain**: Your plan is to use the correct tool to perform the *next uncompleted step*.

### 🚨 CRITICAL RULES for '${finalToolName}' (User-Facing Response)
- This is your ONLY tool for communicating with the user.
- Use it ONLY when the task is 100% complete or you are irrecoverably stuck.
- **NEVER** combine it with any other tools in the same response.
`;
  }

  private getExecutionStrategy(parallelExecution: boolean): string {
    const mode = parallelExecution ? 'Parallel' : 'Sequential';
    const execution = parallelExecution
      ? 'Tools can be executed concurrently.'
      : 'Tools are executed in a specific order.';
    return `### EXECUTION MODE\n*   **Mode**: ${mode} (${execution})`;
  }

  private getFunctionCallingFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `# 🚨 CRITICAL: YOU MUST RESPOND WITH JSON CODE BLOCKS ONLY 🚨
${this.getWorkflowRules(finalToolName)}
${this.getExecutionStrategy(parallelExecution)}
## ⚠️ MANDATORY: NO PLAIN TEXT - ONLY JSON CODE BLOCKS ⚠️
You MUST NOT respond with plain text. EVERY response MUST be a JSON code block.
## 🚨 OUTPUT FORMAT REQUIREMENTS
**Tool Execution** (Internal reasoning + action):
\`\`\`json
{
  "functionCalls": [
    {"name": "your_tool", "arguments": "{\\"param\\": \\"value\\"}"},
    {"name": "report", "arguments": "{\\"report\\": \\"My reasoning: The user wants to [goal]. I am now calling [tool_name] to achieve this.\\"}"}
  ]
}
\`\`\`
**Task Completion** (Final response to user):
\`\`\`json
{
  "functionCall": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"Here is the complete answer for the user...\\"}"
  }
}
\`\`\`
`;
  }

  private getYamlFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `#  RESPONSE FORMAT: YAML CODE BLOCKS ONLY
${this.getWorkflowRules(finalToolName)}
${this.getExecutionStrategy(parallelExecution)}
## Output Requirements
- ❌ NO plain text responses.
- ✅ YAML code blocks only.
## YAML Format Patterns
**Tool Execution** (Internal reasoning + action):
\`\`\`yaml
tool_calls:
  - name: tool_name
    args:
      param: |
        value
  - name: report
    args:
      report: |
        My reasoning: The user wants to [goal]. I am now calling [tool_name] to achieve this.
\`\`\`
**Task Completion** (Final response to user):
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      value: |
        Here is the complete answer for the user...
\`\`\`
`;
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
    sections.push(systemPrompt);
    sections.push(`${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}`);
    sections.push(`# 🛠️ AVAILABLE TOOLS\n**You must adhere to the following schema requirements:**\n- Parameter names are **CASE-SENSITIVE**.\n- You **MUST** include all required parameters.\n- You **MUST** follow the exact data types specified.\n\n${toolDefinitions}`);
    sections.push(this.buildReportSection(currentInteractionHistory, finalToolName));
    if (options.includeContext) sections.push(this.buildContextSection(context, options));
    if (options.includePreviousTaskHistory && prevInteractionHistory.length > 0) sections.push(this.buildPreviousTaskHistory(prevInteractionHistory, options));
    if (lastError) sections.push(this.buildErrorRecoverySection(finalToolName, lastError, keepRetry, errorRecoveryInstructions));
    if (options.customSections) Object.entries(options.customSections).forEach(([name, content]) => sections.push(`# ${name.toUpperCase()}\n${content}`));
    sections.push(this.buildUserRequestSection(userPrompt, finalToolName));
    return sections.join('\n\n---\n\n');
  }

  /**
   * (CORRECTED) Frames the report section as an internal-only log.
   */
  buildReportSection(interactionHistory: Interaction[], finalToolName: string): string {
    const toolCallReports = interactionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];

    if (toolCallReports.length === 0) {
      return `# 📊 REPORTS AND RESULTS (Your Internal Log)
**Your action history is empty. The user does not see this section.** Your first step is to call the appropriate tool(s) to begin working on the user's request.`;
    }

    const reportEntries = toolCallReports.map((report, idx) => `
### PAST ACTION ${idx + 1}
*   **My Internal Monologue**: ${report.report}
*   **Outcome**: ${report.overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}
*   **Tool Calls & Results**:
    \`\`\`json
    ${JSON.stringify(report.toolCalls, null, 2)}
    \`\`\`
*   **Error (if any)**: ${report.error || 'None'}`).join('\n');

    return `# 📊 REPORTS AND RESULTS (Your Internal Log)
**This section is your internal-only memory and thought process. The user does not see this.** It contains the history of your past actions and their results.

${reportEntries}

---
**ACTION ANALYSIS & NEXT STEP**
1.  **Review the log above**: What was the result of the last successful action?
2.  **Determine the next logical step**: Based on that result and the user's goal, what is the *single next action* needed?
3.  **AVOID REPETITION**: Do not repeat a step if its result is already in the log.
4.  **Decide**: If more steps are needed, call the next tool + \`report\`. If all work is done, use \`${finalToolName}\` to talk to the user.`;
  }

  buildContextSection(context: Record<string, any>, options: PromptOptions): string {
    if (Object.keys(context).length === 0) return `# 📎 CONTEXT\nNo additional context has been provided.`;
    const contextEntries = Object.entries(context).map(([key, value]) => `### ${key}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``).join('\n\n');
    return `# 📎 CONTEXT\nThis is supplemental data provided for the task.\n\n${contextEntries}`;
  }

  buildPreviousTaskHistory(prevInteractionHistory: Interaction[], options: PromptOptions): string {
    const entries = options.maxPreviousTaskEntries ? prevInteractionHistory.slice(-options.maxPreviousTaskEntries) : prevInteractionHistory;
    const limitNote = options.maxPreviousTaskEntries ? ` (showing the last ${entries.length} interactions)` : '';
    return `# 📜 PREVIOUS TASK HISTORY\n🛑 **CRITICAL**: This is reference info from past, unrelated tasks${limitNote}. **DO NOT** act on this unless the current request explicitly refers to it.`;
  }

  buildUserRequestSection(userPrompt: string, finalToolName: string): string {
    return `# 🎯 CURRENT TASK & USER REQUEST
Your goal is to address the following request:

> "${userPrompt}"

Now, begin your thinking process.`;
  }

  buildErrorRecoverySection(
    finalToolName: string,
    error: AgentError | null,
    keepRetry: boolean,
    errorRecoveryInstructions?: string
  ): string {
    if (!error) return '';
    const defaultRetryInstructions = `**Recovery Plan:**\n1.  **Analyze the Error**: Why did the last tool call fail?\n2.  **Review Your Plan**: Was there a mistake in the tool name, parameters, or logic?\n3.  **Correct and Retry**: Formulate a new tool call that corrects the mistake.`;
    const maxRetryMessage = `🛑 **MAXIMUM RETRIES EXCEEDED**\nYou have failed multiple times. Do not try the same action again. You **MUST** use the \`${finalToolName}\` tool now to explain what went wrong.`;
    const recoveryInstruction = keepRetry ? (errorRecoveryInstructions || defaultRetryInstructions) : maxRetryMessage;
    const errorType = error.type ? ` (Type: ${error.type})` : '';
    return `# ⚠️ ERROR & RECOVERY\nAn error occurred. You must recover.\n\n**Error Message${errorType}**: ${error.message}\n\n${recoveryInstruction}`;
  }
}