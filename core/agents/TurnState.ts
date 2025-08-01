/**
 * TurnState - Thread-safe key-value store for sharing data between tools during parallel execution
 * 
 * Features:
 * - Per-key locking to prevent race conditions
 * - Type-safe get/set operations
 * - Guaranteed undefined return for missing keys
 * - Automatic lock cleanup and memory management
 */
export class TurnState {
    private store: Map<string, any> = new Map();
    private accessLock: Map<string, Promise<void>> = new Map();
  
    private async withLock<T>(key: string, operation: () => T | Promise<T>): Promise<T> {
      // Wait for any existing lock on this key
      const existingLock = this.accessLock.get(key);
      if (existingLock) {
        await existingLock;
      }
      
      // Create new lock
      let resolve: () => void;
      const lock = new Promise<void>((res) => { resolve = res; });
      this.accessLock.set(key, lock);
      
      try {
        const result = await operation();
        return result;
      } finally {
        // Release lock
        this.accessLock.delete(key);
        resolve!();
      }
    }
  
    /**
     * Set a value for the given key. Thread-safe.
     */
    async set(key: string, value: any): Promise<void> {
      await this.withLock(key, () => {
        this.store.set(key, value);
      });
    }
  
    /**
     * Get a value for the given key. Returns undefined if key doesn't exist.
     * Thread-safe with per-key locking.
     */
    async get<T>(key: string): Promise<T | undefined> {
      return this.withLock(key, () => {
        if (!this.store.has(key)) {
          return undefined;
        }
        const value = this.store.get(key);
        return value as T;
      });
    }
  
    async has(key: string): Promise<boolean> {
      return this.withLock(key, () => {
        return this.store.has(key);
      });
    }
  
    async getOrFail<T>(key: string): Promise<T> {
      return this.withLock(key, () => {
        if (!this.store.has(key)) {
          throw new Error(`State Error: Required key '${key}' not found in the current turn's state.`);
        }
        return this.store.get(key) as T;
      });
    }
  
    async getAndClear<T>(key: string): Promise<T | undefined> {
      return this.withLock(key, () => {
        if (!this.store.has(key)) {
          return undefined;
        }
        const value = this.store.get(key);
        this.store.delete(key);
        return value as T;
      });
    }
  
    async clear(): Promise<void> {
      // Clear all locks first
      const allLocks = Array.from(this.accessLock.values());
      await Promise.all(allLocks);
      
      this.store.clear();
      this.accessLock.clear();
    }

    /**
     * Synchronous versions for backward compatibility (use with caution in parallel execution)
     * These bypass the locking mechanism and should only be used when you're certain
     * no other tools are accessing the same keys concurrently.
     */
    setSync(key: string, value: any): void {
      this.store.set(key, value);
    }
  
    /**
     * Synchronous get - returns undefined if key doesn't exist.
     * WARNING: Not thread-safe - use async get() for parallel execution.
     */
    getSync<T>(key: string): T | undefined {
      if (!this.store.has(key)) {
        return undefined;
      }
      const value = this.store.get(key);
      return value as T;
    }
  
    hasSync(key: string): boolean {
      return this.store.has(key);
    }
  }

  