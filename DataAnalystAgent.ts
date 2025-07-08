import { AgentLoop, AgentLoopOptions, ChatEntry, IToolCallRecord, IToolResult, ToolDefinition } from '../agent-library';
import { AIProvider } from './AgentLoop/AIProvider';
import { IDatabaseManager } from '../database/IDatabaseManager';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { PythonShell } from 'python-shell';
import { DataAnalystParser, PendingToolCall } from './DataAnalystParser';
import { AgentError, AgentErrorType } from './AgentLoop/AgentError';

/**
 * DataAnalystAgent is a specialized agent for handling data extraction and analysis tasks.
 */

export type ToolExecutionResult = IToolResult & {
  visualisation: string;
  output: string;
}

type AgentToolCallRecord = IToolCallRecord & {
  timestamp: string;
  result: string;
}

interface AgentToolDefinition extends ToolDefinition<PendingToolCall, ToolExecutionResult> {
  name: string;
  description: string;
  handler(pendingToolCall: PendingToolCall, toolChainData: any): Promise<ToolExecutionResult>;
}


export class DataAnalystAgent extends AgentLoop<PendingToolCall, ToolExecutionResult, AgentToolCallRecord> {
  getConversationHistory(): ChatEntry[] {
    return this.conversationHistory
  }
  onToolCallFail(error: AgentError): AgentToolCallRecord {
    return {
      toolname: error.toolname || 'unknown',
      toolid: error.toolid || 'unknown',
      succuss: false,
      timestamp: new Date().toISOString(),
      result: error.message
    }
  }
  onToolCallSuccess(toolResult: ToolExecutionResult): AgentToolCallRecord {

    return {
      toolname: toolResult.toolname,
      toolid: toolResult.toolid,
      succuss: true,
      timestamp: new Date().toISOString(),
      result: toolResult.output
    }

  }

  private dbManager: IDatabaseManager;
  private workingDirectory: string;

  private conversationHistory: ChatEntry[] = []


  protected systemPrompt: string =
    `You are DataSage, an autonomous AI data analyst. Your primary purpose is to translate user requests into a sequence of tool calls.

# Core Directives:
1.  **Check History First:** Before planning new tool calls, review the history. If data from a previous turn is sufficient to answer the current request, simply call final tool. 
2.  **Plan Your Tools:** Generate a sequence of tool calls to get the answer.
3.  **Final Answer is Mandatory:** Always conclude your work for a given user request by calling the 'final' tool. This is your only way to communicate with the user.

# Tool Workflows:
- **Simple Retrieval (e.g., "How many users?"):**
  1. 'extraction' to get the number.
  2. 'final' to present the number.
- **Complex Analysis (e.g., "Chart of users by country"):**
  1. 'extraction' to get the raw user and country data.
  2. 'analysis' to process the data and generate the chart.
  3. 'final' to present the result.

# How to use your tools
  you should respond accordingly
  For **Simple Retrieval**
    <tool_list>
    <tool>
      <id></id>
      <name>extraction</name>
      
      <value>valid sql code for extraction</value>
    </tool>
    </tool_list>

  For **Complex Analysis**
    <tool_list>
    <tool>
      <id></id>
      <name>extraction</name>
      <value>valid sql code for extraction</value>
    </tool>
    <tool>
      <id></id>
      <name>analysis</name>
      <value>valid python code</value>
    </tool>
    </tool_list>

    # Once you have all the required information that the user needs, just call final tool
    <tool_list>
    <tool>
      <id></id>
      <name>final</name>
      <value>Detail response for the users question</value>
      </tool>
    </tool_list>


  
  `
  t



