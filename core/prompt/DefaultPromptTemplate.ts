import { Interaction, PromptOptions, ToolCallReport, UserPrompt, AgentResponse } from '../types/types';
import { AgentError } from '../utils/AgentError';

export enum FormatType {
  FUNCTION_CALLING = 'function_calling',
  YAML = 'yaml'
}

export class DefaultPromptTemplate {
  private responseFormat: FormatType;

  constructor(responseFormat: FormatType = FormatType.FUNCTION_CALLING) {
    this.responseFormat = responseFormat;
  }

  setResponseFormat(format: FormatType): void {
    this.responseFormat = format;
  }

  getResponseFormat(): FormatType {
    return this.responseFormat;
  }

  /**
   * Enhanced workflow rules with clearer structure and examples
   */
  /**
   * Enhanced workflow rules with clearer structure and examples
   */
  private getWorkflowRules(finalToolName: string): string {
    return `
## 🧠 CORE INSTRUCTIONS & THINKING PROCESS

### PRIMARY OBJECTIVE
Follow this strict two-phase process for EVERY user request:
1.  **DATA GATHERING PHASE**: Use available tools to collect ALL necessary information.
2.  **ANSWER PRESENTATION PHASE**: Present the complete answer to the user using the \`${finalToolName}\` tool.

### CRITICAL CONSTRAINTS (MUST FOLLOW)
- ✅ **Always** complete both phases for every request.
- ✅ **Never** skip directly to presenting without gathering required data.
- ✅ **Never** end the interaction without presenting the final answer via \`${finalToolName}\`.

### The 'report' Tool (Your Private Thinking Space)
Use the \`report\` tool with EVERY data-gathering tool call. It's your internal monologue.
- **Purpose**: Explain your current goal, tool choice, expected outcome, AND next action.
- **Visibility**: NEVER shown to the user.
- **Format Example**: "My reasoning: [Goal] → [Why this tool?] → [Expected outcome] → NEXT: [specific command/action]"

#### REQUIRED REPORT STRUCTURE
Your report MUST include these 4 components:
1. **Goal**: What you're trying to achieve
2. **Tool Choice**: Why this specific tool  
3. **Expected Outcome**: What data you expect to get
4. **Next Action**: Specific command for what to do after this tool completes

#### NEXT ACTION EXAMPLES
- "NEXT: Use final tool to present complete directory listing"
- "NEXT: Call read_file on package.json to get dependency details"  
- "NEXT: Analyze error and retry with different parameters"
- "NEXT: Gather additional data by checking file permissions"

### STEP-BY-STEP DECISION FRAMEWORK

#### Step 1: Understand the Request
Ask yourself:
- What specific output does the user want?
- What exact data/information do I need to create that output?
- How will I know I have successfully completed the request?

#### Step 2: Assess Your Current State (Check "REPORTS AND RESULTS")
Look at the data you've already gathered:
- Do I have ALL the data needed to answer the user's request completely?
- Are there any gaps or missing pieces?

#### Step 3: Execute ONE Action
Based on your assessment, choose either Path A or Path B:

**PATH A - Data Gathering (If you need more information)**
- Identify the SPECIFIC data gap.
- Choose the MOST APPROPRIATE tool to fill this gap.
- Execute the tool call.
- **MANDATORY**: Include the \`report\` tool call explaining your reasoning and next action.
    - Format:
      \`\`\`
      Tool: [tool_name] + report
      Reasoning: "I need [data_type] to [purpose]. Using [tool_name] because [reason]. NEXT: [specific action after this completes]."
      \`\`\`

**PATH B - Answer Presentation (If you have ALL required data)**
- Synthesize ALL gathered data into a complete, clear, and helpful answer.
- Use the \`${finalToolName}\` tool to deliver this final answer.
    - Format:
      \`\`\`
      Tool: ${finalToolName}
      Content: [Complete, formatted answer based on ALL gathered data]
      \`\`\`

### 🚨 CRITICAL RULES & ANTI-PATTERNS

#### MUST DO:
✅ Always use \`report\` with data-gathering tools.
✅ Present actual data/results in the final answer, not just confirmation of having data.
✅ Complete the full two-phase workflow before considering the task done.
✅ Make each tool call purposeful and justified by your reasoning.

#### MUST NOT DO:
❌ Use \`${finalToolName}\` to say "I have the data" without showing the actual data.
❌ Combine \`${finalToolName}\` with other tools in the same call.
❌ Skip the data gathering phase if information is needed.
❌ Make assumptions about data you haven't explicitly gathered via a tool call.

### EXAMPLES OF CORRECT BEHAVIOR

**Example 1: Simple Data Retrieval**
User: "Get information about X"
1. DATA GATHERING: get_data("X") + report("Retrieving information about X to fulfill user's request. NEXT: Use final tool to present the retrieved data")
2. ANSWER PRESENTATION: ${finalToolName}("Here is the information about X: [retrieved data]")

**Example 2: Multi-Step Analysis**
User: "Analyze Y and provide summary"
1. DATA GATHERING: collect_info("Y") + report("Collecting information about Y for analysis. NEXT: Analyze the collected data")
2. DATA GATHERING: analyze_data(info) + report("Analyzing collected data to generate summary. NEXT: Present complete analysis via final tool")
3. ANSWER PRESENTATION: ${finalToolName}("Analysis complete: [summary results]")
`;
  }

