/**
 * DSL Parser — Tokenizer + Recursive-Descent Parser + Compiler (ADR-0008)
 *
 * Three-stage pipeline:
 *   tokenize(src)     → DSLToken[]
 *   parse(tokens)     → DSLNode (AST)
 *   compile(ast)      → { strategy: { evaluate(ctx) => SignalType }, ast }
 *
 * Grammar (precedence low→high):
 *   expression   := or_expr
 *   or_expr      := and_expr ( "OR" and_expr )*
 *   and_expr     := not_expr ( "AND" not_expr )*
 *   not_expr     := "NOT" not_expr | compare_expr
 *   compare_expr := primary ( (">"|"<"|">="|"<="|"="|"!=") primary )?
 *   primary      := NUMBER
 *                 | IDENTIFIER "(" args? ")"
 *                 | IDENTIFIER "cross" IDENTIFIER   (special cross-detect)
 *                 | IDENTIFIER                       (bare indicator ref)
 *                 | "(" expression ")"
 *
 * Built-in indicators: SMA, EMA, RSI, MACD, BOLL, ATR, OBV, VWAP
 *
 * Security: No eval(), no Function(). Indicator computation is a closed
 * registry — unknown indicator names throw at parse time.
 *
 * See: docs/architecture/adr-0008-strategy-dsl-schema.md
 */

import type { SignalType, StrategyContext } from "@/lib/backtest/types";
import type {
  DSLAndNode,
  DSLCompareNode,
  DSLCompileResult,
  DSLCrossNode,
  DSLIndicatorNode,
  DSLNode,
  DSLNotNode,
  DSLNumberNode,
  DSLOrNode,
  DSLToken,
  DSLTokenType,
  IndicatorDescriptor,
} from "./types";
import { DSLParseError } from "./types";

// ============ Indicator Registry ============

/**
 * Closed registry of built-in indicator functions.
 * Key = uppercase indicator name (per ADR-0008 §"Built-in Indicator Registry").
 *
 * Each descriptor carries:
 *   - paramNames: ordered parameter names for positional argument mapping
 *   - defaults: default values when caller omits a parameter
 *   - compute: pure function (ctx, params) → current value
 */
export const INDICATOR_REGISTRY: Readonly<
  Record<string, IndicatorDescriptor>
