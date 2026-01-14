import { ToolCallReport, BuildPromptParams, FormatMode, PromptOptions, Interaction } from '../types/types';
import { AgentError, AgentErrorType } from '../utils/AgentError';
import { BasePromptTemplate } from './BasePromptTemplate';

export class DefaultPromptTemplate implements BasePromptTemplate {
  private responseFormat: FormatMode;

  constructor(responseFormat: FormatMode = FormatMode.MD_STRUCT) {
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
Do exactly what the user asks, then provide the response.

## WORKFLOW
1. Read the user's request carefully.
2. Analyze the CURRENT TASK PROGRESS section - this is your ONLY source of truth.
3. Check what has been accomplished and what data you have gathered.
4. Decide the goal status:
   - If you have enough information to answer the user: goal_status="success" + use ${finalToolName}
   - If the task cannot be completed: goal_status="failed" + use ${finalToolName} to explain why
   - If you need more data: goal_status="pending" + take the specific next action needed
5. Always use ${selfReasoningTool} with pending_action and detailed progress_summary.

## STRICT RULES
- Do what the user asks, then immediately provide the response with ${finalToolName}.
- If you have enough information to answer the user's question, set goal_status="success" and use ${finalToolName}.
- ALWAYS pair tool calls with ${selfReasoningTool}.
- NEVER respond with plain text.
- NEVER call ${selfReasoningTool} alone.
- Complete the task efficiently - don't over-analyze or gather excessive data.`;
  }

  private buildResponseFormatSection(selfReasoningTool: string, finalToolName: string): string {
    if (this.responseFormat === FormatMode.MD_STRUCT) {
      return `# RESPONSE FORMAT: MD-STRUCT
      
Respond using the MD-Struct format. This is a Markdown-based structured data format.

## RULES
1. **Headings (#)** represent keys.
   - A single # heading is the **Tool Name**.
   - ## headings are **Arguments** or nested keys.
2. **Paragraphs** below a heading are **Values**.
   - Values are automatically inferred as booleans (true/false), numbers, or strings.
3. **Lists (-)** represent **Arrays**.
4. **Fenced Code Blocks (\`\`\`)** represent **Multiline Strings**.
   - Use these for code, long explanations, or any content with special characters.
5. **Multiple Tool Calls**: You can call multiple tools by starting each with a new # heading.

---

### Scenario 1: Intermediate Steps

# ${selfReasoningTool}
## goal
[user's ultimate goal]
## goal_status
pending
## pending_action
[what you are currently doing]
## progress_summary
- [completed action 1]
- [completed action 2]

# some_other_tool
## param1
value1
## code_snippet
\`\`\`javascript
console.log("hello");
\`\`\`

---

### Scenario 2: Final Answer

# ${selfReasoningTool}
## goal
[user's ultimate goal]
## goal_status
success
## pending_action
Responding to user with final answer
## progress_summary
- [completed action 1]
- [completed action 2]
- Task completed

# ${finalToolName}
## value
\`\`\`markdown
Your final answer to the user here.
You can use markdown inside this code block.
\`\`\`

---

### Core Rules
- Response MUST be in MD-Struct format.
- ALWAYS pair tool calls with ${selfReasoningTool}.
- NEVER respond with plain text outside the MD-Struct structure.
- Ensure all required parameters from the tool schemas are provided as ## headings.
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


  private buildCurrentTaskProgressSection(toolCallReports: Interaction[], selfReasoningTool: string): string {
    if (!toolCallReports.length) {
      return `# CURRENT TASK PROGRESS
No actions taken yet for this task.`;
    }

    // Show each turn with pending_action first, then tool results
    const turnLogs = toolCallReports
      .filter((report): report is ToolCallReport => 'toolCalls' in report)
      .map((report, i) => {
        const selfReasoningCall = report.toolCalls.find(tc => tc.toolName === selfReasoningTool);
        const pendingAction = (selfReasoningCall?.args as Record<string, unknown>)?.pending_action ?? 'Action not specified';

        const toolOutputs = report.toolCalls
          .filter(tc => tc.toolName !== selfReasoningTool)
          .map(tc => {
            const result = tc.success ? 'SUCCESS' : 'FAILED';
            const error = tc.error ? `: Error: ${tc.error}` : '';
            const output = tc.success && tc.args && typeof tc.args === 'object'
              ? `\nOutput: ${JSON.stringify(tc.args, null, 2)}`
              : '';
            return `    - Tool \`${tc.toolName}\` -> ${result}${error}${output}`;
          }).join('\n');

