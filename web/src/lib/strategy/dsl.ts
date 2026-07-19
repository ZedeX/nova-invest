/**
 * Strategy DSL — parser, validator, evaluator (ADR-0008)
 *
 * Three-stage pipeline:
 *   parseStrategy(src)         → Expression AST (minimal jsep-compatible)
 *   validateStrategy(strategy) → ValidatedStrategy (identifier + param checks)
 *   evaluateStrategy(expr, ctx)→ value (recursive AST walk)
 *
 * Security:
 *   - No `eval()`, no `Function()` constructor anywhere in this file
 *   - Identifier allowlist (closed set): close, open, high, low, volume, sma, ema, rsi
 *   - Identifier denylist (defense-in-depth): eval, Function, window, global, process
 *
 * See: docs/architecture/adr-0008-strategy-dsl-schema.md
 */

import type { Expression, Strategy, ValidatedStrategy } from "./types";

// ============ Identifier registry ============

/**
 * Closed allowlist of identifiers a strategy expression may reference.
 * Aligns with ADR-0008 §"Built-in Indicator Registry" (SMA/EMA/RSI subset
 * for Phase 1) plus the OHLCV price fields.
 */
export const ALLOWED_IDENTIFIERS: ReadonlySet<string> = new Set([
  "close",
  "open",
  "high",
  "low",
  "volume",
  "sma",
  "ema",
  "rsi",
]);

/**
 * Hard denylist of identifiers that must never appear in a strategy
 * expression. Catches Function()/eval() (code execution) and global
 * object access (window/process/global) even if the allowlist check
 * somehow misses them.
 */
export const DISALLOWED_IDENTIFIERS: ReadonlySet<string> = new Set([
  "eval",
  "Function",
  "window",
  "global",
  "process",
]);

/**
 * Indicator functions whose period argument must be a positive integer
 * bounded by MAX_PERIOD.
 */
const PERIODIC_INDICATORS: ReadonlySet<string> = new Set([
  "sma",
  "ema",
  "rsi",
]);

/** Maximum lookback period accepted by validateStrategy. */
export const MAX_PERIOD = 200;

// ============ Parser (recursive descent) ============

type Token =
  | { type: "ident"; value: string }
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

