/**
 * Playbook System — 6-stage validation + cycle detection + install (ADR-0013)
 *
 * Pipeline stages (per ADR-0013 §"Validation Pipeline" + task plan):
 *   1. Schema validation       — required playbook fields present
 *   2. Strategy validation     — delegate to validateStrategy
 *   3. Dependency graph        — no cycles (topological sort, Kahn's algo)
 *   4. Function()/eval ban     — defense-in-depth: reject Function/eval
 *                                 identifiers even if Stage 2 missed them
 *   5. Identifier allowlist    — defense-in-depth: reject disallowed/global
 *                                 identifiers (window/process/global)
 *   6. Param range             — defense-in-depth: sma/ema/rsi period in
 *                                 [1, MAX_PERIOD]
 *
 * Stages 4–6 duplicate checks already performed by validateStrategy.
 * They exist as a safety net: if validateStrategy is ever weakened (e.g.,
 * a new identifier is added to the allowlist without security review),
 * the Playbook pipeline still rejects unsafe strategies.
 *
 * Cycle detection uses the standard white/gray/black DFS algorithm —
 * O(V+E), deterministic, returns the first cycle path found.
 *
 * See: docs/architecture/adr-0013-playbook-system.md
 */

import {
  ALLOWED_IDENTIFIERS,
  DISALLOWED_IDENTIFIERS,
  checkParamRanges,
  collectIdentifiers,
  validateStrategy,
} from "@/lib/strategy/dsl";
import type { Expression } from "@/lib/strategy/types";
import type {
  D1Like,
  InstallResult,
  Playbook,
  PlaybookDependency,
  PlaybookValidationResult,
} from "./types";

// ============ Cycle detection ============

/**
 * Detect cycles in a directed dependency graph using DFS with a
 * white/gray/black coloring scheme.
 *
 * @param deps  edges as `{ parent_id → child_id }` pairs
 * @returns     cycle path (e.g., `["A","B","C","A"]`) or `[]` if acyclic.
 *              Self-loops return `["A","A"]`.
 */
export function detectCycles(deps: PlaybookDependency[]): string[] {
  // Build adjacency list and collect all nodes (some child IDs may not
  // appear as parents, so we gather both sides).
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const d of deps) {
    if (!adj.has(d.parent_id)) adj.set(d.parent_id, []);
    adj.get(d.parent_id)!.push(d.child_id);
    nodes.add(d.parent_id);
    nodes.add(d.child_id);
  }

  const WHITE = 0; // unvisited
  const GRAY = 1; // on current DFS path
  const BLACK = 2; // fully explored, no cycle through it
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n, WHITE);

  const path: string[] = [];

  const dfs = (node: string): string[] | null => {
    color.set(node, GRAY);
    path.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      const c = color.get(neighbor) ?? WHITE;
      if (c === GRAY) {
        // Back-edge → cycle. Slice from first occurrence of `neighbor`
        // to current path end, then close the loop by appending neighbor.
        const start = path.indexOf(neighbor);
        return [...path.slice(start), neighbor];
      }
      if (c === WHITE) {
        const found = dfs(neighbor);
        if (found) return found;
      }
    }

    path.pop();
    color.set(node, BLACK);
    return null;
  };

  // Iterate nodes in insertion order for deterministic output.
  for (const n of nodes) {
    if (color.get(n) === WHITE) {
      path.length = 0;
      const found = dfs(n);
      if (found !== null) return found;
    }
  }

  return [];
}

// ============ PlaybookValidator ============

/**
 * 6-stage Playbook validation pipeline. Each stage runs sequentially;
 * the first failing stage short-circuits and returns its errors with
 * `failed_stage` set.
 */
