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

  /**
   * Enhanced workflow rules with clearer structure and examples
   */
  private getWorkflowRules(finalToolName: string, reportToolName: string): string {
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

### The '${reportToolName}' Tool (Your Private Thinking Space)
Use the \`${reportToolName}\` tool with EVERY tool call (including \`${finalToolName}\`). It's your internal monologue.
- **Purpose**: Explain your current goal, tool choice, expected outcome, AND next action.
- **Visibility**: NEVER shown to the user.
- **Format Example**: "My reasoning: [Goal] → [Why this tool?] → [Expected outcome]" + separate nextTasks property

#### REQUIRED REPORT STRUCTURE
Your report MUST include these 4 components:
1. **Goal**: What you're trying to achieve
2. **Tool Choice**: Why this specific tool  
3. **Expected Outcome**: What data you expect to get
4. **Complete Plan**: Full sequence from next action to final tool call, including what comprehensive details you'll present to the user

#### NEXT TASK EXAMPLES (separate nextTasks property - MUST use numbered listing)
- "1. Gather remaining information, 2. Process collected data, 3. Use final tool to present complete results"
- "1. Validate input parameters, 2. Execute operation, 3. Use final tool to present comprehensive output"  
- "1. Retry with corrected approach, 2. Verify completion, 3. Use final tool to present successful results"
- "1. Check required conditions, 2. Compile findings, 3. Use final tool to present complete analysis"

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
- **MANDATORY**: Include the \`${reportToolName}\` tool call explaining your reasoning and next action.
    - Format:
      \`\`\`
      Tool: [tool_name] + report
      Reasoning: "I need [data_type] to [purpose]. Using [tool_name] because [reason]."
      nextTasks: "1. [next action], 2. [subsequent step], 3. Use final tool to present [specific details]"
      \`\`\`

**PATH B - Answer Presentation (If you have ALL required data)**
- Synthesize ALL gathered data into a complete, clear, and helpful answer.
- Use the \`${finalToolName}\` tool to deliver this final answer.
- **CHECK SCHEMA**: Use the exact parameters defined in the \`${finalToolName}\` tool schema below

### 🚨 CRITICAL RULES & ANTI-PATTERNS

#### MUST DO:
✅ Always use \`${reportToolName}\` with EVERY tool call (including \`${finalToolName}\`).
✅ Present actual data/results in the final answer, not just confirmation of having data.
✅ Complete the full two-phase workflow before considering the task done.
✅ Make each tool call purposeful and justified by your reasoning.
✅ ONLY use tools that are explicitly listed in the available tools section.
✅ ONLY provide data that you have actually retrieved through tool calls.
✅ Verify tool names and parameters match exactly what is available.

#### MUST NOT DO:
❌ Use \`${finalToolName}\` to say "I have the data" without showing the actual data.
❌ Call any tool without including \`${reportToolName}\` in the same response.
❌ Skip the data gathering phase if information is needed.
❌ Make assumptions about data you haven't explicitly gathered via a tool call.
❌ NEVER invent, guess, or hallucinate data - only use actual tool results.
❌ NEVER use tools that don't exist in the provided tool list.
❌ NEVER assume tool parameters - check the schema requirements exactly.
❌ NEVER provide information you think might be true without verification through tools.

### EXAMPLES OF CORRECT BEHAVIOR

**Example 1: Simple Data Retrieval**
User: "Get information about X"
1. DATA GATHERING: tool_name("X") + ${reportToolName} + nextTasks("1. Process retrieved data, 2. Format comprehensive summary, 3. Use final tool to present complete information")
2. ANSWER PRESENTATION: ${finalToolName} + ${reportToolName} (using schema parameters)

**Example 2: Multi-Step Analysis**
User: "Analyze Y and provide summary"
1. DATA GATHERING: tool_name("Y") + ${reportToolName} + nextTasks("1. Analyze collected data, 2. Create comprehensive summary, 3. Use final tool to present complete analysis")
2. DATA GATHERING: tool_name(data) + ${reportToolName} + nextTasks("1. Compile all results, 2. Format user-friendly report, 3. Use final tool to present comprehensive findings")
3. ANSWER PRESENTATION: ${finalToolName} + ${reportToolName} (using schema parameters)
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

  private getFunctionCallingFormatInstructions(finalToolName: string, reportToolName: string, batchMode?: boolean): string {
    return `# 🚨 RESPONSE FORMAT: JSON CODE BLOCKS ONLY 🚨

## ABSOLUTE REQUIREMENT
- **ALL responses MUST be valid JSON code blocks**
- **NO plain text outside of JSON blocks**
- **NO explanatory text before or after JSON**
- **EVERY response must follow one of the two patterns below**

${this.getWorkflowRules(finalToolName, reportToolName)}
${this.getExecutionStrategy(batchMode)}

## 📋 EXACT OUTPUT FORMATS

### Format 1: Any Tool Call (with mandatory ${reportToolName})
\`\`\`json
{
  "functionCalls": [
    {
      "name": "tool_name_here",
      "arguments": "{\\"param1\\": \\"value1\\", \\"param2\\": \\"value2\\"}"
    },
    {
      "name": "${reportToolName}",
      "arguments": "{\\"report\\": \\"My reasoning: User wants [goal]. I need [data] to achieve this. Using [tool] because [specific_reason]. Expected outcome: [what_I_expect].\\\", \\\"nextTasks\\\": \\\"1. [next action], 2. [subsequent step], 3. Use final tool to present [comprehensive details]\\\"}"
    }
  ]
}
\`\`\`

### Format 2: Final Answer Presentation (also requires ${reportToolName})
\`\`\`json
{
  "functionCalls": [
    {
      "name": "${finalToolName}",
      "arguments": "[Check the ${finalToolName} tool schema below for exact parameters and structure]"
    },
    {
      "name": "${reportToolName}",
      "arguments": "{\\"report\\": \\"Task completed. I have [what was accomplished]\\\", \\\"nextTasks\\\": \\"Task is complete\\\"}"
    }
  ]
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
2. Did I include \`${reportToolName}\` with ALL tools (including ${finalToolName})?
3. Am I using the correct format (functionCalls vs functionCall)?
4. Have I properly escaped all special characters?
`;
  }

  private getYamlFormatInstructions(finalToolName: string, reportToolName: string, batchMode?: boolean): string {
    return `# 📋 RESPONSE FORMAT: YAML CODE BLOCKS ONLY

## ABSOLUTE REQUIREMENT
- **ALL responses MUST be valid YAML code blocks**
- **NO plain text outside of YAML blocks**
- **Use proper YAML syntax with correct indentation**

${this.getWorkflowRules(finalToolName, reportToolName)}
${this.getExecutionStrategy(batchMode)}

## 📋 EXACT OUTPUT FORMATS

### Format 1: Any Tool Call (with mandatory ${reportToolName})
\`\`\`yaml
tool_calls:
  - name: tool_name_here
    args:
      param1: value1
      param2: |
        Multi-line value
        can go here
  - name: ${reportToolName}
    args:
      report: |
        My reasoning: User wants [goal]. I need [data] to achieve this.
        Using [tool] because [specific_reason].
        Expected outcome: [what_I_expect].
      nextTasks: |
        1. [next action], 2. [subsequent step], 3. Use final tool to present [complete results]
\`\`\`

### Format 2: Final Answer Presentation (also requires ${reportToolName})
\`\`\`yaml
tool_calls:
  - name: ${finalToolName}
    args:
      [Check the ${finalToolName} tool schema below for exact parameters]
  - name: ${reportToolName}
    args:
      report: |
        Task completed. I have [what was accomplished]
      nextTasks: |
        Task is complete
\`\`\`

## ⚠️ YAML FORMATTING RULES
1. **Indentation**: Use 2 spaces (never tabs)
2. **Multi-line strings**: Use \`|\` for literal blocks (preserves indentation and structure)
3. **Lists**: Proper \`-\` prefix with consistent spacing
4. **No quotes needed**: Unless value contains special characters
5. **Tool names**: MUST match exactly from the available tools list
6. **Parameters**: MUST match the exact schema requirements
7. **No extra fields**: Don't add parameters not in the schema

## 🔍 MANDATORY SELF-CHECK BEFORE RESPONDING
1. Is my response a valid YAML code block?
2. Are ALL tool names from the provided available tools list?
3. Do ALL parameters match the exact schema requirements?
4. Am I using actual data from tool results, not making up information?
5. Did I include \`${reportToolName}\` with ALL tools (including ${finalToolName})?
6. Does my nextTasks describe the COMPLETE plan to the final tool call?
7. Does my nextTasks specify what comprehensive details I'll present to the user?
8. Have I verified every tool name and parameter against the schema?
`;
  }

  private getFormatInstructions(finalToolName: string, reportToolName: string, batchMode?: boolean): string {
    switch (this.responseFormat) {
      case FormatMode.FUNCTION_CALLING:
        return this.getFunctionCallingFormatInstructions(finalToolName, reportToolName, batchMode);
      case FormatMode.YAML:
        return this.getYamlFormatInstructions(finalToolName, reportToolName, batchMode);
      default:
        return this.getFunctionCallingFormatInstructions(finalToolName, reportToolName, batchMode);
    }
  }

  buildPrompt(params: BuildPromptParams): string {
    const {
      systemPrompt,
      userPrompt,
      context,
      currentInteractionHistory,
      prevInteractionHistory,
      lastError,
      keepRetry,
      finalToolName,
      reportToolName,
      toolDefinitions,
      options,
      nextTasks,
      conversationEntries,
      conversationLimitNote,
      errorRecoveryInstructions
    } = params;
    const sections: string[] = [];

    // System context
    sections.push(systemPrompt);

    // Core instructions
    sections.push(`${this.getFormatInstructions(finalToolName, reportToolName, options.batchMode)}`);

    // ENHANCED: Add immediate task directive if nextTasks exists
    if (nextTasks) {
      // Modify nextTasks to prioritize error fixing if lastError exists
      const adjustednextTasks = lastError 
        ? `Please fix this error first: ${lastError.getMessage()}, then you must continue to the following: ${nextTasks}`
        : nextTasks;
      sections.push(this.buildImmediateTaskDirective(adjustednextTasks, finalToolName));
    }

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

    // Current state - filter toolCallReports 
    const toolCallReports = currentInteractionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];
    sections.push(this.buildReportSection(toolCallReports, finalToolName, reportToolName, nextTasks));

    // Context if needed
    if (options.includeContext) {
      sections.push(this.buildContextSection(context, options));
    }

    // Previous history if needed
    if (options.includePreviousTaskHistory && prevInteractionHistory.length > 0) {
      sections.push(this.buildConversation(conversationEntries || [], conversationLimitNote || ''));
    }

    // Error recovery if needed
    if (lastError) {
      sections.push(this.buildErrorRecoverySection(finalToolName, reportToolName, lastError, keepRetry, errorRecoveryInstructions));
    }

    // Custom sections
    if (options.customSections) {
      Object.entries(options.customSections).forEach(([name, content]) => {
        sections.push(`# ${name.toUpperCase()}\n${content}`);
      });
    }

    // Final user request
    sections.push(this.buildUserRequestSection(userPrompt, finalToolName, reportToolName, nextTasks));

    return sections.join('\n\n---\n\n');
  }

  /**
   * ENHANCED: Build immediate task directive that appears early in the prompt
   */
  private buildImmediateTaskDirective(nextTasks: string, finalToolName: string): string {
    return `# 🎯 IMMEDIATE TASK DIRECTIVE - HIGHEST PRIORITY

## ⚡ YOUR CURRENT TASK (FROM PREVIOUS ANALYSIS):
> **${nextTasks}**

## 🚨 CRITICAL INSTRUCTIONS:
1. **THIS IS NOT A NEW REQUEST** - You already analyzed and decided this is your next step
2. **EXECUTE IMMEDIATELY** - Do not re-analyze or change plans
3. **FOLLOW YOUR OWN COMMAND** - The task above is what YOU determined needs to happen next
4. **NO DEVIATION** - Unless there's a critical error preventing execution

## 📌 CONTEXT:
- You have already completed some actions (see REPORTS AND RESULTS below)
- You determined the next logical step is: "${nextTasks}"
- Now execute this step without hesitation

================================================================================`;
  }

  buildReportSection(toolCallReports: ToolCallReport[], finalToolName: string, reportToolName: string, nextTasks?: string | null): string {
    if (toolCallReports.length === 0) {
      return `# 📊 REPORTS AND RESULTS (Your Internal Log)

## 🚨 CRITICAL DATA FRESHNESS NOTICE
🔒 **This section is PRIVATE** - The user cannot see this internal log.
⚡ **THIS IS YOUR MOST RECENT DATA** - This section will contain the LATEST, REAL-TIME information from your tool calls.
🎯 **DATA PRIORITY RULE**: ALWAYS use data from this section for user responses. Any data NOT in this section is OUTDATED.

## CURRENT STATUS: EMPTY
- **State**: No actions taken yet - NO FRESH DATA AVAILABLE
- **Critical Rule**: You have NO current data to present to the user
- **Next step**: Begin data gathering based on the user request in the "CURRENT TASK" section
- **Warning**: DO NOT use conversation history as real-time data - use it only for context understanding

## ⚠️ DATA USAGE RULES (EMPTY STATE)
❌ **FORBIDDEN**: Presenting any data from conversation history as current information
❌ **FORBIDDEN**: Telling user about data you "remember" from previous interactions
✅ **REQUIRED**: Use tools to gather fresh data before presenting any information to the user`;
    }

    const reportEntries = toolCallReports.map((report, idx) => {
      const toolSummary = report.toolCalls.map(tc =>
        `    - ${tc.context.toolName}: ${tc.context.success ? '✅ SUCCESS' : '❌ FAILED'} ${tc.context.error ? `(Error: ${tc.context.error})` : ''}`
      ).join('\n');
      
      // Note: nextTasks is now a separate property, not embedded in report text
      const nextActionHighlight = '';
      
      return `
### ACTION ${idx + 1} | ${new Date().toISOString()}
**Internal Reasoning**: ${report.report || 'No reasoning provided'}${nextActionHighlight}
**Overall Status**: ${report.overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}
**Tools Executed**:
${toolSummary}
**Raw Results**:
\`\`\`json
${JSON.stringify(report.toolCalls.map(tc => ({ name: tc.context.toolName, success: tc.context.success, context: tc.context })), null, 2)}
\`\`\`
${report.error ? `**Error Details**: ${report.error}` : ''}`;
    }).join('\n');

    return `# 📊 REPORTS AND RESULTS (Your Internal Log)

## 🚨 CRITICAL DATA FRESHNESS NOTICE
🔒 **This section is PRIVATE** - The user cannot see this internal log.
⚡ **THIS IS YOUR MOST RECENT DATA** - This section contains the LATEST, REAL-TIME information from your tool calls.
🎯 **DATA PRIORITY RULE**: ALWAYS use data from this section for user responses. Any data NOT in this section is OUTDATED.

## ⚠️ CONVERSATION HISTORY VS FRESH DATA
- **CONVERSATION HISTORY**: Use ONLY for understanding context and user intent - NOT for actual data
- **REPORTS AND RESULTS**: Use for ALL factual information and data presentation
- **FAILURE CONDITION**: Presenting outdated data from conversation history instead of fresh tool results is a FAILURE

## ACTION HISTORY
${reportEntries}

## 📦 FRESH DATA INVENTORY (USE THIS FOR USER RESPONSES)
🎯 **MANDATORY**: Only use data listed below for user responses. If data is missing, use tools to gather it.

**Available Fresh Data**:
${this.summarizeAvailableData(toolCallReports)}

## 🚫 DATA USAGE RULES
✅ **CORRECT**: Present data from tool results above
❌ **INCORRECT**: Use data from conversation history that isn't verified by recent tool calls
❌ **FAILURE**: Telling user about data you "remember" but haven't recently gathered via tools

## 🎯 PROGRESSION STATUS
${this.buildProgressionStatus(toolCallReports, nextTasks)}`;
  }

  /**
   * ENHANCED: Build a clear progression status
   */
  private buildProgressionStatus(reports: ToolCallReport[], nextTasks?: string | null): string {
    const lastReport = reports[reports.length - 1];
    
    if (nextTasks) {
      return `
### YOUR WORKFLOW PROGRESS:
1. **Last Completed Action**: ${lastReport?.toolCalls[0]?.context.toolName || 'Unknown'}
2. **Your Planned Next Step**: "${nextTasks}"
3. **Current Directive**: Execute the planned step now

⚠️ **IMPORTANT**: You are in the middle of a workflow. Continue with your planned action.`;
    }
    
    return `
### YOUR WORKFLOW PROGRESS:
- Review the action history above
- Determine what data is still needed
- Continue with the next logical step`;
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

  buildConversation(conversationEntries: ConversationEntry[], limitNote: string): string {
    const formattedEntries = conversationEntries.map((entry, idx) => {
      const parts = [];
      if (entry.user) {
        parts.push(`### 👤 USER REQUEST #${idx + 1}\n"${entry.user}"`);
      }
      if (entry.ai) {
        parts.push(`### 🤖 AGENT RESPONSE #${idx + 1}\n${entry.ai}`);
      }
      return parts.join('\n\n');
    }).join('\n\n');

    return `# 💬 CONVERSATION HISTORY${limitNote}

## 🚨 CRITICAL: CONTEXT ONLY - NOT REAL-TIME DATA
⚠️ **DATA FRESHNESS WARNING**: This section contains OUTDATED information for CONTEXT UNDERSTANDING ONLY
🎯 **PRIMARY PURPOSE**: Understanding user intent and request context - NOT for factual data presentation
🚫 **FORBIDDEN**: Using data from this section in user responses unless explicitly requested by user

## ⚠️ STRICT USAGE RULES
✅ **CORRECT USE**: Understanding what the user wants, their communication style, request patterns
❌ **INCORRECT USE**: Presenting file contents, data, or information from here as current facts
❌ **FAILURE CONDITION**: Telling user about data from conversation history instead of using fresh tool results

## PREVIOUS INTERACTIONS (FOR CONTEXT ONLY)
${formattedEntries}

## WHEN TO USE CONVERSATION DATA
✅ **USE when**: User explicitly says "like before", "the same file from earlier", "as we discussed"
✅ **USE when**: Understanding user's request context and intent
❌ **NEVER USE**: As a source of current data or factual information for responses`;
  }

  /**
   * ENHANCED: Build user request section with clear task progression
   */
  buildUserRequestSection(userPrompt: string, finalToolName: string, reportToolName: string, nextTasks?: string | null): string {
    // If there's a nextTasks, emphasize continuation rather than fresh analysis
    if (nextTasks) {
      return `# 🎯 CURRENT TASK & IMMEDIATE ACTION

## ORIGINAL USER REQUEST (FOR REFERENCE)
> "${userPrompt}"

## ⚡ YOUR IMMEDIATE ACTION
You have already analyzed this request and determined your next step.

### 🔴 DO NOT:
- Re-analyze the user's request from scratch
- Change your planned approach
- Repeat previous tool calls

### 🟢 DO:
- Execute the task you planned: "${nextTasks}"
- Use the data you've already gathered
- Continue progressing toward the final answer

## DECISION POINT
Based on your previous analysis and the task "${nextTasks}":
- If this involves gathering more data → Execute the specific tool call now
- If this involves presenting the final answer → Use \`${finalToolName}\` with all gathered data

## EXECUTE NOW
Stop reading and execute your planned action immediately.`;
    }

    // Original behavior for fresh requests
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
3. Call the tool WITH a \`${reportToolName}\` explaining your reasoning
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
- DON'T forget the \`${reportToolName}\` tool when gathering data
- DON'T make assumptions - gather actual data

## ✅ SIGNS OF CORRECT EXECUTION
- Each data-gathering includes clear reasoning via \`${reportToolName}\`
- The final answer includes all requested information
- User receives complete, formatted results via \`${finalToolName}\`
- No steps are skipped or combined inappropriately

## YOUR IMMEDIATE NEXT ACTION
Based on the checklist above, your next response should be:
[Determine this yourself based on the decision framework]`;
  }

  buildErrorRecoverySection(
    finalToolName: string,
    reportToolName: string,
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
- Include \`${reportToolName}\` with new reasoning that explains the change in strategy

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
- **Message**: **${error.message}**
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