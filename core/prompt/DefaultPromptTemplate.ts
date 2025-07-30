import { PromptOptions, ToolCallReport, BuildPromptParams, ConversationEntry, FormatMode } from '../types/types';
import { AgentError } from '../utils/AgentError';

export class DefaultPromptTemplate {
  private responseFormat: FormatMode;

  constructor(responseFormat: FormatMode = FormatMode.FUNCTION_CALLING) {
    this.responseFormat = responseFormat;
  }

  setResponseFormat(format: FormatMode): void {
    this.responseFormat = format;
  }

  getResponseFormat(): FormatMode {
    return this.responseFormat;
  }

  // 1. CORE DIRECTIVE: The absolute mission, stated immediately.
  private buildCoreDirectiveSection(finalToolName: string, reportToolName: string): string {
    return `# 🚨 CORE DIRECTIVE & MISSION

## YOUR PRIMARY OBJECTIVE
Your SOLE purpose is to answer the user's request by following a strict process.

### PHASE 1: DATA GATHERING
- Use available tools to collect ALL information needed to answer the request. 
- The gathered data will be stored in your private log, **Report and Results** section.
- You MUST use the \`${reportToolName}\` tool with EVERY tool call in this phase.

### PHASE 2: FINAL RESPONSE
- Once ALL data is gathered, use the \`${finalToolName}\` tool to present the complete, final answer.
- You MUST also include the \`${reportToolName}\` tool with this final call.

---

## General Workflow Overview

Follow this logic for every turn:
1. Read the user prompt, understand the user intent, use last conversation history
2.  **OBEY IMMEDIATE TASK**: If a 'nextTasks' command exists in '🎯 YOUR IMMEDIATE TASK', execute it immediately. This is your only priority.

3.  **IF NO COMMAND, DECIDE**:
    *   **Check Data**: Review 📊 REPORTS and RESULTS.
    *   **If data is missing**: Call the single best tool to gather it + ${reportToolName}.
    *   **If data is complete**: Call ${finalToolName} to present the final answer + ${reportToolName}.

## 📜 RULES OF ENGAGEMENT (NON-NEGOTIABLE)

* **ALWAYS** use ${reportToolName} with every tool call - NEVER call ${reportToolName} alone.
* **ONLY** use tools from **AVAILABLE TOOLS**.
* **ONLY** use data from **REPORTS and RESULTS** — no guessing.
* **NEVER** reply in plain text, follow **RESPONSE FORMAT**.
* **NEVER** use ${finalToolName} to state data — use it to show data.
* **NEVER** end without calling ${finalToolName}.
* **CRITICAL**: ${reportToolName} must ALWAYS accompany another action tool. If you only need to report, use ${finalToolName} + ${reportToolName} instead.
* **INVALID**: Calling only ${reportToolName} without another tool is strictly forbidden.
`;
  }