  private getExecutionStrategy(batchMode?: boolean): string {
    const batchInfo = batchMode ? `
### BATCH MODE: ENABLED
- **Mode**: You may receive and process multiple related requests in a single interaction.
- **Goal**: Handle all requests efficiently before providing a final response.
- **Action**: Process ALL requests, gather data for each, then provide the final answer(s).
- **Important**: Do not finalize any single request until ALL requests in the batch are addressed.` : `
### BATCH MODE: DISABLED
- **Mode**: You are handling one user request at a time.
- **Goal**: Focus completely on the single current request.
- **Action**: Gather all data needed for this request, then provide the final answer.
- **Important**: Address the current request thoroughly before finalizing.`;
    return batchInfo;
  }

  private getFunctionCallingFormatInstructions(finalToolName: string, batchMode?: boolean): string {
    return `# 🚨 RESPONSE FORMAT: JSON CODE BLOCKS ONLY 🚨

## ABSOLUTE REQUIREMENT
- **ALL responses MUST be valid JSON code blocks**
- **NO plain text outside of JSON blocks**
- **NO explanatory text before or after JSON**
- **EVERY response must follow one of the two patterns below**

${this.getWorkflowRules(finalToolName)}
${this.getExecutionStrategy(batchMode)}

## 📋 EXACT OUTPUT FORMATS

### Format 1: Data Gathering (with mandatory report)
\`\`\`json
{
  "functionCalls": [
    {
      "name": "tool_name_here",
      "arguments": "{\\"param1\\": \\"value1\\", \\"param2\\": \\"value2\\"}"
    },
    {
      "name": "report",
      "arguments": "{\\"report\\": \\"My reasoning: User wants [goal]. I need [data] to achieve this. Using [tool] because [specific_reason]. Expected outcome: [what_I_expect]. NEXT: [specific action after completion].\\"}"
    }
  ]
}
\`\`\`

### Format 2: Final Answer Presentation
\`\`\`json
{
  "functionCall": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"[Complete, helpful answer with all requested data formatted clearly]...\\"}"
  }
}
\`\`\`

## ⚠️ FORMATTING RULES
1. **Escape Requirements**: Double-escape quotes in arguments: \`\\"\`
2. **Newlines**: Use \`\\n\` for line breaks within string values
3. **Special Characters**: Properly escape all JSON special characters
4. **Validation**: Ensure all JSON is valid and parseable

## 🔍 SELF-CHECK BEFORE RESPONDING
Ask yourself:
1. Is my response a valid JSON code block?
2. Did I include \`report\` with any data-gathering tools?
3. Am I using the correct format (functionCalls vs functionCall)?
4. Have I properly escaped all special characters?
`;
  }

  private getYamlFormatInstructions(finalToolName: string, batchMode?: boolean): string {
    return `# 📋 RESPONSE FORMAT: YAML CODE BLOCKS ONLY

## ABSOLUTE REQUIREMENT
- **ALL responses MUST be valid YAML code blocks**
- **NO plain text outside of YAML blocks**
- **Use proper YAML syntax with correct indentation**

${this.getWorkflowRules(finalToolName)}
${this.getExecutionStrategy(batchMode)}

## 📋 EXACT OUTPUT FORMATS

### Format 1: Data Gathering (with mandatory report)
\`\`\`yaml
tool_calls:
  - name: tool_name_here
    args:
      param1: value1
      param2: |
        Multi-line value
        can go here
  - name: report
    args:
      report: |
        My reasoning: User wants [goal]. I need [data] to achieve this.
        Using [tool] because [specific_reason].
        Expected outcome: [what_I_expect].
        NEXT: [specific action after completion].
\`\`\`

### Format 2: Final Answer Presentation
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      value: |
        [Complete, helpful answer with all requested data]
        [Formatted clearly with proper structure]
        [All information the user requested]
\`\`\`

## ⚠️ YAML FORMATTING RULES
1. **Indentation**: Use 2 spaces (never tabs)
2. **Multi-line strings**: Use \`|\` for literal blocks
3. **Lists**: Proper \`-\` prefix with consistent spacing
4. **No quotes needed**: Unless value contains special characters

## 🔍 SELF-CHECK BEFORE RESPONDING
1. Is my response a valid YAML code block?
2. Is indentation consistent throughout?
3. Did I include \`report\` with data-gathering tools?
4. Are multi-line values properly formatted with \`|\`?
`;
  }

