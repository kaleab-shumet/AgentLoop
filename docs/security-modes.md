# Security Modes

AgentLoop provides three distinct execution modes for JavaScript code execution, each with different security characteristics and use cases.

## Overview

| Mode | Environment | Security Level | Bundle Impact | Use Case |
|------|-------------|----------------|---------------|----------|
| `eval` | Universal | None | Minimal (~158KB) | Development, trusted environments |
| `ses` | Node.js | High | Large (+4.3MB) | Production servers, untrusted code |
| `websandbox` | Browser | Medium | Small (+~100KB) | Browser apps, client-side security |

## eval Mode (Default)

The default execution mode uses JavaScript's native `eval()` function for code execution.

### Characteristics
- ✅ **Universal**: Works in all JavaScript environments
- ✅ **Fast**: Direct code execution with minimal overhead
- ✅ **Small**: No additional dependencies or bundle size
- ⚠️ **No Security**: Direct access to global scope and APIs

### Usage
```typescript
import { LiteralJSFormatHandler } from 'agentloop';

const handler = new LiteralJSFormatHandler();
// eval mode is the default
console.log(handler.executionMode); // 'eval'
```

### When to Use
- Development and testing environments
- Trusted code execution environments
- When bundle size is critical
- When maximum performance is needed

## SES Mode (Secure ECMAScript)

SES (Secure ECMAScript) provides secure compartmentalized execution for Node.js environments.

### Characteristics
- 🔒 **Secure Compartments**: Code executes in isolated compartments
- 🛡️ **Prototype Protection**: Prevents prototype pollution attacks
- 🚫 **Restricted Globals**: Limited access to dangerous APIs
- 📦 **Large Bundle**: Adds ~4.3MB to bundle size

### Installation
```bash
npm install ses
```

### Usage
```typescript
import { LiteralJSFormatHandler } from 'agentloop';

const handler = new LiteralJSFormatHandler();
handler.executionMode = 'ses';
```

### Security Features
- **Compartment Isolation**: Each execution runs in a separate compartment
- **Frozen Intrinsics**: Built-in objects are frozen to prevent modification
- **Import Restriction Handling**: Automatically processes import statements in strings
- **Date.now() Restoration**: Handles SES's intentional Date.now() removal

### Technical Details
```typescript
// SES creates isolated compartments like this:
const compartment = new Compartment({
  // Safe constructors only
  Array: Array,
  Object: Object,
  String: String,
  Math: Math,
  JSON: JSON,
  // Tool execution context
  z: zodLibrary,
  toolSchemas: schemas,
  toolCalls: callsArray
});

// Execute in isolated environment
const result = compartment.evaluate(cleanedCode);
```

### When to Use
- Production environments with untrusted code
- Security-critical applications
- When running AI-generated JavaScript
- Server-side execution requiring isolation

## WebSandbox Mode (Browser Security)

WebSandbox provides lightweight sandboxing specifically designed for browser environments.

### Characteristics
- 🌐 **Browser Native**: Designed for browser execution
- ⚡ **Lightweight**: Small bundle size impact (~100KB)
- 🔗 **API Communication**: Bidirectional communication between host and sandbox
- 🎯 **Targeted Security**: Browser-specific security model

### Installation
```bash
npm install @jetbrains/websandbox
```

### Usage
```typescript
import { LiteralJSFormatHandler } from 'agentloop';

const handler = new LiteralJSFormatHandler();
handler.executionMode = 'websandbox';
```

### Technical Implementation
```typescript
// WebSandbox creates secure execution environment
const sandbox = await Sandbox.create({
  // API available to sandboxed code
  z: zodLibrary,
  toolSchemas: schemas,
  toolCalls: callsArray,
  Math: Math,
  JSON: JSON
}).promise;

// Execute function in sandbox
const result = sandbox.run(executionFunction);
```

### When to Use
- Browser-based applications
- Client-side AI agent execution
- When SES is not available (browser environment)
- Applications requiring moderate security with small overhead

## Security Mode Validation

AgentLoop enforces strict mode validation with **no automatic fallbacks**:

```typescript
// ✅ Always works
handler.executionMode = 'eval';

// ❌ Throws error if package not installed
handler.executionMode = 'ses';
// AgentError: "SES execution mode requested but SES is not installed. 
//              Install 'ses' package or use mode: 'eval'"

// ❌ Throws error if not available
handler.executionMode = 'websandbox'; 
// AgentError: "WebSandbox execution mode requested but WebSandbox is not installed.
//              Install '@jetbrains/websandbox' package or use mode: 'eval'"
```

### Why No Fallbacks?

1. **Explicit Security Choices**: Users must consciously choose their security level
2. **Predictable Behavior**: No surprises about what security is actually applied
3. **Clear Error Messages**: Immediate feedback about missing dependencies
4. **Configuration Transparency**: What you configure is exactly what you get

## String Extraction System

Both SES and WebSandbox modes use an automatic string extraction system to handle import statements and other restricted syntax:

```typescript
// Original AI-generated code
const code = `
function callTools() {
  const message = "import something from 'module'";
  return [{ 
    name: 'tool', 
    parameters: { message } 
  }];
}
`;

// Automatically becomes:
const extractedCode = `
function callTools() {
  const message = "__STRING_ID_abc123__";
  return [{ 
    name: 'tool', 
    parameters: { message } 
  }];
}
`;

// String map: { "__STRING_ID_abc123__": "import something from 'module'" }
// After execution, strings are restored in the results
```

This ensures that AI-generated code with import statements or other restricted syntax works seamlessly in secure environments.

## Performance Comparison

| Mode | Startup Time | Execution Speed | Memory Usage | Bundle Size |
|------|-------------|-----------------|--------------|-------------|
| `eval` | Instant | Fastest | Minimal | ~158KB |
| `ses` | Slow (lockdown) | Medium | High | ~4.5MB |
| `websandbox` | Medium | Medium | Medium | ~258KB |

## Best Practices

### Development
- Use `eval` mode for development and testing
- Switch to secure modes for production deployment
- Test with secure modes before deployment

### Production
- Use `ses` mode for server-side production environments
- Use `websandbox` mode for browser production environments
- Never use `eval` mode with untrusted input in production

### Configuration
- Set execution mode at the handler level for fine-grained control
- Use environment variables to switch modes between environments
- Document your security choices in your application

```typescript
// Environment-based configuration
const handler = new LiteralJSFormatHandler();
handler.executionMode = process.env.NODE_ENV === 'production' ? 'ses' : 'eval';
```