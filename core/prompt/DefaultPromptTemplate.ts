import { PromptOptions, ToolCallReport, BuildPromptParams, ConversationEntry, FormatMode } from '../types/types';
import { AgentError } from '../utils/AgentError';

/**
 * DefaultPromptTemplate constructs a comprehensive prompt for an AI agent.
 * It enforces a structured workflow, tool usage, and response format (LiteralJS).
 */
export class DefaultPromptTemplate {
  constructor() {
    // Only LiteralJS format is supported for tool calls.
  }

  /**
   * Returns the supported response format.
   */
  getResponseFormat(): FormatMode {
    return FormatMode.LITERALJS;
  }

  /**
   * Builds the core directive section, outlining the agent's mission and workflow.
   * @param finalToolName The name of the tool used for the final response.
   * @param reportToolName The name of the tool used for reporting actions.
   */
  private buildCoreDirectiveSection(finalToolName: string, reportToolName: string): string {
    return `---
# CORE DIRECTIVE

## MISSION
You are an agent designed to fulfill user requests using a structured, multi-phase process.

## PHASES

### PHASE 1: DATA GATHERING
- **Objective**: Collect ALL necessary information using available tools.
- **Reporting**: Record all data and progress in the 'Reports and Results' section.
- **Rule**: ALWAYS pair every tool call with the \`${reportToolName}\` tool.

### PHASE 2: FINAL RESPONSE
- **Objective**: Deliver a comprehensive answer using \`${finalToolName}\`.
- **CRITICAL**: \`${finalToolName}\` MUST contain the ACTUAL DATA/RESULTS, not just a "task complete" message.
- **Rule**: ALWAYS call \`${finalToolName}\` and \`${reportToolName}\` together.

## WORKFLOW
1.  **Understand**: Analyze the user request and conversation history.
2. **Look Report and Result Section**: This helps you to understand what data is already collected and what is already done.
3. If a 'nextTasks' exists, use your tools to execute it immediately.
    **Task Complete**: Call \`${finalToolName}\` (with actual results) + \`${reportToolName}\` to finalize the task.

4. If no 'nextTasks' or 'nextTasks' not defined: Call the best action tool + \`${reportToolName}\` to full fill user request.

note: When you call action tool, you will find the data in the 'Reports and Results' section on the next iteration.

## STRICT RULES
-   **Tool Pairing**: ALWAYS pair every tool call with \`${reportToolName}\`.
-   **Non-Command Input**: For non-command inputs (greetings, questions), use \`${finalToolName}\` paired with \`${reportToolName}\`.
-   **Tool Usage**: ONLY use tools listed in 'Available Tools'.
-   **Data Source**: ONLY use data from 'Reports and Results'; do not guess.
-   **Output Format**: NEVER respond with plain text; always use tool calls.
-   **Final Tool Timing**: NEVER use \`${finalToolName}\` until the complete answer is ready.
-   **Interaction End**: NEVER end an interaction without calling \`${finalToolName}\`.
-   **Final Tool Content**: \`${finalToolName}\` MUST present actual data/results to the user.
-   **Never Put Placeholder**: Present actual data/results, instead of placeholder
-   **Report Tool Alone**: NEVER call \`${reportToolName}\` alone; it must accompany another tool.`;
  }

