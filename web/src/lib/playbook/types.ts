/**
 * Playbook System — Type definitions (ADR-0013)
 *
 * Simplified Playbook shape per the task plan:
 *   `{ id, name, version, description, strategy, dependencies, created_at }`
 *
 * This is distinct from the full ADR-0013 PlaybookYAML schema (which has
 * 6 kinds, narrative fields, composition config, compliance, etc.). The
 * 6-stage validation pipeline implemented in `system.ts` operates on this
 * simplified shape; the same stages map directly onto the full schema
 * when it is introduced in EP08 stories.
 *
 * See: docs/architecture/adr-0013-playbook-system.md
 */

import type { Strategy } from "@/lib/strategy/types";

/**
 * A composable, versioned package of strategies. The simplified Phase 1
 * shape: one inline Strategy + a list of dependency playbook IDs.
 */
export interface Playbook {
  id: string;
  name: string;
  version: string;
  description: string;
  strategy: Strategy;
  /** IDs of playbooks this playbook depends on (composition edges). */
  dependencies: string[];
  created_at: string;
}

/**
 * Directed edge in the playbook dependency graph. Per ADR-0011 schema
 * (playbook_dependencies table): `parent_id` depends on `child_id`.
 */
export interface PlaybookDependency {
  parent_id: string;
  child_id: string;
}

/** Result of PlaybookValidator.validate — discriminated by `valid`. */
export interface PlaybookValidationResult {
  valid: boolean;
  errors: string[];
  /** Name of the first failing stage, when invalid. Useful for tests. */
  failed_stage?:
    | "schema"
    | "strategy"
    | "dependencies"
    | "function_ban"
    | "identifier_allowlist"
    | "param_range";
}

/** Result of installPlaybook. */
export interface InstallResult {
  success: boolean;
  error?: string;
}

/**
 * Minimal D1 binding surface used by installPlaybook. Matches the shape
 * of the mocked D1 in tests:
 *   `{ prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn() })) })) }`
 */
export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
}
