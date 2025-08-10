/**
 * Convert JSON Schema to Zod string representation
 * A comprehensive converter that handles most JSON Schema features
 */
export function jsonSchemaToZodString(jsonSchemaString: string): string {
  // Parse the JSON Schema string
  const schema = JSON.parse(jsonSchemaString);
  
  // Helper function to resolve $ref references
  function resolveRef(schema: any, rootSchema: any): any {
    if (schema && typeof schema === 'object' && schema.$ref) {
      const refPath = schema.$ref.replace('#/', '').split('/');
      let resolved = rootSchema;
      for (const part of refPath) {
        resolved = resolved[part];
      }
      return resolved;
    }
    return schema;
  }
  
  // Helper function to convert a schema object to Zod string
  function schemaToZod(schema: any, indent: number = 0, rootSchema: any = schema): string {
    // Resolve $ref if present
    schema = resolveRef(schema, rootSchema);
    const indentStr = '  '.repeat(indent);
    
    // Handle boolean schemas
    if (typeof schema === 'boolean') {
      return schema ? 'z.any()' : 'z.never()';
    }
    
    // Handle null or undefined schemas
    if (!schema || typeof schema !== 'object') {
      return 'z.any()';
    }
    
    // Handle const
    if ('const' in schema) {
      const value = schema.const;
      if (value === null) return 'z.literal(null)';
      if (typeof value === 'string') return `z.literal("${value.replace(/"/g, '\\"')}")`;
      if (typeof value === 'number') return `z.literal(${value})`;
      if (typeof value === 'boolean') return `z.literal(${value})`;
      return `z.literal(${JSON.stringify(value)})`;
    }
    
    // Handle enum
    if (schema.enum && Array.isArray(schema.enum)) {
      if (schema.enum.length === 1) {
        const value = schema.enum[0];
        if (value === null) return 'z.literal(null)';
        if (typeof value === 'string') return `z.literal("${value.replace(/"/g, '\\"')}")`;
        return `z.literal(${JSON.stringify(value)})`;
      }
      const literals = schema.enum.map((v: any) => {
        if (v === null) return 'z.literal(null)';
        if (typeof v === 'string') return `z.literal("${v.replace(/"/g, '\\"')}")`;
        if (typeof v === 'number' || typeof v === 'boolean') return `z.literal(${v})`;
        return `z.literal(${JSON.stringify(v)})`;
      });
      return `z.union([${literals.join(', ')}])`;
    }
    
    // Handle schema composition
    if (schema.allOf && Array.isArray(schema.allOf)) {
      const schemas = schema.allOf.map((s: any) => schemaToZod(s, indent, rootSchema));
      if (schemas.length === 1) return schemas[0];
      // For allOf, we need to merge schemas - simplified approach
      return `z.intersection(${schemas.join(', ')})`;
    }
    
    if (schema.anyOf && Array.isArray(schema.anyOf)) {
      const schemas = schema.anyOf.map((s: any) => schemaToZod(s, indent, rootSchema));
      if (schemas.length === 1) return schemas[0];
      return `z.union([${schemas.join(', ')}])`;
    }
    
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
      const schemas = schema.oneOf.map((s: any) => schemaToZod(s, indent, rootSchema));
      if (schemas.length === 1) return schemas[0];
      // oneOf is similar to union in Zod (discriminated unions would be more accurate but complex)
      return `z.union([${schemas.join(', ')}])`;
    }
    
    if (schema.not) {
      // Zod doesn't have direct negation, use z.any() with refinement
      return `z.any().refine((val) => !${schemaToZod(schema.not, indent, rootSchema)}.safeParse(val).success)`;
    }
    
    // Determine type (explicit or implicit)
    let type = schema.type;
    
    // Implicit type detection
    if (!type) {
      if (schema.properties || schema.required || schema.additionalProperties !== undefined || 
          schema.minProperties !== undefined || schema.maxProperties !== undefined) {
        type = 'object';
      } else if (schema.items !== undefined || schema.prefixItems || schema.contains || 
                 schema.minItems !== undefined || schema.maxItems !== undefined || 
                 schema.uniqueItems !== undefined) {
        type = 'array';
      } else if (schema.pattern || schema.minLength !== undefined || schema.maxLength !== undefined) {
        type = 'string';
      } else if (schema.minimum !== undefined || schema.maximum !== undefined || 
                 schema.exclusiveMinimum !== undefined || schema.exclusiveMaximum !== undefined || 
                 schema.multipleOf !== undefined) {
        type = 'number';
      }
    }
    
    // Handle multiple types
    if (Array.isArray(type)) {
      const typeSchemas = type.map(t => {
        const typeSchema = { ...schema, type: t };
        delete typeSchema.type;
        return schemaToZod({ ...typeSchema, type: t }, indent, rootSchema);
      });
      return `z.union([${typeSchemas.join(', ')}])`;
    }
    
    // Build Zod schema based on type
    let zodStr = '';
    
    switch (type) {
      case 'null':
        zodStr = 'z.null()';
        break;
        
      case 'string': {
        zodStr = 'z.string()';
        if (typeof schema.minLength === 'number') {
          zodStr += `.min(${schema.minLength})`;
        }
        if (typeof schema.maxLength === 'number') {
          zodStr += `.max(${schema.maxLength})`;
        }
        if (schema.pattern) {
          zodStr += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`;
        }
        break;
      }
      
      case 'integer':
      case 'number': {
        zodStr = 'z.number()';
        if (type === 'integer') {
          zodStr += '.int()';
        }
        if (typeof schema.minimum === 'number') {
          zodStr += `.min(${schema.minimum})`;
        }
        if (typeof schema.maximum === 'number') {
          zodStr += `.max(${schema.maximum})`;
        }
        if (typeof schema.exclusiveMinimum === 'number') {
          zodStr += `.refine(v => v > ${schema.exclusiveMinimum}, { message: "Must be > ${schema.exclusiveMinimum}" })`;
        }
        if (typeof schema.exclusiveMaximum === 'number') {
          zodStr += `.refine(v => v < ${schema.exclusiveMaximum}, { message: "Must be < ${schema.exclusiveMaximum}" })`;
        }
        if (typeof schema.multipleOf === 'number') {
          zodStr += `.multipleOf(${schema.multipleOf})`;
        }
        break;
      }
      
      case 'boolean': {
        zodStr = 'z.boolean()';
        break;
      }
      
      case 'array': {
        // Handle prefixItems (tuple validation)
        if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
          const tupleItems = schema.prefixItems.map((item: any) => schemaToZod(item, indent, rootSchema));
          zodStr = `z.tuple([${tupleItems.join(', ')}])`;
          
          // Handle additional items after prefixItems
          if (schema.items !== undefined) {
            if (schema.items === false) {
              // No additional items allowed beyond prefixItems
              zodStr += `.transform(arr => arr.slice(0, ${schema.prefixItems.length}))`;
            } else if (schema.items === true) {
              // Any additional items allowed - convert to regular array
              zodStr = `z.array(z.any())`;
            } else {
              // Additional items must match schema - use rest
              const itemSchema = schemaToZod(schema.items, indent, rootSchema);
              zodStr += `.rest(${itemSchema})`;
            }
          }
        } else if (schema.items !== undefined) {
          if (schema.items === false) {
            zodStr = 'z.array(z.never()).length(0)';
          } else if (schema.items === true) {
            zodStr = 'z.array(z.any())';
          } else if (Array.isArray(schema.items)) {
            // Legacy tuple syntax
            const tupleItems = schema.items.map((item: any) => schemaToZod(item, indent, rootSchema));
            zodStr = `z.tuple([${tupleItems.join(', ')}])`;
          } else {
            const itemsZod = schemaToZod(schema.items, indent, rootSchema);
            zodStr = `z.array(${itemsZod})`;
          }
        } else {
          zodStr = 'z.array(z.any())';
        }
        
        // Apply array constraints
        if (typeof schema.minItems === 'number' && !zodStr.includes('tuple')) {
          zodStr += `.min(${schema.minItems})`;
        }
        if (typeof schema.maxItems === 'number' && !zodStr.includes('tuple')) {
          zodStr += `.max(${schema.maxItems})`;
        }
        
        // Handle uniqueItems
        if (schema.uniqueItems === true) {
          zodStr += '.refine(arr => new Set(arr).size === arr.length, { message: "Array must contain unique items" })';
        }
        
        // Handle contains
        if (schema.contains) {
          const containsSchema = schemaToZod(schema.contains, indent, rootSchema);
          const minContains = schema.minContains || 1;
          const maxContains = schema.maxContains;
          
          let containsRefine = `.refine(arr => {
            const matches = arr.filter(item => ${containsSchema}.safeParse(item).success).length;
            return matches >= ${minContains}${maxContains !== undefined ? ` && matches <= ${maxContains}` : ''};
          }, { message: "Contains validation failed" })`;
          
          zodStr += containsRefine;
        }
        break;
      }
      
      case 'object': {
        const properties = schema.properties || {};
        const required = schema.required || [];
        const additionalProperties = schema.additionalProperties;
        
        if (Object.keys(properties).length === 0 && additionalProperties === undefined) {
          zodStr = 'z.object({})';
        } else {
          // Build the properties string
          const propStrings: string[] = [];
          const nextIndent = indent + 1;
          const nextIndentStr = '  '.repeat(nextIndent);
          
          for (const [key, propSchema] of Object.entries(properties)) {
            const isRequired = required.includes(key);
            let propZod = schemaToZod(propSchema, nextIndent, rootSchema);
            
            // Add .optional() if not required
            if (!isRequired) {
              propZod += '.optional()';
            }
            
            // Handle property name (quote if necessary)
            const propKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
            propStrings.push(`${nextIndentStr}${propKey}: ${propZod}`);
          }
          
          if (propStrings.length > 0) {
            zodStr = `z.object({\n${propStrings.join(',\n')}\n${indentStr}})`;
          } else {
            zodStr = 'z.object({})';
          }
          
          // Handle additionalProperties
          if (additionalProperties === false) {
            zodStr += '.strict()';
          } else if (additionalProperties === true) {
            zodStr += '.passthrough()';
          } else if (additionalProperties && typeof additionalProperties === 'object') {
            // Additional properties must match a schema
            const additionalSchema = schemaToZod(additionalProperties, indent, rootSchema);
            zodStr += `.catchall(${additionalSchema})`;
          }
        }
        
        // Apply object constraints
        if (typeof schema.minProperties === 'number') {
          zodStr += `.refine(obj => Object.keys(obj).length >= ${schema.minProperties}, { message: "Minimum ${schema.minProperties} properties required" })`;
        }
        if (typeof schema.maxProperties === 'number') {
          zodStr += `.refine(obj => Object.keys(obj).length <= ${schema.maxProperties}, { message: "Maximum ${schema.maxProperties} properties allowed" })`;
        }
        break;
      }
      
      default: {
        // For unsupported types or no type specified
        zodStr = 'z.any()';
      }
    }
    
    // Add description if present
    if (schema.description) {
      zodStr += `.describe("${schema.description.replace(/"/g, '\\"')}")`;
    }
    
    return zodStr || 'z.any()';
  }
  
  // Convert the schema and return the result
  return schemaToZod(schema, 0, schema);
}

/**
 * Convert a parsed JSON Schema object directly to Zod string
 */
export function jsonSchemaObjectToZodString(schema: any): string {
  return jsonSchemaToZodString(JSON.stringify(schema));
}