> = {
  SMA: {
    paramNames: ["period"],
    defaults: { period: 20 },
    compute: (ctx, params) => {
      const period = params.period;
      if (period <= 0 || ctx.klines.length < period) return NaN;
      let sum = 0;
      for (let i = ctx.klines.length - period; i < ctx.klines.length; i++) {
        sum += ctx.klines[i].c;
      }
      return sum / period;
    },
  },
  EMA: {
    paramNames: ["period"],
    defaults: { period: 20 },
    compute: (ctx, params) => {
      const period = params.period;
      if (period <= 0 || ctx.klines.length < period) return NaN;
      const alpha = 2 / (period + 1);
      // Seed with SMA of first `period` closes
      let prev = 0;
      for (let i = 0; i < period; i++) prev += ctx.klines[i].c;
      prev /= period;
      for (let i = period; i < ctx.klines.length; i++) {
        prev = alpha * ctx.klines[i].c + (1 - alpha) * prev;
      }
      return prev;
    },
  },
  RSI: {
    paramNames: ["period"],
    defaults: { period: 14 },
    compute: (ctx, params) => {
      const period = params.period;
      if (period <= 0 || ctx.klines.length <= period) return NaN;
      let avgGain = 0;
      let avgLoss = 0;
      for (let i = 1; i <= period; i++) {
        const change = ctx.klines[i].c - ctx.klines[i - 1].c;
        if (change >= 0) avgGain += change;
        else avgLoss -= change;
      }
      avgGain /= period;
      avgLoss /= period;
      for (let i = period + 1; i < ctx.klines.length; i++) {
        const change = ctx.klines[i].c - ctx.klines[i - 1].c;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
      }
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    },
  },
  MACD: {
    paramNames: ["fast", "slow", "signal"],
    defaults: { fast: 12, slow: 26, signal: 9 },
    compute: (ctx, params) => {
      const { fast, slow } = params;
      if (fast <= 0 || slow <= 0 || ctx.klines.length < slow) return NaN;
      // Compute fast EMA and slow EMA
      const fastAlpha = 2 / (fast + 1);
      const slowAlpha = 2 / (slow + 1);
      let fastEma = 0;
      for (let i = 0; i < fast; i++) fastEma += ctx.klines[i].c;
      fastEma /= fast;
      for (let i = fast; i < ctx.klines.length; i++) {
        fastEma = fastAlpha * ctx.klines[i].c + (1 - fastAlpha) * fastEma;
      }
      let slowEma = 0;
      for (let i = 0; i < slow; i++) slowEma += ctx.klines[i].c;
      slowEma /= slow;
      for (let i = slow; i < ctx.klines.length; i++) {
        slowEma = slowAlpha * ctx.klines[i].c + (1 - slowAlpha) * slowEma;
      }
      return fastEma - slowEma;
    },
  },
  BOLL: {
    paramNames: ["period", "stdDev"],
    defaults: { period: 20, stdDev: 2 },
    compute: (ctx, params) => {
      const { period, stdDev } = params;
      if (period <= 0 || ctx.klines.length < period) return NaN;
      let sum = 0;
      const start = ctx.klines.length - period;
      for (let i = start; i < ctx.klines.length; i++) sum += ctx.klines[i].c;
      const mean = sum / period;
      let variance = 0;
      for (let i = start; i < ctx.klines.length; i++) {
        variance += (ctx.klines[i].c - mean) ** 2;
      }
      variance /= period;
      const upper = mean + stdDev * Math.sqrt(variance);
      return upper;
    },
  },
  ATR: {
    paramNames: ["period"],
    defaults: { period: 14 },
    compute: (ctx, params) => {
      const period = params.period;
      if (period <= 0 || ctx.klines.length < period + 1) return NaN;
      let atrSum = 0;
      const end = ctx.klines.length - 1;
      const start = end - period + 1;
      for (let i = start; i <= end; i++) {
        const kl = ctx.klines[i];
        const prev = ctx.klines[i - 1];
        const tr = Math.max(
          kl.h - kl.l,
          Math.abs(kl.h - prev.c),
          Math.abs(kl.l - prev.c),
        );
        atrSum += tr;
      }
      return atrSum / period;
    },
  },
  OBV: {
    paramNames: [],
    defaults: {},
    compute: (ctx) => {
      if (ctx.klines.length < 2) return 0;
      let obv = 0;
      for (let i = 1; i < ctx.klines.length; i++) {
        if (ctx.klines[i].c > ctx.klines[i - 1].c) {
          obv += ctx.klines[i].v;
        } else if (ctx.klines[i].c < ctx.klines[i - 1].c) {
          obv -= ctx.klines[i].v;
        }
      }
      return obv;
    },
  },
  VWAP: {
    paramNames: [],
    defaults: {},
    compute: (ctx) => {
      let cumTypicalVol = 0;
      let cumVol = 0;
      for (let i = 0; i < ctx.klines.length; i++) {
        const kl = ctx.klines[i];
        const typical = (kl.h + kl.l + kl.c) / 3;
        cumTypicalVol += typical * kl.v;
        cumVol += kl.v;
      }
      return cumVol > 0 ? cumTypicalVol / cumVol : 0;
    },
  },
};

// ============ Tokenizer ============

const COMPARE_OPS = new Set([">", "<", ">=", "<=", "=", "!="]);

/**
 * Tokenize a DSL expression string into a stream of DSLTokens.
 *
 * Recognized tokens:
 *   - Numbers: integer or decimal (e.g. 14, 70.5)
 *   - Identifiers: letter-led alphanumeric (e.g. RSI, SMA, close, AND, OR, NOT, cross)
 *   - Comparison operators: > < >= <= = !=
 *   - Keywords: AND, OR, NOT
 *   - Delimiters: ( ) ,
 */