  /**
   * Builds the response format section, detailing how the agent must structure its outputs using LiteralJS.
   * @param reportToolName The name of the tool used for reporting actions.
   * @param finalToolName The name of the tool used for the final response.
   */
  private buildResponseFormatSection(reportToolName: string, finalToolName: string): string {
    return `---
# RESPONSE FORMAT: LITERALJS

**OUTPUT ONLY THE CODE BLOCK, NO OTHER TEXT.**

## STRUCTURE
1.  **Import**: \`import { LiteralLoader } from './utils';\`
2.  **Function**: \`function callTools() { return [...] }\`
3.  **Literals**: \`<literals><literal id="...">...</literal></literals>\` (Use for long content or to avoid manual escape characters)
note: If you use **Literals** you must return it together with javascript code block, as a separate XML block. 

## ⚠️ SCHEMA VALIDATION WARNING
Your tool calls are strictly validated against schemas. Common errors include:
-   "Missing required parameter 'paramName'"
-   "Invalid parameter name 'wrongName' (expected 'correctName')"
-   "Wrong data type: expected string, got number"

**ALWAYS double-check tool schemas before responding.**

## CRITICAL RULES

🚨 **NEVER CALL \`${reportToolName}\` ALONE**: It MUST be paired with another tool.

-   **PAIRING REQUIREMENT**: \`${reportToolName}\` MUST accompany another tool.
-   **EXACT SCHEMA MATCH**: Use EXACT parameter names (case-sensitive) from tool schemas.
-   **ALL REQUIRED PARAMS**: Include ALL required parameters as defined in tool definitions.
-   **CORRECT DATA TYPES**: Ensure parameter values match their defined types (string, number, boolean).
-   **Long Content**: Use \`LiteralLoader("id")\` with \`<literal>\` blocks for multiline content.

## VALID PAIRING PATTERNS
-   ✅ **Action + Report**: \`action_tool\` + \`${reportToolName}\`
-   ✅ **Multiple Actions + Report**: \`tool1\` + \`tool2\` + \`${reportToolName}\`
-   ✅ **Final + Report**: \`${finalToolName}\` + \`${reportToolName}\`
-   ❌ **INVALID**: \`${reportToolName}\` alone

**MINIMUM**: Your response must include AT LEAST two tool calls (one or more action tools + \`${reportToolName}\`).

## TEMPLATE
\`\`\`javascript
import { LiteralLoader } from './utils';

function callTools() {
  const calledToolsList = [];
  
  // STEP 1: Call action tool(s) with EXACT schema parameters
  calledToolsList.push({
    toolName: "action_tool_name", // EXACT tool name from Available Tools
    longContentParam: LiteralLoader("long_content_id"), // Do not forget to include literals xml block
    requiredParam: "must_include_all_required", // Include ALL required parameters
    optionalParam: "can_include_optional"      // Include optional parameters as needed
  });
  
  // STEP 2: ALWAYS call the report tool
  calledToolsList.push({
    toolName: "${reportToolName}",
    goal: "brief description of user's objective",
    report: "concise summary of action taken and expected outcome",
    nextTasks: "concrete next steps for the agent or 'Task is complete'"
  });
  
  return calledToolsList;
}
\`\`\`

\`\`\`xml
<literals>
<literal id="long_content_id">
Your long, multiline content goes here without escaping.

</literal>
</literals>
\`\`\``;
  }

  /**
   * Builds the available tools section, listing all tools the agent can use.
   * @param toolDefinitions String representation of available tool schemas.
   */
  private buildToolsSection(toolDefinitions: string): string {
    return `---
# AVAILABLE TOOLS

## USAGE RULES
-   Tool and parameter names are **CASE-SENSITIVE**.
-   Provide ALL required parameters.
-   Match exact data types (e.g., string, number, boolean).
-   ONLY use tools listed below.

${toolDefinitions}`;
  }

  /**
   * Builds the conversation history section, providing context from previous interactions.
   * @param conversationEntries An array of past conversation turns.
   * @param limitNote A note regarding conversation history limits.
   */
  private buildConversationHistorySection(conversationEntries: ConversationEntry[], limitNote: string): string {
    if (conversationEntries.length === 0) return '';

    const formattedEntries = conversationEntries.map((entry, idx) => {
      let content = `## Turn ${idx + 1}`;
      if (entry.user) content += `\n**User**: ${entry.user}`;
      if (entry.ai) content += `\n**Assistant**: ${entry.ai}`;
      return content;
    }).join('\n\n');

    return `---
# CONVERSATION HISTORY
${limitNote}
${formattedEntries}

**Note**: Use this section to maintain conversational flow and continuity.`;
  }

  /**
   * Builds the reports and results section, serving as the agent's internal memory.
   * @param toolCallReports An array of reports from previous tool calls.
   * @param reportToolName The name of the tool used for reporting actions.
   * @param finalToolName The name of the tool used for the final response.
   */
  private buildReportsAndResultsSection(toolCallReports: ToolCallReport[], reportToolName: string, finalToolName: string): string {
    if (toolCallReports.length === 0) {
      return `---
# REPORTS AND RESULTS

**Status**: No data collected yet.
**First Step**: Gather data using an action tool paired with \`${reportToolName}\`.`;
    }

    const reportEntries = toolCallReports.map((report, idx) => {
      const toolSummary = report.toolCalls.map(tc =>
        `  - ${tc.context.toolName}: ${tc.context.success ? '✅ SUCCESS' : '❌ FAILED'}`
      ).join('\n');

      return `### Action #${idx + 1}
**Tools Used**:
${toolSummary}
**Results**:
\`\`\`json
${JSON.stringify(report.toolCalls.map(tc => ({
        name: tc.context.toolName,
        success: tc.context.success,
        context: tc.context // Include full context for detailed debugging/analysis
      })), null, 2)}
\`\`\``;
    }).join('\n\n');

    return `---
# REPORTS AND RESULTS

## IMPORTANT
-   This section is your **PRIVATE INTERNAL MONOLOGUE**.
-   It is your **SINGLE SOURCE OF TRUTH** for all collected data.
-   **ONLY** use data from this section for your responses.
-   This section is **NOT visible to the user** - you must present data using tools.
-   **CRITICAL**: Simply copy and paste the actual data from the JSON results below into your tools.
-   **DO NOT** write JavaScript code to access this data - just read it and copy the content directly.

## ACTION LOG
${reportEntries}`;
  }

