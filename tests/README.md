# AgentLoop Testing Framework

This directory contains the comprehensive testing framework for the AgentLoop project, organized into modern Jest-based tests and legacy tests for backward compatibility.

## Directory Structure

```
tests/
├── __tests__/                    # Jest-compatible test files
│   ├── unit/                     # Pure unit tests
│   │   ├── agents/               # AgentLoop, TurnState tests
│   │   ├── providers/            # AI provider tests
│   │   ├── handlers/             # Response handler tests
│   │   ├── prompt/               # Prompt manager tests
│   │   └── utils/                # Utility tests
│   ├── integration/              # Component integration tests
│   │   ├── agent-workflow/       # Full agent execution tests
│   │   ├── provider-integration/ # AI provider integration
│   │   └── tool-execution/       # Tool execution tests
│   └── performance/              # Performance and stress tests
├── fixtures/                     # Test data and fixtures
├── helpers/                      # Test utilities and helpers
├── setup/                        # Test configuration
└── legacy/                       # Original test files (preserved)
```

## Test Categories

### Unit Tests (`__tests__/unit/`)
- **AgentLoop**: Core orchestration logic, lifecycle hooks, configuration
- **StagnationDetector**: Pattern detection algorithms, confidence scoring
- **FunctionCallingResponseHandler**: JSON parsing, schema validation
- **PromptManager**: Template system, prompt construction
- **Providers**: AI provider implementations and interfaces
- **Utilities**: Error handling, logging, helper functions

### Integration Tests (`__tests__/integration/`)
- **Agent Workflow**: End-to-end agent execution scenarios
- **Provider Integration**: AI provider communication and compatibility
- **Tool Execution**: Multi-tool workflows and dependency resolution

### Performance Tests (`__tests__/performance/`)
- **Throughput**: High-frequency execution testing
- **Memory Usage**: Memory leak detection and optimization
- **Stress Testing**: Extreme load conditions
- **Benchmarking**: Performance baseline validation

## Running Tests

### Quick Commands
```bash
# Run all new tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:performance

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Run legacy tests
npm run test:legacy
```

### Advanced Usage
```bash
# Run specific test file
npm test -- AgentLoop.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should handle errors"

# Run tests with specific timeout
npm test -- --testTimeout=30000

# Run tests in band (no parallel execution)
npm test -- --runInBand
```

## Test Utilities

### MockFactory
Creates mock objects for testing:
```typescript
import { MockFactory } from './helpers';

// Create mock AI provider
const mockProvider = MockFactory.createMockAIProvider(['response1', 'response2']);

// Create mock tools
const tool = MockFactory.createSuccessfulTool('test_tool');
const failingTool = MockFactory.createFailingTool('error_tool', 'Error message');
```

### TestDataFactory
Generates test data:
```typescript
import { TestDataFactory } from './helpers';

// Generate tool definitions
const tools = TestDataFactory.generateMultipleToolDefinitions(5);

// Generate conversation history
const history = TestDataFactory.generateChatHistory(10);

// Generate error scenarios
const errors = TestDataFactory.generateErrorScenarios();
```

### AgentTestHarness
Comprehensive testing harness for agent workflows:
```typescript
import { AgentTestHarness } from './helpers';

const harness = new AgentTestHarness({
  maxIterations: 10,
  enableStagnationDetection: true,
});

// Execute agent with test input
const result = await harness.executeAgent('Test user input');

// Run performance benchmarks
const benchmark = await harness.runPerformanceBenchmark('medium');

// Test stagnation detection
const stagnationResult = await harness.testStagnationDetection();
```

## Test Configuration

### Jest Configuration
The test framework uses Jest with TypeScript support:
- **Coverage**: 80%+ threshold for critical components
- **Timeout**: 30 seconds per test
- **Parallel**: 4 workers for optimal performance
- **Mocking**: Automatic mock clearing between tests

### Custom Matchers
Extended Jest matchers for domain-specific assertions:
```typescript
expect(result).toHaveExecutedTool('tool_name');
expect(result).toHaveDetectedStagnation();
expect(result).toHaveRecoveredFromError();
expect(result).toBeValidAgentResponse();
```

## Coverage Requirements

| Component | Coverage Target |
|-----------|-----------------|
| Core Agents | 90%+ |
| Utilities | 85%+ |
| Handlers | 80%+ |
| Providers | 80%+ |
| Overall | 80%+ |

## Performance Benchmarks

### Execution Time Targets
- **Unit Tests**: < 100ms per test
- **Integration Tests**: < 1000ms per test
- **Simple Agent Execution**: < 500ms
- **Complex Workflows**: < 2000ms

### Memory Usage
- **Memory Growth**: < 1KB per iteration
- **Peak Memory**: < 100MB for test suite
- **Leak Detection**: Automatic with test harness

## Adding New Tests

### Unit Test Template
```typescript
import { ComponentUnderTest } from '../../../core/path/to/component';
import { MockFactory } from '../../helpers';

describe('ComponentUnderTest', () => {
  let component: ComponentUnderTest;
  let mockDependency: jest.Mocked<Dependency>;

  beforeEach(() => {
    mockDependency = MockFactory.createMockDependency();
    component = new ComponentUnderTest(mockDependency);
  });

  describe('method', () => {
    it('should behave correctly', () => {
      // Test implementation
    });
  });
});
```

### Integration Test Template
```typescript
import { AgentTestHarness } from '../../helpers';

describe('Integration Test', () => {
  let harness: AgentTestHarness;

  beforeEach(() => {
    harness = new AgentTestHarness({
      // Configuration
    });
  });

  it('should integrate components correctly', async () => {
    const result = await harness.executeAgent('Test input');
    expect(result.success).toBe(true);
  });
});
```

## CI/CD Integration

### GitHub Actions
The test suite runs automatically on:
- **Push**: To main and develop branches
- **Pull Request**: All branches
- **Matrix**: Node.js 18.x and 20.x
- **Coverage**: Uploaded to Codecov

### Quality Gates
- **Unit Tests**: Must pass
- **Integration Tests**: Must pass
- **Performance Tests**: Must meet benchmarks
- **Coverage**: Must meet thresholds

## Troubleshooting

### Common Issues

1. **Test Timeout**: Increase timeout in Jest configuration
2. **Memory Leaks**: Check test cleanup and mock clearing
3. **Flaky Tests**: Review timing assumptions and async handling
4. **Coverage Gaps**: Add missing test cases for uncovered lines

### Debug Commands
```bash
# Run tests with debugging
npm test -- --verbose --detectOpenHandles

# Run single test file with debugging
npm test -- --testNamePattern="specific test" --verbose

# Check for memory leaks
npm test -- --detectLeaks
```

## Legacy Tests

The `legacy/` directory contains the original custom test framework for backward compatibility. These tests are preserved but not actively maintained. New tests should use the Jest framework.

## Contributing

1. Write tests for all new features
2. Maintain existing test coverage
3. Update documentation for new test patterns
4. Run full test suite before submitting PRs
5. Follow test naming conventions

## Resources

- [Jest Documentation](https://jestjs.io/)
- [TypeScript Jest Guide](https://jestjs.io/docs/getting-started#using-typescript)
- [Testing Best Practices](https://jestjs.io/docs/testing-frameworks)
- [AgentLoop Architecture](../README.md)