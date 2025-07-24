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
  private getWorkflowRules(finalToolName: string): string {
    return `
## 🧠 CORE INSTRUCTIONS & THINKING PROCESS

### PRIMARY OBJECTIVE
You are an AI assistant designed to fulfill user requests through a strict two-phase process:
1. **DATA GATHERING PHASE**: Collect all necessary information using available tools
2. **ANSWER PRESENTATION PHASE**: Present the complete answer to the user using \`${finalToolName}\`

### CRITICAL CONSTRAINTS
- You MUST complete both phases for every request
- You CANNOT skip directly to presenting without gathering required data
- You CANNOT end without presenting the answer via \`${finalToolName}\`

### The 'report' Tool (Your Internal Monologue)
The \`report\` tool is your private reasoning space that helps maintain clarity:
- **Purpose**: Document your thought process and decision-making
- **Visibility**: NEVER shown to the user - for internal use only
- **Usage**: MUST accompany every data-gathering tool call
- **Format**: "My reasoning: [current_goal] → [why_this_tool] → [expected_outcome]"

### STEP-BY-STEP DECISION FRAMEWORK

#### Step 1: Understand the Request
- What specific output does the user expect?
- What data/information is required to fulfill this request?
- What is the success criteria?

#### Step 2: Assess Current State
Review your "REPORTS AND RESULTS" section:
- What data have you already gathered?
- Is this data sufficient to answer the user's request completely?
- Are there any gaps or missing pieces?

#### Step 3: Execute Action
Based on your assessment, choose ONE of these paths:

**PATH A - Data Gathering (when you need more information)**
- Identify the specific data gap
- Select the appropriate tool to fill this gap
- Execute tool call WITH report explaining your reasoning
- Format:
  \`\`\`
  Tool: [tool_name] + report
  Reasoning: "I need [data_type] to [purpose]. Using [tool_name] because [reason]."
  \`\`\`

**PATH B - Answer Presentation (when you have all required data)**
- Synthesize all gathered data into a complete answer
- Format the answer to be clear, helpful, and directly addressing the request
- Use \`${finalToolName}\` to deliver this answer
- Format:
  \`\`\`
  Tool: ${finalToolName}
  Content: [Complete, formatted answer based on gathered data]
  \`\`\`

### 🚨 CRITICAL RULES & ANTI-PATTERNS

#### MUST DO:
✅ Always use \`report\` with data-gathering tools
✅ Present actual data/results, not just confirmation of having data
✅ Complete the full workflow before considering the task done
✅ Make each tool call purposeful and justified

#### MUST NOT DO:
❌ Use \`${finalToolName}\` to say "I have the data" without showing it
❌ Combine \`${finalToolName}\` with other tools in the same call
❌ Skip the data gathering phase if information is needed
❌ Make assumptions about data you haven't explicitly gathered

### EXAMPLES OF CORRECT BEHAVIOR

**Example 1: File Reading Request**
User: "Show me the contents of config.json"
1. DATA GATHERING: read_file("config.json") + report("Reading config.json to show user its contents")
2. ANSWER PRESENTATION: ${finalToolName}("Here are the contents of config.json: [actual contents]")

**Example 2: Multi-Step Analysis**
User: "List all Python files and show their sizes"
1. DATA GATHERING: list_directory(".") + report("Listing directory to find Python files")
2. DATA GATHERING: get_file_info([files]) + report("Getting size information for Python files")
3. ANSWER PRESENTATION: ${finalToolName}("Found X Python files: [formatted list with sizes]")
`;
  }

  private getExecutionStrategy(parallelExecution: boolean): string {
    const strategy = parallelExecution ? `
### EXECUTION STRATEGY: PARALLEL MODE
- **Capability**: Execute multiple independent tools simultaneously
- **When to use**: When gathering multiple pieces of unrelated data
- **Constraint**: Tools must not depend on each other's outputs
- **Example**: Reading multiple files that don't reference each other` : `
### EXECUTION STRATEGY: SEQUENTIAL MODE
- **Capability**: Execute tools one at a time in order
- **When to use**: When tool outputs depend on previous results
- **Constraint**: Wait for each tool to complete before proceeding
- **Example**: List directory → filter results → read specific files`;
    
    return strategy;
  }

  private getFunctionCallingFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `# 🚨 RESPONSE FORMAT: JSON CODE BLOCKS ONLY 🚨

## ABSOLUTE REQUIREMENT
- **ALL responses MUST be valid JSON code blocks**
- **NO plain text outside of JSON blocks**
- **NO explanatory text before or after JSON**
- **EVERY response must follow one of the two patterns below**

${this.getWorkflowRules(finalToolName)}
${this.getExecutionStrategy(parallelExecution)}

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
      "arguments": "{\\"report\\": \\"My reasoning: User wants [goal]. I need [data] to achieve this. Using [tool] because [specific_reason]. Expected outcome: [what_I_expect].\\"}"
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

  private getYamlFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    return `# 📋 RESPONSE FORMAT: YAML CODE BLOCKS ONLY