  constructor(provider: AIProvider, dbManager: IDatabaseManager, workingDirectory: string, options: AgentLoopOptions) {
    super(provider, new DataAnalystParser(), options);
    this.dbManager = dbManager;
    this.workingDirectory = workingDirectory;

    this.tools = [
      {
        name: 'extraction',
        description: 'Runs a read-only SQL SELECT query to get data from the database. The result is saved to a CSV file. This is the first step for any data task.',
        handler: (pendingToolCall: PendingToolCall, toolChainData: any) => this.handleExtraction(pendingToolCall, toolChainData),
      },
      {
        name: 'analysis',
        description: `Runs a Python script to analyze data from a previous extraction step. You MUST use the '{{lastFileName}}' placeholder to access the data.
        - your python must do calculations, analysis and  MUST print a single JSON object with two keys: "discussion" (a string summarizing the finding) and "visualisation" (a string of the Plotly JSON from fig.to_json()).

        Look the following example: 
        
import pandas as pd
import json
import plotly.express as px

# Assuming the last extracted file's name is stored in the variable '{{lastFileName}}'
file_name = '{{lastFileName}}'

# Load the data from the file
df = pd.read_csv(file_name)

# Perform some basic analysis, for example calculating summary statistics
mean_value = df['value'].mean()
median_value = df['value'].median()
std_dev_value = df['value'].std()

# Perform any necessary calculations
# (You can customize this to suit your analysis needs)
correlation_matrix = df.corr()

# Prepare the discussion (analysis)
discussion = f"The analysis of the 'value' column reveals a mean of {mean_value:.2f}, a median of {median_value:.2f}, and a standard deviation of {std_dev_value:.2f}. The data seems to be { 'normally distributed' if abs(mean_value - median_value) < 0.1 else 'skewed' }."

# Prepare the final output dictionary
output = {
    "discussion": discussion
}

# Optionally generate visualization if needed
generate_visualization = True  # Set to True if you want to include visualisation

if generate_visualization:
    # Create a simple visualization using Plotly
    fig = px.histogram(df, x='value', title="Histogram of Values")
    
    # Add visualization to the output dictionary
    output["visualisation"] = fig.to_json()

# Print the data as a JSON string
print(json.dumps(output))

        
        `,
        handler: (pendingToolCall: PendingToolCall, toolChainData: any) => this.handleAnalysis(pendingToolCall, toolChainData),
      },

      // You do not need to overide by calling final
      {
        name: 'final',
        description: 'Call this tool ONLY when you have the complete answer for the user. The input should be a concluding, natural language sentence.',
        handler: async (pendingToolCall: PendingToolCall, toolChainData: any) => this.handleFinal(pendingToolCall, toolChainData),
      },
    ];
  }

  public async run(userPrompt: string, context?: Record<string, any>): Promise<ToolExecutionResult> {

    try {
      this.conversationHistory.push(
        {
          sender: "user",
          message: userPrompt
        }
      )
      const result = await super.run(userPrompt, context);

      this.conversationHistory.push(
        {
          sender: "ai",
          message: result.output
        }
      )

      return result
    } catch (error) {

      this.conversationHistory.push(
        {
          sender: "system",
          message: error instanceof Error ? error.message : String(error)
        }
      )
      throw error
    }

  }

  private async handleExtraction(pendingToolCall: PendingToolCall, toolChainData: any): Promise<ToolExecutionResult> {
    try {
      const sqlResult = await this.dbManager.executeQuery(pendingToolCall.value);
      if (!sqlResult.success) {
        throw new AgentError(
          `Error: ${sqlResult.message}`,
          AgentErrorType.TOOL_EXECUTION_ERROR,
          pendingToolCall.name,
          pendingToolCall.id
        );
      }

      let outputText = 'Query executed successfully. No rows returned.';
      let filename: string | undefined;

      if (sqlResult.data && sqlResult.data.rows.length > 0) {
        outputText = `Query returned ${sqlResult.data.rows.length} rows.`;
        const csvContent = this.convertToCSV(sqlResult.data);

        this.logger.debug({ csvContent })

        outputText += csvContent;

        const uniqueFileName = `extraction_result_${randomUUID()}.csv`;
        const filePath = join(this.workingDirectory, uniqueFileName);
        writeFileSync(filePath, csvContent, 'utf-8');
        filename = uniqueFileName;
        this.logger.info(`[DataAnalystAgent] Saved extraction result to: ${filePath}`);
      } else if (sqlResult.data?.headers) {
        outputText = `Query executed successfully, but returned no rows. Columns are: [${sqlResult.data.headers.join(', ')}]`
      }

      toolChainData.filename = filename;

      return {
        toolname: pendingToolCall.name,
        toolid: pendingToolCall.id,
        succuss: true,
        output: outputText,
        visualisation: ''
      };
    } catch (error) {
      this.logger.error('[DataAnalystAgent.handleExtraction] Failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentError(
        `Error: ${message}`,
        AgentErrorType.TOOL_EXECUTION_ERROR,
        pendingToolCall.name,
        pendingToolCall.id
      );
    }
  }

