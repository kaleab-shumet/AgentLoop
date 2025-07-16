import { AgentLoop } from '../../core/agents/AgentLoop';
import { DefaultAIProvider } from '../../core/providers/DefaultAIProvider';
import { ExecutionMode } from '../../core/types/types';
import z from 'zod';
import * as crypto from 'crypto';
import 'dotenv/config';

/**
 * An MD5 hash agent that can generate MD5 hashes for text input, files, and perform hash-related operations.
 * Demonstrates cryptographic tool usage with AgentLoop framework.
 */
export class MD5HashAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful MD5 hash assistant. You can generate MD5 hashes for text strings, compare hashes, validate hash formats, and provide information about MD5 hashing. When asked to process a data structure, use the process_api_data_structure tool. Always explain what MD5 hashing is and its use cases when appropriate.`;

  constructor(config: any) {
    const provider = new DefaultAIProvider(config);
    super(provider, {
      maxIterations: 5,
      parallelExecution: false,
      executionMode: ExecutionMode.YAML_MODE
    });

    this.setupHashTools();
  }

  private setupHashTools() {
    // CORRECTED: Generate MD5 hash from text (flexible schema)
    this.defineTool((z: any) => ({
      name: 'generate_md5_hash',
      description: 'Generate MD5 hash from input text string',
      argsSchema: z.object({
        text: z.string().optional().describe('The text to hash'),
        encoding: z.enum(['utf8', 'ascii', 'base64']).optional().default('utf8').describe('Text encoding to use')
      }),
      handler: async (name: string, args: any, turnState: any) => {
        try {
          const inputText = args.text || args.param1; // Use whichever is provided
          const hash = crypto.createHash('md5');
          hash.update(inputText, args.encoding);
          const result = hash.digest('hex');

          return {
            toolName: name,
            success: true,
            output: {
              originalText: inputText,
              encoding: args.encoding,
              md5Hash: result,
              hashLength: result.length,
              message: `MD5 hash generated successfully`
            }
          };
        } catch (error: any) {
          return {
            toolName: name,
            success: false,
            error: `Hash generation failed: ${error.message}`
          };
        }
      }
    }));

    // CORRECTED: Compare two MD5 hashes (flexible schema)
    this.defineTool((z: any) => ({
      name: 'compare_hashes',
      description: 'Compare two MD5 hashes to check if they match',
      argsSchema: z.object({
        hash1: z.string().describe('First MD5 hash to compare'),
        hash2: z.string().describe('Second MD5 hash to compare'),
        caseSensitive: z.boolean().optional().default(false).describe('Whether comparison should be case sensitive')
      }),
      handler: async (name: string, args: any, turnState: any) => {
        try {
          // Validate hash format
          const md5Regex = /^[a-fA-F0-9]{32}$/;
          if (!md5Regex.test(args.hash1)) {
            throw new Error('First hash is not a valid MD5 format');
          }
          if (!md5Regex.test(args.hash2)) {
            throw new Error('Second hash is not a valid MD5 format');
          }

          const hash1 = args.caseSensitive ? args.hash1 : args.hash1.toLowerCase();
          const hash2 = args.caseSensitive ? args.hash2 : args.hash2.toLowerCase();
          const matches = hash1 === hash2;

          return {
            toolName: name,
            success: true,
            output: {
              hash1: args.hash1,
              hash2: args.hash2,
              matches,
              caseSensitive: args.caseSensitive,
              message: matches ? 'Hashes match!' : 'Hashes do not match'
            }
          };
        } catch (error: any) {
          return {
            toolName: name,
            success: false,
            error: `Hash comparison failed: ${error.message}`
          };
        }
      }
    }));

    // CORRECTED: Validate MD5 hash format (flexible schema)
    this.defineTool((z: any) => ({
      name: 'validate_hash_format',
      description: 'Validate if a string is a properly formatted MD5 hash',
      argsSchema: z.object({
        hash: z.string().optional().describe('The hash string to validate'),
      }),
      handler: async (name: string, args: any, turnState: any) => {
        try {
          const inputHash = args.hash || args.param1;
          const md5Regex = /^[a-fA-F0-9]{32}$/;
          const isValid = md5Regex.test(inputHash);
          
          const analysis = {
            length: inputHash.length,
            expectedLength: 32,
            containsOnlyHexChars: /^[a-fA-F0-9]+$/.test(inputHash),
            isValid
          };

          return {
            toolName: name,
            success: true,
            output: {
              hash: inputHash,
              ...analysis,
              message: isValid ? 'Valid MD5 hash format' : 'Invalid MD5 hash format'
            }
          };
        } catch (error: any) {
          return {
            toolName: name,
            success: false,
            error: `Hash validation failed: ${error.message}`
          };
        }
      }
    }));

    // Generate multiple hashes for comparison
    this.defineTool((z: any) => ({
      name: 'batch_hash_generation',
      description: 'Generate MD5 hashes for multiple text inputs',
      argsSchema: z.object({
        texts: z.array(z.string()).describe('Array of text strings to hash'),
        includeOriginal: z.boolean().default(true).describe('Whether to include original text in output')
      }),
      handler: async (name: string, args: any, turnState: any) => {
        try {
          const results = args.texts.map((text: string, index: number) => {
            const hash = crypto.createHash('md5');
            hash.update(text, 'utf8');
            const md5Hash = hash.digest('hex');

            return {
              index: index + 1,
              originalText: args.includeOriginal ? text : `[Text ${index + 1}]`,
              md5Hash,
              textLength: text.length
            };
          });

          return {
            toolName: name,
            success: true,
            output: {
              totalInputs: args.texts.length,
              results,
              includeOriginal: args.includeOriginal
            }
          };
        } catch (error: any) {
          return {
            toolName: name,
            success: false,
            error: `Batch hash generation failed: ${error.message}`
          };
        }
      }
    }));
    
    // UNIFIED: A single tool to process multiple API data structures with 3-level nesting
    this.defineTool((z: any) => {
      // Schema for a standard paginated API response (now with 3-level nesting)
      const paginatedApiSchema = z.object({
          status: z.string(),
          message: z.string(),
          data: z.object({
            items: z.array(z.any()),
            metadata: z.object({
              pagination: z.object({
                page: z.number(),
                total: z.number(),
                hasMore: z.boolean()
              }),
              filters: z.record(z.any()).optional(),
              sorting: z.record(z.any()).optional()
            })
          }),
          errors: z.array(z.object({
            code: z.string(),
            message: z.string(),
            details: z.record(z.any()).optional()
          })).optional(),
        }).describe('Standard paginated API response structure with 3-level nesting.');

      // Schema for a composite business data object (now with 3-level nesting)
      const businessDataSchema = z.object({
          organization: z.object({
            department: z.object({
              team: z.object({
                id: z.string(),
                name: z.string(),
                lead: z.string(),
                members: z.array(z.any()),
                projects: z.object({
                  active: z.array(z.any()),
                  completed: z.array(z.any())
                })
              })
            })
          }),
          metrics: z.object({
            performance: z.object({
              sales: z.number(),
              users: z.number(),
              errorRate: z.number()
            })
          })
        }).describe('A business data object with 3-level organizational hierarchy.');

      return {
        name: 'process_api_data_structure',
        description: 'Analyzes and processes API response structures with 3-level nesting, including paginated lists and hierarchical business data objects.',
        argsSchema: z.object({
          // The top-level argument is an object that can contain ONE of the known structures.
          apiResponse: z.union([
            z.object({ businessData: businessDataSchema }),
            z.object({ apiResponse: paginatedApiSchema })
          ])
        }).describe('The API response object with 3-level nesting, wrapped in either a "businessData" or "apiResponse" key.'),
        
        handler: async (name: string, args: any, turnState: any) => {
          try {
            const { apiResponse } = args;
            let output;

            // Check which structure was passed and process accordingly
            if (apiResponse.businessData) {
              const data = apiResponse.businessData;
              const teamData = data.organization.department.team;
              const analysis = {
                dataType: 'BusinessDataObject3Level',
                organizationStructure: {
                  teamId: teamData.id,
                  teamName: teamData.name,
                  teamLead: teamData.lead,
                  memberCount: teamData.members.length,
                  activeProjects: teamData.projects.active.length,
                  completedProjects: teamData.projects.completed.length,
                },
                metrics: data.metrics.performance,
                totalProjectsCount: teamData.projects.active.length + teamData.projects.completed.length,
              };
              const structuralInfo = {
                maxNestingDepth: this.calculateNestingDepth(data),
                isFlatStructure: this.calculateNestingDepth(data) <= 2,
                isDeeplyNested: this.calculateNestingDepth(data) >= 3,
                dataIntegrityHash: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
              };
              output = { message: 'Successfully processed 3-level business data object', analysis, structuralInfo };

            } else if (apiResponse.apiResponse) {
              const data = apiResponse.apiResponse;
              const analysis = {
                dataType: 'PaginatedApiResponse3Level',
                status: data.status,
                message: data.message,
                dataStructure: {
                  itemCount: data.data.items?.length || 0,
                  pagination: data.data.metadata.pagination,
                  hasFilters: !!data.data.metadata.filters,
                  hasSorting: !!data.data.metadata.sorting,
                },
                errorCount: data.errors?.length || 0,
                errorDetails: data.errors?.map((e: { code: any; message: any; }) => ({ code: e.code, message: e.message })) || []
              };
              const structuralInfo = {
                maxNestingDepth: this.calculateNestingDepth(data),
                isFlatStructure: this.calculateNestingDepth(data) <= 2,
                isDeeplyNested: this.calculateNestingDepth(data) >= 3,
                dataIntegrityHash: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
              };
              output = { message: 'Successfully processed 3-level paginated API response', analysis, structuralInfo };
            } else {
              throw new Error('Unrecognized API response structure provided.');
            }

            return { toolName: name, success: true, output };
          } catch (error: any) {
            return {
              toolName: name,
              success: false,
              error: `API data processing failed: ${error.message}`
            };
          }
        }
      };
    });

    // Hash information and facts
    this.defineTool((z: any) => ({
      name: 'hash_info',
      description: 'Provide information about MD5 hashing, its properties, and use cases',
      argsSchema: z.object({
        topic: z.enum(['general', 'security', 'properties', 'use-cases', 'limitations']).describe('What aspect of MD5 to explain')
      }),
      handler: async (name: string, args: any, turnState: any) => {
        try {
          const info: { [key: string]: any } = {
            general: {
              title: 'MD5 Hash Algorithm',
              description: 'MD5 (Message Digest Algorithm 5) is a widely used cryptographic hash function that produces a 128-bit (32 hexadecimal characters) hash value.',
              created: '1991 by Ronald Rivest',
              outputSize: '128 bits (32 hex characters)',
              type: 'Cryptographic hash function'
            },
            security: {
              title: 'MD5 Security Considerations',
              status: 'Cryptographically broken',
              vulnerabilities: ['Collision attacks', 'Preimage attacks'],
              recommendation: 'Not recommended for security-critical applications',
              alternatives: ['SHA-256', 'SHA-3', 'BLAKE2']
            },
            properties: {
              title: 'MD5 Properties',
              deterministic: 'Same input always produces same output',
              fixedSize: 'Always produces 32-character hexadecimal output',
              avalanche: 'Small input changes cause large output changes',
              oneWay: 'Computationally infeasible to reverse'
            },
            'use-cases': {
              title: 'Common MD5 Use Cases',
              appropriate: ['File integrity checking', 'Data deduplication', 'Non-security checksums'],
              inappropriate: ['Password hashing', 'Digital signatures', 'Security tokens']
            },
            limitations: {
              title: 'MD5 Limitations',
              issues: ['Collision vulnerabilities', 'Speed makes brute force easier', 'Not cryptographically secure'],
              timeline: 'Vulnerabilities discovered in 1996, practical attacks by 2004'
            }
          };

          return {
            toolName: name,
            success: true,
            output: info[args.topic]
          };
        } catch (error: any) {
          return {
            toolName: name,
            success: false,
            error: `Failed to retrieve hash info: ${error.message}`
          };
        }
      }
    }));

    // Final answer tool
    this.defineTool((z: any) => ({
      name: 'final',
      description: 'Provide the final hash result and explanation',
      argsSchema: z.object({
        value: z.string().describe('The final answer with explanation')
      }),
      handler: async (name: string, args: any, turnState: any) => {
        return {
          toolName: name,
          success: true,
          output: {
            value: args.value
          }
        };
      }
    }));
  }

  // Helper methods for complex data analysis
  private calculateNestingDepth(obj: any): number {
    if (typeof obj !== 'object' || obj === null) return 0;
    
    let maxDepth = 0;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const depth = 1 + this.calculateNestingDepth(obj[key]);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    return maxDepth;
  }
}