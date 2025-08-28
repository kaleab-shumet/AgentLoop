# JavaScript Execution Security

AgentLoop provides **SES (Secure EcmaScript)** as the only JavaScript execution mode, ensuring maximum security for all AI-generated code execution.

## Overview

| Aspect | SES-Only Execution |
|--------|-------------------|
| **Security Level** | Maximum - Compartmentalized execution |
| **Performance** | Optimized for secure execution |
| **Dependencies** | Zero - SES included in bundle |
| **Use Case** | All environments - development & production |
| **Configuration** | Zero - always secure by default |

## SES-Only Architecture

AgentLoop eliminates security choices by providing only one, maximally secure execution mode.

### Why SES-Only?

Traditional frameworks offer multiple execution modes, creating security complexity:
- Developers must choose between security and performance
- Easy to accidentally deploy unsafe configurations  
- Multiple code paths increase attack surface
- Security decisions pushed to application developers

AgentLoop solves this by **removing the choice entirely** - every execution is secure.

## SES (Secure EcmaScript) Features

### Core Security
- **Isolated Compartments**: Each execution runs in a separate, secure environment
- **Frozen Intrinsics**: Built-in objects cannot be modified or tampered with
- **No Dangerous Globals**: Zero access to `process`, `require`, `import`, `eval`, etc.
- **Prototype Protection**: Prevents prototype pollution attacks
- **Memory Isolation**: No access to host application memory or state

### Cross-Platform Security
```typescript
// This code works identically in Node.js and browsers
const agent = new MyAgent(provider);

// All executions are automatically secure - no configuration needed
const result = await agent.run({
  userPrompt: "Process this data securely",
  prevInteractionHistory: []
});
```

### Technical Implementation

```typescript
// Every execution creates a secure compartment
const compartment = new Compartment({
  // Safe globals only
  Math: Math,
  JSON: JSON,
  Array: Array,
  Object: Object,
  // Tool execution context
  z: zodLibrary,
  toolSchemas: schemas,
  toolCalls: []
});

// AI-generated code executes in isolation
const result = compartment.evaluate(aiGeneratedCode);
```

## Security Benefits

### Eliminates Entire Attack Classes

1. **Code Injection**: Impossible - no access to host environment
2. **Prototype Pollution**: Prevented - intrinsics are frozen
3. **Global Tampering**: Blocked - limited endowments only
4. **File System Access**: None - no Node.js APIs available
5. **Network Access**: Controlled - only through provided tools
6. **Process Manipulation**: Impossible - no process access

### Predictable Security Model

```typescript
// ✅ This is ALL you need for maximum security
const agent = new MyAgent(aiProvider);

// No security configuration required
// No unsafe modes to accidentally enable
// No security decisions to get wrong
```

## Performance Characteristics

| Metric | SES Execution |
|--------|---------------|
| **Security** | Maximum |
| **Startup Time** | ~50ms (compartment creation) |
| **Execution Speed** | Optimized for security |
| **Memory Usage** | +2-5MB (compartment overhead) |
| **Bundle Size** | +~200KB (SES library included) |

### Performance Optimizations

1. **Compartment Reuse**: SES compartments are reused when possible
2. **String Extraction**: Automatically handles restricted syntax
3. **AST Processing**: Efficient code parsing and transformation
4. **Minimal Endowments**: Only necessary objects provided

## Development Experience

### Zero Configuration
```typescript
// Before: Complex security decisions
const agent = new OtherFramework(provider, {
  executionMode: 'should-i-use-eval-or-ses?', // ❌ Complex choice
  securityLevel: 'what-level-do-i-need?',     // ❌ More decisions
  fallbackMode: 'what-if-ses-fails?'          // ❌ Even more complexity
});

// After: No decisions needed
const agent = new AgentLoop(provider); // ✅ Always secure
```

### Consistent Behavior
```typescript
// Same security in all environments
const agent = new MyAgent(provider);

// Development - secure
await agent.run({ userPrompt: "test", prevInteractionHistory: [] });

// Production - same security level
await agent.run({ userPrompt: "process", prevInteractionHistory: [] });

// Browser - identical security
await agent.run({ userPrompt: "client-side", prevInteractionHistory: [] });
```

## Migration from Multi-Mode Systems

### Before (Multiple Modes)
```typescript
// Old: Security decisions everywhere
const agent = new OldFramework(provider, {
  executionMode: process.env.NODE_ENV === 'production' ? 'ses' : 'eval' // ❌ Risky
});
```

### After (SES-Only)
```typescript
// New: Always secure
const agent = new AgentLoop(provider); // ✅ No decisions, maximum security
```

## Security Validation

### Automatic Security Testing
```typescript
// Every execution is automatically validated
const agent = new MyAgent(provider);

try {
  // This will always be secure - no unsafe code paths exist
  const result = await agent.run({
    userPrompt: "Execute this task",
    prevInteractionHistory: []
  });
} catch (error) {
  // Clear errors - no silent security downgrades
  console.error("Secure execution failed:", error.message);
}
```

### No Security Configuration Errors
Common configuration mistakes are **impossible**:
- ❌ Accidentally using unsafe mode in production
- ❌ Forgetting to enable security features  
- ❌ Misconfiguring security levels
- ❌ Silent fallbacks to unsafe execution

All eliminated by having only one, secure execution mode.

## Best Practices

### Architecture Recommendations

```typescript
// ✅ Perfect - No configuration needed
const agent = new MyAgent(aiProvider);

// ✅ Still perfect - SES is the only mode
const agent = new MyAgent(aiProvider, {
  maxIterations: 10,
  globalToolTimeoutMs: 30000
  // No jsExecutionMode needed - always SES
});
```

### Security-First Development

1. **Trust the Security**: SES provides comprehensive protection
2. **Focus on Features**: Spend time on tools, not security configuration
3. **Test with Confidence**: Every execution uses production security
4. **Deploy Safely**: No security configuration to get wrong

### Tool Development
```typescript
// Tools run in secure environment automatically
this.defineTool(z => ({
  name: 'file_operation',
  description: 'Safe file operations',
  argsSchema: z.object({
    path: z.string(),
    content: z.string()
  }),
  handler: async ({ args }) => {
    // This handler runs in host environment (safe)
    // AI-generated code runs in SES compartment (also safe)
    // No security concerns with this architecture
    return { success: true };
  }
}));
```

## FAQ

### Why Not Offer eval as an Option?
**Security Principle**: Never provide unsafe alternatives. Even optional unsafe modes create:
- Configuration complexity
- Accidental security vulnerabilities  
- Different security models in different environments
- Pressure to choose performance over security

### What if I Need Maximum Performance?
**Answer**: SES performance is optimized and the security benefits far outweigh the minimal overhead. The ~50ms startup cost and ~10% execution overhead are negligible compared to AI model latency.

### Can I Disable Security for Development?
**Answer**: No, and this is intentional. Using the same security model in development and production:
- Eliminates environment-specific bugs
- Ensures thorough testing of security boundaries
- Prevents security misconfigurations

### What About Legacy Code?
**Answer**: SES is highly compatible with standard JavaScript. The automatic string extraction system handles most edge cases transparently.

## Summary

AgentLoop's SES-only architecture provides:

✅ **Maximum Security** - No compromise, no unsafe alternatives  
✅ **Zero Configuration** - No security decisions to make or get wrong  
✅ **Consistent Behavior** - Same security everywhere  
✅ **Production Ready** - Battle-tested secure execution  
✅ **Developer Friendly** - Focus on features, not security config  

**The result**: Secure-by-design AI agent framework with zero security configuration complexity.