  private getFormatInstructions(finalToolName: string, batchMode?: boolean): string {
    switch (this.responseFormat) {
      case FormatType.FUNCTION_CALLING:
        return this.getFunctionCallingFormatInstructions(finalToolName, batchMode);
      case FormatType.YAML:
        return this.getYamlFormatInstructions(finalToolName, batchMode);
      default:
        return this.getFunctionCallingFormatInstructions(finalToolName, batchMode);
    }
  }

  buildPrompt(
    systemPrompt: string,
    userPrompt: string,
    context: Record<string, any>,
    currentInteractionHistory: Interaction[],
    prevInteractionHistory: Interaction[],
    lastError: AgentError | null,
    keepRetry: boolean,
    finalToolName: string,
    toolDefinitions: string,
    options: PromptOptions,
    errorRecoveryInstructions?: string
  ): string {
    const sections: string[] = [];

    // System context
    sections.push(systemPrompt);

    // Core instructions
    sections.push(`${this.getFormatInstructions(finalToolName, options.batchMode)}`);

    // Available tools
    sections.push(`# 🛠️ AVAILABLE TOOLS

## TOOL USAGE REQUIREMENTS
- **Parameter names are CASE-SENSITIVE** - must match exactly
- **ALL required parameters MUST be included** - no omissions
- **Data types MUST match specifications** - string vs number vs boolean
- **Follow the exact schema** - no extra or modified parameters

## TOOL DEFINITIONS
${toolDefinitions}

## COMMON TOOL USAGE PATTERNS
- File operations: Always check existence before reading
- API calls: Include all required headers and parameters
- Data processing: Validate input format before processing
- Error handling: Anticipate and handle potential failures`);

    // Current state
    sections.push(this.buildReportSection(currentInteractionHistory, finalToolName));

    // Context if needed
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // Previous history if needed
    if (options.includePreviousTaskHistory && prevInteractionHistory.length > 0) {
      sections.push(this.buildConversation(prevInteractionHistory, options));
    }

    // Error recovery if needed
    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, lastError, keepRetry, errorRecoveryInstructions));
    }

    // Custom sections
    if (options.customSections) {
      Object.entries(options.customSections).forEach(([name, content]) => {
        sections.push(`# ${name.toUpperCase()}\n${content}`);
      });
    }

    // Final user request
    sections.push(this.buildUserRequestSection(userPrompt, finalToolName));

    return sections.join('\n\n---\n\n');
  }


  buildReportSection(interactionHistory: Interaction[], finalToolName: string): string {
    const toolCallReports = interactionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    if (toolCallReports.length === 0) {
      return `# 📊 REPORTS AND RESULTS (Your Internal Log)

## CURRENT STATUS: EMPTY
- **State**: No actions taken yet.
- **User visibility**: This section is NEVER shown to the user.
- **Next step**: Begin data gathering based on the user request in the "CURRENT TASK" section.

## REMINDER
This is your working memory. Each action you take will be recorded here with:
- Your reasoning (from the \`report\` tool)
- Tool calls made and their results
- Success/failure status
- Any errors encountered`;
    }
    const reportEntries = toolCallReports.map((report, idx) => {
      const toolSummary = report.toolCalls.map(tc =>
        `    - ${tc.context.toolName}: ${tc.context.success ? '✅ SUCCESS' : '❌ FAILED'} ${tc.context.error ? `(Error: ${tc.context.error})` : ''}`
      ).join('\n');
      
      // Extract NEXT command and clean report text
      const cleanedReport = this.removeNextCommand(report.report || '');
      
      return `
### ACTION ${idx + 1} | ${new Date().toISOString()}
**Internal Reasoning**: ${cleanedReport || 'No reasoning provided'}
**Overall Status**: ${report.overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}
**Tools Executed**:
${toolSummary}
**Raw Results**:
\`\`\`json
${JSON.stringify(report.toolCalls.map(tc => ({ name: tc.context.toolName, success: tc.context.success, context: tc.context })), null, 2)}
\`\`\`
${report.error ? `**Error Details**: ${report.error}` : ''}`;
    }).join('\n');
    const latestNextCommand = this.getLatestNextCommand(toolCallReports);
    
    return `# 📊 REPORTS AND RESULTS (Your Internal Log)

## VISIBILITY NOTICE
🔒 **This section is PRIVATE** - The user cannot see this internal log.

${latestNextCommand ? this.buildNextCommandFocus(latestNextCommand) : ''}

## ACTION HISTORY
${reportEntries}

## CURRENT DATA INVENTORY
Based on the actions above, you currently have access to:
${this.summarizeAvailableData(toolCallReports)}`;
  }

  private summarizeAvailableData(reports: ToolCallReport[]): string {
    const successfulCalls = reports
      .flatMap(r => r.toolCalls)
      .filter(tc => tc.context.success);
    if (successfulCalls.length === 0) {
      return "- No successfully gathered data yet.";
    }
    return successfulCalls
      .map(tc => `- ${tc.context.toolName}: Data available`)
      .join('\n');
  }

  /**
   * Extract NEXT command from report text using regex
   */
  private extractNextCommand(reportText: string): string | null {
    const nextRegex = /NEXT:\s*(.+?)(?:\.|$)/i;
    const match = reportText.match(nextRegex);
    return match ? match[1].trim() : null;
  }

  /**
   * Remove NEXT command from report text, returning clean reasoning
   */
  private removeNextCommand(reportText: string): string {
    const nextRegex = /\s*NEXT:\s*.+?(?:\.|$)/i;
    return reportText.replace(nextRegex, '').trim();
  }

  /**
   * Get the latest NEXT command from the most recent report
   */
  private getLatestNextCommand(reports: ToolCallReport[]): string | null {
    if (reports.length === 0) return null;
    const latestReport = reports[reports.length - 1];
    return this.extractNextCommand(latestReport.report || '');
  }

  /**
   * Build focused instructions based on the extracted NEXT command
   */
  private buildNextCommandFocus(nextCommand: string): string {
    return `
## 🚨 HIGHEST PRIORITY - EXECUTE YOUR PLANNED ACTION 🚨

### 🎯 YOUR PREVIOUS COMMAND TO YOURSELF:
> "${nextCommand}"

### ⚡ IMMEDIATE REQUIREMENTS:
1. **EXECUTE EXACTLY**: Follow the command you gave yourself above
2. **NO DEVIATION**: Don't change plans unless there's a critical error
3. **STAY FOCUSED**: This is your own strategic decision from the previous turn
4. **ACT NOW**: Implement the planned action immediately

### 🔥 CRITICAL REMINDER:
You are NOT starting fresh - you already planned this action. Execute it.

================================================================================`;
  }


  buildContextSection(context: Record<string, any>, options: PromptOptions): string {
    if (Object.keys(context).length === 0) {
      return `# 📎 CONTEXT
**Status**: No additional context provided
**Note**: Rely on user request and available tools`;
    }

    const contextEntries = Object.entries(context).map(([key, value]) => {
      const preview = JSON.stringify(value, null, 2);
      const lines = preview.split('\n');
      const truncated = lines.length > 20
        ? lines.slice(0, 20).join('\n') + '\n... [truncated]'
        : preview;

      return `### ${key}
**Type**: ${typeof value}
**Content**:
\`\`\`json
${truncated}
\`\`\``;
    }).join('\n\n');

    return `# 📎 CONTEXT
Additional information provided for this task:

${contextEntries}

## USAGE NOTES
- This context supplements but doesn't replace user requests
- Refer to context when relevant to the current task
- Don't act on context unless it relates to the current request`;
  }

  buildConversation(prevInteractionHistory: Interaction[], options: PromptOptions): string {
    const entries = options.maxPreviousTaskEntries
      ? prevInteractionHistory.slice(-options.maxPreviousTaskEntries)
      : prevInteractionHistory;

    const limitNote = options.maxPreviousTaskEntries
      ? ` (showing last ${entries.length} of ${prevInteractionHistory.length} total)`
      : '';

    const conversationEntries = entries
      .filter(interaction => 'type' in interaction && (interaction.type === 'user_prompt' || interaction.type === 'agent_response'))
      .map((interaction, idx) => {
        if ('type' in interaction && interaction.type === 'user_prompt') {
          const userPrompt = interaction as UserPrompt;
          return `### 👤 USER REQUEST #${idx + 1}
"${userPrompt.context}"`;
        } else if ('type' in interaction && interaction.type === 'agent_response') {
          const agentResponse = interaction as AgentResponse;
          return `### 🤖 AGENT RESPONSE #${idx + 1}
${typeof agentResponse.context === 'string' ? agentResponse.context : JSON.stringify(agentResponse.context)}`;
        }
        return '';
      })
      .filter(entry => entry !== '')
      .join('\n\n');

    return `# 💬 CONVERSATION HISTORY${limitNote}

## ⚠️ IMPORTANT NOTICE
- This is REFERENCE ONLY - do not act on past requests
- Only relevant if current request explicitly refers to previous interactions
- Focus on the CURRENT TASK in the "CURRENT TASK" section

## PREVIOUS INTERACTIONS
${conversationEntries}

## CONTEXT USAGE RULES
✅ USE when: Current request says "like before", "again", "the same file", etc.
❌ DON'T USE when: Current request is independent of history`;
  }

  buildUserRequestSection(userPrompt: string, finalToolName: string): string {
    return `# 🎯 CURRENT TASK & IMMEDIATE ACTION

## USER REQUEST
> "${userPrompt}"

## YOUR DECISION CHECKLIST
Follow this exact sequence to determine your next action:

### 1️⃣ PARSE THE REQUEST
- What specific output/result is the user asking for?
- What data do I need to provide this output?
- Have I clearly understood the success criteria?

### 2️⃣ CHECK YOUR INTERNAL LOG
Review "REPORTS AND RESULTS" section above:
- ✅ If you have ALL required data → Go to step 3B
- ❌ If you're missing ANY data → Go to step 3A

### 3️⃣A IF MISSING DATA (Data Gathering Path)
Execute the following:
1. Identify the specific missing data
2. Choose the appropriate tool to get this data
3. Call the tool WITH a \`report\` explaining your reasoning
4. After receiving results, return to step 1

### 3️⃣B IF HAVE ALL DATA (Answer Presentation Path)
Execute the following:
1. Compile all gathered data into a complete answer
2. Format the answer to be clear and helpful
3. Use \`${finalToolName}\` to present this answer
4. Your task is now complete

## 🚫 COMMON MISTAKES TO AVOID
- DON'T say "I have the data" without showing it
- DON'T use ${finalToolName} until you have everything needed
- DON'T forget the \`report\` tool when gathering data
- DON'T make assumptions - gather actual data

## ✅ SIGNS OF CORRECT EXECUTION
- Each data-gathering includes clear reasoning via \`report\`
- The final answer includes all requested information
- User receives complete, formatted results via \`${finalToolName}\`
- No steps are skipped or combined inappropriately

## YOUR IMMEDIATE NEXT ACTION
Based on the checklist above, your next response should be:
[Determine this yourself based on the decision framework]`;
  }

  buildErrorRecoverySection(
    finalToolName: string,
    error: AgentError | null,
    keepRetry: boolean,
    errorRecoveryInstructions?: string
  ): string {
    if (!error) return '';

    // Handle stagnation error specifically
    if (error.type === 'STAGNATION_ERROR') {
      // Extract tool information from the error context
      const toolInfo = error.context?.toolInfo || 'Unknown tool';
      const toolArgs = error.context?.toolArgs || '{}';
      const isLastChance = error.context?.isLastChance || false;
      const terminationThreshold = error.context?.terminationThreshold || 3;

      const warningSection = isLastChance ? `

## 🚨 CRITICAL WARNING - FINAL ATTEMPT 🚨
**THIS IS YOUR LAST CHANCE!** You have reached ${error.context?.occurrenceCount}/${terminationThreshold} similar attempts.
**The next similar reasoning pattern will TERMINATE the agent immediately.**
**You MUST change your approach completely or the task will fail.**

` : '';

      return `# 🔄 STAGNATION DETECTED - STRATEGIC ANALYSIS REQUIRED
${warningSection}
## SITUATION ANALYSIS
**Problem**: You are repeatedly calling the same tool without making any progress.
**Repeated Tool**: \`${toolInfo}\`
**Tool Arguments**: \`${toolArgs}\`
**Similarity**: ${error.context?.similarity ? (error.context.similarity * 100).toFixed(1) + '%' : 'Unknown'}
**Occurrence Count**: ${error.context?.occurrenceCount || 'Unknown'}/${terminationThreshold} times
**Current Report**: "${error.context?.currentText || 'Unknown'}"
**Similar Previous Report**: "${error.context?.similarText || 'Unknown'}"

## 📊 COMPREHENSIVE REVIEW REQUIRED
You MUST now analyze your entire "REPORTS AND RESULTS" section and:

### 1️⃣ ASSESS CURRENT PROGRESS
- What data have you successfully gathered?
- What tools have you used and what were their results?
- How much of the user's request have you fulfilled?

### 2️⃣ IDENTIFY THE CAUSE
- Why are you repeating the same reasoning?
- What specific obstacle is preventing progress?
- Are you missing critical information or tools?

### 3️⃣ STRATEGIC DECISION
Based on your analysis, choose ONE path:

**PATH A - CONTINUE WITH NEW APPROACH**
- If you can identify a different strategy to gather missing data
- Use a completely different tool or approach than before
- Include \`report\` with new reasoning that explains the change in strategy

**PATH B - CONCLUDE WITH AVAILABLE DATA**
- If you have sufficient data to partially answer the user's request
- Use \`${finalToolName}\` to present what you've accomplished
- Explain any limitations or partial results

**PATH C - REQUEST CLARIFICATION**
- If the user's request is unclear or impossible with available tools
- Use \`${finalToolName}\` to explain the issue and ask for guidance

## 🎯 YOUR NEXT ACTION
Analyze your complete action history above, then execute your chosen path with clear reasoning.`;
    }

    const errorContext = `# ⚠️ ERROR RECOVERY REQUIRED

## ERROR DETAILS
- **Type**: ${error.type || 'Unknown'}
- **Message**: ${error.message}
- **Timestamp**: ${new Date().toISOString()}
${error.stack ? `- **Stack**: \`\`\`\n${error.stack}\n\`\`\`` : ''}

