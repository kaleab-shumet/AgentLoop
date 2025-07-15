import { JsonSchemaXmlParser } from '../core/utils/JsonSchemaXmlParser';
import { z } from 'zod';

describe('JsonSchemaXmlParser Array Handling', () => {
  let parser: JsonSchemaXmlParser;

  beforeEach(() => {
    parser = new JsonSchemaXmlParser();
  });

  describe('Simple Array Handling', () => {
    test('should handle array of strings', () => {
      const schema = z.object({
        tags: z.array(z.string())
      });

      const xml = `
        <root>
          <tags>value1</tags>
          <tags>value2</tags>
          <tags>value3</tags>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.tags).toEqual(['value1', 'value2', 'value3']);
    });

    test('should handle array of numbers', () => {
      const schema = z.object({
        numbers: z.array(z.number())
      });

      const xml = `
        <root>
          <numbers>1</numbers>
          <numbers>2</numbers>
          <numbers>3</numbers>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.numbers).toEqual([1, 2, 3]);
    });

    test('should handle array of booleans', () => {
      const schema = z.object({
        flags: z.array(z.boolean())
      });

      const xml = `
        <root>
          <flags>true</flags>
          <flags>false</flags>
          <flags>1</flags>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.flags).toEqual([true, false, true]);
    });

    test('should handle single element arrays', () => {
      const schema = z.object({
        items: z.array(z.string())
      });

      const xml = `
        <root>
          <items>single</items>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.items).toEqual(['single']);
    });

    test('should handle empty arrays', () => {
      const schema = z.object({
        items: z.array(z.string())
      });

      const xml = `
        <root>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.items).toBeUndefined();
    });
  });

  describe('Nested Array Handling', () => {
    test('should handle arrays of objects', () => {
      const schema = z.object({
        users: z.array(z.object({
          name: z.string(),
          age: z.number()
        }))
      });

      const xml = `
        <root>
          <users>
            <name>John</name>
            <age>25</age>
          </users>
          <users>
            <name>Jane</name>
            <age>30</age>
          </users>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.users).toEqual([
        { name: 'John', age: 25 },
        { name: 'Jane', age: 30 }
      ]);
    });

    test('should handle nested arrays', () => {
      const schema = z.object({
        matrix: z.array(z.array(z.number()))
      });

      const xml = `
        <root>
          <matrix>
            <item>1</item>
            <item>2</item>
          </matrix>
          <matrix>
            <item>3</item>
            <item>4</item>
          </matrix>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.matrix).toBeDefined();
      expect(Array.isArray(result.root.matrix)).toBe(true);
    });

    test('should handle objects with array properties', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          hobbies: z.array(z.string()),
          scores: z.array(z.number())
        })
      });

      const xml = `
        <root>
          <user>
            <name>John</name>
            <hobbies>reading</hobbies>
            <hobbies>gaming</hobbies>
            <scores>95</scores>
            <scores>87</scores>
          </user>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.user.name).toBe('John');
      expect(result.root.user.hobbies).toEqual(['reading', 'gaming']);
      expect(result.root.user.scores).toEqual([95, 87]);
    });
  });

  describe('Complex Array Structures', () => {
    test('should handle optional arrays', () => {
      const schema = z.object({
        optionalArray: z.array(z.string()).optional()
      });

      const xml = `
        <root>
          <optionalArray>value1</optionalArray>
          <optionalArray>value2</optionalArray>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.optionalArray).toEqual(['value1', 'value2']);
    });

    test('should handle arrays with mixed wrapper types', () => {
      const schema = z.object({
        mixed: z.array(z.string().optional()).default([])
      });

      const xml = `
        <root>
          <mixed>value1</mixed>
          <mixed>value2</mixed>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.mixed).toEqual(['value1', 'value2']);
    });

    test('should handle union types in arrays', () => {
      const schema = z.object({
        unionArray: z.array(z.union([z.string(), z.number()]))
      });

      const xml = `
        <root>
          <unionArray>text</unionArray>
          <unionArray>42</unionArray>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.unionArray).toEqual(['text', 42]);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed XML gracefully', () => {
      const schema = z.object({
        items: z.array(z.string())
      });

      const malformedXml = `
        <root>
          <items>value1</items>
          <items>value2</items>
        </root
      `;

      expect(() => {
        parser.parse(malformedXml, [schema], 'root');
      }).toThrow('XML parsing failed');
    });

    test('should handle empty XML string', () => {
      const schema = z.object({
        items: z.array(z.string())
      });

      expect(() => {
        parser.parse('', [schema], 'root');
      }).toThrow('XML string cannot be empty');
    });

    test('should handle invalid schema gracefully', () => {
      const xml = `
        <root>
          <items>value1</items>
        </root>
      `;

      expect(() => {
        parser.parse(xml, [], 'root');
      }).toThrow('Reference schemas must be a non-empty array');
    });
  });

  describe('Edge Cases', () => {
    test('should handle deeply nested structures', () => {
      const schema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.array(z.string())
          })
        })
      });

      const xml = `
        <root>
          <level1>
            <level2>
              <level3>deep1</level3>
              <level3>deep2</level3>
            </level2>
          </level1>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.level1.level2.level3).toEqual(['deep1', 'deep2']);
    });

    test('should handle multiple schemas with overlapping paths', () => {
      const schema1 = z.object({
        items: z.array(z.string())
      });

      const schema2 = z.object({
        items: z.array(z.number())
      });

      const xml = `
        <root>
          <items>value1</items>
          <items>value2</items>
        </root>
      `;

      // Should not throw an error with multiple schemas
      const result = parser.parse(xml, [schema1, schema2], 'root');
      expect(result.root.items).toBeDefined();
      expect(Array.isArray(result.root.items)).toBe(true);
    });

    test('should handle XML with attributes (ignored)', () => {
      const schema = z.object({
        items: z.array(z.string())
      });

      const xml = `
        <root>
          <items type="string">value1</items>
          <items type="string">value2</items>
        </root>
      `;

      const result = parser.parse(xml, [schema], 'root');
      expect(result.root.items).toEqual(['value1', 'value2']);
    });
  });
});