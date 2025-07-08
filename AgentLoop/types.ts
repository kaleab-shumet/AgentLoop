import z, { ZodTypeAny } from "zod";




export interface ToolResult {
    toolname: string;
    success: boolean
    [key: string]: any;
  }
  
  export interface PendingToolCall {
    name: string;
    [key: string]: any;
  }
  
  export interface ToolChainData {
    [key: string]: any
  }
  
  

  
  export interface ChatEntry {
    sender: "ai" | "user" | "system";
    message: string;
  }
  
  export type Tool<T extends ZodTypeAny = ZodTypeAny> = {
    name: string;
    description: string;
    responseSchema: T;
    handler: (name: string, args: z.infer<T>, toolChainData: ToolChainData) => ToolResult | Promise<ToolResult>;
  };