## ERROR ANALYSIS CHECKLIST
Before proceeding, analyze:
1. **Root Cause**: What specifically went wrong?
2. **Parameter Issues**: Were all required parameters included?
3. **Format Issues**: Was the JSON/YAML format correct?
4. **Tool Selection**: Was the right tool used?
5. **Data Dependencies**: Were prerequisites met?`;

    if (!keepRetry) {
      return `${errorContext}

## 🛑 MAXIMUM RETRIES EXCEEDED
**Status**: Recovery attempts exhausted
**Required Action**: You MUST now use \`${finalToolName}\` to:
1. Acknowledge the error to the user
2. Explain what went wrong in user-friendly terms
3. Suggest alternative approaches if applicable
4. Apologize for the inconvenience

**Example Response**:
\`\`\`json
{
  "functionCall": {
    "name": "${finalToolName}",
    "arguments": "{\\"value\\": \\"I encountered an error while [action]. The issue was [explanation]. I apologize for the inconvenience. You might try [alternative suggestion].\\"}"
  }
}
\`\`\``;
    }

    const customInstructions = errorRecoveryInstructions || `## DEFAULT RECOVERY STRATEGY
1. **Identify the Issue**: Analyze the error message and determine the root cause
2. **Review Documentation**: Check tool definitions for correct usage
3. **Adjust Approach**: Modify parameters, tool selection, or strategy
4. **Retry with Fixes**: Execute the corrected approach
5. **Monitor Results**: Ensure the retry succeeds`;

    return `${errorContext}

## RECOVERY INSTRUCTIONS
${customInstructions}

## RETRY CHECKLIST
Before retrying, ensure:
- ✅ You understand why the error occurred
- ✅ You've identified the specific fix needed
- ✅ Your new approach addresses the root cause
- ✅ You're not repeating the same mistake

## RECOVERY PATTERNS

### Pattern 1: Parameter Mismatch
**Error**: "Missing required parameter 'X'"
**Fix**: Include all required parameters with correct names and types

### Pattern 2: Invalid Format
**Error**: "Invalid JSON/YAML format"
**Fix**: Check escaping, quotes, and structure

### Pattern 3: Tool Not Found
**Error**: "Unknown tool 'X'"
**Fix**: Use exact tool names from the AVAILABLE TOOLS section

### Pattern 4: Permission/Access
**Error**: "Permission denied" or "Not found"
**Fix**: Verify resource exists and is accessible

## YOUR RECOVERY ACTION
Based on the error above, formulate and execute your recovery plan.`;
  }
}
