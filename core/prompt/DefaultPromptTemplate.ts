import { ToolCallReport, BuildPromptParams, FormatMode, PromptOptions, Interaction } from '../types/types';
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
      longContent: LiteralLoader("unique-id") // Reference to XML literal block, unique-id can be max 16 chars, check the xml block below
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
      longContent: LiteralLoader("data-id") // Reference to XML literal block below
    })
  );

  toolCalls.push(
    toolSchemas.${selfReasoningTool}.parse({
      goal: "[user's ultimate goal - why they need this]",
      pending_action: "[what you are currently doing and waiting for result]",
      progress_summary: "[detailed summary of what has been accomplished so far]"
    })
  );

  return toolCalls;
}
\`\`\`

\`\`\`xml
<literals>
  <literal id="data-id">
This is my long content,
with multiple lines
</literal>      
</literals>
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
      goal: "[user's ultimate goal - why they need this]",
      pending_action: "[what you are currently doing and waiting for result]",
      progress_summary: "[detailed summary of what has been accomplished so far]"
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
- While using \`LiteralLoader("id")\`, ensure 'id' is unique (max 16 chars) and defined in the XML block below.

**TEST**
- We are evaluating your ability to:
1. Follow instructions precisely.
2. Write clean, functional code **without defining any variables**.
3. Correctly reference XML using "LiteralLoader('id')" in the appropriate places.
4. Strictly adhere to tool schemas and parameters, ensuring all created data passes schema validation.
5. Use '${selfReasoningTool}' to clearly track progress for next iteration.

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

${latestProgressSummary ? `## PROGRESS SUMMARY\n${latestProgressSummary}${latestPendingAction ? `\n${latestPendingAction} ${status}` : ''}\n\n` : ''}## CRITICAL - ONLY SOURCE OF TRUTH
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
      context
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

    sections.push(this.buildTaskSection(userPrompt, finalToolName, selfReasoningTool, goal, lastError));

    return sections.join('\n\n---\n\n');
  }
}