const TWO_CHAR_OPS = new Set([">=", "<=", "==", "!="]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", ">", "<", "="]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ type: "ident", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: "num", value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character at position ${i}: ${c}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }

  private consume(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new Error("Unexpected end of input");
    this.pos++;
    return tok;
  }

  /** expression := comparison */
  parseExpression(): Expression {
    return this.parseComparison();
  }

  /** comparison := additive ( (">"|"<"|">="|"<="|"="|"==") additive )* */
  private parseComparison(): Expression {
    let left = this.parseAdditive();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && [">", "<", ">=", "<=", "=", "==", "!="].includes(tok.value)) {
        this.consume();
        const right = this.parseAdditive();
        left = { type: "BinaryExpression", operator: tok.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  /** additive := multiplicative ( ("+"|"-") multiplicative )* */
  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "+" || tok.value === "-")) {
        this.consume();
        const right = this.parseMultiplicative();
        left = { type: "BinaryExpression", operator: tok.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  /** multiplicative := unary ( ("*"|"/") unary )* */
  private parseMultiplicative(): Expression {
    let left = this.parseUnary();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "*" || tok.value === "/")) {
        this.consume();
        const right = this.parseUnary();
        left = { type: "BinaryExpression", operator: tok.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  /**
   * unary := "-" unary | primary
   * Negative literals are folded into a single Literal node so that
   * validateStrategy can read `value` directly for param-range checks.
   */
  private parseUnary(): Expression {
    const tok = this.peek();
    if (tok?.type === "op" && tok.value === "-") {
      this.consume();
      const next = this.peek();
      if (next?.type === "num") {
        this.consume();
        return { type: "Literal", value: -next.value };
      }
      // Fall through to primary for non-literal negation (not currently
      // exercised by tests but kept for completeness).
      const inner = this.parseUnary();
      return {
        type: "BinaryExpression",
        operator: "-",
        left: { type: "Literal", value: 0 },
        right: inner,
      };
    }
    return this.parsePrimary();
  }

  /**
   * primary := number
   *          | identifier ( "(" arglist ")" )?
   *          | "(" expression ")"
   *          | member (".") identifier  (consumed in a loop)
   */
  private parsePrimary(): Expression {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of input");

    if (tok.type === "num") {
      this.consume();
      return { type: "Literal", value: tok.value };
    }

    if (tok.type === "ident") {
      this.consume();
      let node: Expression = { type: "Identifier", name: tok.value };

      // Function call
      if (this.peek()?.type === "lparen") {
        this.consume();
        const args: Expression[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseExpression());
          while (this.peek()?.type === "comma") {
            this.consume();
            args.push(this.parseExpression());
          }
        }
        const close = this.peek();
        if (close?.type !== "rparen") {
          throw new Error("Expected ')' to close call expression");
        }
        this.consume();
        node = { type: "CallExpression", callee: node, args };
      }

      // Member access (e.g., macd.histogram) — loop supports a.b.c
      while (this.peek()?.type === "op" && "value" in (this.peek() as Token) && (this.peek() as Token & { value: string }).value === ".") {
        // The tokenizer does not emit "." as an op today; this branch is
        // reserved for future identifier.member support. Kept to make the
        // AST shape explicit for MemberExpression consumers.
        break;
      }

      return node;
    }

    if (tok.type === "lparen") {
      this.consume();
      const inner = this.parseExpression();
      const close = this.peek();
      if (close?.type !== "rparen") {
        throw new Error("Expected ')' to close parenthesized expression");
      }
      this.consume();
      return inner;
    }

    throw new Error(`Unexpected token: ${JSON.stringify(tok)}`);
  }
}

/**
 * Parse a strategy expression string into a jsep-compatible AST.
 *
 * Supported grammar (subset of jsep):
 *   - Identifiers: `close`, `sma`, ...
 *   - Numeric literals: `100`, `-1`, `14.5`
 *   - Binary operators: `+ - * / > < >= <= = == !=`
 *   - Call expressions: `sma(close, 14)`
 *   - Parenthesised sub-expressions: `(close + open) / 2`
 *
 * Member expressions (`obj.prop`) are NOT parsed by this minimal parser —
 * the validator accepts them when constructed by hand (test fixtures),
 * but the parser does not yet emit them. This matches the task constraint
 * "minimal parser that handles simple cases".
 */
export function parseStrategy(src: string): Expression {
  const tokens = tokenize(src);
  if (tokens.length === 0) {
    throw new Error("parseStrategy: empty input");
  }
  const parser = new Parser(tokens);
  const expr = parser.parseExpression();
  return expr;
}

// ============ Validator ============

/** Collect every Identifier name referenced in an expression tree. */
export function collectIdentifiers(expr: Expression, out: Set<string>): void {
  switch (expr.type) {
    case "Identifier":
      out.add(expr.name);
      return;
    case "Literal":
      return;
    case "BinaryExpression":
      collectIdentifiers(expr.left, out);
      collectIdentifiers(expr.right, out);
      return;
    case "CallExpression":
      collectIdentifiers(expr.callee, out);
      for (const arg of expr.args) collectIdentifiers(arg, out);
      return;
    case "MemberExpression":
      collectIdentifiers(expr.object, out);
      collectIdentifiers(expr.property, out);
      return;
  }
}

/**
 * Walk the AST and validate period parameters on indicator calls
 * (sma/ema/rsi). Period must be a positive literal integer ≤ MAX_PERIOD.
 * Errors are pushed into the supplied array.
 */
export function checkParamRanges(expr: Expression, errors: string[]): void {
  switch (expr.type) {
    case "Identifier":
    case "Literal":
      return;
    case "BinaryExpression":
      checkParamRanges(expr.left, errors);
      checkParamRanges(expr.right, errors);
      return;
    case "MemberExpression":
      checkParamRanges(expr.object, errors);
      checkParamRanges(expr.property, errors);
      return;
    case "CallExpression": {
      const callee = expr.callee;
      if (
        callee.type === "Identifier" &&
        PERIODIC_INDICATORS.has(callee.name) &&
        expr.args.length >= 2
      ) {
        const periodArg = expr.args[1];
        if (periodArg.type === "Literal" && typeof periodArg.value === "number") {
          const period = periodArg.value;
          if (period <= 0) {
            errors.push(
              `${callee.name} period must be positive, got ${period}`,
            );
          } else if (!Number.isInteger(period)) {
            errors.push(
              `${callee.name} period must be an integer, got ${period}`,
            );
          } else if (period > MAX_PERIOD) {
            errors.push(
              `${callee.name} period ${period} exceeds max ${MAX_PERIOD}`,
            );
          }
        }
      }
      for (const arg of expr.args) checkParamRanges(arg, errors);
      return;
    }
  }
}

/**
 * Validate a parsed Strategy.
 *
 * Checks performed (in order):
 *   1. Required structural fields (id, name, expression, created_at)
 *   2. Identifier denylist (eval, Function, window, global, process)
 *   3. Identifier allowlist (close/open/high/low/volume/sma/ema/rsi)
 *   4. Period parameter ranges (sma/ema/rsi period must be 1..MAX_PERIOD)
 *
 * Returns a discriminated union: success → { valid: true, errors: [] };
 * failure → { valid: false, errors: [...] }.
 */
export function validateStrategy(strategy: Strategy): ValidatedStrategy {
  const errors: string[] = [];

  // Stage 1: structural
  if (!strategy.id) errors.push("Strategy id is required");
  if (!strategy.name) errors.push("Strategy name is required");
  if (!strategy.expression) errors.push("Strategy expression is required");
  if (!strategy.created_at) errors.push("Strategy created_at is required");

  if (errors.length > 0) {
    return { ...strategy, valid: false, errors };
  }

  // Collect all identifiers referenced in the expression
  const idents = new Set<string>();
  collectIdentifiers(strategy.expression, idents);

  // Stage 2: denylist (security — fail closed)
  for (const name of idents) {
    if (DISALLOWED_IDENTIFIERS.has(name)) {
      errors.push(`Disallowed identifier: ${name}`);
    }
  }

  // Stage 3: allowlist
  for (const name of idents) {
    if (!DISALLOWED_IDENTIFIERS.has(name) && !ALLOWED_IDENTIFIERS.has(name)) {
      errors.push(`Unknown identifier: ${name}`);
    }
  }

  // Stage 4: param ranges
  checkParamRanges(strategy.expression, errors);

  if (errors.length > 0) {
    return { ...strategy, valid: false, errors };
  }

  return { ...strategy, valid: true, errors: [] as never[] };
}

// ============ Evaluator ============

/**
 * Recursively evaluate an Expression against a context map.
 *
 * - Literal: returns its value.
 * - Identifier: looks up `name` in `context`; throws if missing.
 * - BinaryExpression: applies the operator to evaluated left/right.
 * - CallExpression: looks up callee in `context`, calls with evaluated args.
 * - MemberExpression: evaluates object, then reads `property` (identifier
 *   name or evaluated value) from the object.
 *
 * No `eval()` or `Function()` is ever invoked — this is a pure AST walk.
 */
export function evaluateStrategy(
  expr: Expression,
  context: Record<string, unknown>,
): unknown {
  switch (expr.type) {
    case "Literal":
      return expr.value;

    case "Identifier": {
      if (!(expr.name in context)) {
        throw new Error(`Undefined identifier in context: ${expr.name}`);
      }
      return context[expr.name];
    }

    case "BinaryExpression": {
      const left = evaluateStrategy(expr.left, context);
      const right = evaluateStrategy(expr.right, context);
      switch (expr.operator) {
        case "+": return (left as number) + (right as number);
        case "-": return (left as number) - (right as number);
        case "*": return (left as number) * (right as number);
        case "/": return (left as number) / (right as number);
        case ">": return (left as number) > (right as number);
        case "<": return (left as number) < (right as number);
        case ">=": return (left as number) >= (right as number);
        case "<=": return (left as number) <= (right as number);
        case "=":
        case "==": return left === right;
        case "!=": return left !== right;
        default:
          throw new Error(`Unknown operator: ${expr.operator}`);
      }
    }

    case "CallExpression": {
      const fn = evaluateStrategy(expr.callee, context);
      if (typeof fn !== "function") {
        const calleeRepr =
          expr.callee.type === "Identifier" ? expr.callee.name : "<expr>";
        throw new Error(`Expected function for callee '${calleeRepr}'`);
      }
      const args = expr.args.map((a) => evaluateStrategy(a, context));
      return (fn as (...a: unknown[]) => unknown)(...args);
    }

    case "MemberExpression": {
      const obj = evaluateStrategy(expr.object, context);
      const key =
        expr.property.type === "Identifier"
          ? expr.property.name
          : evaluateStrategy(expr.property, context);
      if (obj == null) return undefined;
      return (obj as Record<string, unknown>)[key as string];
    }
  }
}
