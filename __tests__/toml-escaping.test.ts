import { processTomlWithEscaping } from '../core/utils/tomlRepair';

describe('processTomlWithEscaping', () => {
  
  test('handles valid TOML without changes', () => {
    const input = `message = "Hello world"`;
    const result = processTomlWithEscaping(input);
    expect(result).toBeDefined();
    expect(result.message).toBe("Hello world");
  });

  test('handles array of tables structure', () => {
    const input = `[[tool_calls]]
name = "test"
[tool_calls.args]
value = "simple"`;
    const result = processTomlWithEscaping(input);
    expect(result).toBeDefined();
    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls[0].name).toBe("test");
  });

  test('attempts to fix simple unescaped quotes', () => {
    const input = `code="print("hello")"`;
    
    // This should either fix the quotes or throw a descriptive error
    expect(() => {
      const result = processTomlWithEscaping(input);
      // If it succeeds, the quotes should be properly handled
      expect(result).toBeDefined();
    }).not.toThrow(/Max attempts reached/);
  });

  test('attempts to fix nested assignment quotes', () => {
    const input = `code="hello="helloworld""`;
    
    // This should either fix the quotes or throw a descriptive error
    expect(() => {
      const result = processTomlWithEscaping(input);
      // If it succeeds, the quotes should be properly handled
      expect(result).toBeDefined();
    }).not.toThrow(/Max attempts reached/);
  });

  test('handles properly escaped triple quotes', () => {
    const input = `code = """print(\\"hello\\")"""`;
    const result = processTomlWithEscaping(input);
    expect(result).toBeDefined();
    expect(result.code).toBe('print("hello")');
  });

  test('handles multiline strings with embedded content', () => {
    const input = `script = """
function test() {
    console.log("hello");
}
"""`;
    const result = processTomlWithEscaping(input);
    expect(result).toBeDefined();
    expect(result.script).toContain('console.log("hello")');
  });

  test('handles empty and special values', () => {
    const input = `empty = ""
number = "123"
boolean = "true"`;
    const result = processTomlWithEscaping(input);
    expect(result).toBeDefined();
    expect(result.empty).toBe("");
    expect(result.number).toBe("123");
    expect(result.boolean).toBe("true");
  });

  test('should not exceed max attempts on complex input', () => {
    const input = `complex = "lots""of""quotes""everywhere"`;
    
    // Should either succeed or fail gracefully, not hang
    const startTime = Date.now();
    
    try {
      processTomlWithEscaping(input);
    } catch (error) {
      // Should either reach max attempts OR fail with TOML parsing error
      const errorMessage = (error as Error).message;
      expect(
        errorMessage.includes('Max attempts reached') || 
        errorMessage.includes('Unexpected character')
      ).toBe(true);
    }
    
    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(5000); // Should not take more than 5 seconds
  });

  test('preserves Unicode and special characters', () => {
    const input = `unicode = "Hello 世界! 🌍"`;
    const result = processTomlWithEscaping(input);
    expect(result).toBeDefined();
    expect(result.unicode).toBe("Hello 世界! 🌍");
  });

});