export class TurnState {
    private store: Map<string, any> = new Map();
  
    set(key: string, value: any): void {
      this.store.set(key, value);
    }
  
    get<T>(key: string): T | undefined {
      return this.store.get(key) as T;
    }
  
    has(key: string): boolean {
      return this.store.has(key);
    }
  
    getOrFail<T>(key: string): T {
      if (!this.store.has(key)) {
        throw new Error(`State Error: Required key '${key}' not found in the current turn's state.`);
      }
      return this.store.get(key) as T;
    }
  
    getAndClear<T>(key: string): T | undefined {
      if (!this.store.has(key)) {
        return undefined;
      }
      const value = this.store.get(key);
      this.store.delete(key);
      return value as T;
    }
  
    clear(): void {
      this.store.clear();
    }
  }

  