## ABSOLUTE REQUIREMENT
- **ALL responses MUST be valid YAML code blocks**
- **NO plain text outside of YAML blocks**
- **Use proper YAML syntax with correct indentation**

${this.getWorkflowRules(finalToolName)}
${this.getExecutionStrategy(parallelExecution)}

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

  private getFormatInstructions(finalToolName: string, parallelExecution: boolean): string {
    switch (this.responseFormat) {
      case FormatType.FUNCTION_CALLING:
        return this.getFunctionCallingFormatInstructions(finalToolName, parallelExecution);
      case FormatType.YAML:
        return this.getYamlFormatInstructions(finalToolName, parallelExecution);
      default:
        return this.getFunctionCallingFormatInstructions(finalToolName, parallelExecution);
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
    sections.push(`${this.getFormatInstructions(finalToolName, options.parallelExecution || false)}`);
    
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
- **State**: No actions taken yet
- **User visibility**: This section is NEVER shown to the user
- **Next step**: Begin data gathering based on user request

## REMINDER
This is your working memory. Each action you take will be recorded here with:
- Your reasoning (from \`report\` tool)
- Tool calls made and their results
- Success/failure status
- Any errors encountered`;
    }

    const reportEntries = toolCallReports.map((report, idx) => {
      const toolSummary = report.toolCalls.map(tc => 
        `    - ${tc.context.toolName}: ${tc.context.success ? 'SUCCESS' : 'FAILED'} ${tc.context.error ? `(Error: ${tc.context.error})` : ''}`
      ).join('\n');
      
      return `
### ACTION ${idx + 1} | ${new Date().toISOString()}
**Internal Reasoning**: ${report.report || 'No reasoning provided'}
**Overall Status**: ${report.overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}
**Tools Executed**:
${toolSummary}
**Raw Results**:
\`\`\`json
${JSON.stringify(report.toolCalls.map(tc => ({name: tc.context.toolName, success: tc.context.success, context: tc.context})), null, 2)}
\`\`\`
${report.error ? `**Error Details**: ${report.error}` : ''}`;
    }).join('\n');

    return `# 📊 REPORTS AND RESULTS (Your Internal Log)

## VISIBILITY NOTICE
🔒 **This section is PRIVATE** - User cannot see this internal log

## ACTION HISTORY
${reportEntries}

## CURRENT DATA INVENTORY
Based on the above actions, you currently have access to:
${this.summarizeAvailableData(toolCallReports)}`;
  }

  private summarizeAvailableData(reports: ToolCallReport[]): string {
    const successfulCalls = reports
      .flatMap(r => r.toolCalls)
      .filter(tc => tc.context.success);
    
    if (successfulCalls.length === 0) {
      return "- No successfully gathered data yet";
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
