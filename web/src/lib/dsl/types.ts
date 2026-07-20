/**
 * DSL Parser — Type definitions (ADR-0008)
 *
 * Defines token types, AST node types, and result types for the strategy
 * DSL expression parser. The parser supports AND/OR/NOT/comparison operators
 * and compiles ASTs into Strategy objects consumable by the backtest engine.
 *
 * See: docs/architecture/adr-0008-strategy-dsl-schema.md
 */

import type { SignalType, StrategyContext } from "@/lib/backtest/types";

// ============ Token types ============

export type DSLTokenType =
  | "number"
  | "identifier"
  | "op_compare"
  | "op_and"
  | "op_or"
  | "op_not"
  | "lparen"
  | "rparen"
  | "comma";

export interface DSLToken {
  type: DSLTokenType;
  value: string;
  pos: number;
}

// ============ AST node types ============

export interface DSLIndicatorNode {
  type: "indicator";
  name: string;
  params: Record<string, number>;
}

export interface DSLNumberNode {
  type: "number";
  value: number;
}

export interface DSLCompareNode {
  type: "compare";
  op: ">" | "<" | ">=" | "<=" | "=" | "!=";
  left: DSLNode;
  right: DSLNode;
}

export interface DSLAndNode {
  type: "and";
  operands: DSLNode[];
}

export interface DSLOrNode {
  type: "or";
  operands: DSLNode[];
}

export interface DSLNotNode {
  type: "not";
  operand: DSLNode;
}

export interface DSLCrossNode {
  type: "cross";
  left: DSLNode;
  right: DSLNode;
}

export type DSLNode =
  | DSLIndicatorNode
  | DSLNumberNode
  | DSLCompareNode
  | DSLAndNode
  | DSLOrNode
  | DSLNotNode
  | DSLCrossNode;

// ============ Error type ============

export class DSLParseError extends Error {
  constructor(
    message: string,
    public readonly pos: number,
  ) {
    super(message);
    this.name = "DSLParseError";
  }
}

// ============ Compile result ============

export interface DSLCompileResult {
  strategy: {
    evaluate: (ctx: StrategyContext) => SignalType;
  };
  ast: DSLNode;
}

// ============ Built-in indicator descriptor ============

export interface IndicatorDescriptor {
  /** Parameter names in expected order */
  paramNames: string[];
  /** Default values for parameters (keyed by param name) */
  defaults: Record<string, number>;
  /** Compute function: receives klines and parsed params, returns current value */
  compute: (ctx: StrategyContext, params: Record<string, number>) => number;
}
