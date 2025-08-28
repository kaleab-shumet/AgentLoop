// Extended types for Acorn AST nodes with additional properties we need
import type { Node } from "acorn";

export interface FunctionDeclarationNode extends Node {
  type: "FunctionDeclaration";
  id: {
    type: "Identifier";
    name: string;
  };
  body: {
    type: "BlockStatement";
    start: number;
    end: number;
  };
  start: number;
  end: number;
}

export interface LiteralNode extends Node {
  type: "Literal";
  value: unknown;
  raw: string;
}

export interface TemplateLiteralNode extends Node {
  type: "TemplateLiteral";
  quasis: Array<{
    value: {
      raw: string;
      cooked: string;
    };
  }>;
}