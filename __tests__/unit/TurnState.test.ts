import { TurnState } from '../../core/agents/TurnState';

describe('TurnState', () => {
  let turnState: TurnState;

  beforeEach(() => {
    turnState = new TurnState();
  });

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      turnState.set('key1', 'value1');
      turnState.set('key2', 42);
      
      expect(turnState.get('key1')).toBe('value1');
      expect(turnState.get('key2')).toBe(42);
    });

    it('should return undefined for non-existent keys', () => {
      expect(turnState.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      turnState.set('existing', 'value');
      
      expect(turnState.has('existing')).toBe(true);
      expect(turnState.has('nonexistent')).toBe(false);
    });
  });

  describe('getOrFail', () => {
    it('should return value if key exists', () => {
      turnState.set('test', 'value');
      
      expect(turnState.getOrFail('test')).toBe('value');
    });

    it('should throw error if key does not exist', () => {
      expect(() => {
        turnState.getOrFail('nonexistent');
      }).toThrow("State Error: Required key 'nonexistent' not found in the current turn's state.");
    });
  });

  describe('getAndClear', () => {
    it('should return value and remove it', () => {
      turnState.set('temp', 'temporary');
      
      const value = turnState.getAndClear('temp');
      
      expect(value).toBe('temporary');
      expect(turnState.has('temp')).toBe(false);
      expect(turnState.get('temp')).toBeUndefined();
    });

    it('should return undefined for non-existent keys', () => {
      const value = turnState.getAndClear('nonexistent');
      
      expect(value).toBeUndefined();
    });
  });

  describe('Type Safety', () => {
    it('should handle different data types', () => {
      const obj = { name: 'test', value: 123 };
      const arr = [1, 2, 3];
      const bool = true;
      const num = 42;
      
      turnState.set('object', obj);
      turnState.set('array', arr);
      turnState.set('boolean', bool);
      turnState.set('number', num);
      
      expect(turnState.get('object')).toEqual(obj);
      expect(turnState.get('array')).toEqual(arr);
      expect(turnState.get('boolean')).toBe(bool);
      expect(turnState.get('number')).toBe(num);
    });

    it('should work with generic types', () => {
      interface TestInterface {
        id: number;
        name: string;
      }
      
      const testObj: TestInterface = { id: 1, name: 'test' };
      turnState.set('typed', testObj);
      
      const retrieved = turnState.get<TestInterface>('typed');
      expect(retrieved).toEqual(testObj);
      expect(retrieved?.id).toBe(1);
      expect(retrieved?.name).toBe('test');
    });
  });

  describe('State Isolation', () => {
    it('should maintain separate state instances', () => {
      const state1 = new TurnState();
      const state2 = new TurnState();
      
      state1.set('key', 'value1');
      state2.set('key', 'value2');
      
      expect(state1.get('key')).toBe('value1');
      expect(state2.get('key')).toBe('value2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values', () => {
      turnState.set('null', null);
      turnState.set('undefined', undefined);
      
      expect(turnState.get('null')).toBeNull();
      expect(turnState.get('undefined')).toBeUndefined();
      expect(turnState.has('null')).toBe(true);
      expect(turnState.has('undefined')).toBe(true);
    });

    it('should handle empty string keys', () => {
      turnState.set('', 'empty key');
      
      expect(turnState.get('')).toBe('empty key');
      expect(turnState.has('')).toBe(true);
    });

    it('should handle overwriting values', () => {
      turnState.set('key', 'original');
      turnState.set('key', 'updated');
      
      expect(turnState.get('key')).toBe('updated');
    });
  });
});