export function tokenize(src: string): DSLToken[] {
  const tokens: DSLToken[] = [];
  let i = 0;

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }

    // Number literal
    if (/[0-9]/.test(src[i])) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      tokens.push({ type: "number", value: src.slice(start, i), pos: start });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(src[i])) {
      const start = i;
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) i++;
      const word = src.slice(start, i);
      let type: DSLTokenType;
      if (word === "AND") type = "op_and";
      else if (word === "OR") type = "op_or";
      else if (word === "NOT") type = "op_not";
      else type = "identifier";
      tokens.push({ type, value: word, pos: start });
      continue;
    }

    // Two-char comparison operators
    const two = src.slice(i, i + 2);
    if (COMPARE_OPS.has(two)) {
      tokens.push({ type: "op_compare", value: two, pos: i });
      i += 2;
      continue;
    }

    // Single-char comparison operators
    if (COMPARE_OPS.has(src[i])) {
      tokens.push({ type: "op_compare", value: src[i], pos: i });
      i++;
      continue;
    }

    // Parentheses
    if (src[i] === "(") {
      tokens.push({ type: "lparen", value: "(", pos: i });
      i++;
      continue;
    }
    if (src[i] === ")") {
      tokens.push({ type: "rparen", value: ")", pos: i });
      i++;
      continue;
    }

    // Comma
    if (src[i] === ",") {
      tokens.push({ type: "comma", value: ",", pos: i });
      i++;
      continue;
    }

    throw new DSLParseError(`Unexpected character '${src[i]}'`, i);
  }

  return tokens;
}

// ============ Recursive-Descent Parser ============

/**
 * Parse a token stream into a DSLNode AST.
 *
 * Precedence (low→high): OR → AND → NOT → comparison → primary
 */
export function parse(tokens: DSLToken[]): DSLNode {
  if (tokens.length === 0) {
    throw new DSLParseError("Empty expression", 0);
  }
  const state = { pos: 0 };
  const node = parseOrExpr(tokens, state);

  if (state.pos < tokens.length) {
    const tok = tokens[state.pos];
    throw new DSLParseError(
      `Unexpected token '${tok.value}' after expression`,
      tok.pos,
    );
  }

  return node;
}

function peek(tokens: DSLToken[], state: { pos: number }): DSLToken | null {
  return tokens[state.pos] ?? null;
}

function consume(
  tokens: DSLToken[],
  state: { pos: number },
): DSLToken {
  const tok = tokens[state.pos];
  if (!tok) {
    throw new DSLParseError("Unexpected end of input", -1);
  }
  state.pos++;
  return tok;
}

// or_expr := and_expr ( "OR" and_expr )*
function parseOrExpr(
  tokens: DSLToken[],
  state: { pos: number },
): DSLNode {
  const first = parseAndExpr(tokens, state);
  const operands: DSLNode[] = [first];

  while (peek(tokens, state)?.type === "op_or") {
    consume(tokens, state);
    operands.push(parseAndExpr(tokens, state));
  }

  if (operands.length === 1) return operands[0];
  return { type: "or", operands } as DSLOrNode;
}

// and_expr := not_expr ( "AND" not_expr )*
function parseAndExpr(
  tokens: DSLToken[],
  state: { pos: number },
): DSLNode {
  const first = parseNotExpr(tokens, state);
  const operands: DSLNode[] = [first];

  while (peek(tokens, state)?.type === "op_and") {
    consume(tokens, state);
    operands.push(parseNotExpr(tokens, state));
  }

  if (operands.length === 1) return operands[0];
  return { type: "and", operands } as DSLAndNode;
}

// not_expr := "NOT" not_expr | compare_expr
function parseNotExpr(
  tokens: DSLToken[],
  state: { pos: number },
): DSLNode {
  if (peek(tokens, state)?.type === "op_not") {
    consume(tokens, state);
    const operand = parseNotExpr(tokens, state);
    return { type: "not", operand } as DSLNotNode;
  }
  return parseCompareExpr(tokens, state);
}

// compare_expr := primary ( (">"|"<"|">="|"<="|"="|"!=") primary
//                             | "cross" primary )?
function parseCompareExpr(
  tokens: DSLToken[],
  state: { pos: number },
): DSLNode {
  const left = parsePrimary(tokens, state);

  const tok = peek(tokens, state);

  // Comparison operators
  if (tok?.type === "op_compare") {
    const op = tok.value as DSLCompareNode["op"];
    consume(tokens, state);
    const right = parsePrimary(tokens, state);
    return { type: "compare", op, left, right } as DSLCompareNode;
  }

  // Cross detection: "cross" keyword
  if (tok?.type === "identifier" && tok.value.toLowerCase() === "cross") {
    consume(tokens, state);
    const right = parsePrimary(tokens, state);
    return { type: "cross", left, right } as DSLCrossNode;
  }

  return left;
}

