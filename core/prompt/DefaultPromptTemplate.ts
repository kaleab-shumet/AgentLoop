import {
  PromptOptions,
  ToolCallReport,
  BuildPromptParams,
  ConversationEntry,
  FormatMode,
} from '../types/types';
import { AgentError } from '../utils/AgentError';
import { BasePromptTemplate } from './BasePromptTemplate';

export class DefaultPromptTemplate implements BasePromptTemplate {
  getResponseFormat(): FormatMode {
    return FormatMode.XRJSON;
  }

  public coreDirective(finalTool: string, reportTool: string): string {
    return `---
# CORE DIRECTIVE

You are a structured tool-using agent.

## PHASES
1. DATA GATHERING — Use any action tool + "${reportTool}".
2. FINAL RESPONSE — Use "${finalTool}" + "${reportTool}".

## WORKFLOW
1. Read Conversation History to understand context.
2. Check Next Tasks section for immediate actions.
3. If nextTask is present, execute it immediately using the correct tool + "${reportTool}".
4. If no nextTask, analyze USER REQUEST and use action tool + "${reportTool}".
5. If nextTask says complete, finalize with "${finalTool}" + "${reportTool}".

## RULES
- Use only defined tools.
- Match param names and types exactly.
- Never call "${reportTool}" alone.
- Output valid XRJSON only.`;
  }

  private responseFormat(reportTool: string, finalTool: string): string {
    return `---
# XRJSON FORMAT

Use XRJSON: a JSON object followed by a <literals> block.

- Use "xrjson('id')" for any string > 50 characters or multi-line.
- Every ID used must have a matching <literal>.
- You can write free-form text inside <literal> tag. No escaping needed.

## STRUCTURE
\`\`\`xrjson
{
  "tools": [
    {
      "toolName": "${finalTool}",
      "value": "xrjson('final_output')"
    },
    {
      "toolName": "${reportTool}",
      "goal": "Summarize",
      "report": "xrjson('summary')",
      "nextTasks": "Task Completed"
    }
  ]
}

<literals>
  <literal id="final_output">
    You do not need to escape strings in here, write freely. System automatically escapes it.
    Final detailed response...
  </literal>
  <literal id="summary">
    Task Complete, Task summary...
  </literal>
</literals>
\`\`\`

## RULES
- Always begin with a valid JSON object.
- No free text outside JSON and <literals>.
- No text between \`}\` and \`<literals>\`.`;
  }

  public toolsSection(toolDefs: string, reportTool: string): string {
    return `---
# TOOLS

Use only these tools. Match parameter names and types exactly. Never call "${reportTool}" alone.

${toolDefs}`;
  }

  public historySection(entries: ConversationEntry[], note: string): string {
    if (!entries.length) return '';
    return `---
# CONVERSATION HISTORY
${note}
${entries.map((e, i) => `## Turn ${i + 1}\n**User**: ${e.user || ''}\n**Assistant**: ${e.ai || ''}`).join('\n\n')}`;
  }

  public reportsSection(
    reports: ToolCallReport[],
    reportTool: string,
    finalTool: string
  ): string {
    if (!reports.length) {
      return `---
# REPORTS AND RESULTS
No data collected yet. Begin with any action tool + "${reportTool}".`;
    }

    const entries = reports
      .map(
        (r, i) => `### Action #${i + 1}
**Tools Used**:
${r.toolCalls
  .map((tc) => `- ${tc.context.toolName}: ${tc.context.success ? '✅' : '❌'}`)
  .join('\n')}
**Results**:
\`\`\`json
${JSON.stringify(
  r.toolCalls.map((tc) => ({
    name: tc.context.toolName,
    success: tc.context.success,
    context: tc.context,
  })),
  null,
  2
)}
\`\`\``
      )
      .join('\n\n');

    return `---
# REPORTS AND RESULTS

Use only this data for tool responses.

${entries}`;
  }

  public errorSection(
    finalTool: string,
    reportTool: string,
    error: AgentError | null
  ): string {
    if (!error) return '';
    
    const stagnationHint = error.type === 'STAGNATION_ERROR' 
      ? ' Try a different approach. If it still fails, use "${finalTool}" to explain the real problem.' 
      : '';
    
    return `---
# ERROR RECOVERY

**${error.type || 'Unknown Error'}**: ${error.message}, hint: ${stagnationHint}

Steps:
1. Diagnose issue.
2. Retry tool + "${reportTool}".
3. Finalize with "${finalTool}" + "${reportTool}".`;
  }

  public taskSection(
    prompt: string,
    finalTool: string,
    reportTool: string,
    nextTasks?: string | null
  ): string {
    return `---
# TASK

${nextTasks
  ? `## nextTasks\n> ${nextTasks}\n\nExecute immediately using correct tool + "${reportTool}".`
  : `## USER REQUEST\n> ${prompt}\n\nIf data needed, use action tool + "${reportTool}". Finalize with "${finalTool}" + "${reportTool}".`}`;
  }

  private reminderSection(reportTool: string): string {
    return `---
# REMINDER

- XRJSON only. No free-form text outside JSON + <literals>.
- Match tool schemas exactly: tool name, param names, param types.
- Use "xrjson('id')" for all long/multi-line values.
- Every ID must have matching <literal>.
- Never call "${reportTool}" alone.
- Validate before finalizing.`;
  }

  private customSections(customs: Record<string, string>): string {
    return Object.entries(customs)
      .map(([k, v]) => `---\n# ${k.toUpperCase()}\n${v}`)
      .join('\n\n');
  }

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

    const reports = currentInteractionHistory.filter(
      (i) => 'toolCalls' in i
    ) as ToolCallReport[];

    return [
      systemPrompt,
      this.coreDirective(finalToolName, reportToolName),
      this.responseFormat(reportToolName, finalToolName),
      this.toolsSection(toolDefinitions, reportToolName),
      options.includePreviousTaskHistory
        ? this.historySection(conversationEntries ?? [], conversationLimitNote || '')
        : '',
      this.reportsSection(reports, reportToolName, finalToolName),
      this.errorSection(finalToolName, reportToolName, lastError),
      options.customSections ? this.customSections(options.customSections) : '',
      this.taskSection(userPrompt, finalToolName, reportToolName, nextTasks),
      this.reminderSection(reportToolName),
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
