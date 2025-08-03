import * as TOML from '@iarna/toml';

/**
 * Processes <multiline> tags: escapes unescaped quotes and removes the tags
 */
function escapeMultilineContent(str: string): string {
  return str.replace(
    /(<multiline>)([\s\S]*?)(<\/multiline>)/g,
    (match: string, openTag: string, content: string, closeTag: string) => {
      // Escape only unescaped quotes in multiline content
      const escapedContent = content.replace(
        /(\\*)"/g,
        (match: string, backslashes: string) => {
          // If even number of backslashes (including 0), the quote is unescaped
          if (backslashes.length % 2 === 0) {
            return backslashes + '\\"';
          }
          // If odd number of backslashes, the quote is already escaped
          return match;
        }
      );
      // Return only the escaped content, removing the multiline tags
      return escapedContent;
    }
  );
}

export function processTomlWithEscaping(
  malformedToml: string,
  maxAttempts: number = 10,
  attemptCount: number = 0,
  originalError?: any
): any {
  // Handle empty content
  if (!malformedToml || !malformedToml.trim()) {
    throw new Error('Empty TOML content cannot be processed');
  }

  // Prevent infinite loops
  if (attemptCount >= maxAttempts) {
    throw originalError || new Error('Max repair attempts reached');
  }

  // Process multiline content and sanitize
  let sanitizedToml = malformedToml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  sanitizedToml = escapeMultilineContent(sanitizedToml);

  try {
    return TOML.parse(sanitizedToml);
  } catch (error: any) {
    // If this is the first attempt, try with escaping
    if (attemptCount === 0) {
      return processTomlWithEscaping(sanitizedToml, maxAttempts, attemptCount + 1, error);
    }
    
    // Otherwise, throw the error
    throw error;
  }
}