// primary := NUMBER
//          | IDENTIFIER "(" args? ")"        (indicator call)
//          | IDENTIFIER                       (bare indicator ref)
//          | "(" expression ")"
// Note: "cross" is handled at the compare_expr level, not here.
function parsePrimary(
  tokens: DSLToken[],
  state: { pos: number },
): DSLNode {
  const tok = peek(tokens, state);
  if (!tok) {
    throw new DSLParseError("Unexpected end of input", -1);
  }

  // Number literal
  if (tok.type === "number") {
    consume(tokens, state);
    return { type: "number", value: parseFloat(tok.value) } as DSLNumberNode;
  }

  // Identifier: could be indicator call, cross, or bare reference
  if (tok.type === "identifier") {
    consume(tokens, state);
    const name = tok.value;

    // Indicator call: IDENTIFIER "(" args? ")"
    if (peek(tokens, state)?.type === "lparen") {
      consume(tokens, state); // consume "("
      const args: DSLNode[] = [];

      if (peek(tokens, state)?.type !== "rparen") {
        args.push(parseOrExpr(tokens, state));
        while (peek(tokens, state)?.type === "comma") {
          consume(tokens, state);
          args.push(parseOrExpr(tokens, state));
        }
      }

      const close = peek(tokens, state);
      if (close?.type !== "rparen") {
        throw new DSLParseError(
          `Expected ')' after ${name} arguments`,
          close?.pos ?? -1,
        );
      }
      consume(tokens, state);

      // Validate indicator name and build params
      const descriptor = INDICATOR_REGISTRY[name.toUpperCase()];
      if (!descriptor) {
        throw new DSLParseError(`Unknown indicator: ${name}`, tok.pos);
      }

      const params: Record<string, number> = { ...descriptor.defaults };
      // Map positional args to param names
      for (let i = 0; i < args.length; i++) {
        if (i >= descriptor.paramNames.length) {
          throw new DSLParseError(
            `Too many arguments for ${name}: expected at most ${descriptor.paramNames.length}, got ${args.length}`,
            tok.pos,
          );
        }
        const argNode = args[i];
        if (argNode.type !== "number") {
          throw new DSLParseError(
            `Indicator ${name} parameter ${descriptor.paramNames[i]} must be a number literal`,
            tok.pos,
          );
        }
        params[descriptor.paramNames[i]] = argNode.value;
      }

      return { type: "indicator", name: name.toUpperCase(), params } as DSLIndicatorNode;
    }

    // Bare identifier: must be a known indicator (used without parentheses)
    const bareDesc = INDICATOR_REGISTRY[name.toUpperCase()];
    if (bareDesc) {
      return {
        type: "indicator",
        name: name.toUpperCase(),
        params: { ...bareDesc.defaults },
      } as DSLIndicatorNode;
    }

    throw new DSLParseError(`Unknown identifier: ${name}`, tok.pos);
  }

  // Parenthesized expression
  if (tok.type === "lparen") {
    consume(tokens, state);
    const inner = parseOrExpr(tokens, state);
    const close = peek(tokens, state);
    if (close?.type !== "rparen") {
      throw new DSLParseError("Expected ')'", close?.pos ?? -1);
    }
    consume(tokens, state);
    return inner;
  }

  throw new DSLParseError(`Unexpected token '${tok.value}'`, tok.pos);
}

// ============ Compiler ============

/**
 * Compile a DSLNode AST into a Strategy object with an evaluate() method.
 *
 * The evaluate function walks the AST recursively, computing indicator
 * values on-the-fly from the StrategyContext and applying boolean/comparison
 * logic to produce a SignalType:
 *   - Comparison/AND/OR/NOT results that are truthy → BUY
 *   - Explicit SELL must come from the DSL author's logic
 *     (e.g. RSI > 70 → SELL)
 *   - cross() → BUY when left crosses above right, SELL when below, else HOLD
 *
 * The compiler maps compare results to signals:
 *   - A top-level compare/and/or/not that evaluates to true → BUY
 *   - A cross node at the top level → BUY/SELL based on direction
 *   - Everything else → HOLD
 */