  /**
   * Builds the error recovery section, providing instructions for handling errors.
   * @param finalToolName The name of the tool used for the final response.
   * @param reportToolName The name of the tool used for reporting actions.
   * @param error The AgentError object if an error occurred, otherwise null.
   */
  private buildErrorRecoverySection(finalToolName: string, reportToolName: string, error: AgentError | null): string {
    if (!error) return '';

    return `---
# ERROR RECOVERY

## ERROR DETAILS
-   **Type**: ${error.type || 'Unknown'}
-   **Message**: ${error.message}

## RECOVERY STEPS
1.  **Analyze**: Determine the root cause of the error.
2.  **Plan**: Develop a new strategy to avoid repeating the error.
3.  **Execute**: Perform the corrected action + \`${reportToolName}\`.
4.  **Report**: Explain in your report:
    -   What you attempted previously.
    -   Why it failed.
    -   Your new approach.

## COMMON FIXES
-   **\`${reportToolName}\` Alone**: ALWAYS pair \`${reportToolName}\` with an action tool.
-   **Just Reporting**: Use \`${finalToolName}\` + \`${reportToolName}\` for direct reports.
-   **Parameter Errors**: Double-check exact parameter names and data types against schemas.
-   **Missing Data**: Gather all required information before proceeding.`;
  }

  /**
   * Builds the immediate task section, directing the agent's next action.
   * @param userPrompt The current user's prompt.
   * @param finalToolName The name of the tool used for the final response.
   * @param reportToolName The name of the tool used for reporting actions.
   * @param nextTasks Optional string indicating pre-determined next steps.
   */
  private buildTaskSection(userPrompt: string, finalToolName: string, reportToolName: string, nextTasks?: string | null): string {

    const nextTaskContent = nextTasks ? "" : '## Next Tasks\n> No immediate tasks defined. Focus on the user request. ';

    if (nextTasks) {
      return `---
# IMMEDIATE TASK

## nextTasks
> ${nextTasks}

## INSTRUCTIONS
-   Execute this command immediately without re-evaluation.
-   This is your previously determined plan.
-   **REMEMBER**: Always pair tools with \`${reportToolName}\`.`;
    }

    return `---
# IMMEDIATE TASK
${nextTaskContent}

## USER REQUEST
> ${userPrompt}

## REMINDER
1.  **Understand**: Fully comprehend the user request and refer to 'Conversation History'.
2.  **Gather Data**: If data is needed, use an \`[action_tool]\` + \`${reportToolName}\`.
3.  **Finalize**: If data is complete, use \`${finalToolName}\` + \`${reportToolName}\`.
    **Note**: NEVER use \`${reportToolName}\` alone.`;
  }

  /**
   * Builds content for any custom sections provided in options.
   * @param customSections A record of custom section names and their content.
   */
  private buildCustomSectionsContent(customSections: Record<string, string>): string {
    return Object.entries(customSections).map(([name, content]) =>
      `---
# ${name.toUpperCase()}
${content}`
    ).join('\n\n');
  }

  /**
   * Main method to build the complete prompt string.
   * @param params Parameters required to build the prompt.
   * @returns The complete, formatted prompt string.
   */
  buildPrompt(params: BuildPromptParams): string {
    const {
      systemPrompt,
      userPrompt,
      currentInteractionHistory,
      lastError,
      finalToolName,
      reportToolName,
      toolDefinitions,
      options,
      nextTasks,
      conversationEntries,
      conversationLimitNote,
    } = params;

    const sections: string[] = [];

    // Add optional system prompt
    if (systemPrompt) {
      sections.push(systemPrompt);
    }

    // Add core prompt sections in a logical flow
    sections.push(this.buildCoreDirectiveSection(finalToolName, reportToolName));
    sections.push(this.buildResponseFormatSection(reportToolName, finalToolName));
    sections.push(this.buildToolsSection(toolDefinitions));

    // Include conversation history if enabled and available
    if (options.includePreviousTaskHistory && conversationEntries && conversationEntries.length > 0) {
      sections.push(this.buildConversationHistorySection(conversationEntries, conversationLimitNote || ''));
    }
    // Add reports and results (agent's memory)
    const toolCallReports = currentInteractionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    sections.push(this.buildReportsAndResultsSection(toolCallReports, reportToolName, finalToolName));

    // Add error recovery instructions if an error occurred
    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, reportToolName, lastError));
    }

    // Add any custom prompt sections
    if (options.customSections) {
      sections.push(this.buildCustomSectionsContent(options.customSections));
    }

    // Add the immediate task for the agent
    sections.push(this.buildTaskSection(userPrompt, finalToolName, reportToolName, nextTasks));

    // Join all sections with a clear separator
    return sections.join('\n\n');
  }
}