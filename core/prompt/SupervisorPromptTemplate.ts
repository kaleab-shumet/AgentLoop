import { Interaction, PromptOptions, ToolCallReport } from '../types/types';
import { AgentError } from '../utils/AgentError';
import { BasePromptTemplate, WorkerPromptParams, SupervisorPromptParams } from './BasePromptTemplate';

/**
 * Supervisor prompt template for internal agent supervision
 * The supervisor agent has two main tools: talk_to_user and command_worker
 */
export class SupervisorPromptTemplate implements BasePromptTemplate {
  
  constructor() {}

  /**
   * Generate core supervision logic and decision framework
   */
  private getSupervisionRules(): string {
    return `## SUPERVISOR AGENT DECISION FRAMEWORK

### Your Role
You are a supervisor agent that coordinates between the user and a worker agent. You have two primary tools:
1. **talk_to_user**: Communicate directly with the user when needed
2. **command_worker**: Send commands to the worker agent to execute tasks

### 🚨 CRITICAL DECISION PROCESS
**ALWAYS follow this decision process in order:**

1. **Check for Worker Reports**: If there are worker execution results, analyze them FIRST
2. **Evaluate Outcomes**: Determine if the worker succeeded, failed, or needs guidance
3. **Decide Next Action**: Based on worker results, choose your next step

### 🎯 Decision Logic Based on Worker Results

**When Worker Reports Success:**
- ✅ Use 'talk_to_user' to present results to the user
- Include specific details about what was accomplished
- Explain the outcome in a friendly, helpful manner

**When Worker Reports Failure:**
- 📋 Analyze the failure reason from worker report
- Either: Use 'command_worker' with clearer/different instructions
- Or: Use 'talk_to_user' to ask user for clarification

**When No Worker Reports (Initial Request):**
- 🔍 Analyze user request to understand what they want
- Use 'command_worker' to execute the requested task
- Give specific, actionable commands to the worker

### Command Strategy for Worker
- Give **specific, actionable commands** with clear expected outcomes
- Keep commands focused and direct
- Example: "Execute the requested operation"
- Example: "Process the data as specified"

### Communication Rules with User
- **Present worker results** when tasks complete successfully
- **Ask for clarification** when requests are unclear or when worker fails
- **Provide helpful context** about what was accomplished or attempted

### Critical Constraints
- 🚨 **ALWAYS analyze worker reports before making decisions**
- ❌ NEVER execute tools directly - only command the worker agent
- ❌ NEVER ignore worker execution results
- ✅ Always respond appropriately to what the worker accomplished
- ✅ Present worker success results to the user immediately
`;
  }

  /**
   * Generate format instructions for supervisor responses
   */
  private getFormatInstructions(): string {
    return `# 🚨 CRITICAL: SUPERVISOR RESPONSE FORMAT 🚨

## ⚠️ MANDATORY: NO PLAIN TEXT - ONLY JSON CODE BLOCKS ⚠️
🚨 **CRITICAL**: You MUST NOT respond with plain text. EVERY response MUST be a JSON code block.
🚨 **CRITICAL**: You MUST NOT write explanations outside of JSON code blocks.
🚨 **CRITICAL**: You MUST respond with \`\`\`json at the start of your response.

## 🚨 OUTPUT FORMAT REQUIREMENTS 🚨
You MUST respond with JSON in code blocks. Follow these patterns exactly:

### JSON Format Patterns

**User Communication**:
\`\`\`json
{
  "functionCall": {
    "name": "talk_to_user",
    "arguments": "{\\"message\\": \\"Your message to the user\\"}"
  }
}
\`\`\`

**Worker Command**:
\`\`\`json
{
  "functionCall": {
    "name": "command_worker",
    "arguments": "{\\"command\\": \\"Specific command for the worker agent\\", \\"context\\": \\"Additional context or expected outcome\\"}"
  }
}
\`\`\`

### Formatting Requirements
- ✅ Use "functionCall" (singular) for single tool execution
- ✅ Arguments as JSON strings with escaped quotes
- ✅ Include ALL required parameters from schemas
- ❌ NEVER use multiple tools simultaneously
- ❌ NEVER execute tasks directly - always command the worker agent

🚨 **CRITICAL RULE**: Whenever you use 'command_worker', you MUST also call 'supervisor_report' in the same response to document progress. Use "functionCalls" (plural) for this:

\`\`\`json
{
  "functionCalls": [
    {"name": "command_worker", "arguments": "{\\"command\\": \\"Your command\\"}"},
    {"name": "supervisor_report", "arguments": "{\\"report\\": \\"Progress update with user request, completed actions, and next steps\\"}"}
  ]
}
\`\`\``;
  }

