import { PromptOptions, ToolCallReport, BuildPromptParams, ConversationEntry, FormatMode } from '../types/types';
import { AgentError } from '../utils/AgentError';

export class DefaultPromptTemplate {
  constructor() {
    // Only supports LiteralJS format
  }

  getResponseFormat(): FormatMode {
    return FormatMode.LITERALJS;
  }

  // Core directive section: defines the agent's mission and workflow
  private buildCoreDirectiveSection(finalToolName: string, reportToolName: string): string {
    return `# CORE DIRECTIVE

## MISSION
You are an agent designed to complete user requests through a structured process.

## PHASE 1: DATA GATHERING
- Use appropriate tools to collect ALL necessary information
- Track all data in the Reports and Results section
- ALWAYS pair each tool call with the \`${reportToolName}\` tool

## PHASE 2: FINAL RESPONSE

* After collecting all necessary data, deliver the comprehensive answer using '${finalToolName}'.
* **CRITICAL**: ${finalToolName} must contain the ACTUAL DATA/RESULTS for the user - not just "task complete"
* Always include the '${reportToolName}' tool alongside '${finalToolName}' both must be called together.


## WORKFLOW
1. Read and understand user request and conversation history
2. IF 'nextTasks' section exists: Execute it immediately
3. IF 'nextTasks' section does not section exist:
   - Review collected data in Reports and Results
   - IF data incomplete: Call best tool + ${reportToolName}
   - IF data complete: Call ${finalToolName} (with actual results) + ${reportToolName}

## STRICT RULES
- ALWAYS pair every tool call with ${reportToolName}
- For any input that isn't a direct command (e.g., greetings, questions, confirmations), respond using the '${finalToolName}' tool and pair it with '${reportToolName}' tool.
- ONLY use tools listed in Available Tools section
- ONLY use data from Reports and Results - no guessing
- NEVER respond with plain text
- NEVER use ${finalToolName} until ready with complete answer
- NEVER end interaction without calling ${finalToolName}
- **${finalToolName} MUST present actual data/results to user - not just "task complete"**
- NEVER call ${reportToolName} alone - it must accompany another tool`;
  }

  // Response format section: defines exactly how the agent must structure outputs  
  private buildResponseFormatSection(reportToolName: string, finalToolName: string): string {
    return `# RESPONSE FORMAT: LITERALJS

**ONLY OUTPUT THE CODE BLOCK - NO OTHER TEXT!**

## Structure
1. **Import**: \`import { LiteralLoader } from './utils';\`
2. **Function**: \`function callTools() { return [...] }\`  
3. **Literals**: \`<literals><literal id="...">...</literal></literals>\` (if needed)

**DO NOT include any explanatory text outside the code block!**

## ⚠️  SCHEMA VALIDATION WARNING
Your tool calls will be validated against schemas. Failures cause errors like:
- "Missing required parameter 'path'"
- "Invalid parameter name 'filepath' (expected 'path')"
- "Wrong data type: expected string, got number"

**ALWAYS double-check tool schemas before responding!**

## CRITICAL RULES

🚨 **NEVER CALL \`${reportToolName}\` ALONE**: Always pair with another tool!

- **PAIRING REQUIREMENT**: \`${reportToolName}\` MUST be called with another tool - never by itself
- **EXACT SCHEMA MATCH**: Use EXACT parameter names from tool schemas - case-sensitive!
- **ALL REQUIRED PARAMS**: Include ALL required parameters - check tool definitions carefully
- **CORRECT DATA TYPES**: String parameters must be strings, numbers must be numbers, etc.
- **Long content** (multiline): Use \`LiteralLoader("id")\` + \`<literal>\` blocks

## VALID PAIRING PATTERNS
✅ **Action + Report**: \`action_tool\` + \`${reportToolName}\`
✅ **Multiple Actions + Report**: \`tool1\` + \`tool2\` + \`${reportToolName}\`
✅ **Final + Report**: \`${finalToolName}\` + \`${reportToolName}\`
❌ **NEVER**: \`${reportToolName}\` alone

**MINIMUM**: AT LEAST 2 tools (1+ action tools + \`${reportToolName}\`)

## Template
\`\`\`javascript
import { LiteralLoader } from './utils';

function callTools() {
  const calledToolsList = [];
  
  // STEP 1: Call action tool with EXACT schema parameters
  calledToolsList.push({
    toolName: "action_tool_name", // EXACT tool name from schema
    parameterName: "value", // EXACT parameter name from schema
    requiredParam: "must_include_all_required", // Include ALL required params
    optionalParam: "can_include_optional" // Optional params as needed
  });
  
  // STEP 2: ALWAYS call report tool 
  calledToolsList.push({
    toolName: "${reportToolName}",
    goal: "specific user objective",
    report: "what action was taken and expected outcome",
    nextTasks: "next concrete steps or 'Task is complete'"
  });
  
  return calledToolsList;
}
\`\`\`

\`\`\`xml
<literals>
<literal id="exampleid">
Long content here without escaping
</literal>
</literals>
\`\`\``;
  }

