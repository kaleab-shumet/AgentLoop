/**
 * Rate limiting configuration for test suites
 * Adjust these values based on your AI provider's rate limits
 */
export interface RateLimitConfig {
  // Delay between individual tests (milliseconds)
  testDelay: number;
  
  // Delay between test categories (milliseconds)
  categoryDelay: number;
  
  // Delay between AgentLoop iterations (milliseconds)
  iterationDelay: number;
  
  // Maximum concurrent requests
  maxConcurrentRequests: number;
}

/**
 * Default rate limiting settings for different AI providers
 */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Gemini free tier: 15 requests per minute
  gemini_free: {
    testDelay: 3000,      // 3 seconds between tests
    categoryDelay: 5000,  // 5 seconds between categories  
    iterationDelay: 1000, // 1 second between iterations
    maxConcurrentRequests: 1
  },
  
  // Gemini paid tier: higher limits
  gemini_paid: {
    testDelay: 1000,      // 1 second between tests
    categoryDelay: 2000,  // 2 seconds between categories
    iterationDelay: 500,  // 0.5 seconds between iterations
    maxConcurrentRequests: 2
  },
  
  // OpenAI rate limits
  openai: {
    testDelay: 2000,      // 2 seconds between tests
    categoryDelay: 3000,  // 3 seconds between categories
    iterationDelay: 800,  // 0.8 seconds between iterations
    maxConcurrentRequests: 3
  },
  
  // Conservative settings for any provider
  conservative: {
    testDelay: 5000,      // 5 seconds between tests
    categoryDelay: 10000, // 10 seconds between categories
    iterationDelay: 2000, // 2 seconds between iterations
    maxConcurrentRequests: 1
  }
};

/**
 * Get rate limit config based on environment or provider
 */
export function getRateLimitConfig(): RateLimitConfig {
  const provider = process.env.AI_PROVIDER?.toLowerCase() || 'gemini_free';
  
  // Check for custom environment variables
  if (process.env.RATE_LIMIT_TEST_DELAY) {
    return {
      testDelay: parseInt(process.env.RATE_LIMIT_TEST_DELAY || '3000') || 3000,
      categoryDelay: parseInt(process.env.RATE_LIMIT_CATEGORY_DELAY || '5000') || 5000,
      iterationDelay: parseInt(process.env.RATE_LIMIT_ITERATION_DELAY || '1000') || 1000,
      maxConcurrentRequests: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT || '1') || 1
    };
  }
  
  return RATE_LIMIT_CONFIGS[provider] || RATE_LIMIT_CONFIGS.gemini_free;
}

/**
 * Helper function for consistent sleeping across test suites
 */
export async function rateLimitedSleep(duration: number, message?: string): Promise<void> {
  if (message) {
    console.log(`   ⏳ ${message} (${duration/1000}s)`);
  }
  return new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * Rate limiting decorator for test functions
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T, 
  delay: number
): T {
  return (async (...args: any[]) => {
    const result = await fn(...args);
    await rateLimitedSleep(delay, `Rate limiting delay`);
    return result;
  }) as T;
}