  buildPrompt(params: WorkerPromptParams | SupervisorPromptParams): string {
    if (params.type === 'supervisor') {
      return this.buildSupervisorPrompt(params);
    }
    throw new Error('SupervisorPromptTemplate only supports SupervisorPromptParams');
  }

  private buildSupervisorPrompt(params: SupervisorPromptParams): string {
    const {
      systemPrompt,
      userPrompt,
      context,
      currentInteractionHistory,
      prevInteractionHistory,
      lastError,
      keepRetry,
      toolDefinitions,
      options,
      errorRecoveryInstructions,
      workerReport
    } = params;

    return `${this.getSystemSection(systemPrompt)}

${this.getFormatSection()}

${this.getSupervisionSection()}

${this.getToolsSection(toolDefinitions)}

${this.getWorkerReportSection(workerReport)}

${this.getReportsSection(currentInteractionHistory)}

${this.getContextSection(context, options)}

${this.getPreviousHistorySection(prevInteractionHistory, options)}

${this.getErrorRecoverySection(lastError, keepRetry, errorRecoveryInstructions)}

${this.getCustomSections(options)}

${this.getUserRequestSection(userPrompt)}`;
  }

  private getWorkerReportSection(workerReport?: string): string {
    if (!workerReport) {
      return '';
    }
    
    return `# 📋 WORKER EXECUTION REPORT

🔍 **Latest Worker Results:**
${workerReport}

🎯 **Action Required:** Based on the worker's report above, decide whether to:
- Use 'talk_to_user' to present the results if worker was successful
- Use 'command_worker' to give further instructions if more work is needed
- Use 'talk_to_user' to ask for clarification if worker encountered issues

`;
  }

  private getSystemSection(systemPrompt: string): string {
    return systemPrompt;
  }

  private getFormatSection(): string {
    return `🚨🚨🚨 CRITICAL: SUPERVISOR AGENT - RESPOND ONLY WITH JSON CODE BLOCKS 🚨🚨🚨

${this.getFormatInstructions()}`;
  }

  private getSupervisionSection(): string {
    return this.getSupervisionRules();
  }

  private getToolsSection(toolDefinitions: string): string {
    return `# AVAILABLE SUPERVISOR TOOLS
📋 **Schema Compliance Requirements:**
- Parameter names are CASE-SENSITIVE
- ALL required parameters MUST be included
- Follow exact data types specified in schemas
- Review tool descriptions for usage context

${toolDefinitions}`;
  }

  private getReportsSection(currentInteractionHistory: Interaction[]): string {
    return this.buildReportSection(currentInteractionHistory);
  }

  private getContextSection(context: Record<string, any>, options: PromptOptions): string {
    if (!options.includeContext) return '';
    return this.buildContextSection(context, options);
  }

  private getPreviousHistorySection(prevInteractionHistory: Interaction[], options: PromptOptions): string {
    if (!options.includePreviousTaskHistory || prevInteractionHistory.length === 0) return '';
    return this.buildPreviousTaskHistory(prevInteractionHistory, options);
  }

  private getErrorRecoverySection(
    lastError: AgentError | null,
    keepRetry: boolean,
    errorRecoveryInstructions?: string
  ): string {
    if (!lastError) return '';
    return this.buildErrorRecoverySection(lastError, keepRetry, errorRecoveryInstructions);
  }

  private getCustomSections(options: PromptOptions): string {
    if (!options.customSections) return '';
    
    return Object.entries(options.customSections)
      .map(([name, content]) => `# ${name.toUpperCase()}\n${content}`)
      .join('\n\n');
  }

  private getUserRequestSection(userPrompt: string): string {
    return this.buildUserRequestSection(userPrompt);
  }