  private async handleAnalysis(pendingToolCall: PendingToolCall, toolChainData: any): Promise<ToolExecutionResult> {
    let tempFilePath: string | undefined;

    try {
      const pythonCode = pendingToolCall.value;

      if (!pythonCode.includes(".csv") && !pythonCode.includes("{{lastFileName}}")) {
        this.logger.debug("Error: The python code does not seem to reference a data file. You must use a placeholder like '{{lastFileName}}' which comes from a prior 'extraction' step.")
        throw new AgentError(
          "Error: The python code does not seem to reference a data file. You must use a placeholder like '{{lastFileName}}' which comes from a prior 'extraction' step.",
          AgentErrorType.TOOL_EXECUTION_ERROR,
          pendingToolCall.name,
          pendingToolCall.id
        )
      }

      if (pythonCode.includes("{{lastFileName}}")) {
        if (!toolChainData?.filename) {
          throw new AgentError(
            "Error: The extraction tool does not provide necessary data, you must use extraction tool first",
            AgentErrorType.TOOL_EXECUTION_ERROR,
            pendingToolCall.name,
            pendingToolCall.id
          );
        }
      }
      const processedPythonCode = pythonCode.replaceAll("{{lastFileName}}", toolChainData.filename);


      const tempFileName = `analysis_${Date.now()}_${randomUUID()}.py`;
      tempFilePath = join(tmpdir(), tempFileName);
      writeFileSync(tempFilePath, processedPythonCode, 'utf-8');

      const options = {
        mode: 'text' as const,
        pythonPath: 'python',
        pythonOptions: ['-u'],
        scriptPath: tmpdir(),
        cwd: this.workingDirectory,
      };

      const results = await PythonShell.run(tempFileName, options);
      const resultString = (results || []).join('\n');


      const { discussion, visualisation } = JSON.parse(resultString)

      toolChainData.visualisation = visualisation;

      // adding message will not make to send the output
      return {
        toolname: pendingToolCall.name,
        toolid: pendingToolCall.id,
        succuss: true,
        output: discussion,
        visualisation: visualisation,
      };

    } catch (error) {
      this.logger.error('[DataAnalystAgent.handleAnalysis] Failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentError(
        `Error: ${message}`,
        AgentErrorType.TOOL_EXECUTION_ERROR,
        pendingToolCall.name,
        pendingToolCall.id
      );
    } finally {
      if (tempFilePath) {
        try { unlinkSync(tempFilePath); } catch (e) { this.logger.warn(`Failed to cleanup temp file: ${tempFilePath}`); }
      }
    }

  }

  private convertToCSV(data: any): string {
    const { rows, headers } = data;
    if (!rows || rows.length === 0) return '';
    const csvHeader = headers.join(',');
    const csvRows = rows.map((row: any[]) =>
      row.map((cell: any) => {
        if (cell === null || cell === undefined) return '';
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    );
    return [csvHeader, ...csvRows].join('\n');
  }

  /**
   * Custom handler for the 'final' tool in DataAnalystAgent. Can be extended for logging or post-processing.
   */
  protected handleFinal(pendingToolCall: PendingToolCall, toolChainData: any): ToolExecutionResult {
    // You can add custom logic here if needed (e.g., logging, formatting)
    const visualisation = toolChainData && 'visualisation' in toolChainData ? toolChainData.visualisation : undefined;


    return {
      toolname: pendingToolCall.name,
      toolid: pendingToolCall.id,
      succuss: true,
      output: pendingToolCall.value,
      visualisation: visualisation || ''
    };
  }


}