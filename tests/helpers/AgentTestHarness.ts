import { AgentLoop } from '../../core/agents/AgentLoop';
import { AIProvider } from '../../core/providers/AIProvider';
import { ToolDefinition, ToolResult, ChatEntry } from '../../core/types/types';
import { MockFactory } from './MockFactory';
import { TestDataFactory } from './TestDataFactory';
import { Logger } from '../../core/utils/Logger';

export interface TestAgentConfig {
  maxIterations?: number;
  enableStagnationDetection?: boolean;
  stagnationThreshold?: number;
  enableParallelExecution?: boolean;
  tools?: ToolDefinition[];
  aiProvider?: AIProvider;
  logger?: Logger;
}

export interface TestExecutionResult {
  success: boolean;
  result: any;
  toolsExecuted: Array<{ name: string; args: any; result: ToolResult }>;
  iterationCount: number;
  executionTime: number;
  stagnationDetected: boolean;
  errorRecovered: boolean;
  errors: Error[];
}

/**
 * Test harness for AgentLoop testing
 */
export class AgentTestHarness {
  private agent: AgentLoop;
  private mockProvider: AIProvider;
  private mockLogger: Logger;
  private executionResults: TestExecutionResult[] = [];

  constructor(config: TestAgentConfig = {}) {
    this.mockLogger = config.logger || MockFactory.createMockLogger();
    this.mockProvider = config.aiProvider || MockFactory.createRealisticMockAIProvider();
    
    // Create a test agent implementation
    this.agent = new (class extends AgentLoop {
      constructor(
        tools: ToolDefinition[],
        aiProvider: AIProvider,
        logger: Logger,
        config: any
      ) {
        super();
        this.tools = tools;
        this.aiProvider = aiProvider;
        this.logger = logger;
        this.maxIterations = config.maxIterations || 10;
        this.enableStagnationDetection = config.enableStagnationDetection ?? true;
        this.stagnationThreshold = config.stagnationThreshold || 3;
        this.enableParallelExecution = config.enableParallelExecution ?? false;
      }

      async run(userInput: string, history: ChatEntry[] = []): Promise<any> {
        const startTime = Date.now();
        const executionLog: any[] = [];
        let iterationCount = 0;
        let stagnationDetected = false;
        let errorRecovered = false;
        const errors: Error[] = [];

        try {
          // Simulate agent execution
          const result = await this.executeAgent(userInput, history, executionLog);
          
          return {
            success: true,
            result,
            toolsExecuted: executionLog,
            iterationCount,
            executionTime: Date.now() - startTime,
            stagnationDetected,
            errorRecovered,
            errors,
          };
        } catch (error) {
          errors.push(error as Error);
          return {
            success: false,
            result: error,
            toolsExecuted: executionLog,
            iterationCount,
            executionTime: Date.now() - startTime,
            stagnationDetected,
            errorRecovered,
            errors,
          };
        }
      }

      private async executeAgent(
        userInput: string,
        history: ChatEntry[],
        executionLog: any[]
      ): Promise<any> {
        // Simulate basic agent execution logic
        const response = await this.aiProvider.generateResponse(
          `User: ${userInput}\n\nAvailable tools: ${this.tools.map(t => t.name).join(', ')}`
        );

        // Parse response and execute tools
        try {
          const parsedResponse = JSON.parse(response);
          if (parsedResponse.name && this.tools.find(t => t.name === parsedResponse.name)) {
            const tool = this.tools.find(t => t.name === parsedResponse.name)!;
            const result = await tool.implementation(parsedResponse.arguments || {});
            
            executionLog.push({
              name: parsedResponse.name,
              args: parsedResponse.arguments || {},
              result,
            });

            return result;
          }
        } catch (parseError) {
          throw new Error(`Failed to parse AI response: ${parseError}`);
        }

        return { success: true, result: 'No tool executed' };
      }

      // Expose private fields for testing
      get maxIterations() { return (this as any)._maxIterations; }
      set maxIterations(value: number) { (this as any)._maxIterations = value; }
      
      get enableStagnationDetection() { return (this as any)._enableStagnationDetection; }
      set enableStagnationDetection(value: boolean) { (this as any)._enableStagnationDetection = value; }
      
      get stagnationThreshold() { return (this as any)._stagnationThreshold; }
      set stagnationThreshold(value: number) { (this as any)._stagnationThreshold = value; }
      
      get enableParallelExecution() { return (this as any)._enableParallelExecution; }
      set enableParallelExecution(value: boolean) { (this as any)._enableParallelExecution = value; }
      
      get tools() { return (this as any)._tools; }
      set tools(value: ToolDefinition[]) { (this as any)._tools = value; }
      
      get aiProvider() { return (this as any)._aiProvider; }
      set aiProvider(value: AIProvider) { (this as any)._aiProvider = value; }
      
      get logger() { return (this as any)._logger; }
      set logger(value: Logger) { (this as any)._logger = value; }
    })(
      config.tools || [MockFactory.createSuccessfulTool('default_tool')],
      this.mockProvider,
      this.mockLogger,
      config
    );
  }

