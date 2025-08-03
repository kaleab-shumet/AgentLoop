import * as TOML from '@iarna/toml';

function escapeUnescaped(
  str: string
): string {
  return str.replace(
    /(\\)?([\"\\])/g,
    (
      match: string,
      backslash: string | undefined,
      char: string
    ) => {
      if (backslash) {
        // Already escaped, keep as is
        return match;
      } else {
        // Not escaped, escape it
        return '\\' + char;
      }
    }
  );
}


export function processTomlWithEscaping(
  malformedToml: string,
  trippleQuotesIndices: number[] = [],
  maxAttempts?: number,
  attemptCount: number = 0,
  originalError?: any,
  previousContent?: string
): any {


  // EASY FIX 1: Handle empty/whitespace-only content
  if (!malformedToml || !malformedToml.trim()) {
    throw new Error('Empty or whitespace-only TOML content cannot be processed');
  }

  // EASY FIX 2: Sanitize unicode control characters that can break parsing
  const sanitizedToml = malformedToml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // INFINITE LOOP PROTECTION: Check if content hasn't changed from previous attempt
  if (previousContent && sanitizedToml === previousContent) {
    throw originalError || new Error('No progress made in TOML repair - content unchanged');
  }

  // EASY FIX 3: Better max attempts calculation with reasonable limits
  if (maxAttempts === undefined) {
    const totalQuotesCount = (sanitizedToml.match(/"/g) || []).length;
    maxAttempts = Math.min(totalQuotesCount + 5, 50); // Cap at 50 to prevent infinite loops
  }

  if (attemptCount >= maxAttempts) {
    // Throw the original TOML error so LLM understands what to fix
    throw originalError || new Error('Max attempts reached, but no original error available');
  }

  try {
    const parsed = TOML.parse(sanitizedToml);
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


    const tripleQuotesMatch = [...sanitizedToml.matchAll(/"""/g)].map(m => m.index || 0).sort((a, b) => a - b);

    if (tripleQuotes.length == 0) {
      tripleQuotes = tripleQuotesMatch;
    }



    const countTripleQuotes = tripleQuotesMatch.length;

    if (countTripleQuotes >= 2) {

      if (countTripleQuotes == 2) {
        const subStr = sanitizedToml.substring(tripleQuotesMatch[0] + 3, tripleQuotesMatch[1]);

        const escapedSubStr = escapeUnescaped(subStr);

        const patchedToml = replaceRange(sanitizedToml, tripleQuotesMatch[0] + 3, subStr.length, escapedSubStr);
        return processTomlWithEscaping(patchedToml, tripleQuotes, maxAttempts, attemptCount + 1, error, sanitizedToml);

      }
      else if (countTripleQuotes > 2) {

        const lastQuoteIndex = tripleQuotesMatch.pop(); // Remove the last match to avoid infinite loop
        tripleQuotesMatch.shift(); // Remove the first match to avoid infinite loop 

        const nearestTripleQuoteIndex = tripleQuotesMatch.reduce((prev, curr) => {
          return Math.abs(curr - errIndex) < Math.abs(prev - errIndex) ? curr : prev;
        });

        if (typeof lastQuoteIndex === 'number' && errIndex > lastQuoteIndex) {
          errIndex = lastQuoteIndex;
        }

        const subStr = sanitizedToml.substring(nearestTripleQuoteIndex, errIndex);

        const escapedSubStr = escapeUnescaped(subStr);

        const patchedToml = replaceRange(sanitizedToml, nearestTripleQuoteIndex, subStr.length, escapedSubStr);
        return processTomlWithEscaping(patchedToml, tripleQuotes, maxAttempts, attemptCount + 1, error, sanitizedToml);
      }
    } else {
      // Handle regular double quotes when no triple quotes are present - use same logic as triple quotes
      const doubleQuoteMatches = [...sanitizedToml.matchAll(/"/g)].map(m => m.index || 0).sort((a, b) => a - b);
      const countDoubleQuotes = doubleQuoteMatches.length;

      if (countDoubleQuotes == 2) {
        const subStr = sanitizedToml.substring(doubleQuoteMatches[0] + 1, doubleQuoteMatches[1]);
        const escapedSubStr = escapeUnescaped(subStr);
        const patchedToml = replaceRange(sanitizedToml, doubleQuoteMatches[0] + 1, subStr.length, escapedSubStr);
        return processTomlWithEscaping(patchedToml, tripleQuotes, maxAttempts, attemptCount + 1, error, sanitizedToml);

      } else if (countDoubleQuotes > 2) {
        const lastQuoteIndex = doubleQuoteMatches.pop(); // Remove the last match to avoid infinite loop
        doubleQuoteMatches.shift(); // Remove the first match to avoid infinite loop 

        const nearestDoubleQuoteIndex = doubleQuoteMatches.reduce((prev, curr) => {
          return Math.abs(curr - errIndex) < Math.abs(prev - errIndex) ? curr : prev;
        });

        let adjustedErrIndex = errIndex;
        if (typeof lastQuoteIndex === 'number' && errIndex > lastQuoteIndex) {
          adjustedErrIndex = lastQuoteIndex;
        }

        const subStr = sanitizedToml.substring(nearestDoubleQuoteIndex, adjustedErrIndex);
        const escapedSubStr = escapeUnescaped(subStr);
        const patchedToml = replaceRange(sanitizedToml, nearestDoubleQuoteIndex, subStr.length, escapedSubStr);
        return processTomlWithEscaping(patchedToml, tripleQuotes, maxAttempts, attemptCount + 1, error, sanitizedToml);
      }
    }

    throw error;

  }
}

function replaceRange(str: string, start: number, length: number, replacement: string) {
  return str.slice(0, start) + replacement + str.slice(start + length);
}