export class PlaybookValidator {
  validate(pb: Playbook): PlaybookValidationResult {
    // ---- Stage 1: schema ----
    const schemaErrors = this.validateSchema(pb);
    if (schemaErrors.length > 0) {
      return { valid: false, errors: schemaErrors, failed_stage: "schema" };
    }

    // ---- Stage 2: strategy (delegate) ----
    const strategyResult = validateStrategy(pb.strategy);
    if (!strategyResult.valid) {
      return {
        valid: false,
        errors: strategyResult.errors,
        failed_stage: "strategy",
      };
    }

    // ---- Stage 3: dependency cycles ----
    // Build edges from this playbook's own dependencies. We can only see
    // direct children here; transitive cycle detection would require the
    // full dep graph (validateNoCycles in ADR-0013 fetches from D1). For
    // the in-memory validator we check direct self-loops and rely on
    // detectCycles() for full graph analysis (exercised in tests).
    const localEdges: PlaybookDependency[] = pb.dependencies.map((child) => ({
      parent_id: pb.id,
      child_id: child,
    }));
    const cycle = detectCycles(localEdges);
    if (cycle.length > 0) {
      return {
        valid: false,
        errors: [`Cycle detected: ${cycle.join(" → ")}`],
        failed_stage: "dependencies",
      };
    }

    // ---- Stage 4: Function()/eval ban (defense-in-depth) ----
    const fnErrors = this.checkFunctionBan(pb.strategy.expression);
    if (fnErrors.length > 0) {
      return {
        valid: false,
        errors: fnErrors,
        failed_stage: "function_ban",
      };
    }

    // ---- Stage 5: identifier allowlist (defense-in-depth) ----
    const idErrors = this.checkIdentifierAllowlist(pb.strategy.expression);
    if (idErrors.length > 0) {
      return {
        valid: false,
        errors: idErrors,
        failed_stage: "identifier_allowlist",
      };
    }

    // ---- Stage 6: param range (defense-in-depth) ----
    const paramErrors: string[] = [];
    checkParamRanges(pb.strategy.expression, paramErrors);
    if (paramErrors.length > 0) {
      return {
        valid: false,
        errors: paramErrors,
        failed_stage: "param_range",
      };
    }

    return { valid: true, errors: [] };
  }

  /** Stage 1: required-field presence. */
  private validateSchema(pb: Playbook): string[] {
    const errors: string[] = [];
    if (!pb.id) errors.push("Playbook id is required");
    if (!pb.name) errors.push("Playbook name is required");
    if (!pb.version) errors.push("Playbook version is required");
    if (!pb.description) errors.push("Playbook description is required");
    if (!pb.strategy) errors.push("Playbook strategy is required");
    if (!Array.isArray(pb.dependencies)) errors.push("Playbook dependencies must be an array");
    if (!pb.created_at) errors.push("Playbook created_at is required");
    return errors;
  }

  /** Stage 4: reject Function/eval identifiers anywhere in the AST. */
  private checkFunctionBan(expr: Expression): string[] {
    const errors: string[] = [];
    const idents = new Set<string>();
    collectIdentifiers(expr, idents);
    if (idents.has("Function")) {
      errors.push("Function() constructor is banned in strategy expressions");
    }
    if (idents.has("eval")) {
      errors.push("eval() is banned in strategy expressions");
    }
    return errors;
  }

  /**
   * Stage 5: every Identifier in the expression must be in the allowlist.
   * Disallowed identifiers (Function/eval/window/process/global) are
   * reported with a security-flagged message; other unknown identifiers
   * get an allowlist message.
   */
  private checkIdentifierAllowlist(expr: Expression): string[] {
    const errors: string[] = [];
    const idents = new Set<string>();
    collectIdentifiers(expr, idents);
    for (const name of idents) {
      if (DISALLOWED_IDENTIFIERS.has(name)) {
        errors.push(
          `Disallowed identifier in strategy expression: ${name}`,
        );
      } else if (!ALLOWED_IDENTIFIERS.has(name)) {
        errors.push(
          `Identifier not in allowlist: ${name}`,
        );
      }
    }
    return errors;
  }
}

// ============ installPlaybook ============

/**
 * Install a playbook to D1 after running the full 6-stage validation.
 *
 * Per ADR-0013 §"Critical Implementation Rules" #5, the YAML content
 * lives in R2 and D1 stores metadata only. This Phase 1 stub writes a
 * single row to the `playbooks` table; the R2 upload is the caller's
 * responsibility (deferred to EP08 stories).
 *
 * @returns `{ success: true }` on success; `{ success: false, error }`
 *          when validation fails or the D1 write throws.
 */
export async function installPlaybook(
  playbook: Playbook,
  db?: D1Like,
): Promise<InstallResult> {
  const validator = new PlaybookValidator();
  const result = validator.validate(playbook);
  if (!result.valid) {
    return { success: false, error: result.errors.join("; ") };
  }

  if (db) {
    try {
      const stmt = db.prepare(
        "INSERT INTO playbooks (id, name, version, description, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      await stmt
        .bind(
          playbook.id,
          playbook.name,
          playbook.version,
          playbook.description,
          playbook.created_at,
        )
        .run();
    } catch (err) {
      return {
        success: false,
        error: `D1 insert failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { success: true };
}
