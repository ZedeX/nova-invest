/**
 * Strategy DSL — Type definitions (ADR-0008)
 *
 * Minimal jsep-compatible AST node types. jsep is NOT installed per task
 * constraints; this file defines the same shape jsep would produce so that
 * a future migration to jsep requires no test changes.
 *
 * See: docs/architecture/adr-0008-strategy-dsl-schema.md
 */

export type Expression =
  | { type: "Identifier"; name: string }
  | { type: "Literal"; value: string | number | boolean }
  | {
      type: "BinaryExpression";
      operator: string;
      left: Expression;
      right: Expression;
    }
  | { type: "CallExpression"; callee: Expression; args: Expression[] }
  | { type: "MemberExpression"; object: Expression; property: Expression };

/**
 * A parsed Strategy. Distinct from the persistence shape in
 * `web/src/lib/types.ts` (which carries dsl_yaml + status fields) — this
 * interface represents the in-memory validated form consumed by the
 * evaluator and the Playbook system.
 */
export interface Strategy {
  id: string;
  name: string;
  expression: Expression;
  params?: Record<string, unknown>;
  created_at: string;
}

/**
 * Discriminated union for validation results. `errors: never[]` on the
 * success branch makes exhaustiveness checks safe in downstream consumers.
 */
export type ValidatedStrategy =
  | (Strategy & { valid: true; errors: never[] })
  | (Strategy & { valid: false; errors: string[] });