  buildReportSection(interactionHistory: Interaction[]): string {
    const toolCallReports = interactionHistory.filter(i => 'toolCalls' in i) as ToolCallReport[];

    if (toolCallReports.length === 0) {
      return `# SUPERVISOR REPORTS AND RESULTS
📋 **No reports available yet.**
🎯 **As supervisor**: Analyze user request and decide whether to talk_to_user or command_worker
💡 **Remember**: You coordinate between user and worker agent - you don't execute tasks directly`;
    }

    // Find the most recent worker report
    const workerReports = toolCallReports.filter(report => 
      report.report && !report.report.includes("Supervisor")
    );
    
    const latestWorkerReport = workerReports[workerReports.length - 1];

    let formattedSection = `# SUPERVISOR REPORTS AND RESULTS

## 🔍 CRITICAL: ANALYZE WORKER RESULTS BEFORE DECIDING NEXT ACTION

`;

    if (latestWorkerReport) {
      formattedSection += `### 📊 Latest Worker Execution Results:
**Worker Report**: "${latestWorkerReport.report}"
**Overall Success**: ${latestWorkerReport.overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}
**Error Details**: ${latestWorkerReport.error || 'None'}

### 🔍 Worker Tool Results Analysis:
`;

      if (latestWorkerReport.toolCalls && latestWorkerReport.toolCalls.length > 0) {
        latestWorkerReport.toolCalls.forEach((toolCall, idx) => {
          const context = toolCall.context;
          formattedSection += `**Tool ${idx + 1}: ${context.toolName}**
   - Status: ${context.success ? '✅ Success' : '❌ Failed'}
   - Details: ${JSON.stringify(context, null, 2)}

`;
        });
      }

      formattedSection += `### 🎯 SUPERVISOR DECISION FRAMEWORK:
Based on the worker results above, you must decide:

**If worker was successful:**
- Use 'talk_to_user' to present the results to the user
- Explain what was accomplished in a friendly, helpful way
- Include specific details from the worker's execution

**If worker failed or needs clarification:**
- Use 'command_worker' with more specific/different instructions
- OR use 'talk_to_user' to ask the user for clarification

**If task is complete:**
- Use 'talk_to_user' to provide final summary and results

`;
    }

    // Show supervision history summary
    formattedSection += `## 📝 Supervision History Summary:
${toolCallReports.map((report, idx) => `${idx + 1}. ${report.report} - ${report.overallSuccess ? '✅' : '❌'}`).join('\n')}

🚨 **CRITICAL**: You must analyze the worker's results above and respond appropriately to the user based on what the worker accomplished or failed to accomplish.`;

    return formattedSection;
  }

  buildContextSection(context: Record<string, any>, options: PromptOptions): string {
    if (Object.keys(context).length === 0) {
      return `# CONTEXT
📋 No additional context provided for this supervision task.`;
    }

    const contextEntries = Object.entries(context)
      .map(([key, value]) => {
        const displayValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return `### ${key}\n${displayValue}`;
      })
      .join('\n\n');

    return `# CONTEXT
🔍 **Available Context Data for Supervision:**

${contextEntries}`;
  }

  buildPreviousTaskHistory(prevInteractionHistory: Interaction[], options: PromptOptions): string {
    const entries = options.maxPreviousTaskEntries
      ? prevInteractionHistory.slice(-options.maxPreviousTaskEntries)
      : prevInteractionHistory;

    const entryCount = entries.length;
    const limitNote = options.maxPreviousTaskEntries
      ? ` (showing last ${Math.min(entryCount, options.maxPreviousTaskEntries)} entries)`
      : '';

    return `# PREVIOUS SUPERVISION HISTORY
📚 **Reference Information from Past Supervision Sessions**${limitNote}
⚠️ Use this for context only - focus on current supervision task

${JSON.stringify(entries, null, 2)}`;
  }

  buildUserRequestSection(userPrompt: string): string {
    return `# USER REQUEST
🎯 **Current user request:** "${userPrompt}"

📋 **Supervision Decision Process:**
1. **Analyze Request**: What does the user want to accomplish?
2. **Plan Approach**: Can the worker agent handle this directly or does it need breakdown?
3. **Choose Action**:
   - If need clarification → talk_to_user
   - If ready to execute → command_worker with specific instructions
   - If complex task → command_worker with step-by-step guidance
4. **Monitor Results**: Review worker agent's execution and decide next action
5. **Present Results**: Use talk_to_user to deliver final results to user

⚡ **Focus**: How can I best supervise the execution of this request?`;
  }

  buildErrorRecoverySection(
    error: AgentError | null,
    keepRetry: boolean,
    errorRecoveryInstructions?: string
  ): string {
    if (!error) return '';

    const defaultRetryInstructions = "📋 **Supervision Recovery Steps:**\n1. Analyze what went wrong in supervision or worker agent execution\n2. Identify if error was in command clarity or worker agent capability\n3. Modify supervision approach - clearer commands or different strategy\n4. Retry with improved supervision or talk to user if unsolvable";

    const maxRetryMessage = `🚫 **Maximum Supervision Retries Exceeded**\nUse 'talk_to_user' to:\n- Explain what was attempted\n- Describe what failed and why\n- Ask user for guidance or different approach`;

    const retryInstruction = keepRetry
      ? (errorRecoveryInstructions || defaultRetryInstructions)
      : maxRetryMessage;

    const errorType = error.type ? ` (${error.type})` : '';

    return `# SUPERVISION ERROR RECOVERY
⚠️ **Last Supervision Error**${errorType}: ${error.message}

${retryInstruction}`;
  }
}