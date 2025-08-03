import * as TOML from '@iarna/toml';


export function processTomlWithEscaping(
  malformedToml: string,
  trippleQuotesIndices: number[] = [],
  maxAttempts?: number,
  attemptCount: number = 0,
  originalError?: any,
  previousContent?: string,
  replacementNeeded: boolean = false
): any {

  let newReplacementNeeded = replacementNeeded;

  const REPALCEMENT_PLACEHOLDER = "__TRIPLE_QUOTE_PLACEHOLDER__";
  const TRIPPLE_SINGLE_QUOTE = "'''";

  // EASY FIX 1: Handle empty/whitespace-only content
  if (!malformedToml || !malformedToml.trim()) {
    throw new Error('Empty or whitespace-only TOML content cannot be processed');
  }

  // EASY FIX 2: Sanitize unicode control characters that can break parsing
  let sanitizedToml = malformedToml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // EASY FIX 3: Process <literal> tags - replace triple quotes with placeholder and remove tags
  sanitizedToml = sanitizedToml.replace(
    /<literal>([\s\S]*?)<\/literal>/g,
    (match: string, content: string) => {
      // Mark that replacement is needed and replace triple quotes with placeholder
      newReplacementNeeded = true;
      return content.replace(/'''/g, REPALCEMENT_PLACEHOLDER);
    }
  );


  // INFINITE LOOP PROTECTION: Check if content hasn't changed from previous attempt
  if (previousContent && sanitizedToml === previousContent) {
    throw originalError || new Error('No progress made in TOML repair - content unchanged');
  }

  // EASY FIX 3: Better max attempts calculation with reasonable limits
  if (maxAttempts === undefined) {
    const totalQuotesCount = (sanitizedToml.match(/'''/g) || []).length;
    maxAttempts = Math.min(totalQuotesCount + 5, 50); // Cap at 50 to prevent infinite loops
  }

  if (attemptCount >= maxAttempts) {
    // Throw the original TOML error so LLM understands what to fix
    throw originalError || new Error('Max attempts reached, but no original error available');
  }

  try {
    let parsed = TOML.parse(sanitizedToml);
    let parsedString = JSON.stringify(parsed, null, 2);
   
    parsedString = parsedString.replace(new RegExp(REPALCEMENT_PLACEHOLDER, 'g'), TRIPPLE_SINGLE_QUOTE);

    parsed = JSON.parse(parsedString);
    return parsed;
  } catch (error: any) {
    // Use the pos property directly from the TOML error object
    if (!error.pos && error.pos !== 0) {
      throw error;
    }

    let errIndex = error.pos;

    if (errIndex < 0 || errIndex > sanitizedToml.length) {
      throw error;
    }



    let tripleQuotes = [...trippleQuotesIndices]


    const tripleQuotesMatch = [...sanitizedToml.matchAll(/'''/g)].map(m => m.index || 0)
      .sort((a, b) => a - b)

    if (tripleQuotes.length == 0) {
      tripleQuotes = tripleQuotesMatch;
    }



    const countTripleQuotes = tripleQuotesMatch.length;

    if (countTripleQuotes > 2) {

      tripleQuotesMatch.pop(); // Remove the last match to avoid infinite loop
      tripleQuotesMatch.shift(); // Remove the first match to avoid infinite loop 

      const nearestTripleQuotes = tripleQuotesMatch.filter(index => index < errIndex)
      const nearestTripleQuoteIndex = nearestTripleQuotes[nearestTripleQuotes.length - 1] || 0;


      const patchedToml = replaceRange(sanitizedToml, nearestTripleQuoteIndex, 3, REPALCEMENT_PLACEHOLDER);

      if (!newReplacementNeeded) {
        newReplacementNeeded = true;
      }

      return processTomlWithEscaping(patchedToml, tripleQuotes, maxAttempts, attemptCount + 1, error, sanitizedToml, newReplacementNeeded);
    }

    throw error;

  }
}

function replaceRange(str: string, start: number, length: number, replacement: string) {
  return str.slice(0, start) + replacement + str.slice(start + length);
}

// Debug test case - move this here for step debugging
if (require.main === module) {
  const testToml = `python_code = '''
class DataProcessor:
    '''
    A class for processing data with embedded quotes: "example"
    '''
    
    def process(self):
        '''Method with 'single' quotes'''
        return "result"
    
    def complex_method(self):
        '''
        Method with embedded triple quotes in docstring
        '''
        code = '''
        def inner():
            print("nested quotes")
        '''
        return code
'''`;

  console.log('Testing TOML:');
  console.log(testToml);
  console.log('\n--- Starting debug ---');

  try {
    const result = processTomlWithEscaping(testToml);
    console.log('Success! Result:', result);
  } catch (error) {
    if (error instanceof Error) {
      console.log('Error:', error.message);
    } else {
      console.log('Error:', String(error));
    }
    console.log('Full error:', error);
  }
}