  // Tools section: defines the agent's available capabilities
  private buildToolsSection(toolDefinitions: string): string {
    return `# AVAILABLE TOOLS

## USAGE RULES
- Tool and parameter names are CASE-SENSITIVE
- Provide ALL required parameters
- Match exact data types (string, number, boolean, etc.)
- ONLY use tools listed below

${toolDefinitions}`;
  }

  // Conversation history section: provides context from previous interactions
  private buildConversationHistorySection(conversationEntries: ConversationEntry[], limitNote: string): string {
    if (conversationEntries.length === 0) return '';

    const formattedEntries = conversationEntries.map((entry, idx) => {
      let content = `## Turn ${idx + 1}`;
      if (entry.user) content += `\n**User**: ${entry.user}`;
      if (entry.ai) content += `\n**Assistant**: ${entry.ai}`;
      return content;
    }).join('\n\n');

    return `# CONVERSATION HISTORY  
${limitNote}
${formattedEntries}

 **
 Note: Use this section to maintain the flow and continuity of the conversation.
 **
`;
  }

  // Reports and results section: the agent's "memory" of previous actions
  private buildReportsAndResultsSection(toolCallReports: ToolCallReport[], reportToolName: string): string {
    if (toolCallReports.length === 0) {
      return `# REPORTS AND RESULTS

**Status**: No data collected yet. First step: gather data using action tool + ${reportToolName}.`;
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
        context: tc.context
      })), null, 2)}
\`\`\``;
    }).join('\n\n');

    return `# REPORTS AND RESULTS

## IMPORTANT
- This section stores your PRIVATE INTERNAL MONOLOGUE
- This is your SINGLE SOURCE OF TRUTH for all data
- Use ONLY this data for your responses
- This is NOT visible to the user - it's your private memory

## ACTION LOG
${reportEntries}`;
  }

  // Error recovery section: instructions for handling errors
  private buildErrorRecoverySection(finalToolName: string, reportToolName: string, error: AgentError | null): string {
    if (!error) return '';

    return `# ERROR RECOVERY

## ERROR DETAILS
- **Type**: ${error.type || 'Unknown'}
- **Message**: ${error.message}

## RECOVERY STEPS
1. Analyze the error cause
2. Create a new plan that avoids repeating the error
3. Execute corrected action + ${reportToolName}
4. Explain in your report:
   - What you attempted
   - Why it failed
   - Your new approach

## COMMON FIXES
- If you called ${reportToolName} alone: ALWAYS pair with an action tool
- If you need to just report: Use ${finalToolName} + ${reportToolName}
- If parameter error: Check exact parameter names and data types
- If missing data: Gather required information first`;
  }

  // Task section: defines the immediate action for the agent
  private buildTaskSection(userPrompt: string, finalToolName: string, reportToolName: string, nextTasks?: string | null): string {
    if (nextTasks) {
      return `# IMMEDIATE TASK

## COMMAND
> ${nextTasks}

## INSTRUCTIONS
- Execute this command immediately without re-evaluation
- This is your previously determined plan
- REMEMBER: Always pair tools with ${reportToolName}`;
    }

    return `# IMMEDIATE TASK

## USER REQUEST
> ${userPrompt}

## Reminder
1. Understand user request, refer Conversation History
2. If data needed: Use [action_tool] + ${reportToolName}
3. If data complete: Use ${finalToolName} + ${reportToolName}
note:  NEVER use ${reportToolName} alone`;
  }

  // Helper for building custom sections
  private buildCustomSectionsContent(customSections: Record<string, string>): string {
    return Object.entries(customSections).map(([name, content]) =>
      `# ${name.toUpperCase()}\n${content}`
    ).join('\n\n');
  }

  // Main method to build the complete prompt
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

    // Add system prompt if provided
    if (systemPrompt) {
      sections.push(systemPrompt);
    }

    // Add core sections in logical order
    sections.push(this.buildCoreDirectiveSection(finalToolName, reportToolName));
    sections.push(this.buildResponseFormatSection(reportToolName, finalToolName));
    sections.push(this.buildToolsSection(toolDefinitions));

    // Add conversation history if enabled and available
    if (options.includePreviousTaskHistory && conversationEntries && conversationEntries.length > 0) {
      sections.push(this.buildConversationHistorySection(conversationEntries, conversationLimitNote || ''));
    }

    // Add reports and results from current interaction
    const toolCallReports = currentInteractionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    sections.push(this.buildReportsAndResultsSection(toolCallReports, reportToolName));

    // Add error recovery if an error occurred
    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, reportToolName, lastError));
    }

    // Add custom sections if provided
    if (options.customSections) {
      sections.push(this.buildCustomSectionsContent(options.customSections));
    }

    // Add immediate task section
    sections.push(this.buildTaskSection(userPrompt, finalToolName, reportToolName, nextTasks));

    // Join all sections with clear separation
    return sections.join('\n\n---\n\n');
  }
}