export function compile(ast: DSLNode): DSLCompileResult {
  return {
    strategy: {
      evaluate: (ctx: StrategyContext): SignalType => {
        const result = evaluateNode(ast, ctx);
        if (typeof result === "string") return result as SignalType;
        return result ? "BUY" : "HOLD";
      },
    },
    ast,
  };
}

/**
 * Compile with separate entry/exit expressions.
 * Entry expression truthy → BUY, exit expression truthy → SELL, else HOLD.
 */
export function compileWithExit(
  entry: DSLNode,
  exit: DSLNode,
): DSLCompileResult {
  return {
    strategy: {
      evaluate: (ctx: StrategyContext): SignalType => {
        const entryResult = evaluateNode(entry, ctx);
        const exitResult = evaluateNode(exit, ctx);
        if (exitResult === true) return "SELL";
        if (entryResult === true) return "BUY";
        return "HOLD";
      },
    },
    ast: entry,
  };
}

/** Evaluate a DSLNode against a StrategyContext. Returns boolean or number. */
function evaluateNode(node: DSLNode, ctx: StrategyContext): boolean | number {
  switch (node.type) {
    case "number":
      return node.value;

    case "indicator": {
      const descriptor = INDICATOR_REGISTRY[node.name];
      if (!descriptor) {
        throw new Error(`Unknown indicator: ${node.name}`);
      }
      return descriptor.compute(ctx, node.params);
    }

    case "compare": {
      const left = toNumber(evaluateNode(node.left, ctx));
      const right = toNumber(evaluateNode(node.right, ctx));
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      switch (node.op) {
        case ">":
          return left > right;
        case "<":
          return left < right;
        case ">=":
          return left >= right;
        case "<=":
          return left <= right;
        case "=":
          return left === right;
        case "!=":
          return left !== right;
      }
    }

    case "and":
      return node.operands.every((op) => evaluateNode(op, ctx) === true);

    case "or":
      return node.operands.some((op) => evaluateNode(op, ctx) === true);

    case "not":
      return evaluateNode(node.operand, ctx) !== true;

    case "cross": {
      // Need at least 2 bars to detect a cross
      if (ctx.klines.length < 2) return false;
      // Compute current and previous values for both left and right
      const leftVal = toNumber(evaluateNode(node.left, ctx));
      const rightVal = toNumber(evaluateNode(node.right, ctx));
      // Build previous-bar context
      const prevCtx: StrategyContext = {
        ...ctx,
        index: ctx.index - 1,
        klines: ctx.klines.slice(0, -1),
        close: ctx.klines[ctx.klines.length - 2].c,
        open: ctx.klines[ctx.klines.length - 2].o,
        high: ctx.klines[ctx.klines.length - 2].h,
        low: ctx.klines[ctx.klines.length - 2].l,
        volume: ctx.klines[ctx.klines.length - 2].v,
        date: ctx.klines[ctx.klines.length - 2].t,
      };
      const prevLeft = toNumber(evaluateNode(node.left, prevCtx));
      const prevRight = toNumber(evaluateNode(node.right, prevCtx));

      if (
        Number.isNaN(leftVal) ||
        Number.isNaN(rightVal) ||
        Number.isNaN(prevLeft) ||
        Number.isNaN(prevRight)
      ) {
        return false;
      }

      // Bullish cross: left was below right, now above
      if (prevLeft <= prevRight && leftVal > rightVal) return true;
      // Bearish cross: left was above right, now below
      if (prevLeft >= prevRight && leftVal < rightVal) return false;
      return false;
    }
  }
}

function toNumber(v: boolean | number): number {
  return typeof v === "boolean" ? (v ? 1 : 0) : v;
}

// ============ Convenience: parse + compile in one step ============

/**
 * Parse a DSL expression string and compile it into a Strategy.
 * Shorthand for `compile(parse(tokenize(src)))`.
 */
export function parseAndCompile(src: string): DSLCompileResult {
  const tokens = tokenize(src);
  const ast = parse(tokens);
  return compile(ast);
}
