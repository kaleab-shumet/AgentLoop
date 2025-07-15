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
 * A utility class to parse XML and analyze Zod schemas.
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


            console.log("paths: ", paths);

            // Configure the parser to handle type conversion based on schema paths.
            const parser = new XMLParser({
                ...this.options,
            });

            const parsed = parser.parse(xmlString);

            arrays.forEach(e => {

                const value = _.get(parsed, e);

                const normalized =
                    Array.isArray(value)
                        ? value
                        : (() => {
                            const keys = _.keys(value ?? {});
                            if (keys.length === 0) return value !== undefined ? [value] : [];

                            const vals = keys.map(k => _.get(value, k));

                            if (vals.length === 1) {
                                return Array.isArray(vals[0]) ? vals[0] : [vals[0]];
                            }

                            if (vals.every(v => Array.isArray(v))) {
                                return _.flatten(vals);
                            }

                            return [value];
                        })();

                _.set(parsed, e, normalized);



            })





            return parsed;

        } catch (error: any) {
            throw new Error(`XML parsing failed: ${error.message}`);
        }
    }

    /**
     * Accepts a Zod schema and detects all array, number, and boolean paths recursively.
     * @param schema The Zod schema to analyze.
     * @param toolName The tool name to prefix all paths with.
     * @returns A FoundPaths object with categorized paths.
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
                    traverse(def.type, path);
                    break;

                case 'ZodObject':
                    Object.entries(def.shape()).forEach(([key, value]) => {
                        const newPath = path ? `${path}.${key}` : key;
                        traverse(value as ZodTypeAny, newPath);
                    });
                    break;

                case 'ZodOptional':
                case 'ZodNullable':
                    traverse(def.innerType, path);
                    break;

                case 'ZodUnion':
                    def.options.forEach((option: ZodTypeAny) => {
                        traverse(option, path);
                    });
                    break;
            }
        };

        traverse(schema);
        return result;
    }


}