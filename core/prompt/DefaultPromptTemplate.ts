import { PromptOptions, ToolCallReport, BuildPromptParams, ConversationEntry, FormatMode } from '../types/types';
import { AgentError, AgentErrorType } from '../utils/AgentError';

export class DefaultPromptTemplate {
  private responseFormat: FormatMode;

  constructor(responseFormat: FormatMode = FormatMode.JSOBJECT) {
    this.responseFormat = responseFormat;
  }

  setResponseFormat(format: FormatMode): void {
    this.responseFormat = format;
  }

  getResponseFormat(): FormatMode {
    return this.responseFormat;
  }

  private buildCoreDirectiveSection(finalToolName: string, selfReasoningTool: string): string {
    return `# CORE DIRECTIVE

## MISSION
Complete user requests via a structured 2-phase process.

## PHASE 1: DATA GATHERING
- Use tools to collect ALL needed info.
- Track all data in Reports and Results.
- ALWAYS pair each tool call with \`${selfReasoningTool}\`.

## PHASE 2: FINAL RESPONSE
- Deliver final answer with '${finalToolName}'.
- Always call '${finalToolName}' and '${selfReasoningTool}' together.

## WORKFLOW
1. Understand user request and history.
2. If 'nextTasks' exists: execute immediately.
3. Else:
   - If data incomplete: call best tool + ${selfReasoningTool}.
   - If data complete: call ${finalToolName} + ${selfReasoningTool}.

## STRICT RULES
- ALWAYS pair tool calls with ${selfReasoningTool}.
- For non-command inputs, respond using '${finalToolName}' + '${selfReasoningTool}'.
- Use ONLY listed tools and data from Reports and Results.
- NEVER respond with plain text.
- NEVER call ${finalToolName} until ready with complete answer.
- NEVER end interaction without calling ${finalToolName}.
- NEVER call ${selfReasoningTool} alone.`;
  }

  private buildResponseFormatSection(selfReasoningTool: string, finalToolName: string): string {
    if (this.responseFormat === FormatMode.JSOBJECT) {
      return `# RESPONSE FORMAT: JAVASCRIPT 'callTools' FUNCTION WITH LITERAL BLOCKS

Respond ONLY with a JavaScript \`callTools()\` function returning an array of tool calls.

**MANDATORY:** Start code with \`import { LiteralLoader } from './utils';\`

---

### Handling Long Data

If any string parameter is longer, multiline, complex, or requires escaping , DO NOT embed inline.
Instead:


1. Reference inside \`callTools()\` using \`LiteralLoader("unique-id")\`:

\`\`\`javascript
import { LiteralLoader } from './utils';
// Make sure to import LiteralLoader

// Never write any code outside callTools, every code must be inside callTools function
// Make sure you write valid JavaScript code
// you must use named function declaration in JavaScript with the exact name callTools with empty parameters
function callTools() {
  const calledToolsList = [];

  // Always check the given schema to write the correct tool name, parameters.
  // The value must be in validation constraints, check tool schema
  calledToolsList.push({
    toolName: "someTool",
    content: LiteralLoader("unique-id") // Always use LiteralLoader reference for all multiline strings(mandatory), do not afraid to use it, its easy
  });
  return calledToolsList;
}
\`\`\`


2. Place the long content AFTER the function in a \`<literals>\` XML block, e.g.:

\`\`\`xml
<literals>
  <literal id="unique-id">
Your long content here,
with multiple lines and special characters.
  </literal>
</literals>
\`\`\`
---

### Scenario 1: Intermediate Steps

\`\`\`javascript
import { LiteralLoader } from './utils';

function callTools() {
  const calledToolsList = [];

  calledToolsList.push({
    toolName: "some_action_tool",
    param1: "value",
    longContent: LiteralLoader("data-id")
  });

  calledToolsList.push({
    toolName: "${selfReasoningTool}",
    goal: "User's objective",
    report: "Action performed. Expected outcome.",
    nextTasks: "Next tool call..."
  });

  return calledToolsList;
}
\`\`\`

### Scenario 2: Final Answer

\`\`\`javascript
import { LiteralLoader } from './utils';


function callTools() {
  const calledToolsList = [];

  
  calledToolsList.push({
    toolName: "${finalToolName}",
    param: "short answer or " + LiteralLoader("long-answer-id")
  });

  calledToolsList.push({
    toolName: "${selfReasoningTool}",
    goal: "User's objective",
    report: "Task complete. Final answer.",
    nextTasks: "Task complete."
  });

  return calledToolsList;
}
\`\`\`

---

### Core Rules

- Response = ONLY \`callTools\` function + optional \`<literals>\` block.
- ALWAYS import \`LiteralLoader\`.
- Use valid JS syntax.
- Use \`LiteralLoader\` for long strings.
- No plain text outside \`<literals>\`.
- Use exact tool parameter names/types and validation constraints.
- No placeholders; use real values.
- \`${selfReasoningTool}\` must always accompany another tool.
- NEVER call \`${selfReasoningTool}\` alone.
- For multiline strings, you must use \`LiteralLoader\` with unique IDs.

`;
    }
    throw new AgentError(`Unsupported response format: ${this.responseFormat}`, AgentErrorType.CONFIGURATION_ERROR);
  }

