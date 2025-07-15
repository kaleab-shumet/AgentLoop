
import { XMLParser } from 'fast-xml-parser';

/**
 * Custom XML parser specifically designed for XML generated from JSON Schema -> XSD -> XML pipeline.
 * Automatically restores original JSON array structures by flattening array wrapper elements.
 */
export class JsonSchemaXmlParser {
  private parser: XMLParser;
  private customPatterns?: Array<{parent: string, child: string}>;
  constructor(options: any = {}) {
    // Default parser configuration optimized for JSON Schema generated XML
    this.parser = new XMLParser({
      ignoreAttributes: true,        // Attributes don't matter for data restoration
      trimValues: true,              // Clean up whitespace
      parseTagValue: false,          // Keep string values as strings
      parseTrueNumberOnly: false,    // Preserve number types from original JSON
      parseNodeValue: true,          // Parse node values
      parseAttributeValue: false,    // Skip attribute parsing
      ...options                     // Allow custom overrides
    });
  }
  
  /**
   * Parse XML string and restore original JSON Schema array structures
   * @param {string} xmlString - XML string to parse
   * @returns {Object} - Parsed object with flattened array structures
   */
  parse(xmlString: string): any {
    if (typeof xmlString !== 'string') {
      throw new Error('Input must be a valid XML string');
    }
    
    try {
      const parsed = this.parser.parse(xmlString);
      return this.flattenArrayWrappers(parsed);
    } catch (error: any) {
      throw new Error(`XML parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Recursively flatten array wrapper elements based on JSON Schema -> XSD conversion patterns
   * @param {*} obj - Object to process
   * @returns {*} - Processed object with flattened arrays
   */
  private flattenArrayWrappers(obj: any): any {
    // Handle primitive values and arrays
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return Array.isArray(obj) ? obj.map(item => this.flattenArrayWrappers(item)) : obj;
    }
    
    const result: { [key: string]: any } = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const props = Object.keys(value);
        
        // Check for single-property objects that might be array wrappers
        if (props.length === 1) {
          const childKey = props[0];
          const childValue = (value as any)[childKey];
          
          // Detect array patterns based on JSON Schema -> XSD generation rules
          if (this.isArrayPattern(key, childKey) || this.matchesCustomPattern(key, childKey)) {
            // This was originally an array in JSON Schema
            if (Array.isArray(childValue)) {
              // Multiple elements - keep as array
              result[key] = childValue.map(item => this.flattenArrayWrappers(item));
            } else {
              // Single element - restore as single-item array
              result[key] = [this.flattenArrayWrappers(childValue)];
            }
          } else {
            // Regular nested object - recurse without flattening
            result[key] = this.flattenArrayWrappers(value);
          }
        } else {
          // Multiple properties - definitely not an array wrapper
          result[key] = this.flattenArrayWrappers(value);
        }
      } else {
        // Primitive value or array - keep as-is (arrays handled above)
        result[key] = Array.isArray(value) ? 
          value.map(item => this.flattenArrayWrappers(item)) : value;
      }
    }
    
    return result;
  }
  
  /**
   * Detect if a parent-child key pair represents an array pattern from JSON Schema -> XSD conversion
   * Based on the naming patterns used in JsonSchemaToXsdConverter.generateArrayItems()
   * @param {string} parentKey - Parent element name
   * @param {string} childKey - Child element name  
   * @returns {boolean} - True if this represents an array pattern
   */
  private isArrayPattern(parentKey: string, childKey: string): boolean {
    // Pattern 1: Plural parent with singular child (texts -> text, items -> item)
    // This matches the schema.title.replace(/s$/, '') logic in your XSD generator
    if (parentKey.endsWith('s') && parentKey.length > 1) {
      const singular = parentKey.slice(0, -1);
      if (childKey === singular) {
        return true;
      }
    }
    
    // Pattern 2: Generic 'item' child name (default fallback in your XSD generator)
    if (childKey === 'item') {
      return true;
    }
    
    // Pattern 3: Common array naming patterns
    const commonArrayPatterns = [
      // Plural to singular transformations
      { parent: /ies$/, child: (p: string) => p.replace(/ies$/, 'y') },      // stories -> story
      { parent: /ves$/, child: (p: string) => p.replace(/ves$/, 'f') },      // leaves -> leaf
      { parent: /children$/, child: () => 'child' },                 // children -> child
      { parent: /people$/, child: () => 'person' },                  // people -> person
      { parent: /data$/, child: () => 'datum' },                     // data -> datum
    ];
    
    for (const pattern of commonArrayPatterns) {
      if (pattern.parent.test(parentKey)) {
        const expectedChild = typeof pattern.child === 'function' ? 
          (pattern.child as (p: string) => string)(parentKey) : pattern.child;
        if (childKey === expectedChild) {
          return true;
        }
      }
    }
    
    // Pattern 4: Element/elements pattern
    if (parentKey === 'elements' && childKey === 'element') {
      return true;
    }
    
    // Pattern 5: List suffix pattern (itemList -> item)
    if (parentKey.endsWith('List') && parentKey.length > 4) {
      const withoutList = parentKey.slice(0, -4);
      if (childKey === withoutList || childKey === withoutList.toLowerCase()) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Add custom array patterns for specific use cases
   * @param {Array<{parent: string, child: string}>} patterns - Array of parent-child patterns
   */
  addCustomPatterns(patterns: Array<{parent: string, child: string}>): void {
    this.customPatterns = this.customPatterns || [];
    this.customPatterns.push(...patterns);
  }
  
  /**
   * Check if a parent-child pair matches any custom patterns
   * @param {string} parentKey - Parent element name
   * @param {string} childKey - Child element name
   * @returns {boolean} - True if matches custom pattern
   */
  private matchesCustomPattern(parentKey: string, childKey: string): boolean {
    if (!this.customPatterns) return false;
    
    return this.customPatterns.some(pattern => 
      pattern.parent === parentKey && pattern.child === childKey
    );
  }
}