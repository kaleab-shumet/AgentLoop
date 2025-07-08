import { convertJsonSchemaToXsd } from './JsonToXsd';

const testCases = [
  {
    name: 'Simple string property',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    },
    rootElementName: 'root'
  },
  {
    name: 'Object with number and boolean',
    schema: {
      type: 'object',
      properties: {
        age: { type: 'number' },
        isActive: { type: 'boolean' }
      },
      required: ['age']
    },
    rootElementName: 'root'
  },
  {
    name: 'Array of strings',
    schema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    rootElementName: 'root'
  },
  {
    name: 'Nested object',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            profile: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                age: { type: 'integer' }
              },
              required: ['email']
            }
          },
          required: ['id']
        }
      },
      required: ['user']
    },
    rootElementName: 'root'
  },
  {
    name: 'Enum and pattern',
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'pending']
        },
        code: {
          type: 'string',
          pattern: '^[A-Z]{3}-\\d{3}$'
        }
      }
    },
    rootElementName: 'root'
  },
  {
    name: 'Complex: allOf, anyOf, oneOf',
    schema: {
      type: 'object',
      properties: {
        data: {
          allOf: [
            { type: 'object', properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'number' } } }
          ]
        },
        choice: {
          anyOf: [
            { type: 'string' },
            { type: 'number' }
          ]
        },
        option: {
          oneOf: [
            { type: 'boolean' },
            { type: 'null' }
          ]
        }
      }
    },
    rootElementName: 'root'
  },
  {
    name: 'Highly nested and referenced',
    schema: {
      type: 'object',
      definitions: {
        Address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' }
          },
          required: ['street']
        }
      },
      properties: {
        person: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { $ref: '#/definitions/Address' }
          },
          required: ['name', 'address']
        }
      },
      required: ['person']
    },
    rootElementName: 'root'
  }
];

testCases.forEach((testCase, idx) => {
  const { name, schema, rootElementName } = testCase;
  // Clean schema to remove undefined values
  function cleanSchema(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(cleanSchema);
    } else if (obj && typeof obj === 'object') {
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        if (obj[key] !== undefined) {
          newObj[key] = cleanSchema(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  }
  const cleanedSchema = cleanSchema(schema);
  // Pass rootElementName as a direct argument if supported, otherwise omit it from options
  const xsd = convertJsonSchemaToXsd(cleanedSchema, rootElementName ? { rootElementName } as any : undefined);
  console.log(`\n===== Test Case ${idx + 1}: ${name} =====`);
  console.log('JSON Schema:');
  console.log(JSON.stringify(cleanedSchema, null, 2));
  console.log('XSD Output:');
  console.log(xsd);
});