  /**
   * Execute the agent with a user input
   */
  async executeAgent(
    userInput: string,
    history: ChatEntry[] = []
  ): Promise<TestExecutionResult> {
    const result = await this.agent.run(userInput, history);
    this.executionResults.push(result);
    return result;
  }

  /**
   * Execute multiple test scenarios
   */
  async executeScenarios(
    scenarios: Array<{
      name: string;
      userInput: string;
      expectedSuccess: boolean;
      expectedTools?: string[];
    }>
  ): Promise<Array<{ scenario: string; result: TestExecutionResult; passed: boolean }>> {
    const results = [];

    for (const scenario of scenarios) {
      const result = await this.executeAgent(scenario.userInput);
      const passed = result.success === scenario.expectedSuccess &&
                    (!scenario.expectedTools || 
                     scenario.expectedTools.every(tool => 
                       result.toolsExecuted.some(executed => executed.name === tool)
                     ));

      results.push({
        scenario: scenario.name,
        result,
        passed,
      });
    }

    return results;
  }

  /**
   * Test stagnation detection with predefined patterns
   */
  async testStagnationDetection(): Promise<{
    patternsDetected: number;
    totalPatterns: number;
    results: Array<{ pattern: string; detected: boolean; expected: boolean }>;
  }> {
    const patterns = TestDataFactory.generateStagnationPatterns();
    const results = [];
    let patternsDetected = 0;

    for (const pattern of patterns) {
      // Configure agent for stagnation testing
      this.agent.enableStagnationDetection = true;
      this.agent.stagnationThreshold = 2;

      // Simulate pattern execution
      const result = await this.executeAgent(`Test pattern: ${pattern.name}`);
      const detected = result.stagnationDetected;

      if (detected && pattern.shouldDetectStagnation) {
        patternsDetected++;
      }

      results.push({
        pattern: pattern.name,
        detected,
        expected: pattern.shouldDetectStagnation,
      });
    }

    return {
      patternsDetected,
      totalPatterns: patterns.length,
      results,
    };
  }

  /**
   * Test error recovery scenarios
   */
  async testErrorRecovery(): Promise<{
    recoveredErrors: number;
    totalErrors: number;
    results: Array<{ error: string; recovered: boolean; expected: boolean }>;
  }> {
    const errorScenarios = TestDataFactory.generateErrorScenarios();
    const results = [];
    let recoveredErrors = 0;

    for (const scenario of errorScenarios) {
      // Configure mock provider to throw the error
      this.mockProvider.generateResponse = jest.fn().mockRejectedValueOnce(scenario.error);

      const result = await this.executeAgent(`Test error: ${scenario.name}`);
      const recovered = result.errorRecovered;

      if (recovered && scenario.expectedRecovery) {
        recoveredErrors++;
      }

      results.push({
        error: scenario.name,
        recovered,
        expected: scenario.expectedRecovery,
      });
    }

    return {
      recoveredErrors,
      totalErrors: errorScenarios.length,
      results,
    };
  }

  /**
   * Run performance benchmarks
   */
  async runPerformanceBenchmark(
    testSize: 'small' | 'medium' | 'large' = 'medium'
  ): Promise<{
    averageExecutionTime: number;
    maxExecutionTime: number;
    minExecutionTime: number;
    totalExecutions: number;
    passedBenchmark: boolean;
  }> {
    const testData = TestDataFactory.generatePerformanceTestData(testSize);
    const executionTimes: number[] = [];

    for (let i = 0; i < testData.iterations; i++) {
      const result = await this.executeAgent(`Performance test ${i + 1}`);
      executionTimes.push(result.executionTime);
    }

    const averageExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
    const maxExecutionTime = Math.max(...executionTimes);
    const minExecutionTime = Math.min(...executionTimes);
    const passedBenchmark = averageExecutionTime <= testData.expectedMaxExecutionTime;

    return {
      averageExecutionTime,
      maxExecutionTime,
      minExecutionTime,
      totalExecutions: testData.iterations,
      passedBenchmark,
    };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): TestExecutionResult[] {
    return [...this.executionResults];
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionResults = [];
  }

  /**
   * Get mock provider for test configuration
   */
  getMockProvider(): AIProvider {
    return this.mockProvider;
  }

  /**
   * Get mock logger for test verification
   */
  getMockLogger(): Logger {
    return this.mockLogger;
  }

  /**
   * Add tools to the agent
   */
  addTools(tools: ToolDefinition[]): void {
    this.agent.tools = [...this.agent.tools, ...tools];
  }

  /**
   * Replace all tools in the agent
   */
  setTools(tools: ToolDefinition[]): void {
    this.agent.tools = tools;
  }

  /**
   * Configure agent settings
   */
  configure(config: Partial<TestAgentConfig>): void {
    if (config.maxIterations !== undefined) {
      this.agent.maxIterations = config.maxIterations;
    }
    if (config.enableStagnationDetection !== undefined) {
      this.agent.enableStagnationDetection = config.enableStagnationDetection;
    }
    if (config.stagnationThreshold !== undefined) {
      this.agent.stagnationThreshold = config.stagnationThreshold;
    }
    if (config.enableParallelExecution !== undefined) {
      this.agent.enableParallelExecution = config.enableParallelExecution;
    }
  }
}