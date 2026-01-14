import z from 'zod';
import { MDStructFormatHandler } from './core/handlers/MDStructFormatHandler';
import { Tool } from './core/types/types';

async function runDemo() {
    const handler = new MDStructFormatHandler();

    // 1. Generate MD-Struct for a Zod schema
    const testTool: Tool = {
        name: 'write_code',
        description: 'Write code to a file',
        argsSchema: z.object({
            filename: z.string().describe('The name of the file'),
            code: z.string().describe('The code content'),
            language: z.string().describe('The programming language')
        }),
        handler: async () => ({ toolName: 'write_code', success: true })
    };

    console.log("--- Generated Tool Definition ---");
    const toolDef = handler.formatToolDefinitions([testTool]);
    console.log(toolDef);

    // 2. Parse a response where the agent writes a JS sorting function
    const response = `
# write_code
## filename
sort.js
## language
javascript
## code
\`\`\`javascript
function bubbleSort(arr) {
    let n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                // swap arr[j] and arr[j+1]
                let temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
    return arr;
}
\`\`\`
`;

    console.log("\n--- Parsing Agent Response ---");
    const parsed = await handler.parseResponse(response, [testTool]);
    console.log(JSON.stringify(parsed, null, 2));
}

runDemo().catch(console.error);