        return `### Turn ${i + 1}: ${pendingAction}
${toolOutputs || '    - No tool actions taken'}`;
      }).join('\n\n');

    // Get latest progress summary and pending action with status
    const latestReport = toolCallReports
      .filter((report): report is ToolCallReport => 'toolCalls' in report)
      .reverse()[0];
    const latestSelfReasoning = latestReport?.toolCalls.find(tc => tc.toolName === selfReasoningTool);
    const latestProgressSummary = (latestSelfReasoning?.args as Record<string, unknown>)?.progress_summary ?? '';
    const latestPendingAction = (latestSelfReasoning?.args as Record<string, unknown>)?.pending_action ?? '';

    // Check if all tool calls in latest turn were successful
    const latestTurnSuccess = latestReport ? latestReport.toolCalls.filter(tc => tc.toolName !== selfReasoningTool).every(tc => tc.success) : true;
    const status = latestTurnSuccess ? '(success)' : '(error)';

    return `# CURRENT TASK PROGRESS

## EXECUTION HISTORY
${turnLogs || 'No actions taken yet'}

${latestProgressSummary ? `## PROGRESS SUMMARY\n${latestProgressSummary}${latestPendingAction ? `\n${latestPendingAction} ${status}` : ''}\n\n` : ''}## NEXT TASK
Analyze the progress above and determine the best action to achieve the user's goal. Review what has been accomplished, identify any gaps or missing information, and decide whether to:
- Gather more data if information is incomplete
- Take the next logical step toward the goal
- Provide the final answer if all requirements are met

## CRITICAL - ONLY SOURCE OF TRUTH
- This CURRENT TASK PROGRESS section is the ONLY reliable source of truth for making decisions.
- Analyze DEEPLY what has been accomplished and what data you have gathered in the tool outputs.
- Focus ONLY on the current task the user requested.
- Look at the actual tool outputs - do they contain enough information to answer the user?`;
  }

  private buildTaskSection(userPrompt: string, finalToolName: string, _selfReasoningTool: string, goal?: string | null, lastError?: AgentError | null): string {
    const goalSection = goal ? `\n## CURRENT GOAL\n> ${goal}` : `\n## USER REQUEST\n> ${userPrompt}`;

    if (lastError) {
      return `${goalSection}

# PREVIOUS ACTION FAILED
An error occurred during the last action.

- **Error Type**: ${lastError.type}
- **Error Message**: ${lastError.message}

## REQUIRED ACTION
1. **Analyze the History and the Error**: Understand why the last action failed.
2. **Decide the Next Best Action**: This could be to fix the problem (e.g., create a missing directory) or to try an alternative approach.
3. Execute the single best next action.`;
    }

    return `${goalSection}

# FOCUS ON CURRENT TASK
1. **Review Progress**: Check what you've accomplished for THIS specific task.
2. **Assess Task Completion**: Do you have enough information to complete the user's current request?
3. **Take Action**:
   - If TASK COMPLETE: Use goal_status="success" + ${finalToolName} to respond to user with the answer
   - If TASK FAILED: Use goal_status="failed" + ${finalToolName} to explain why  
   - If TASK INCOMPLETE: Use goal_status="pending" + take the next action needed for THIS task only`;
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
      goal,
      context,
      stagnationWarning
    } = params;

    const sections: string[] = [];

    if (systemPrompt) sections.push(systemPrompt);

    sections.push(this.buildCoreDirectiveSection(finalToolName, selfReasoningTool));
    sections.push(this.buildResponseFormatSection(selfReasoningTool, finalToolName));
    sections.push(this.buildToolsSection(toolDefinitions));

    const reports = currentInteractionHistory.filter(i => 'toolCalls' in i);
    sections.push(this.buildCurrentTaskProgressSection(reports, selfReasoningTool));

    if (context && options.includeContext) {
      sections.push(this.buildContextContent(context));
    }

    // Add stagnation warning if present
    if (stagnationWarning) {
      sections.push(`# ⚠️ CRITICAL WARNING\n\n${stagnationWarning}`);
    }

    sections.push(this.buildTaskSection(userPrompt, finalToolName, selfReasoningTool, goal, lastError));

    return sections.join('\n\n---\n\n');
  }
}
