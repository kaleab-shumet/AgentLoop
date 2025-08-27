import { ToolCallReport, BuildPromptParams, ConversationEntry, FormatMode, PromptOptions } from '../types/types';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { BasePromptTemplate } from './BasePromptTemplate';

export class DefaultPromptTemplate implements BasePromptTemplate {
  private responseFormat: FormatMode;

  constructor(responseFormat: FormatMode = FormatMode.LITERAL_JS) {
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
- Track all data in Notes.
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
- Use ONLY listed tools and data from Notes.
- NEVER respond with plain text.
- NEVER call ${finalToolName} until ready with complete answer.
- NEVER end interaction without calling ${finalToolName}.
- NEVER call ${selfReasoningTool} alone.`;
  }

  private buildResponseFormatSection(selfReasoningTool: string, finalToolName: string): string {
    if (this.responseFormat === FormatMode.LITERAL_JS) {
      return `# RESPONSE FORMAT: JAVASCRIPT 'callTools' FUNCTION WITH TOOL SCHEMAS

Respond ONLY with a JavaScript \`callTools()\` function returning an array of tool calls.

**MANDATORY:** Start code with imports: \`import { LiteralLoader, toolCalls } from './utils';\` and \`import { toolSchemas } from './toolSchemas';\`

---

### Tool Schema Import Format

Import and use tool schemas directly:

\`\`\`javascript
import { LiteralLoader, toolCalls } from './utils';
import { toolSchemas } from './toolSchemas';

function callTools() {

  // REMINDER: Check schema constraints before parse() - otherwise SYSTEM FAILURE!
  // Parse tool schema directly - toolName included automatically
  toolCalls.push(
    toolSchemas.exampleTool.parse({
      parameter1: "valid value", // Must satisfy schema constraints
      parameter2: 42,
      longContent: LiteralLoader("unique-id")
    })
  );

  return toolCalls;
}
\`\`\`

Place long content AFTER the function in a \`<literals>\` XML block:

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
import { LiteralLoader, toolCalls } from './utils';
import { toolSchemas } from './toolSchemas';

function callTools() {

  // REMINDER: Check schema constraints before parse() - otherwise SYSTEM FAILURE!
  // I will never declare variables, always use toolSchemas directly with literalLoader for long content
  // I need to use literalLoader for long content then i will reference it in the xml block
  // If i use literalLoader, i do not need to escape quotes or special characters, it is easier for me
  toolCalls.push(
    toolSchemas.some_action_tool.parse({
      param1: "value",
      longContent: LiteralLoader("data-id")
    })
  );

  toolCalls.push(
    toolSchemas.${selfReasoningTool}.parse({
      goal: "User's objective",
      report: "Action performed. Expected outcome.",
      nextTasks: "Next tool call..."
    })
  );

  return toolCalls;
}
\`\`\`

### Scenario 2: Final Answer

\`\`\`javascript
import { LiteralLoader, toolCalls } from './utils';
import { toolSchemas } from './toolSchemas';

function callTools() {

  // REMINDER: Check schema constraints before parse() - otherwise SYSTEM FAILURE!
  toolCalls.push(
    toolSchemas.${finalToolName}.parse({
      param: LiteralLoader("long-answer-id")
    })
  );

  // Always pair with self reasoning tool, I will never forget to use ${selfReasoningTool} tool
  toolCalls.push(
    toolSchemas.${selfReasoningTool}.parse({
      goal: "User's objective",
      report: "Task complete. Final answer.",
      nextTasks: "Task complete."
    })
  );

  return toolCalls;
}
\`\`\`

---

### Core Rules

- Response = ONLY \`callTools\` function + optional \`<literals>\` block.
- ALWAYS import \`LiteralLoader\` from './utils' and \`toolSchemas\` from './toolSchemas'.
- Use tool schema format: \`toolCalls.push(toolSchemas.toolName.parse({...}))\`
- Parse and push directly - toolName automatically included from schema defaults.
- **CRITICAL**: Check validation constraints in tool schema before using parse - otherwise it leads to SYSTEM FAILURE.
- NEVER use \`.default()\` - always use \`.parse()\` with actual values.
- Use \`LiteralLoader\` for long/multiline strings in parse values.
- **FORBIDDEN**: Defining variables in the function is completely prohibited.

**TEST**
- We are evaluating your ability to:

1. Follow instructions precisely.
2. Write clean, functional code **without defining any variables**.
3. Correctly reference XML using 'LiteralLoader' in the appropriate places.
4. Strictly adhere to tool schemas and parameters, ensuring all created data passes schema validation.
5. Demonstrate reasoning skills through the use of '${selfReasoningTool}'.

- No plain text outside \`<literals>\`.
- Provide real values that satisfy the imported schema constraints.
- \`${selfReasoningTool}\` must always accompany another tool.
- NEVER call \`${selfReasoningTool}\` alone.

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

    return `# CONVERSATION HISTORY(OLD ENTRIES)
${limitNote}
${entries}

**Note:** Maintain conversation flow and context.
`;
  }

  private buildNotesSection(toolCallReports: ToolCallReport[], selfReasoningTool: string): string {
    if (!toolCallReports.length) {
      return `# NOTES(Tool Call results)

**Status**: No results yet. Your tool output will appear here once available, please call appropriate tool with ${selfReasoningTool}.`;
    }

    const reports = toolCallReports.map((report, i) => {
      const toolsUsed = report.toolCalls.map(tc =>
        `  - ${tc.context.toolName}: ${tc.context.success ? '✅ SUCCESS' : '❌ FAILED'}`
      ).join('\n');

      return `### Action #${i + 1}
**Tool Used**:
${toolsUsed}
**Tool Result**:
\`\`\`json
${JSON.stringify(report.toolCalls.map(tc => ({
        name: tc.context.toolName,
        success: tc.context.success,
        context: tc.context
      })), null, 2)}
\`\`\``;
    }).join('\n\n');

    return `# NOTES FOR CURRENT TASK

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

  private buildTaskSection(userPrompt: string, finalToolName: string, selfReasoningTool: string, nextTasks?: string | null, goal?: string | null, report?: string | null, error?: AgentError | null): string {

    const goalSection = goal ? `\n\n## GOAL\n> ${goal}` : '';
    const userRequestSection = `## USER REQUEST> ${userPrompt}\n\n`

    // If there's an error, prioritize error resolution
    if (error) {
      return `
${goalSection}

${userRequestSection}
      
# IMMEDIATE TASK
## ERROR TO RESOLVE FIRST
- **Error Type**: ${error.type}
- **Error Message**: ${error.message}

## REQUIRED ACTION
1. Analyze the error cause
2. Create a corrected approach
3. Execute the fix using appropriate tools
${nextTasks ? `4. After fixing the error, continue with: ${nextTasks}` : ''}

## INSTRUCTIONS
- Resolve the error before proceeding with other tasks
${nextTasks ? '- After error is fixed, continue with remaining tasks' : ''}
- REMEMBER: Always pair tools with ${selfReasoningTool}`;
    }

    if (nextTasks) {
      let taskSection = `
${goalSection}

${userRequestSection}
      
# IMMEDIATE TASK
${report ? `## PREVIOUS ATTEMPT
- You said: "${report}"(completed task)
- Filter out completed tasks and execute remaining tasks, do not repeat completed task.

` : ''}## TASKS TO EXECUTE
${nextTasks}`;



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

  private buildContextContent(context: Record<string, string>): string {
    return Object.entries(context)
      .map(([title, content]) => `# ${title.toUpperCase()}\n${content}`)
      .join('\n\n');
  }

  buildPrompt(params: BuildPromptParams, options: PromptOptions): string {
    const {
      systemPrompt,
      userPrompt,
      currentInteractionHistory,
      lastError,
      finalToolName,
      reportToolName: selfReasoningTool,
      toolDefinitions,
      nextTasks,
      goal,
      report,
      conversationEntries,
      conversationLimitNote,
      context
    } = params;

    const sections: string[] = [];

    if (systemPrompt) sections.push(systemPrompt);

    sections.push(this.buildCoreDirectiveSection(finalToolName, selfReasoningTool));
    sections.push(this.buildResponseFormatSection(selfReasoningTool, finalToolName));
    sections.push(this.buildToolsSection(toolDefinitions));

    if (options.includePreviousTaskHistory && conversationEntries?.length) {
      sections.push(this.buildConversationHistorySection(conversationEntries, conversationLimitNote ?? ''));
    }

    const reports = currentInteractionHistory.filter(i => 'toolCalls' in i);
    sections.push(this.buildNotesSection(reports, selfReasoningTool));


    if (context && options.includeContext) {
      sections.push(this.buildContextContent(context));
    }

    sections.push(this.buildTaskSection(userPrompt, finalToolName, selfReasoningTool, nextTasks, goal, report, lastError));

    return sections.join('\n\n---\n\n');
  }
}