  // 2. RESPONSE FORMAT: How the model MUST structure its output.
  private buildResponseFormatSection(reportToolName: string, finalToolName: string): string {
    if (this.responseFormat === FormatMode.YAML) {
      return `# 📋 RESPONSE FORMAT: YAML CODE BLOCK ONLY

## YAML OUTPUT REQUIREMENTS
- Your entire response MUST be a single **valid** YAML code block.
- NO text before or after the \`\`\`yaml block.
- Indent with 2 spaces. No tab indentation
- use '|' for multiline
- escape special characters

### Format 1: Data Gathering (Action Tool + Report Tool)
\`\`\`yaml
tool_calls:
  - name: [action_tool_name]  # MUST be a data-gathering tool, NOT ${reportToolName}
    args:
      [param1]: [value1]
  - name: ${reportToolName}   # ALWAYS accompanies the action tool above
    args:
      report: "My Goal: [goal]. My Plan: [tool choice + reason]. Expected: [outcome]."
      nextTasks: |
        1. [Next concrete step].
        2. [Following step]. 
        3. Use ${finalToolName} to present [final deliverable]."
\`\`\`

### Format 2: Final Answer (Final Tool + Report Tool)
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}   # Present the final answer
    args:
      [check tool schema for required parameters]
  - name: ${reportToolName}  # ALWAYS accompanies the final tool
    args:
      report: "Task complete. Presenting final answer."
      nextTasks: "Task is complete."
\`\`\`

### ❌ INVALID FORMAT - NEVER DO THIS:
\`\`\`yaml
tool_calls:
  - name: ${reportToolName}  # ❌ FORBIDDEN: ${reportToolName} alone
    args:
      report: "..."
\`\`\`
`;
    }

    // Default to Function Calling JSON
    return `# 📋 RESPONSE FORMAT: JSON CODE BLOCK ONLY

## JSON OUTPUT REQUIREMENTS
- Your entire response MUST be a single JSON code block.
- NO text before or after the \`\`\`json block.
- You should escape escape characters
- Arguments MUST be a stringified JSON. Double-escape quotes (\`\\"\`).

### Format 1: Data Gathering (Action Tool + Report Tool)
\`\`\`json
{
  "functionCalls": [
    { "name": "[action_tool_name]", "arguments": "{\\"param1\\": \\"value1\\"}" },
    { "name": "${reportToolName}", "arguments": "{\\"report\\": \\"My Goal: [goal]. My Plan: [tool choice + reason]. Expected: [outcome].\\", \\"nextTasks\\": \\"1. [Next concrete step]. 2. [Following step]. 3. Use ${finalToolName} to present [final deliverable].\\"}" }
  ]
}
\`\`\`

### Format 2: Final Answer (Final Tool + Report Tool)
\`\`\`json
{
  "functionCalls": [
    { "name": "${finalToolName}", "arguments": "[check tool schema for required parameters as stringified JSON]" },
    { "name": "${reportToolName}", "arguments": "{\\"report\\": \\"Task complete. Presenting final answer.\\", \\"nextTasks\\": \\"Task is complete.\\"}" }
  ]
}
\`\`\`

### ❌ INVALID FORMAT - NEVER DO THIS:
\`\`\`json
{
  "functionCalls": [
    { "name": "${reportToolName}", "arguments": "{\\"report\\": \\"....\\"}" }
  ]
}
\`\`\`
`;
  }

  // 3. AVAILABLE TOOLS: The model's capabilities.
  private buildToolsSection(toolDefinitions: string): string {
    return `# 🛠️ AVAILABLE TOOLS

## TOOL USAGE RULES
- Tool and parameter names are CASE-SENSITIVE. Match them exactly.
- Provide ALL required parameters.
- Data types MUST match the schema (string, number, etc.).
- DO NOT use tools that are not on this list.

${toolDefinitions}`;
  }

  // 4. CONVERSATION HISTORY: Fixed to be properly read by the AI
  private buildConversationHistorySection(conversationEntries: ConversationEntry[], limitNote: string): string {
    if (conversationEntries.length === 0) return '';
    
    const formattedEntries = conversationEntries.map((entry, idx) => {
        let content = `## Turn ${idx + 1}`;
        if (entry.user) content += `\n**User**: ${entry.user}`;
        if (entry.ai) {
            // Include actual AI response if available, not just "(Responded with tool calls)"
            content += `\n**Assistant**: ${entry.ai}`;
        }
        return content;
    }).join('\n\n');

    return `# 💬 CONVERSATION HISTORY
**Use this information** to understand the conversation context and maintain continuity.
${limitNote}

${formattedEntries}`;
  }

  // 5. STATE & HISTORY: The model's "memory", most recent first.
  private buildReportsAndResultsSection(toolCallReports: ToolCallReport[]): string {
    if (toolCallReports.length === 0) {
      return `# 📊 REPORTS and RESULTS (Your Internal Monologue)
**Status**: No actions taken yet. You have no data. Your first step MUST be to gather data using an action tool + report tool combination.`;
    }

    const reportEntries = toolCallReports.map((report, idx) => {
      const toolSummary = report.toolCalls.map(tc => `  - ${tc.context.toolName}: ${tc.context.success ? '✅ SUCCESS' : '❌ FAILED'}`).join('\n');
      return `### Action #${idx + 1}
**Reasoning**: ${report.report || 'N/A'}
**Tools Used**:
${toolSummary}
**Results**:
\`\`\`json
${JSON.stringify(report.toolCalls.map(tc => ({ name: tc.context.toolName, success: tc.context.success, context: tc.context })), null, 2)}
\`\`\``;
    }).join('\n');

    return `# 📊 REPORTS & RESULTS (YOUR MEMORY)

## DATA SOURCE HIERARCHY
1. **TRUST THIS SECTION**: This is your SINGLE SOURCE OF TRUTH for data.
2. **Latest Data**: This section contains latest updated data.

## ACTION LOG
${reportEntries}`;
  }

