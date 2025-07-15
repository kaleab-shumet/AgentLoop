import { XMLParser } from 'fast-xml-parser';
import { ZodTypeAny, z } from 'zod';
import { Tool } from '../types';
import _ from 'lodash';

// Interface for the structured paths
export interface FoundPaths {
    numbers: string[];
    booleans: string[];
    arrays: string[];
}

/**
 * A utility class to parse XML and analyze Zod schemas with full nested support.
 */
export class JsonSchemaXmlParser {
    private readonly options: any;

    constructor(options = {}) {
        this.options = {
            trimValues: true,
            ignoreAttributes: true,
            ...options,
        };
    }

    /**
     * Parse an XML string, using a Zod schema to guide type conversion and array flattening.
     * @param xmlString - The XML string to parse.
     * @param referenceTools - A Zod schema to use for identifying array, number, and boolean paths.
     * @returns The parsed and structured JavaScript object.
     */
    public parse(xmlString: string, referenceTools: Tool<ZodTypeAny>[]): any {
        if (typeof xmlString !== 'string') {
            throw new Error('Input must be a valid XML string');
        }

        try {
            // Find all paths for numbers, booleans, and arrays from the schema.
            const paths = referenceTools.map(tool => this.findPaths(tool.argsSchema, tool.name));

            const numbers = paths.map(e => e.numbers).flat();
            const booleans = paths.map(e => e.booleans).flat();
            const arrays = paths.map(e => e.arrays).flat();

            console.log("Schema paths: ", paths);

            // Configure the parser
            const parser = new XMLParser({
                ...this.options,
                parseTagValue: false,
                parseAttributeValue: false,
            });

            const parsed = parser.parse(xmlString);
            console.log("Parsed: ", JSON.stringify(parsed, null, 2));

            // Function to find the value using dynamic path resolution with caching
            const pathCache = new Map<string, string>();

            const findValueAndPath = (targetPath: string, originalPath: string) => {
                const cacheKey = `${targetPath}|${originalPath}`;
                if (pathCache.has(cacheKey)) {
                    const cachedPath = pathCache.get(cacheKey)!;
                    return { value: _.get(parsed, cachedPath), path: cachedPath };
                }

                let value = _.get(parsed, targetPath);
                if (value !== undefined) {
                    pathCache.set(cacheKey, targetPath);
                    return { value, path: targetPath };
                }

                const topLevelKeys = Object.keys(parsed);
                for (const rootKey of topLevelKeys) {
                    const wrappedPath = `${rootKey}.${targetPath}`;
                    value = _.get(parsed, wrappedPath);
                    if (value !== undefined) {
                        console.log(`Found value under wrapper '${rootKey}': ${wrappedPath}`);
                        pathCache.set(cacheKey, wrappedPath);
                        return { value, path: wrappedPath };
                    }

                    const fullWrappedPath = `${rootKey}.${originalPath}`;
                    value = _.get(parsed, fullWrappedPath);
                    if (value !== undefined) {
                        console.log(`Found value at full wrapped path '${rootKey}': ${fullWrappedPath}`);
                        pathCache.set(cacheKey, fullWrappedPath);
                        return { value, path: fullWrappedPath };
                    }
                }

                pathCache.set(cacheKey, targetPath);
                return { value: undefined, path: targetPath };
            };

            // Fix arrays first (they might contain objects that need type conversion)
            arrays.forEach(arrayPath => {
                const actualPath = arrayPath.includes('.') ? arrayPath.split('.').slice(1).join('.') : arrayPath;
                console.log(`Processing array path: ${arrayPath} -> actualPath: ${actualPath}`);

                const { value, path: finalPath } = findValueAndPath(actualPath, arrayPath);
                console.log(`Final path used: ${finalPath}`);
                console.log(`Value at ${finalPath}:`, JSON.stringify(value, null, 2));

                if (value === undefined || value === null) {
                    console.log(`Value is undefined/null, setting empty array`);
                    _.set(parsed, finalPath, []);
                    return;
                }

                if (Array.isArray(value)) {
                    console.log(`Value is already an array, keeping as is`);
                    _.set(parsed, finalPath, value);
                    return;
                }

                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                    console.log(`Value is primitive, wrapping in array`);
                    _.set(parsed, finalPath, [value]);
                    return;
                }

                if (typeof value === 'object') {
                    console.log(`Value is object, analyzing structure...`);

                    if (Object.keys(value).length === 0) {
                        console.log(`Empty object, setting empty array`);
                        _.set(parsed, finalPath, []);
                        return;
                    }

                    const keys = Object.keys(value);
                    console.log(`Object keys:`, keys);

                    if (keys.length === 1) {
                        const singleKey = keys[0];
                        const singleValue = value[singleKey];
                        console.log(`Single key object. Key: ${singleKey}, Value:`, JSON.stringify(singleValue, null, 2));

                        if (Array.isArray(singleValue)) {
                            console.log(`Extracting array from wrapper object`);
                            _.set(parsed, finalPath, singleValue);
                            return;
                        }

                        if (singleValue !== undefined && singleValue !== null) {
                            console.log(`Wrapping single value in array`);
                            _.set(parsed, finalPath, [singleValue]);
                            return;
                        }
                    }

                    const allKeysAreIndices = keys.every(key => /^\d+$/.test(key));
                    console.log(`All keys are indices: ${allKeysAreIndices}`);

                    if (allKeysAreIndices) {
                        const arrayValues = keys.sort((a, b) => parseInt(a) - parseInt(b))
                            .map(key => value[key]);
                        console.log(`Converting numeric object to array:`, arrayValues);
                        _.set(parsed, finalPath, arrayValues);
                    } else {
                        console.log(`Wrapping object in array`);
                        _.set(parsed, finalPath, [value]);
                    }
                }

                console.log(`Final value after processing:`, JSON.stringify(_.get(parsed, finalPath), null, 2));
                console.log(`---`);
            });

            // Process nested structures recursively
            this.processNestedConversions(parsed, numbers, booleans, referenceTools);

            return parsed;

        } catch (error: any) {
            throw new Error(`XML parsing failed: ${error.message}`);
        }
    }

    /**
     * Recursively process nested structures for type conversion
     */
    private processNestedConversions(
        obj: any,
        numberPaths: string[],
        booleanPaths: string[],
        referenceTools: Tool<ZodTypeAny>[],
        currentPath: string = ''
    ): void {
        if (Array.isArray(obj)) {
            // Process each item in the array
            obj.forEach((item, index) => {
                const itemPath = currentPath ? `${currentPath}.${index}` : index.toString();
                this.processNestedConversions(item, numberPaths, booleanPaths, referenceTools, itemPath);
            });
        } else if (obj && typeof obj === 'object') {
            // Process each property in the object
            Object.keys(obj).forEach(key => {
                const keyPath = currentPath ? `${currentPath}.${key}` : key;
                const value = obj[key];

                // Check if this path should be converted
                const shouldConvertToNumber = numberPaths.some(numPath => {
                    const actualPath = numPath.includes('.') ? numPath.split('.').slice(1).join('.') : numPath;
                    return this.pathMatches(keyPath, actualPath);
                });

                const shouldConvertToBoolean = booleanPaths.some(boolPath => {
                    const actualPath = boolPath.includes('.') ? boolPath.split('.').slice(1).join('.') : boolPath;
                    return this.pathMatches(keyPath, actualPath);
                });

                if (shouldConvertToNumber && value !== undefined && value !== null) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        console.log(`Converting nested number at ${keyPath}: '${value}' -> ${numValue}`);
                        obj[key] = numValue;
                    }
                } else if (shouldConvertToBoolean && value !== undefined && value !== null) {
                    const stringValue = String(value).toLowerCase();
                    if (stringValue === 'true' || stringValue === '1') {
                        console.log(`Converting nested boolean at ${keyPath}: '${value}' -> true`);
                        obj[key] = true;
                    } else if (stringValue === 'false' || stringValue === '0') {
                        console.log(`Converting nested boolean at ${keyPath}: '${value}' -> false`);
                        obj[key] = false;
                    }
                } else {
                    // Recursively process nested objects/arrays
                    this.processNestedConversions(value, numberPaths, booleanPaths, referenceTools, keyPath);
                }
            });
        }
    }

    /**
     * Check if a current path matches a target path pattern
     */
    private pathMatches(currentPath: string, targetPath: string): boolean {
        // Remove array indices from current path for comparison
        const normalizedCurrent = currentPath.replace(/\.\d+\./g, '.').replace(/\.\d+$/, '');
        const normalizedTarget = targetPath;

        return normalizedCurrent === normalizedTarget ||
            normalizedCurrent.endsWith('.' + normalizedTarget) ||
            normalizedTarget.endsWith('.' + normalizedCurrent);
    }

    /**
     * Enhanced findPaths that detects nested array element types
     */
    public findPaths(schema: ZodTypeAny, toolName: string): FoundPaths {
        const result: FoundPaths = {
            numbers: [],
            booleans: [],
            arrays: []
        };

        const traverse = (currentSchema: ZodTypeAny, path: string = '') => {
            const def = currentSchema._def;

            switch (def.typeName) {
                case 'ZodNumber':
                case 'ZodBigInt':
                    if (path) {
                        result.numbers.push(`${toolName}.${path}`);
                    }
                    break;

                case 'ZodBoolean':
                    if (path) {
                        result.booleans.push(`${toolName}.${path}`);
                    }
                    break;

                case 'ZodArray':
                    if (path) {
                        result.arrays.push(`${toolName}.${path}`);
                    }
                    // Also traverse the array element type to find nested conversions
                    const elementPath = path; // We'll handle array indices dynamically
                    traverse(def.type, elementPath);
                    break;

                case 'ZodObject':
                    Object.entries(def.shape()).forEach(([key, value]) => {
                        const newPath = path ? `${path}.${key}` : key;
                        traverse(value as ZodTypeAny, newPath);
                    });
                    break;

                case 'ZodOptional':
                case 'ZodNullable':
                case 'ZodDefault':
                case 'ZodCatch':
                    traverse(def.innerType, path);
                    break;

                case 'ZodUnion':
                case 'ZodDiscriminatedUnion':
                    def.options.forEach((option: ZodTypeAny) => {
                        traverse(option, path);
                    });
                    break;

                case 'ZodIntersection':
                    traverse(def.left, path);
                    traverse(def.right, path);
                    break;

                case 'ZodTuple':
                    if (path) {
                        result.arrays.push(`${toolName}.${path}`);
                    }
                    def.items.forEach((item: ZodTypeAny, index: number) => {
                        traverse(item, path ? `${path}.${index}` : index.toString());
                    });
                    break;

                case 'ZodRecord':
                case 'ZodMap':
                    if (def.valueType) {
                        traverse(def.valueType, path);
                    }
                    break;

                case 'ZodLazy':
                    break;

                case 'ZodEffects':
                case 'ZodRefine':
                case 'ZodTransform':
                    traverse(def.schema, path);
                    break;

                case 'ZodPromise':
                    traverse(def.type, path);
                    break;

                case 'ZodBranded':
                    traverse(def.type, path);
                    break;

                case 'ZodString':
                case 'ZodLiteral':
                case 'ZodEnum':
                case 'ZodNativeEnum':
                case 'ZodDate':
                case 'ZodSymbol':
                case 'ZodUndefined':
                case 'ZodNull':
                case 'ZodVoid':
                case 'ZodAny':
                case 'ZodUnknown':
                case 'ZodNever':
                case 'ZodFunction':
                    break;

                default:
                    console.log(`Unknown Zod type: ${def.typeName} at path: ${toolName}.${path}`);
                    break;
            }
        };

        traverse(schema);
        return result;
    }
}