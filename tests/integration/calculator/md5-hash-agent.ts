import { AgentLoop, ExecutionMode } from '../../../core';
import { DefaultAIProvider } from '../../../core/providers/DefaultAIProvider';
import z from 'zod';
import * as crypto from 'crypto';

/**
 * An MD5 hash agent that can generate MD5 hashes for text input, files, and perform hash-related operations.
 * Demonstrates cryptographic tool usage with AgentLoop framework.
 */
export class MD5HashAgent extends AgentLoop {
  protected systemPrompt = `You are a helpful MD5 hash assistant. You can generate MD5 hashes for text strings, compare hashes, validate hash formats, and provide information about MD5 hashing. Always explain what MD5 hashing is and its use cases when appropriate.`;

  constructor(config: any) {
    const provider = new DefaultAIProvider(config);
    super(provider, {
      maxIterations: 5,
      parallelExecution: false,
      executionMode: ExecutionMode.XML
    });

    this.setupHashTools();
  }

  private setupHashTools() {
    // Generate MD5 hash from text
    this.defineTool((z) => ({
      name: 'generate_md5_hash',
      description: 'Generate MD5 hash from input text string',
      argsSchema: z.object({
        text: z.string().describe('The text to hash'),
        encoding: z.enum(['utf8', 'ascii', 'base64']).optional().default('utf8').describe('Text encoding to use')
      }),
      handler: async (name: string, args: any) => {
        try {
          const hash = crypto.createHash('md5');
          hash.update(args.text, args.encoding);
          const result = hash.digest('hex');

          return {
            toolName: name,
            success: true,
            output: {
              originalText: args.text,
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

    // Compare two MD5 hashes
    this.defineTool((z) => ({
      name: 'compare_hashes',
      description: 'Compare two MD5 hashes to check if they match',
      argsSchema: z.object({
        hash1: z.string().describe('First MD5 hash to compare'),
        hash2: z.string().describe('Second MD5 hash to compare'),
        caseSensitive: z.boolean().optional().default(false).describe('Whether comparison should be case sensitive')
      }),
      handler: async (name: string, args: any) => {
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

    // Validate MD5 hash format
    this.defineTool((z) => ({
      name: 'validate_hash_format',
      description: 'Validate if a string is a properly formatted MD5 hash',
      argsSchema: z.object({
        hash: z.string().describe('The hash string to validate')
      }),
      handler: async (name: string, args: any) => {
        try {
          const md5Regex = /^[a-fA-F0-9]{32}$/;
          const isValid = md5Regex.test(args.hash);
          
          const analysis = {
            length: args.hash.length,
            expectedLength: 32,
            containsOnlyHexChars: /^[a-fA-F0-9]+$/.test(args.hash),
            isValid
          };

          return {
            toolName: name,
            success: true,
            output: {
              hash: args.hash,
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
    this.defineTool((z) => ({
      name: 'batch_hash_generation',
      description: 'Generate MD5 hashes for multiple text inputs',
      argsSchema: z.object({
        texts: z.array(z.string()).describe('Array of text strings to hash'),
        includeOriginal: z.boolean().default(true).describe('Whether to include original text in output')
      }),
      handler: async (name: string, args: any) => {
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

    // Hash information and facts
    this.defineTool((z) => ({
      name: 'hash_info',
      description: 'Provide information about MD5 hashing, its properties, and use cases',
      argsSchema: z.object({
        topic: z.enum(['general', 'security', 'properties', 'use-cases', 'limitations']).describe('What aspect of MD5 to explain')
      }),
      handler: async (name: string, args: any) => {
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
    this.defineTool((z) => ({
      name: 'final',
      description: 'Provide the final hash result and explanation',
      argsSchema: z.object({
        answer: z.string().describe('The final answer with explanation')
      }),
      handler: async (name: string, args: any) => {
        return {
          toolName: name,
          success: true,
          output: {
            value: args.answer
          }
        };
      }
    }));
  }
}

// Example usage and test functions
export async function demonstrateMD5Hash() {
  const config = {
    apiKey: process.env.GEMINI_API_KEY || 'your-api-key-here',
    service: 'google',
    model: 'gemini-2.0-flash'
  };

  const agent = new MD5HashAgent(config);

  console.log('🔐 MD5 Hash Agent Demo');

  const testCases = [
    "Generate MD5 hash for the text 'Hello World'",
    "What is the MD5 hash of 'password123'?",
    "Compare these two hashes: 5d41402abc4b2a76b9719d911017c592 and 5d41402abc4b2a76b9719d911017c592",
    "Is 'abc123' a valid MD5 hash format?",
    "Generate MD5 hashes for: 'apple', 'banana', 'cherry'",
    "Tell me about MD5 security considerations"
  ];

  for (let i = 0; i < testCases.length; i++) {
    console.log(`\n--- Test Case ${i + 1}: ${testCases[i]} ---`);

    try {
      const result = await agent.run({
        userPrompt: testCases[i],
        conversationHistory: [],
        toolCallHistory: []
      });

      console.log('✅ Success!');
      console.log('Final Answer:', result.finalAnswer?.output?.value || 'No final answer');
      console.log('Tool Calls Made:', result.toolCallHistory.length);

      // Show hash operation details
      result.toolCallHistory.forEach((tool, index) => {
        if (tool.success && tool.output) {
          console.log(`${index + 1}. ${tool.toolName}:`, tool.output);
        }
      });

    } catch (error) {
      console.log('❌ Test failed:', error);
    }
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateMD5Hash().catch(console.error);
}