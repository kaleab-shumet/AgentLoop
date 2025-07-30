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

  private buildMissionSection(finalToolName: string, reportToolName: string): string {
    return `# MISSION
Two-phase workflow: (1) Gather data using tools + ${reportToolName}, (2) Present final answer using ${finalToolName} + ${reportToolName}.

## WORKFLOW
- Need data? → [tool] + ${reportToolName}
- Have data? → ${finalToolName} + ${reportToolName}  
- Error? → Fix issue + ${reportToolName}
- Check nextTasks command first - if present, execute immediately

## RULES
- ALWAYS use ${reportToolName} with every tool call
- NEVER use ${reportToolName} alone (forbidden)
- NEVER respond in plain text
- ONLY use listed tools
- ONLY use data from REPORTS section`;
  }

  private buildFormatSection(reportToolName: string, finalToolName: string): string {
    if (this.responseFormat === FormatMode.YAML) {
      return `# FORMAT: YAML ONLY - CRITICAL SYNTAX RULES

## YAML REQUIREMENTS
- EXACTLY 2 spaces for indentation (NO tabs, NO 4-space)
- Use quotes for all string values
- Use "|" for multiline strings
- Escape special chars: \\ " \` \n \t
- NO text before/after code block

## DATA GATHERING FORMAT
\`\`\`yaml
tool_calls:
  - name: [action_tool_name]
    args:
      param1: "value1"
      param2: "value2"
  - name: ${reportToolName}
    args:
      report: "Goal: [goal]. Plan: [action + reason]. Expected: [outcome]."
      nextTasks: |
        1. [Next step].
        2. [Following step].
        3. Use ${finalToolName} to present [deliverable].
\`\`\`

## FINAL ANSWER FORMAT
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      [check_tool_schema]: "required_value"
  - name: ${reportToolName}
    args:
      report: "Task complete. Presenting final answer."
      nextTasks: "Task is complete."
\`\`\`

## YAML VALIDATION CHECKLIST
✓ Exactly 2-space indentation
✓ All strings quoted
✓ No tabs anywhere
✓ Proper array syntax with "-"
✓ Valid YAML structure`;
    }

    return `# FORMAT: JSON ONLY - CRITICAL SYNTAX RULES

## JSON REQUIREMENTS
- Valid JSON structure only
- Double-escape quotes in arguments: \\"
- Arguments must be stringified JSON
- NO trailing commas
- NO text before/after code block

## DATA GATHERING FORMAT
\`\`\`json
{
  "functionCalls": [
    {
      "name": "[action_tool_name]",
      "arguments": "{\\"param1\\": \\"value1\\", \\"param2\\": \\"value2\\"}"
    },
    {
      "name": "${reportToolName}",
      "arguments": "{\\"report\\": \\"Goal: [goal]. Plan: [action + reason]. Expected: [outcome].\\", \\"nextTasks\\": \\"1. [Next step]. 2. [Following step]. 3. Use ${finalToolName} to present [deliverable].\\"}"
    }
  ]
}
\`\`\`

## FINAL ANSWER FORMAT
\`\`\`json
{
  "functionCalls": [
    {
      "name": "${finalToolName}",
      "arguments": "{\\"param\\": \\"value\\"}"
    },
    {
      "name": "${reportToolName}",
      "arguments": "{\\"report\\": \\"Task complete. Presenting final answer.\\", \\"nextTasks\\": \\"Task is complete.\\"}"
    }
  ]
}
\`\`\`

## JSON VALIDATION CHECKLIST
✓ Valid JSON syntax
✓ Double-escaped quotes in arguments: \\"
✓ All arguments as stringified JSON
✓ No trailing commas
✓ Proper bracket/brace matching

## COMMON ERRORS TO AVOID
❌ Single quotes: 'value' → ✅ "value"
❌ Unescaped quotes: "He said "hello"" → ✅ "He said \\"hello\\""
❌ Tabs in indentation → ✅ Use spaces only
❌ Missing commas between objects
❌ Trailing commas at end of arrays/objects`;
  }

  private buildToolsSection(toolDefinitions: string): string {
    return `# TOOLS
Match names/params exactly. Provide all required parameters.

${toolDefinitions}`;
  }

  private buildStateSection(toolCallReports: ToolCallReport[], reportToolName: string): string {
    if (toolCallReports.length === 0) {
      return `# REPORTS (YOUR MEMORY)
Status: No data. Must gather data first using [tool] + ${reportToolName}.`;
    }

    const entries = toolCallReports.map((report, i) => {
      const tools = report.toolCalls.map(tc => 
        `${tc.context.toolName}: ${tc.context.success ? 'SUCCESS' : 'FAILED'}`
      ).join(', ');
      
      return `## Action ${i + 1}
Plan: ${report.report || 'N/A'}
Tools: ${tools}
Data: ${JSON.stringify(report.toolCalls.map(tc => tc.context), null, 2)}`;
    }).join('\n\n');

    return `# REPORTS (YOUR MEMORY - SINGLE SOURCE OF TRUTH)
${entries}`;
  }

  private buildContextSection(conversationEntries: ConversationEntry[], limitNote: string): string {
    if (!conversationEntries?.length) return '';
    
    const entries = conversationEntries.map(entry => {
      let content = '';
      if (entry.user) content += `User: "${entry.user}"`;
      if (entry.ai) content += ' → Agent: [tool calls]';
      return content;
    }).join('\n');

    return `# CONTEXT (REFERENCE ONLY)
${limitNote}
${entries}`;
  }

  private buildErrorSection(error: AgentError | null, reportToolName: string, finalToolName: string): string {
    if (!error) return '';

    return `# ERROR RECOVERY
Error: ${error.message}

Fix: Analyze error → Create new plan → Execute correct tools + ${reportToolName}
Common: If called ${reportToolName} alone, use [action_tool] + ${reportToolName} or ${finalToolName} + ${reportToolName}`;
  }

  private buildTaskSection(userPrompt: string, reportToolName: string, finalToolName: string, nextTasks?: string | null): string {
    if (nextTasks) {
      return `# IMMEDIATE TASK
EXECUTE: ${nextTasks}

Use [tool] + ${reportToolName} or ${finalToolName} + ${reportToolName}. Never ${reportToolName} alone.`;
    }

    return `# TASK
"${userPrompt}"

Next: Gather data with [tool] + ${reportToolName}, then answer with ${finalToolName} + ${reportToolName}.`;
  }

  private buildCustomSections(customSections: Record<string, string>): string {
    return Object.entries(customSections)
      .map(([name, content]) => `# ${name.toUpperCase()}\n${content}`)
      .join('\n\n');
  }

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
      conversationLimitNote
    } = params;

    const sections: string[] = [];

    // Core sections in priority order
    sections.push(systemPrompt);
    sections.push(this.buildMissionSection(finalToolName, reportToolName));
    sections.push(this.buildFormatSection(reportToolName, finalToolName));
    sections.push(this.buildToolsSection(toolDefinitions));

    // State and context
    const toolCallReports = currentInteractionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    sections.push(this.buildStateSection(toolCallReports, reportToolName));
    
    if (options.includePreviousTaskHistory && prevInteractionHistory.length > 0) {
      sections.push(this.buildContextSection(conversationEntries || [], conversationLimitNote || ''));
    }

    // Error handling
    if (lastError) {
      sections.push(this.buildErrorSection(lastError, reportToolName, finalToolName));
    }

    // Custom sections
    if (options.customSections) {
      sections.push(this.buildCustomSections(options.customSections));
    }

    // Final task
    sections.push(this.buildTaskSection(userPrompt, reportToolName, finalToolName, nextTasks));

    return sections.join('\n\n');
  }
}