// ===================================================================================
// ============================= PRODUCTION-GRADE CODE ===============================
// ===================================================================================

/**
 * A custom error class for handling specific conversion errors.
 */
export class XsdConversionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'XsdConversionError';
    }
  }
  
  /**
   * Defines a more complete interface for a subset of the JSON Schema specification.
   * This interface is designed to cover the JSON Schema features that are commonly
   * convertible to XSD 1.0.
   */
  export interface JsonSchema {
    type?: string | string[];
    properties?: { [key: string]: JsonSchema };
    items?: JsonSchema | boolean;
    required?: string[];
    title?: string;
    description?: string;
    enum?: any[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    additionalProperties?: boolean | JsonSchema;
    $ref?: string;
    definitions?: { [key: string]: JsonSchema };
    components?: { schemas: { [key: string]: JsonSchema } }; // For OpenAPI 3.x support
    oneOf?: JsonSchema[];
    anyOf?: JsonSchema[];
    allOf?: JsonSchema[];
    minItems?: number;
    maxItems?: number;
    // Added to handle default values, though XSD defaults are limited to simple types
    default?: any; 
  }
  
  /**
   * Defines the options for the JSON Schema to XSD converter.
   */
  export interface XsdOptions {
    targetNamespace?: string;
    namespacePrefix?: string;
    elementFormDefault?: 'qualified' | 'unqualified';
    rootElementName?: string;
    // Option to include documentation from description fields
    includeDocumentation?: boolean; 
  }
  
  /**
   * Converts JSON Schema documents to XML Schema Definition (XSD) 1.0.
   *
   * This class implements a two-pass conversion process:
   * 1. **Type Discovery:** It traverses the entire schema to identify and assign unique names
   * to all complex types, simple types with restrictions, and definitions. This resolves
   * the issue of forward references and ensures all necessary types are defined globally.
   * 2. **XSD Generation:** It constructs the XSD string by generating the header, root element,
   * and all the named type definitions discovered in the first pass.
   *
   * Limitations:
   * - Maps both `oneOf` and `anyOf` to `<xs:choice>`, as XSD 1.0 cannot enforce the
   * "exactly one" constraint of `oneOf`.
   * - Advanced JSON Schema features like `not`, `if/then/else`, `const`, `dependentSchemas`,
   * and complex dependencies are not supported.
   * - XSD 1.0 does not directly support `patternProperties` or `propertyNames`.
   * - Default values are only applied to simple types where applicable in XSD.
   * - Union types (e.g., `type: ["string", "number"]` other than `null`) are mapped to `xs:anyType`
   * or the primary type if `null` is present.
   */
  export class JsonSchemaToXsdConverter {
    // Stores globally defined schemas (from definitions/components/schemas)
    private globalDefinitions: { [key: string]: JsonSchema } = {};
    // Maps a JsonSchema object instance to its assigned XSD type name
    private schemaRegistry: Map<JsonSchema, string> = new Map();
    // Stores all assigned XSD type names to ensure uniqueness and prevent collisions
    private registeredTypeNames: Set<string> = new Set();
    // Counter for generating unique names for anonymous types
    private anonymousTypeCounter = 1;
    // Configuration options for the conversion
    private readonly options: Required<XsdOptions>;
  
    // Static map for XML character escaping for improved performance and readability.
    private static readonly XML_ESCAPES: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };
  
    constructor(options: XsdOptions = {}) {
      // Merge provided options with robust defaults
      this.options = {
        targetNamespace: 'http://example.com/schema',
        namespacePrefix: 'tns',
        elementFormDefault: 'qualified',
        rootElementName: 'root',
        includeDocumentation: true, // Default to including documentation
        ...options,
      };
    }
  
    /**
     * Converts a JSON Schema object into an XSD string.
     * @param jsonSchema The root JSON Schema object.
     * @param rootElementName The name for the root element in the XSD. If not provided,
     * the `defaultRootElementName` from the options is used.
     * @returns A string containing the generated XSD.
     * @throws {XsdConversionError} if the schema is invalid or conversion fails.
     */
    public convert(jsonSchema: JsonSchema, rootElementName?: string): string {
      if (typeof jsonSchema !== 'object' || jsonSchema === null) {
        throw new XsdConversionError('Input JSON Schema must be a non-null object.');
      }
  
      // Reset state for a fresh conversion to ensure idempotency
      this.globalDefinitions = {
        ...(jsonSchema.definitions || {}),
        ...(jsonSchema.components?.schemas || {}),
      };
      this.schemaRegistry.clear();
      this.registeredTypeNames.clear();
      this.anonymousTypeCounter = 1;
  
      // First Pass: Discover and name all types that need a global definition.
      // This step populates the schemaRegistry with all named types.
      this.discoverTypes(jsonSchema);
  
      // Determine the final root element name and its type.
      let finalRootElementName = this.sanitizeName(rootElementName || this.options.rootElementName);
      let rootSchemaForElement = jsonSchema;
  
      // If the root schema is a $ref to a definition, use that definition for the root element's type.
      // This handles cases like Test 10 where the root is just a reference to a defined type.
      if (jsonSchema.$ref) {
          rootSchemaForElement = this.resolveRef(jsonSchema.$ref);
          // The root element name might still come from options or a provided name,
          // but its type will be the resolved definition.
          finalRootElementName = this.sanitizeName(rootElementName || jsonSchema.title || this.options.rootElementName);
      } else if (jsonSchema.title && this.globalDefinitions[jsonSchema.title] === jsonSchema) {
          // If the root schema itself IS one of the global definitions (uncommon, but possible),
          // use its definition key as the name for the type.
          finalRootElementName = this.sanitizeName(rootElementName || jsonSchema.title);
          rootSchemaForElement = jsonSchema; // It's already the correct object
      } else if (jsonSchema.title && this.globalDefinitions[jsonSchema.title] && this.globalDefinitions[jsonSchema.title] !== jsonSchema) {
          // If the root schema has a title that clashes with a global definition, but they are different objects,
          // prioritize the definition for the type, and give the root element a generic name.
          console.warn(`[Warning] Root schema title '${jsonSchema.title}' clashes with a global definition. Root element will be named '${finalRootElementName}' and its type will be the definition '${jsonSchema.title}'.`);
          rootSchemaForElement = this.globalDefinitions[jsonSchema.title]; // Use the definition object for type resolution
      } else {
          // Standard case: root element name from options or provided.
          // The rootSchemaForElement remains jsonSchema, and its type will be resolved as an anonymous type if complex.
          finalRootElementName = this.sanitizeName(rootElementName || jsonSchema.title || this.options.rootElementName);
      }
  
      const xsdHeader = this.generateXsdHeader();
      const rootElement = this.generateRootElement(rootSchemaForElement, finalRootElementName);
      const typeDefinitions = this.generateAllTypeDefinitions();
      const xsdFooter = `</xs:schema>`;
  
      return `${xsdHeader}\n${rootElement}\n${typeDefinitions}\n${xsdFooter}`;
    }
  
    // --- Type Discovery (First Pass) ---
  
    /**
     * Recursively traverses the JSON Schema to identify and register all complex types,
     * simple types with restrictions, and referenced definitions.
     * This ensures that all types requiring a global XSD definition are named and available
     * before the actual XSD generation.
     * @param schema The current JSON Schema object being processed.
     */
    private discoverTypes(schema: JsonSchema): void {
      // Prevent infinite recursion for circular references and re-processing
      if (this.schemaRegistry.has(schema) || typeof schema !== 'object' || schema === null) {
        return;
      }
  
      // If this schema object is a global definition, register it with its key name.
      // This ensures that definitions are named consistently based on their keys.
      let isGlobalDefinition = false;
      for (const key in this.globalDefinitions) {
          if (this.globalDefinitions[key] === schema) {
              isGlobalDefinition = true;
              if (!this.schemaRegistry.has(schema)) { // Only if not already registered
                  this.assignUniqueTypeName(schema, key); // Use the definition key as the name
              }
              break;
          }
      }
  
      // If it's a named type (complex or restricted simple) AND it's NOT a global definition,
      // then it's an anonymous type that needs a unique name.
      // The root schema passed to `convert` will also fall into this if it's not a $ref or a direct definition.
      if (this.isNamedType(schema) && !isGlobalDefinition) {
        const preferredName = schema.title || `AnonymousType${this.anonymousTypeCounter++}`;
        this.assignUniqueTypeName(schema, preferredName);
      }
  
      // Recurse into sub-schemas.
      // For $ref, resolve it and then discover types within the referenced schema.
      if (schema.$ref) {
        const refSchema = this.resolveRef(schema.$ref);
        this.discoverTypes(refSchema);
      }
      if (schema.properties) {
        Object.values(schema.properties).forEach(prop => this.discoverTypes(prop));
      }
      if (schema.items && typeof schema.items === 'object') {
        this.discoverTypes(schema.items);
      }
      const compositionSchemas = [...(schema.allOf || []), ...(schema.oneOf || []), ...(schema.anyOf || [])];
      compositionSchemas.forEach(subSchema => this.discoverTypes(subSchema));
    }
  
    /**
     * Assigns a unique XSD type name to a schema and registers it in the schemaRegistry
     * and registeredTypeNames set. Handles name collisions by appending a counter.
     * @param schema The JsonSchema object to name.
     * @param preferredName The desired name for the XSD type.
     * @returns The unique XSD type name assigned.
     */
    private assignUniqueTypeName(schema: JsonSchema, preferredName: string): string {
        let uniqueName = this.sanitizeName(preferredName);
        let counter = 1;
        // Keep appending a counter until a unique name is found
        while (this.registeredTypeNames.has(uniqueName)) {
            uniqueName = this.sanitizeName(`${preferredName}${counter++}`);
        }
        this.registeredTypeNames.add(uniqueName);
        this.schemaRegistry.set(schema, uniqueName);
        return uniqueName;
    }
  
    // --- XSD Generation (Second Pass) ---
  
    /**
     * Generates the XML Schema header, including namespace declarations and default settings.
     * @returns The XSD header string.
     */
    private generateXsdHeader(): string {
      const { targetNamespace, namespacePrefix, elementFormDefault } = this.options;
      return `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="${targetNamespace}"
           xmlns:${namespacePrefix}="${targetNamespace}"
           elementFormDefault="${elementFormDefault}">`;
    }
  
    /**
     * Generates the root element definition for the XSD.
     * @param schema The JSON Schema for the root element's type.
     * @param name The name of the root element.
     * @returns The XSD element definition string.
     */
    private generateRootElement(schema: JsonSchema, name: string): string {
      const { typeName } = this.resolveType(schema);
      const doc = this.generateDocumentation(schema.description, 1);
      return `  <xs:element name="${name}" type="${typeName}">${doc}</xs:element>`;
    }
  
    /**
     * Generates all globally defined complex and simple types discovered during the first pass.
     * @returns A string containing all XSD type definitions.
     */
    private generateAllTypeDefinitions(): string {
      let definitions = '';
      // Iterate over the schemaRegistry to generate definitions for all discovered types.
      // Ensure a consistent order for reproducible output.
      const sortedEntries = Array.from(this.schemaRegistry.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  
      for (const [schema, typeName] of sortedEntries) {
        // Only generate a definition if it's a complex or simple type that needs one.
        // Primitive types (like string, number) without restrictions are handled inline.
        if (this.isComplexType(schema)) {
          definitions += this.generateComplexType(typeName, schema);
        } else if (this.isSimpleTypeWithRestriction(schema)) {
          definitions += this.generateSimpleType(typeName, schema);
        }
      }
      return definitions;
    }
  
    /**
     * Generates an XSD complex type definition.
     * @param typeName The name of the complex type.
     * @param schema The JSON Schema object representing the complex type.
     * @returns The XSD complex type definition string.
     * @throws {XsdConversionError} if an unsupported `allOf` structure is encountered.
     */
    private generateComplexType(typeName: string, schema: JsonSchema): string {
      let content = '';
      const doc = this.generateDocumentation(schema.description, 1);
  
      if (schema.allOf && schema.allOf.length > 0) {
        // `allOf` maps to <xs:extension> for inheritance or merging properties.
        // We look for a base type (a $ref) and then merge properties from others.
        let baseTypeRef: string | undefined;
        let mergedProperties: { [key: string]: JsonSchema } = {};
        let mergedRequired: string[] = [];
  
        for (const subSchema of schema.allOf) {
          if (subSchema.$ref) {
            // If multiple $ref are present, this is ambiguous for XSD 1.0 extension.
            if (baseTypeRef) {
              throw new XsdConversionError(`'allOf' in type '${typeName}' contains multiple '$ref's, which is ambiguous for XSD 1.0 extension.`);
            }
            const { typeName: resolvedRefTypeName } = this.resolveType(subSchema);
            baseTypeRef = resolvedRefTypeName;
          } else if (subSchema.properties) {
            // Merge properties from other object schemas in allOf
            mergedProperties = { ...mergedProperties, ...subSchema.properties };
            mergedRequired = [...mergedRequired, ...(subSchema.required || [])];
          } else if (subSchema.type && subSchema.type !== 'object') {
            // Handle cases where allOf might combine a ref with a primitive type (uncommon for XSD extension)
            // For now, we'll prioritize object merging.
            console.warn(`[Warning] 'allOf' in type '${typeName}' contains a non-object sub-schema without properties. This might not be fully represented in XSD.`);
          }
        }
  
        if (baseTypeRef) {
          content += `  <xs:complexContent>\n`;
          content += `    <xs:extension base="${baseTypeRef}">\n`;
          if (Object.keys(mergedProperties).length > 0) {
            content += `      <xs:sequence>\n`;
            content += this.generateProperties({ properties: mergedProperties }, mergedRequired);
            content += `      </xs:sequence>\n`;
          }
          content += `    </xs:extension>\n`;
          content += `  </xs:complexContent>\n`;
        } else {
          // If no base type ref, treat allOf as a simple merge of properties into a sequence.
          content += `  <xs:sequence>\n`;
          content += this.generateProperties({ properties: mergedProperties }, mergedRequired);
          content += `  </xs:sequence>\n`;
        }
      } else if (schema.oneOf || schema.anyOf) {
        // `oneOf` and `anyOf` map to <xs:choice>.
        content += this.generateChoice(schema);
      } else {
        // A standard object with properties or an array.
        content += `  <xs:sequence>\n`;
        if (schema.properties) {
          content += this.generateProperties(schema, schema.required || []);
        }
        if (schema.type === 'array' && schema.items && typeof schema.items === 'object') {
          content += this.generateArrayItems(schema);
        }
        content += `  </xs:sequence>\n`;
      }
  
      // Handle additionalProperties by adding <xs:any> if not explicitly false.
      // If additionalProperties is a schema, XSD 1.0 cannot directly represent it.
      if (schema.additionalProperties === true) {
        content += `  <xs:any minOccurs="0" maxOccurs="unbounded" processContents="lax"/>\n`;
      } else if (typeof schema.additionalProperties === 'object') {
        console.warn(`[Warning] 'additionalProperties' with a schema in type '${typeName}' is not fully supported in XSD 1.0 and will be ignored.`);
      }
  
      return `\n<xs:complexType name="${typeName}">${doc}\n${content}</xs:complexType>\n`;
    }
  
    /**
     * Generates XSD element definitions for properties within a complex type.
     * @param schema The JSON Schema object containing the properties.
     * @param requiredProps An array of property names that are required.
     * @returns A string containing XSD element definitions.
     */
    private generateProperties(schema: JsonSchema, requiredProps: string[]): string {
      let elements = '';
      for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
        const { typeName, nillable } = this.resolveType(propSchema);
        const minOccurs = requiredProps.includes(propName) ? '1' : '0';
        const nillableAttr = nillable ? ' nillable="true"' : '';
        const doc = this.generateDocumentation(propSchema.description, 4); // Indent 4 spaces
        const defaultAttr = propSchema.default !== undefined ? ` default="${this.escapeXml(String(propSchema.default))}"` : '';
  
        elements += `        <xs:element name="${this.sanitizeName(propName)}" type="${typeName}" minOccurs="${minOccurs}"${nillableAttr}${defaultAttr}>${doc}</xs:element>\n`;
      }
      return elements;
    }
  
    /**
     * Generates an XSD choice group for `oneOf` or `anyOf` keywords.
     * @param schema The JSON Schema object containing `oneOf` or `anyOf`.
     * @returns The XSD choice group string.
     */
    private generateChoice(schema: JsonSchema): string {
      const choices = schema.oneOf || schema.anyOf || [];
      if (choices.length === 0) {
        return ''; // No choices to generate
      }
  
      let choiceContent = '  <xs:choice minOccurs="1" maxOccurs="1">\n'; // XSD 1.0 choice is always 1 or 0..1
      for (const choiceSchema of choices) {
        // For a choice, the element name is crucial. Derive it from title, $ref, or a generated name.
        const refName = choiceSchema.$ref?.match(/([^/]+)$/)?.[1];
        const elementName = this.sanitizeName(choiceSchema.title || refName || `choiceItem${this.anonymousTypeCounter++}`);
  
        const { typeName, nillable } = this.resolveType(choiceSchema);
        const nillableAttr = nillable ? ' nillable="true"' : '';
        const doc = this.generateDocumentation(choiceSchema.description, 4);
        choiceContent += `    <xs:element name="${elementName}" type="${typeName}"${nillableAttr}>${doc}</xs:element>\n`;
      }
      choiceContent += '  </xs:choice>\n';
      return choiceContent;
    }
  
    /**
     * Generates an XSD element for array items.
     * @param schema The JSON Schema object for the array.
     * @returns The XSD element definition for array items.
     */
    private generateArrayItems(schema: JsonSchema): string {
      if (typeof schema.items !== 'object' || schema.items === null) {
        // If items is boolean (e.g., items: true), XSD cannot strictly represent it.
        // If items is missing, it implies any type, which is handled by processContents="lax" on xs:any.
        console.warn(`[Warning] Array 'items' in schema '${schema.title || 'anonymous array'}' is not an object schema and might not be fully represented in XSD.`);
        return '';
      }
  
      const { typeName, nillable } = this.resolveType(schema.items);
      const nillableAttr = nillable ? ' nillable="true"' : '';
      const minOccurs = schema.minItems !== undefined ? String(schema.minItems) : '0'; // Default minItems to 0 if not specified
      const maxOccurs = schema.maxItems !== undefined ? String(schema.maxItems) : 'unbounded';
      const doc = this.generateDocumentation(schema.items.description, 4);
  
      // A common convention is to name the repeating element based on the item's title,
      // or by singularizing the array's title.
      const itemName = this.sanitizeName(
        (schema.items as JsonSchema).title || (schema.title ? schema.title.replace(/s$/, '') : 'item')
      );
  
      return `        <xs:element name="${itemName}" type="${typeName}" minOccurs="${minOccurs}" maxOccurs="${maxOccurs}"${nillableAttr}>${doc}</xs:element>\n`;
    }
  
    /**
     * Generates an XSD simple type definition with restrictions.
     * @param typeName The name of the simple type.
     * @param schema The JSON Schema object representing the simple type.
     * @returns The XSD simple type definition string.
     */
    private generateSimpleType(typeName: string, schema: JsonSchema): string {
      const { primaryType } = this.getTypeAndNillability(schema);
      const baseType = this.mapJsonTypeToXsd(primaryType, schema.format);
      let restrictions = '';
      const doc = this.generateDocumentation(schema.description, 2);
  
      if (schema.enum && schema.enum.length > 0) {
        restrictions += schema.enum.map(e => `      <xs:enumeration value="${this.escapeXml(String(e))}"/>`).join('\n');
      }
      if (schema.pattern !== undefined) restrictions += `\n      <xs:pattern value="${this.escapeXml(schema.pattern)}"/>`;
      if (schema.minLength !== undefined) restrictions += `\n      <xs:minLength value="${schema.minLength}"/>`;
      if (schema.maxLength !== undefined) restrictions += `\n      <xs:maxLength value="${schema.maxLength}"/>`;
      if (schema.minimum !== undefined) restrictions += `\n      <xs:minInclusive value="${schema.minimum}"/>`;
      if (schema.maximum !== undefined) restrictions += `\n      <xs:maxInclusive value="${schema.maximum}"/>`;
  
      // Add default value if present and applicable to a simple type
      const defaultAttr = schema.default !== undefined ? ` default="${this.escapeXml(String(schema.default))}"` : '';
  
      return `
<xs:simpleType name="${typeName}">${doc}
  <xs:restriction base="${baseType}">
${restrictions}
  </xs:restriction>
</xs:simpleType>
`;
    }
  
    // --- Helpers ---
  
    /**
     * Resolves a JSON Schema object to its corresponding XSD type name and nillability.
     * This method handles `$ref`s, registered named types, and inline primitive types.
     * @param schema The JSON Schema object to resolve.
     * @returns An object containing the XSD type name and a boolean indicating nillability.
     * @throws {XsdConversionError} if a malformed or unresolvable `$ref` is encountered.
     */
    private resolveType(schema: JsonSchema): { typeName: string; nillable: boolean } {
      // 1. If it's a $ref, resolve it and get the name from the registry.
      if (schema.$ref) {
        const refSchema = this.resolveRef(schema.$ref);
        const registeredName = this.schemaRegistry.get(refSchema); // Should have been registered by discoverTypes
        if (!registeredName) {
            throw new XsdConversionError(`Internal error: Referenced schema for $ref "${schema.$ref}" was not registered during discovery.`);
        }
        return { typeName: `${this.options.namespacePrefix}:${registeredName}`, nillable: false };
      }
  
      // 2. If this exact schema object is already in the registry (meaning it's a named definition or anonymous type)
      if (this.schemaRegistry.has(schema)) {
        const registeredName = this.schemaRegistry.get(schema)!;
        return { typeName: `${this.options.namespacePrefix}:${registeredName}`, nillable: false };
      }
  
      // 3. If it's an inline complex type that hasn't been registered (e.g., an object property without a title/ref)
      // This path is for types that need a global definition but were not explicitly defined.
      if (this.isNamedType(schema)) {
          // This should ideally be handled by discoverTypes, but as a fallback/catch-all
          // for inline complex types that weren't picked up as definitions or anonymous.
          const preferredName = schema.title || `AnonymousType${this.anonymousTypeCounter++}`;
          const uniqueName = this.assignUniqueTypeName(schema, preferredName); // Register it now
          return { typeName: `${this.options.namespacePrefix}:${uniqueName}`, nillable: false };
      }
  
      // 4. It's a primitive or inline simple type without restrictions.
      const { primaryType, nillable } = this.getTypeAndNillability(schema);
      const xsdType = this.mapJsonTypeToXsd(primaryType, schema.format);
      return { typeName: xsdType, nillable };
    }
  
    /**
     * Resolves a JSON Schema `$ref` string to the actual JsonSchema object.
     * @param ref The `$ref` string (e.g., '#/definitions/MyType').
     * @returns The resolved JsonSchema object.
     * @throws {XsdConversionError} if the `$ref` format is unsupported or the definition is not found.
     */
    private resolveRef(ref: string): JsonSchema {
      const match = ref.match(/^#\/(?:definitions|components\/schemas)\/([^/]+)$/);
      if (!match) {
        throw new XsdConversionError(`Unsupported or malformed $ref format: "${ref}". Only local refs like '#/definitions/MyType' or '#/components/schemas/MyType' are supported.`);
      }
      const refName = match[1];
      const refSchema = this.globalDefinitions[refName];
      if (!refSchema) {
        throw new XsdConversionError(`Definition not found for $ref: "${ref}"`);
      }
      return refSchema;
    }
  
    /**
     * Determines the primary JSON type and whether the type allows `null`.
     * @param schema The JSON Schema object.
     * @returns An object with the primary type string and a nillable boolean.
     */
    private getTypeAndNillability(schema: JsonSchema): { primaryType: string; nillable: boolean } {
      if (Array.isArray(schema.type)) {
        const nonNullTypes = schema.type.filter(t => t !== 'null');
        if (nonNullTypes.length > 1) {
          // XSD 1.0 doesn't directly support union types like ["string", "number"].
          // We'll default to 'string' or 'anyType' and warn.
          console.warn(`[Warning] Union type '${schema.type.join(', ')}' is not fully supported in XSD 1.0. Mapping to 'xs:anyType'.`);
          return { primaryType: 'any', nillable: schema.type.includes('null') };
        }
        return {
          primaryType: nonNullTypes[0] || 'string', // Default to string if only "null" is present or empty array
          nillable: schema.type.includes('null'),
        };
      }
      // Default to 'object' if type is not specified, as per JSON Schema spec.
      return { primaryType: schema.type || 'object', nillable: false };
    }
  
    /**
     * Maps a JSON Schema type and format to an XSD built-in type.
     * @param jsonType The JSON Schema type string.
     * @param format The JSON Schema format string (optional).
     * @returns The corresponding XSD built-in type string.
     */
    private mapJsonTypeToXsd(jsonType: string, format?: string): string {
      if (format) {
        switch (format) {
          case 'date-time': return 'xs:dateTime';
          case 'date': return 'xs:date';
          case 'time': return 'xs:time';
          case 'email':
          case 'hostname':
          case 'ipv4':
          case 'ipv6':
          case 'uri':
          case 'uuid': // Common format, maps to string
            return 'xs:string'; // These are typically restricted with patterns in XSD.
          case 'byte': return 'xs:base64Binary'; // Base64 encoded characters
          case 'binary': return 'xs:hexBinary'; // Hex encoded characters
          case 'int32': return 'xs:int';
          case 'int64': return 'xs:long';
          case 'float': return 'xs:float';
          case 'double': return 'xs:double';
        }
      }
      switch (jsonType) {
        case 'string': return 'xs:string';
        case 'number': return 'xs:decimal'; // Use xs:decimal for arbitrary precision.
        case 'integer': return 'xs:integer';
        case 'boolean': return 'xs:boolean';
        case 'object': return 'xs:anyType'; // Inline, anonymous object becomes anyType
        case 'array': return 'xs:anyType'; // Inline, anonymous array becomes anyType (should be handled by generateArrayItems)
        default: return 'xs:anyType'; // Fallback for unknown or missing types
      }
    }
  
    /**
     * Checks if a JSON Schema object represents a complex type in XSD.
     * @param schema The JSON Schema object.
     * @returns True if it's a complex type, false otherwise.
     */
    private isComplexType = (schema: JsonSchema): boolean =>
      schema.type === 'object' || // Explicit object
      schema.type === 'array' ||  // Explicit array
      !!schema.properties ||      // Has properties (implies object)
      !!schema.allOf ||           // Has allOf (implies complex content)
      !!schema.oneOf ||           // Has oneOf (implies complex content)
      !!schema.anyOf;             // Has anyOf (implies complex content)
  
    /**
     * Checks if a JSON Schema object represents a simple type with restrictions in XSD.
     * @param schema The JSON Schema object.
     * @returns True if it's a simple type with restrictions, false otherwise.
     */
    private isSimpleTypeWithRestriction = (schema: JsonSchema): boolean =>
      !this.isComplexType(schema) && // Must not be a complex type
      (
        !!schema.enum ||
        !!schema.pattern ||
        schema.minLength !== undefined ||
        schema.maxLength !== undefined ||
        schema.minimum !== undefined ||
        schema.maximum !== undefined
      );
  
    /**
     * Checks if a JSON Schema object needs a globally named XSD type definition.
     * @param schema The JSON Schema object.
     * @returns True if it needs a named type, false otherwise.
     */
    private isNamedType = (schema: JsonSchema): boolean =>
      this.isComplexType(schema) || this.isSimpleTypeWithRestriction(schema);
  
    /**
     * Sanitizes a string to be a valid XML name (NCName).
     * Replaces invalid characters with underscores.
     * @param name The input string.
     * @returns The sanitized XML name.
     */
    private sanitizeName = (name: string): string => {
      // XML NCNames cannot start with a number or contain certain characters.
      // This regex allows letters, digits, '.', '-', '_', and combines them.
      // It also ensures the name starts with a letter or underscore.
      let sanitized = name.replace(/[^a-zA-Z0-9_.\-]/g, '_');
      if (sanitized.match(/^[0-9.\-]/)) { // Cannot start with digit, dot, or hyphen
        sanitized = '_' + sanitized;
      }
      return sanitized;
    };
  
    /**
     * Escapes special XML characters in a string.
     * @param str The string to escape.
     * @returns The escaped string.
     */
    private escapeXml = (str: string): string => {
      return String(str).replace(/[<>&'"]/g, char => JsonSchemaToXsdConverter.XML_ESCAPES[char]);
    };
  
    /**
     * Generates an XSD annotation with documentation from a description.
     * @param description The description string.
     * @param indentLevel The level of indentation for the documentation.
     * @returns The XSD documentation string or an empty string if no description or `includeDocumentation` is false.
     */
    private generateDocumentation(description: string | undefined, indentLevel: number): string {
      if (!this.options.includeDocumentation || !description) {
        return '';
      }
      const indent = ' '.repeat(indentLevel);
      const escapedDescription = this.escapeXml(description);
      return `\n${indent}<xs:annotation>\n${indent}  <xs:documentation>${escapedDescription}</xs:documentation>\n${indent}</xs:annotation>`;
    }
  }
  
  // ===================================================================================
  // ============================= COMPLEX TEST SUITE ==================================
  // ===================================================================================
  
  // Helper function to run tests and catch errors
  function runTest(testName: string, schema: JsonSchema, rootElementName?: string, options?: XsdOptions) {
    console.log(`\n--- ${testName.toUpperCase()} ---`);
    try {
      const converter = new JsonSchemaToXsdConverter(options);
      const xsdOutput = converter.convert(schema, rootElementName);
      console.log(xsdOutput);
    } catch (error) {
      if (error instanceof XsdConversionError) {
        console.error(`Error in ${testName}: ${error.message}`);
      } else {
        console.error(`Unexpected error in ${testName}:`, error);
      }
    }
  }
  
  // ---- Test 1: Basic Schema with Primitive Types and Required Fields ----
  const basicSchema: JsonSchema = {
    title: 'Person',
    type: 'object',
    description: 'Represents a person with basic details.',
    properties: {
      firstName: { type: 'string', description: 'The first name of the person.' },
      lastName: { type: 'string' },
      age: { type: 'integer', minimum: 0, maximum: 120, default: 30 },
      isStudent: { type: 'boolean' }
    },
    required: ['firstName', 'lastName']
  };
  runTest('TEST 1: BASIC SCHEMA', basicSchema, 'personData');
  
  // ---- Test 2: Composition with allOf and oneOf ----
  const compositionSchema: JsonSchema = {
    title: 'EmployeeProfile',
    type: 'object',
    description: 'Defines an employee profile including user and contact information.',
    definitions: {
      BaseContact: {
        title: 'ContactInfo',
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', description: 'Employee email address.' },
          phone: { type: 'string' }
        },
        required: ['email']
      },
      User: {
        title: 'UserDetails',
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Unique user identifier.' },
          username: { type: 'string' }
        },
        required: ['id']
      }
    },
    properties: {
      employee: {
        title: 'Employee',
        allOf: [
          { $ref: '#/definitions/User' },
          {
            type: 'object',
            properties: {
              department: { type: 'string' },
              contact: { $ref: '#/definitions/BaseContact' }
            }
          }
        ]
      },
      primaryRecipient: {
        title: 'Recipient',
        oneOf: [
          { $ref: '#/definitions/User' },
          { title: 'EmailAddress', type: 'string', format: 'email', description: 'An email address as a recipient.' }
        ]
      },
      anyRecipient: {
        title: 'AnyRecipient',
        anyOf: [
          { title: 'PhoneNumber', type: 'string', pattern: '^\\d{10}$' },
          { title: 'PostalAddress', type: 'string' }
        ]
      }
    },
    required: ['employee']
  };
  runTest('TEST 2: COMPOSITION (allOf, oneOf, anyOf)', compositionSchema, 'profile');
  
  // ---- Test 3: Nillable, additionalProperties, and Anonymous Types ----
  const featuresSchema: JsonSchema = {
    title: 'SystemReport',
    type: 'object',
    description: 'A system-generated report with various features.',
    properties: {
      reportId: { type: 'string' },
      generatedAt: { type: 'string', format: 'date-time' },
      // This property should be nillable
      completedAt: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'Timestamp when the report was completed, can be null.'
      },
      // This object has an anonymous type that should be generated
      metadata: {
        type: 'object',
        properties: {
          source: { type: 'string' }
        },
        // It allows other properties
        additionalProperties: true,
        description: 'Additional metadata for the report.'
      },
      // This object does NOT allow other properties
      config: {
        title: 'ReportConfig',
        type: 'object',
        properties: {
          strictMode: { type: 'boolean', default: false }
        },
        additionalProperties: false,
        description: 'Configuration settings for the report generation.'
      },
      // Test a simple type with enum and pattern
      status: {
        title: 'ReportStatus',
        type: 'string',
        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
        default: 'PENDING',
        description: 'Current status of the report.'
      }
    }
  };
  runTest('TEST 3: NILLABLE, additionalProperties, ANONYMOUS TYPES', featuresSchema, 'report');
  
  // ---- Test 4: Complex Arrays and Restrictions ----
  const arraySchema: JsonSchema = {
    title: 'ProductCatalog',
    type: 'object',
    description: 'A catalog of products with versioning.',
    properties: {
      catalogVersion: {
        title: 'VersionString',
        type: 'string',
        pattern: '^\\d+\\.\\d+\\.\\d+$',
        description: 'Version of the product catalog (e.g., 1.0.0).'
      },
      products: {
        title: 'Products',
        type: 'array',
        minItems: 1,
        maxItems: 1000,
        description: 'List of products in the catalog.',
        items: {
          title: 'Product',
          type: 'object',
          properties: {
            sku: { type: 'string', maxLength: 50, description: 'Stock Keeping Unit.' },
            name: { type: 'string' },
            price: { type: 'number', minimum: 0, default: 0.0 },
            category: {
              title: 'ProductCategory',
              type: 'string',
              enum: ['Electronics', 'Books', 'Home Goods', 'Food']
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              minItems: 0,
              maxItems: 10,
              description: 'Keywords associated with the product.'
            }
          },
          required: ['sku', 'name', 'price']
        }
      }
    }
  };
  runTest('TEST 4: COMPLEX ARRAYS AND RESTRICTIONS', arraySchema, 'catalog');
  
  // ---- Test 5: Empty Schema / Minimal Schema ----
  const emptySchema: JsonSchema = {};
  runTest('TEST 5: EMPTY SCHEMA', emptySchema, 'emptyRoot');
  
  // ---- Test 6: Schema with only $ref as root ----
  const refRootSchema: JsonSchema = {
    $ref: '#/definitions/User',
    definitions: {
      User: {
        title: 'RootUser',
        type: 'object',
        properties: {
          username: { type: 'string' },
          userId: { type: 'integer' }
        }
      }
    }
  };
  runTest('TEST 6: ROOT IS A $REF', refRootSchema, 'userRoot');
  
  // ---- Test 7: Schema with components/schemas (OpenAPI style) ----
  const openApiSchema: JsonSchema = {
    title: 'OpenAPIExample',
    components: {
      schemas: {
        Pet: {
          title: 'PetModel',
          type: 'object',
          properties: {
            id: { type: 'integer', format: 'int64' },
            name: { type: 'string' },
            tag: { type: 'string', description: 'A tag for the pet.' }
          },
          required: ['id', 'name']
        },
        ErrorResponse: {
          title: 'ErrorModel',
          type: 'object',
          properties: {
            code: { type: 'integer' },
            message: { type: 'string' }
          },
          required: ['code', 'message']
        }
      }
    },
    properties: {
      pets: {
        type: 'array',
        items: { $ref: '#/components/schemas/Pet' }
      },
      latestError: {
        type: ['null', 'object'],
        properties: {
          errorDetails: { $ref: '#/components/schemas/ErrorResponse' }
        }
      }
    }
  };
  runTest('TEST 7: OPENAPI COMPONENTS/SCHEMAS', openApiSchema, 'apiData');
  
  // ---- Test 8: Schema with union type (non-null) - expected warning and anyType ----
  const unionTypeSchema: JsonSchema = {
    title: 'MixedData',
    type: 'object',
    properties: {
      value: {
        type: ['string', 'number'],
        description: 'Can be either a string or a number.'
      }
    }
  };
  runTest('TEST 8: UNION TYPE (NON-NULL)', unionTypeSchema, 'mixed');
  
  // ---- Test 9: Schema with invalid $ref ----
  const invalidRefSchema: JsonSchema = {
    $ref: '#/nonExistent/Type'
  };
  runTest('TEST 9: INVALID $REF', invalidRefSchema, 'invalidRef');
  
  // ---- Test 10: Canonical Schema with circular reference (should now work correctly) ----
  const circularSchema: JsonSchema = {
    // The root schema is now a $ref to the definition for canonical representation
    $ref: '#/definitions/Node',
    definitions: {
      Node: {
        title: 'Node', // This title will be used for the XSD type name
        type: 'object',
        properties: {
          id: { type: 'string' },
          children: {
            type: 'array',
            items: { $ref: '#/definitions/Node' } // Self-referential
          }
        }
      }
    }
  };
  runTest('TEST 10: CIRCULAR REFERENCE (CANONICAL)', circularSchema, 'treeNode');
  
  // ---- Test 11: Schema with `additionalProperties: false` and `additionalProperties: object` ----
  const additionalPropsSchema: JsonSchema = {
    title: 'StrictAndLooseObject',
    type: 'object',
    properties: {
      strictObject: {
        title: 'StrictConfig',
        type: 'object',
        properties: {
          key1: { type: 'string' }
        },
        additionalProperties: false,
        description: 'An object that does not allow additional properties.'
      },
      looseObject: {
        title: 'LooseData',
        type: 'object',
        properties: {
          key2: { type: 'number' }
        },
        additionalProperties: true,
        description: 'An object that allows any additional properties.'
      },
      // This will generate a warning as XSD 1.0 cannot represent this accurately
      schemaControlledProps: {
        title: 'SchemaControlledData',
        type: 'object',
        properties: {
          fixedProp: { type: 'boolean' }
        },
        additionalProperties: { type: 'string' }, // This will be warned and ignored
        description: 'An object where additional properties should be strings (not fully supported in XSD 1.0).'
      }
    }
  };
  runTest('TEST 11: ADDITIONAL PROPERTIES', additionalPropsSchema, 'appSettings');
  
  /**
   * Export a simple function for convenience.
   * @param schema The JSON Schema object to convert.
   * @param options Optional XSD conversion options.
   * @param rootElementName Optional name for the root element in the XSD.
   * @returns The generated XSD string.
   */
  export function convertJsonSchemaToXsd(schema: JsonSchema, options?: XsdOptions, rootElementName?: string): string {
    const converter = new JsonSchemaToXsdConverter(options);
    return converter.convert(schema, rootElementName);
  }