  // 6. ERROR RECOVERY: Specific instructions for when things go wrong.
  private buildErrorRecoverySection(finalToolName: string, reportToolName: string, error: AgentError | null): string {
    if (!error) return '';

    return `# 🆘 ERROR DETECTED: RECOVERY PROTOCOL

## ERROR DETAILS
- **Type**: ${error.type || 'Unknown'}
- **Message**: ${error.message}

## RECOVERY INSTRUCTIONS
1.  **Analyze**: Read the error message. Why did it happen? (e.g., wrong parameter, missing data, calling ${reportToolName} alone).
2.  **Re-plan**: Formulate a new plan to fix the error. DO NOT repeat the same action.
3.  **Execute**: Call the correct action tool + ${reportToolName} combination with corrected parameters.
4.  **Report**: In your \`${reportToolName}\` call, explain what you have already done and its result. Then plan your next task
    - **Example Report**: "My Goal: [original goal]. I have done this [task] but failed due to [error cause]. My new plan is to [new action] to fix it. Expected: [new outcome]."

## COMMON ERROR FIXES
- **If you called ${reportToolName} alone**: You must call an action tool + ${reportToolName} together.
- **If you need to just report status**: Use ${finalToolName} + ${reportToolName} instead of ${reportToolName} alone.`;
  }

  // 7. THE TASK: The final, immediate command.
  private buildTaskSection(userPrompt: string, finalToolName: string, reportToolName: string, nextTasks?: string | null): string {
    if (nextTasks) {
      return `# 🎯 YOUR IMMEDIATE TASK

## CONTEXT
You are in the middle of executing a plan. You previously decided on the following action.

## ⚡ YOUR COMMAND
> **${nextTasks}**

## INSTRUCTIONS
- **DO NOT RE-EVALUATE**. Execute this command immediately.
- This is your plan. Follow it.
- Your next response must be a tool call to perform this task.
- **REMEMBER**: Always use action tool + ${reportToolName} together, never ${reportToolName} alone.`;
    }

    return `# 🎯 YOUR IMMEDIATE TASK

## USER REQUEST
> **${userPrompt}**

## EXECUTION REMINDER
- If you need to gather data: Use [action_tool] + ${reportToolName}
- If you're ready to answer: Use ${finalToolName} + ${reportToolName}
- **NEVER** use ${reportToolName} by itself`;
  }

  // This is a helper not directly used in the final prompt string but good for organization.
  private buildCustomSectionsContent(customSections: Record<string, string>): string {
    return Object.entries(customSections).map(([name, content]) =>
      `# ${name.toUpperCase()}\n${content}`
    ).join('\n\n---\n\n');
  }

  // Main build method with optimized order and structure.
  buildPrompt(params: BuildPromptParams): string {
    const {
      systemPrompt,
      userPrompt,
      currentInteractionHistory,
      prevInteractionHistory,
      lastError,
      finalToolName,
      reportToolName,
      toolDefinitions,
      options,
      nextTasks,
      conversationEntries,
      conversationLimitNote,
      // `context`, `keepRetry`, `errorRecoveryInstructions` are simplified/handled within sections
    } = params;
    const sections: string[] = [];

    // --- PROMPT STRUCTURE ---
    // The order is critical for guiding the model's focus.

    // 1. System Prompt & Core Mission: Who you are and your fundamental objective.
    sections.push(systemPrompt);
    sections.push(this.buildCoreDirectiveSection(finalToolName, reportToolName));

    // 2. Response Format: The syntax you MUST use for every response.
    sections.push(this.buildResponseFormatSection(reportToolName, finalToolName));

    // 3. Tools: Your available capabilities.
    sections.push(this.buildToolsSection(toolDefinitions));

    // 4. CONVERSATION HISTORY MOVED BEFORE REPORTS for better context awareness
    if (options.includePreviousTaskHistory && conversationEntries && conversationEntries.length > 0) {
        sections.push(this.buildConversationHistorySection(conversationEntries, conversationLimitNote || ''));
    }

    // 5. State & History: Your memory of what has been done.
    const toolCallReports = currentInteractionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    sections.push(this.buildReportsAndResultsSection(toolCallReports));

    // 6. Error Handling (if applicable): A special state that overrides the normal flow.
    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, reportToolName, lastError));
    }
    
    // 7. Custom Sections (if any)
    if (options.customSections) {
        sections.push(this.buildCustomSectionsContent(options.customSections));
    }

    // 8. The Final Command: The specific, immediate action to take.
    sections.push(this.buildTaskSection(userPrompt, finalToolName, reportToolName, nextTasks));

    return sections.join('\n\n---\n\n');
  }
}