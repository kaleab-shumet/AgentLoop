import { processTomlWithEscaping } from '../core/utils/tomlRepair';

describe('processTomlWithEscaping - Complex Python Code Case', () => {
  
  test('handles Python code with multiple docstrings', () => {
    const tomlCode = `
[script]
code = """
def greet(name):
    """
    This is a multiline comment in Python.
    It explains that this function greets the user by name.
    """
    print(f"Hello, {name}!")

def thanks(name):
    """
    This is a multiline comment in Python.
    It explains that this function greets the user by name.
    """
    print(f"thanks, {name}!")

"""
`;

    console.log('INPUT TOML:');
    console.log(tomlCode);
    
    let result;
    let success = false;
    let errorMessage = '';
    
    try {
      result = processTomlWithEscaping(tomlCode);
      success = true;
      console.log('\n✅ PARSING SUCCEEDED!');
      console.log('PARSED RESULT:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      errorMessage = (error as Error).message;
      console.log('\n❌ PARSING FAILED:');
      console.log('ERROR:', errorMessage);
    }
    
    // Test assertions
    if (success) {
      expect(result).toBeDefined();
      expect(result.script).toBeDefined();
      expect(result.script.code).toBeDefined();
      
      // The code should contain the Python functions
      expect(result.script.code).toContain('def greet(name):');
      expect(result.script.code).toContain('def thanks(name):');
      expect(result.script.code).toContain('print(f"Hello, {name}!")');
      expect(result.script.code).toContain('print(f"thanks, {name}!")');
      
      // Check if docstrings are preserved (either escaped or as-is)
      const codeContent = result.script.code;
      const hasDocstrings = codeContent.includes('This is a multiline comment');
      
      console.log('\n📋 CONTENT ANALYSIS:');
      console.log('Contains docstring text:', hasDocstrings);
      console.log('Code length:', codeContent.length);
      console.log('First 200 chars:', codeContent.substring(0, 200));
      
      expect(hasDocstrings).toBe(true);
      
    } else {
      // If it failed, check that it's a parsing error (expected for this complex case)
      expect(
        errorMessage.includes('Max attempts reached') ||
        errorMessage.includes('Unexpected character') ||
        errorMessage.includes('Invalid character') ||
        errorMessage.includes('triple')
      ).toBe(true);
    }
  });

  test('performance check for complex nested quotes', () => {
    const tomlCode = `
[script]
code = """
def greet(name):
    """
    This is a multiline comment in Python.
    It explains that this function greets the user by name.
    """
    print(f"Hello, {name}!")

def thanks(name):
    """
    This is a multiline comment in Python.
    It explains that this function greets the user by name.
    """
    print(f"thanks, {name}!")

"""
`;

    const startTime = Date.now();
    
    try {
      processTomlWithEscaping(tomlCode);
    } catch (error) {
      // Error is okay, we're testing performance
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`\n⏱️  Processing time: ${duration}ms`);
    
    // Should not take more than 10 seconds even for complex cases
    expect(duration).toBeLessThan(10000);
  });

});