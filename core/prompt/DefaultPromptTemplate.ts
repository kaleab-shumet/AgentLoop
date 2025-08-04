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
* Always include the '${reportToolName}' tool alongside '${finalToolName}' both must be called together.


## WORKFLOW
1. Read and understand user request and conversation history
2. IF 'nextTasks' section exists: Execute it immediately
3. IF 'nextTasks' section does not section exist:
   - Review collected data in Reports and Results
   - IF data incomplete: Call best tool + ${reportToolName}
   - IF data complete: Call ${finalToolName} + ${reportToolName}

## STRICT RULES
- ALWAYS pair every tool call with ${reportToolName}
- For any input that isn't a direct command (e.g., greetings, questions, confirmations), respond using the '${finalToolName}' tool and pair it with '${reportToolName}' tool.
- ONLY use tools listed in Available Tools section
- ONLY use data from Reports and Results - no guessing
- NEVER respond with plain text
- NEVER use ${finalToolName} until ready with complete answer
- NEVER end interaction without calling ${finalToolName}
- NEVER call ${reportToolName} alone - it must accompany another tool`;
  }

  // Response format section: defines exactly how the agent must structure outputs
  private buildResponseFormatSection(reportToolName: string, finalToolName: string): string {
    if (this.responseFormat === FormatMode.TOML) {
      return `# RESPONSE FORMAT: TOML ONLY

## VALID FORMATS

### FORMAT 1: Data Gathering
\`\`\`toml
[[tool_calls]]
name = "[action_tool_name]"  # Any tool except ${reportToolName}
[tool_calls.args]
param1 = "value1"

[[tool_calls]]
name = "${reportToolName}"   # Must accompany action tool
[tool_calls.args]
goal = "[user's primary intent or objective]"
report = "Action: [what u did]. Expected: [outcome]."
nextTasks = '''
1. [Next step]
2. [Following step]
3. Use ${finalToolName} to explain the [user goal] and present achievement [deliverable].
'''
\`\`\`

### FORMAT 2: Final Answer
\`\`\`toml
[[tool_calls]]
name = "${finalToolName}"
[tool_calls.args]
# required parameters here

[[tool_calls]]
name = "${reportToolName}"
[tool_calls.args]
goal = "[user's primary intent or objective]"
report = "Task complete. Presenting final answer."
nextTasks = "Task is complete."
\`\`\`

## REQUIREMENTS
- Use ONLY valid TOML syntax
- Use appropriate TOML string syntax (single quotes for simple strings, triple quotes for multiline)
- RECOMMENDED: For multiline string content with quotes, use <literal> tags to prevent system failures:
  content = '''<literal>
  no need to escape quotes here because it's inside <literal> tags
  '''
  this is a content inside triple quotes
  '''
  </literal>'''
- WARNING: Without <literal> tags, system parsing failures may occur
- CRITICAL: For complex nested structures, use array of tables syntax instead of inline tables
- NEVER respond with plain text outside TOML block`;
    }

    if (this.responseFormat === FormatMode.JSOBJECT) {
      return `# RESPONSE FORMAT: JAVASCRIPT FUNCTION ONLY

## VALID FORMATS

### FORMAT 1: Data Gathering
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  // Add action tool (any tool except ${reportToolName})
  calledToolsList.push({
    toolName: "[action_tool_name]",
    param1: "value1",
    param2: 42
  });
  
  // Always add ${reportToolName} to accompany action tool
  calledToolsList.push({
    toolName: "${reportToolName}",
    goal: \`[user's primary intent or objective]\`,
    report: \`Action: [what u did]. Expected: [outcome].\`,
    nextTasks: \`1. [Next step]. 2. [Following step]. 3. Use ${finalToolName} to explain the [user goal] and present achievement [deliverable].\`
  });
  
  return calledToolsList;
}
\`\`\`

### FORMAT 2: Final Answer
\`\`\`javascript
function callTools() {
  const calledToolsList = [];
  
  // Add final tool with required parameters
  calledToolsList.push({
    toolName: "${finalToolName}",
    // add required parameters here
  });
  
  // Always add ${reportToolName} to accompany final tool
  calledToolsList.push({
    toolName: "${reportToolName}",
    goal: \`[user's primary intent or objective]\`,
    report: \`Task complete. Presenting final answer.\`,
    nextTasks: \`Task is complete.\`
  });
  
  return calledToolsList;
}
\`\`\`

## REQUIREMENTS
- Write ONLY a JavaScript function named \`callTools\`
- Function must return an array named \`calledToolsList\`
- Each object in array must have \`toolName\` property
- Include all required properties for each tool
- Respect all type constraints (string, integer, number, array, object)
- Honor numeric constraints (minimum, exclusiveMinimum, etc.)
- For arrays, respect minItems, uniqueItems, and item types
- Use realistic, human-readable values (no placeholders)
- No external libraries or imports allowed
- Pure vanilla JavaScript only
- NEVER call ${reportToolName} alone - must accompany another tool`;
    }

    // Default to Function Calling JSON
    return `# RESPONSE FORMAT: JSON ONLY

## VALID FORMATS

### FORMAT 1: Data Gathering
\`\`\`json
{
  "functionCalls": [
    { "name": "[action_tool_name]", "arguments": "{\\"param1\\": \\"value1\\"}" },
    { "name": "${reportToolName}", "arguments": "{\\"goal\\": \\"[user's primary intent or objective]\\", \\"report\\": \\"Action: [what u did]. Expected: [outcome].\\", \\"nextTasks\\": \\"1. [Next step]. 2. [Following step]. 3. Use ${finalToolName} to explain the [user goal] and present achievement [deliverable].\\"}" }
  ]
}
\`\`\`

### FORMAT 2: Final Answer
\`\`\`json
{
  "functionCalls": [
    { "name": "${finalToolName}", "arguments": "[required_parameters_as_stringified_JSON]" },
    { "name": "${reportToolName}", "arguments": "{\\"goal\\": \\"[user's primary intent or objective]\\", \\"report\\": \\"Task complete. Presenting final answer.\\", \\"nextTasks\\": \\"Task is complete.\\"}" }
  ]
}
\`\`\`

## REQUIREMENTS
- Entire response must be a single valid JSON code block
- No text before or after JSON block
- Double-escape quotes in nested JSON strings
- Arguments must be stringified JSON
- NEVER call ${reportToolName} alone`;
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
- This is your SINGLE SOURCE OF TRUTH for all data
- Use ONLY this data for your responses

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