  private buildToolsSection(toolDefinitions: string): string {
    return `# AVAILABLE TOOLS

**CRITICAL VALIDATION RULES:**
- Tool and parameter names are CASE-SENSITIVE.
- Provide ALL required parameters - missing required params cause TOOL FAILURE.
- Match exact data types and validation constraints shown in schema.
- Read parameter descriptions carefully for validation rules and requirements.
- Pay attention to minimum/maximum values, string lengths, and format requirements.
- Check if parameters are optional or mandatory based on schema definitions.
- ONLY use listed tools.

**IMPORTANT:** Tool execution will fail if validation constraints are not met. Always check the schema carefully before calling tools.

${toolDefinitions}`;
  }

  private buildConversationHistorySection(conversationEntries: ConversationEntry[], limitNote: string): string {
    if (!conversationEntries.length) return '';

    const entries = conversationEntries.map((e, i) => {
      let s = `## Turn ${i + 1}`;
      if (e.user) s += `\n**User**: ${e.user}`;
      if (e.ai) s += `\n**Assistant**: ${e.ai}`;
      return s;
    }).join('\n\n');

    return `# CONVERSATION HISTORY
${limitNote}
${entries}

**Note:** Maintain conversation flow and context.
`;
  }

  private buildReportsAndResultsSection(toolCallReports: ToolCallReport[], selfReasoningTool: string): string {
    if (!toolCallReports.length) {
      return `# REPORTS AND RESULTS

**Status**: No data collected yet. Begin by gathering data with action tool + ${selfReasoningTool}.`;
    }

    const reports = toolCallReports.map((report, i) => {
      const toolsUsed = report.toolCalls.map(tc =>
        `  - ${tc.context.toolName}: ${tc.context.success ? '✅ SUCCESS' : '❌ FAILED'}`
      ).join('\n');

      return `### Action #${i + 1}
**Tools Used**:
${toolsUsed}
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
- Use ONLY this data for responses.

## ACTION LOG
${reports}`;
  }

  private buildErrorRecoverySection(finalToolName: string, selfReasoningTool: string, error: AgentError | null): string {
    if (!error) return '';

    return `# ERROR RECOVERY

## ERROR DETAILS
- Type: ${error.type || 'Unknown'}
- Message: ${error.message}

## RECOVERY STEPS
1. Analyze cause
2. Create new plan avoiding error
3. Execute corrected action + ${selfReasoningTool}
4. Report what was attempted, why it failed, new approach

## COMMON FIXES
- Never call ${selfReasoningTool} alone.
- Use ${finalToolName} + ${selfReasoningTool} to just report.
- Check exact parameter names/types if parameter error.
- Gather missing data first.`;
  }

  private buildTaskSection(userPrompt: string, finalToolName: string, selfReasoningTool: string, nextTasks?: string | null, goal?: string | null, report?: string | null): string {

    const goalSection = goal ? `\n\n## GOAL\n> ${goal}` : '';
    const userRequestSection = `## USER REQUEST> ${userPrompt}\n\n`
    const reportSection = report ? `In previously turn you said \`${report}\`, filter out task which is already done, now execute task which is not done previously from the following tasks: ` : '';

    if (nextTasks) {
      let taskSection = `
${goalSection}

${userRequestSection}
      
# IMMEDIATE TASK
> ${reportSection}${nextTasks}`;



      taskSection += `

## INSTRUCTIONS
- Execute immediately without re-evaluation.
- REMEMBER: Always pair tools with ${selfReasoningTool}.`;

      return taskSection;
    }

    return `# IMMEDIATE TASK

${userRequestSection}

## REMINDER
1. Understand request and conversation history.
2. If data needed: Use [action_tool] + ${selfReasoningTool}.
3. If data complete: Use ${finalToolName} + ${selfReasoningTool}.
Note: NEVER call ${selfReasoningTool} alone.`;
  }

  private buildCustomSectionsContent(customSections: Record<string, string>): string {
    return Object.entries(customSections)
      .map(([title, content]) => `# ${title.toUpperCase()}\n${content}`)
      .join('\n\n');
  }

  buildPrompt(params: BuildPromptParams): string {
    const {
      systemPrompt,
      userPrompt,
      currentInteractionHistory,
      lastError,
      finalToolName,
      reportToolName: selfReasoningTool,
      toolDefinitions,
      options,
      nextTasks,
      goal,
      report,
      conversationEntries,
      conversationLimitNote,
    } = params;

    const sections: string[] = [];

    if (systemPrompt) sections.push(systemPrompt);

    sections.push(this.buildCoreDirectiveSection(finalToolName, selfReasoningTool));
    sections.push(this.buildResponseFormatSection(selfReasoningTool, finalToolName));
    sections.push(this.buildToolsSection(toolDefinitions));

    if (options.includePreviousTaskHistory && conversationEntries?.length) {
      sections.push(this.buildConversationHistorySection(conversationEntries, conversationLimitNote || ''));
    }

    const reports = currentInteractionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    sections.push(this.buildReportsAndResultsSection(reports, selfReasoningTool));

    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, selfReasoningTool, lastError));
    }

    if (options.customSections) {
      sections.push(this.buildCustomSectionsContent(options.customSections));
    }

    sections.push(this.buildTaskSection(userPrompt, finalToolName, selfReasoningTool, nextTasks, goal, report));

    return sections.join('\n\n---\n\n');
  }
}
