/**
 * Playbook System - Type definitions (Epic 08, ADR-0013)
 *
 * Two shapes coexist:
 *   1. `Playbook` (simplified, Phase 1) - used by system.ts 6-stage validator
 *   2. `PlaybookYAML` (full Epic 08 schema) - 6 kinds, 3 composition types,
 *      narrative, SemVer versioning, dependencies, execution config
 *
 * See: docs/prd/epic/08_Playbook_System.md
 *      docs/architecture/adr-0013-playbook-system.md
 */

import type { Strategy } from "@/lib/strategy/types";

// ============ Phase 1 simplified shape (used by system.ts) ============

export interface Playbook {
  id: string;
  name: string;
  version: string;
  description: string;
  strategy: Strategy;
  dependencies: string[];
  created_at: string;
}

export interface PlaybookDependency {
  parent_id: string;
  child_id: string;
}

export interface PlaybookValidationResult {
  valid: boolean;
  errors: string[];
  failed_stage?:
    | "schema"
    | "strategy"
    | "dependencies"
    | "function_ban"
    | "identifier_allowlist"
    | "param_range";
}

export interface InstallResult {
  success: boolean;
  error?: string;
}

export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
}

// ============ Epic 08 full schema ============

export type PlaybookKind =
  | "strategy"
  | "composite"
  | "data_fetcher"
  | "risk_manager"
  | "alert"
  | "narrative";

export type LifecycleStatus = "draft" | "published" | "archived" | "deprecated";

export type CompositionType = "parallel" | "sequential" | "conditional";

export interface PlaybookAuthor {
  id: string;
  name: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string;
}

export interface Versioning {
  semantic_version: string; // MAJOR.MINOR.PATCH
  changelog: ChangelogEntry[];
}

/** Narrative content - required: why, how, risks. Optional: references, lessons_learned, faq. */
export interface Narrative {
  why: string;
  how: string;
  risks: string[]; // at least 1
  references?: string[];
  lessons_learned?: string;
  faq?: Array<{ q: string; a: string }>;
}

export interface DataDependency {
  source: string; // "yahoo" | "mock" | ...
  symbols: string[];
  timeframe: string;
}

export interface ToolDependency {
  name: string;
  version: string; // semver range ">=1.0"
}

export interface PlaybookDependencyRef {
  id: string;
  version?: string; // semver range
}

export interface Dependencies {
  data?: DataDependency[];
  tools?: ToolDependency[];
  playbooks?: PlaybookDependencyRef[];
}

export interface ParallelAllocation {
  playbook_id: string;
  weight: number;
}

export interface SequentialStep {
  playbook_id: string;
  depends_on?: string;
}

export interface ConditionalRule {
  if: { field: string; op: string; value: unknown };
  then: string; // playbook_id
  else?: string; // playbook_id
}

export interface Composition {
  type: CompositionType;
  // parallel
  allocation?: ParallelAllocation[];
  // sequential
  sequence?: SequentialStep[];
  // conditional
  condition?: ConditionalRule;
}

export interface ExecutionConfig {
  default_mode: "paper" | "live";
  schedule: string; // "daily" | "weekly" | cron expression
  max_concurrent: number;
}

export interface ComplianceConfig {
  risk_warning: string;
  license: string;
  commercial_use: boolean;
}

/** Full Playbook YAML schema per Epic 08 §2.2. */
export interface PlaybookYAML {
  api_version: string; // "playbook.nova-invest.dev/v1"
  kind: PlaybookKind;

  metadata: {
    id: string;
    title: string;
    description: string;
    author: PlaybookAuthor;
    created_at: string;
    updated_at: string;
  };

  versioning: Versioning;
  narrative: Narrative;
  dependencies?: Dependencies;

  // strategy kind: reference to DSL YAML (R2 key or inline)
  strategy?: {
    dsl_ref?: string; // "r2://strategies/str_xxx.yaml"
    dsl_inline?: Strategy;
  };

  // composite kind: composition config
  composition?: Composition;

  execution?: ExecutionConfig;
  compliance?: ComplianceConfig;
}

// ============ Store / API types ============

export interface PlaybookRecord {
  id: string;
  title: string;
  description: string;
  author_id: string;
  kind: PlaybookKind;
  current_version: string;
  lifecycle_status: LifecycleStatus;
  created_at: string;
  updated_at: string;
}

export interface PlaybookVersionRecord {
  playbook_id: string;
  version: string;
  yaml_r2_key: string;
  changelog: string;
  published_by: string;
  published_at: string;
}

export interface CreatePlaybookRequest {
  title: string;
  description: string;
  kind: PlaybookKind;
  yaml: string; // full PlaybookYAML as YAML string
  narrative: Narrative;
  strategy?: { dsl_ref?: string; dsl_inline?: Strategy };
  composition?: Composition;
}

export interface PublishVersionRequest {
  version: string;
  changelog: string;
  yaml: string;
}

export interface ComposeRequest {
  composition: Composition;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

// ============ Execution ============

export interface ExecutionContext {
  userId: string;
  capital: number;
  timestamp: string;
  // Shared state between sequential steps
  state?: Record<string, unknown>;
}

export interface ExecutionResult {
  playbook_id: string;
  status: "success" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  children?: ExecutionResult[];
}
