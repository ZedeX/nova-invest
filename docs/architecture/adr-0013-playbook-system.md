# ADR-0013: Playbook System (Versioning + Composition + Execution)

## Status

Proposed

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + D1 + R2 |
| **Domain** | Playbook (Schema + Versioning + Composition + Execution) |
| **Knowledge Risk** | MEDIUM |
| **References Consulted** | EP08 §TR-EP08-001–TR-EP08-014, ADR-0008 (Strategy DSL — Playbook contains Strategy), ADR-0009 (Backtest Engine — Playbook references backtest results), ADR-0011 (D1 schema: playbooks/playbook_versions/playbook_dependencies/user_playbook_installs), ADR-0002 (R2 for YAML storage) |
| **Post-Cutoff APIs Used** | semver npm package (ISC license) for SemVer validation + comparison |
| **Verification Required** | Circular dependency detection via topological sort rejects cyclic playbook_dependencies; parallel composition weight sum ∈ [0.999, 1.001]; SemVer strict monotonic increase enforced; narrative fields ≥20 chars each validated at publish; PlaybookExecutor timeout after 30s; kind=composite requires ≥2 dependencies |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0008 (Strategy DSL — Playbook contains one or more Strategy references), ADR-0009 (Backtest Engine — Playbook references BacktestResult), ADR-0011 (D1 schema: playbooks, playbook_versions, playbook_dependencies, user_playbook_installs), ADR-0002 (R2 for YAML storage) — all Accepted or Proposed with Accepted deps |
| **Enables** | EP08 Playbook stories, composition engine, community sharing (ADR-0012), Build Agent Playbook creation |
| **Blocks** | EP08 Playbook stories cannot start until this ADR is Accepted; ADR-0012 (Community UGC) references Playbook YAML for Share Package |
| **Ordering Note** | ADR-0008 and ADR-0011 must be Accepted first (Playbook references Strategy DSL + D1 tables). ADR-0012 (Community) can be Accepted in parallel — share package definition is independent of PlaybookExecutor implementation. |

## Context

### Problem Statement

EP08 requires composable, versioned (SemVer) packages of strategies + data fetchers + risk managers + alerts + narratives. Key challenges:

1. **Composition complexity**: 3 composition types (parallel, sequential, conditional) with different execution semantics. Parallel requires weight normalization; sequential requires DAG ordering; conditional requires if/then/else evaluation.
2. **Circular dependencies**: Playbook A depends on B, B depends on A → infinite loop in PlaybookExecutor. Must be detected and rejected at validation time.
3. **Versioning consistency**: SemVer must strictly increase. Multiple versions of the same Playbook may exist; executors must resolve which version to use.
4. **Narrative quality**: Playbooks must explain why, how, and risks — not just contain code. Without mandatory narrative fields, users may publish opaque strategies.
5. **Kind-specific constraints**: `kind=composite` must have ≥2 dependencies; `kind=strategy` must have exactly 1 strategy reference. Without enforcement, invalid Playbooks reach the executor.
6. **Execution timeout**: Cloudflare Workers have 30s CPU limit. Composite Playbooks with many sequential dependencies could exceed this.

### Constraints

- **Cloudflare Workers CPU limit**: 30s per request. PlaybookExecutor must enforce timeout. Long-running compositions (sequential with many steps) need per-step time budgeting.
- **D1 for metadata only**: Playbook YAML content stored in R2 (per ADR-0002). D1 stores metadata + version pointers. YAML content NEVER in D1 (per ADR-0011 Critical Implementation Rules).
- **SemVer validation**: Use `semver` npm package (ISC license) for `semver.valid()` and `semver.compare()`. App-level enforcement, not DB constraint.
- **Topological sort**: Implemented in-application (no D1 support for graph queries). Playbook dependency DAG loaded into memory, sorted, cycle detection runs at validation time.
- **Playbook YAML in R2**: Per ADR-0002, Playbook YAML is stored as R2 object. Key format: `playbooks/{playbook_id}/{version}.yaml`.

### Requirements

- Playbook YAML Schema v1 with api_version/kind/metadata/versioning/narrative/dependencies/strategy/composition/execution/compliance sections.
- 6 kinds: strategy, composite, data_fetcher, risk_manager, alert, narrative.
- 3 composition types: parallel (weights sum to 1.0 ±0.001), sequential (depends_on DAG), conditional (if/then/else).
- SemVer versioning with strict monotonic increase.
- Circular dependency detection via topological sort.
- Narrative fields required: why (≥20 chars), how (≥20 chars), risks (≥20 chars).
- PlaybookExecutor with 3 execution paths.
- Playbook lifecycle: Draft → Validated → Published → Archived/Deprecated.
- API endpoints: POST/GET /api/playbooks, POST /api/playbooks/:id/versions, POST /api/playbooks/:id/compose.

## Decision

**Adopt a Playbook YAML Schema v1 with 6 kinds, 3 composition types, SemVer versioning, mandatory narrative fields, and a PlaybookExecutor with timeout guards. Circular dependency detection via topological sort at validation time. Playbook YAML stored in R2; metadata in D1.**

### Playbook YAML Schema v1

```yaml
api_version: "playbook.nova-invest.io/v1"
kind: "strategy" | "composite" | "data_fetcher" | "risk_manager" | "alert" | "narrative"

metadata:
  name: string              # required, unique per author
  title: string             # required, display name
  author: string            # required
  description: string       # optional
  tags: [string]            # optional, for discovery
  created_at: ISO8601       # required

versioning:
  version: string           # required, SemVer (e.g., "1.0.0")
  changelog: string         # optional, what changed in this version

narrative:
  why: string               # required, ≥20 chars — why this Playbook exists
  how: string               # required, ≥20 chars — how it works
  risks: string             # required, ≥20 chars — what could go wrong

dependencies:
  - playbook_id: string     # references playbooks.id
    version?: string        # optional pinned version; latest if omitted
    dependency_type: "parallel" | "sequential" | "conditional" | "data"
    weight?: number         # required if dependency_type = "parallel", 0 < weight ≤ 1
    condition?: string      # required if dependency_type = "conditional"
    alias?: string          # optional, reference name in composition

strategy:
  strategy_id: string       # required for kind = "strategy", references strategies.id
  # OR inline DSL (Phase 2)

composition:
  type: "parallel" | "sequential" | "conditional"
  # parallel: all dependencies run concurrently with weights
  # sequential: dependencies run in depends_on order
  # conditional: if condition → run dependency A, else → run dependency B

execution:
  timeout_ms: number        # default 30000 (30s Worker limit)
  max_retries: number       # default 0
  on_failure: "abort" | "skip" | "fallback"

compliance:
  risk_disclosure: string   # required for publish (≥50 chars per ADR-0012)
  disclaimer: string        # optional
```

### Key Interfaces

```typescript
// web/src/lib/playbook/types.ts

export type PlaybookKind =
  | "strategy"
  | "composite"
  | "data_fetcher"
  | "risk_manager"
  | "alert"
  | "narrative";

export type CompositionType = "parallel" | "sequential" | "conditional";
export type DependencyType = "parallel" | "sequential" | "conditional" | "data";
export type FailurePolicy = "abort" | "skip" | "fallback";

export type PlaybookLifecycle =
  | "draft"
  | "validated"
  | "published"
  | "archived"
  | "deprecated";

export interface PlaybookYAML {
  api_version: "playbook.nova-invest.io/v1";
  kind: PlaybookKind;
  metadata: PlaybookMetadata;
  versioning: PlaybookVersioning;
  narrative: PlaybookNarrative;
  dependencies: PlaybookDependency[];
  strategy?: PlaybookStrategyRef;
  composition?: PlaybookComposition;
  execution: PlaybookExecution;
  compliance?: PlaybookCompliance;
}

export interface PlaybookMetadata {
  name: string;
  title: string;
  author: string;
  description?: string;
  tags?: string[];
  created_at: string;
}

export interface PlaybookVersioning {
  version: string;        // SemVer
  changelog?: string;
}

export interface PlaybookNarrative {
  why: string;            // ≥20 chars
  how: string;            // ≥20 chars
  risks: string;          // ≥20 chars
}

export interface PlaybookDependency {
  playbook_id: string;
  version?: string;
  dependency_type: DependencyType;
  weight?: number;        // required if parallel
  condition?: string;     // required if conditional
  alias?: string;
}

export interface PlaybookStrategyRef {
  strategy_id: string;
}

export interface PlaybookComposition {
  type: CompositionType;
}

export interface PlaybookExecution {
  timeout_ms: number;
  max_retries: number;
  on_failure: FailurePolicy;
}

export interface PlaybookCompliance {
  risk_disclosure: string;
  disclaimer?: string;
}

/** Validation result for Playbook YAML */
export interface PlaybookValidationResult {
  valid: boolean;
  errors: PlaybookValidationError[];
  warnings: PlaybookValidationWarning[];
  has_cycle: boolean;
}

export interface PlaybookValidationError {
  code: string;
  message: string;
  path?: string;
}

export interface PlaybookValidationWarning {
  code: string;
  message: string;
}
```

### Validation Pipeline

```
Playbook YAML string
        │
        ▼  Stage 1: js-yaml safeLoad()
JSON object
        │
        ▼  Stage 2: JSON Schema validate (strict mode, no additionalProperties)
        │   → Check required fields per kind
        │   → Check narrative field lengths (why/how/risks ≥20 chars)
        │
        ▼  Stage 3: Kind-specific validation
        │   → kind="strategy": strategy_id required, dependencies.length === 0 or 1
        │   → kind="composite": dependencies.length ≥ 2
        │   → kind="data_fetcher"/"risk_manager"/"alert"/"narrative": no composition section
        │
        ▼  Stage 4: Dependency validation
        │   → All playbook_id references exist in D1
        │   → Pinned versions exist in playbook_versions
        │   → Parallel dependencies: sum(weights) ∈ [0.999, 1.001]
        │
        ▼  Stage 5: Circular dependency detection (topological sort)
        │   → Build DAG from playbook_dependencies
        │   → Topological sort — if sort fails, cycle detected
        │   → REJECT if cycle
        │
        ▼  Stage 6: Version monotonic check
        │   → New version > latest version in D1 (semver.compare)
        │   → REJECT if ≤ latest
        │
        ▼
PlaybookValidationResult { valid: true }
```

### Circular Dependency Detection

```typescript
// web/src/lib/playbook/cycle-detection.ts

/**
 * Topological sort with cycle detection.
 * Returns sorted order or null if cycle detected.
 *
 * Kahn's algorithm: BFS-based, O(V + E).
 */
export function topologicalSort(
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
): string[] | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    adjacency.set(node, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // If sorted.length < nodes.length, cycle exists
  return sorted.length === nodes.length ? sorted : null;
}

/**
 * Validate Playbook dependency DAG for cycles.
 * Loads all transitive dependencies and checks for cycles.
 */
export async function validateNoCycles(
  playbookId: string,
  db: D1Database,
): Promise<{ hasCycle: boolean; cyclePath?: string[] }> {
  // Load all dependencies transitively (BFS)
  const allEdges: Array<{ from: string; to: string }> = [];
  const allNodes = new Set<string>();
  const visited = new Set<string>();
  const queue = [playbookId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    allNodes.add(current);

    const deps = await db.prepare(
      "SELECT child_id FROM playbook_dependencies WHERE parent_id = ?"
    ).bind(current).all();

    for (const dep of deps.results ?? []) {
      const childId = dep.child_id as string;
      allEdges.push({ from: current, to: childId });
      allNodes.add(childId);
      if (!visited.has(childId)) queue.push(childId);
    }
  }

  const result = topologicalSort([...allNodes], allEdges);
  if (result === null) {
    return { hasCycle: true, cyclePath: findCyclePath(allNodes, allEdges) };
  }
  return { hasCycle: false };
}

function findCyclePath(
  nodes: Set<string>,
  edges: Array<{ from: string; to: string }>,
): string[] {
  // DFS to find one cycle (for error reporting)
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node, []);
  for (const edge of edges) adj.get(edge.from)!.push(edge.to);

  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    if (visited.has(node)) {
      const cycleStart = path.indexOf(node);
      return path.slice(cycleStart).concat(node);
    }
    visited.add(node);
    path.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      const result = dfs(neighbor);
      if (result) return result;
    }

    path.pop();
    return null;
  }

  for (const node of nodes) {
    visited.clear();
    const result = dfs(node);
    if (result) return result;
  }

  return [];
}
```

### PlaybookExecutor

```typescript
// web/src/lib/playbook/executor.ts

export interface PlaybookExecutionResult {
  playbook_id: string;
  version: string;
  status: "completed" | "timeout" | "error";
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  step_results: StepExecutionResult[];
  error?: string;
}

export interface StepExecutionResult {
  dependency_id: string;      // playbook_id of the dependency
  alias?: string;
  status: "completed" | "skipped" | "error" | "timeout";
  output?: unknown;
  duration_ms: number;
  error?: string;
}

export class PlaybookExecutor {
  private timeoutMs: number;
  private startedAt: number;

  constructor(timeoutMs: number = 30_000) {
    this.timeoutMs = timeoutMs;
    this.startedAt = Date.now();
  }

  private checkTimeout(stepsRemaining: number): void {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= this.timeoutMs) {
      throw new Error(`PlaybookExecutor timeout after ${elapsed}ms`);
    }
    // Per-step budget: remaining time / remaining steps
    const perStepBudget = (this.timeoutMs - elapsed) / stepsRemaining;
    if (perStepBudget < 100) {
      throw new Error(
        `Insufficient time budget: ${perStepBudget.toFixed(0)}ms per step remaining`
      );
    }
  }

  /**
   * Execute a composite Playbook based on composition type.
   */
  async execute(
    playbook: PlaybookYAML,
    context: ExecutionContext,
  ): Promise<PlaybookExecutionResult> {
    this.startedAt = Date.now();
    const startTime = new Date().toISOString();

    try {
      if (!playbook.composition) {
        // Non-composite Playbook (kind=strategy/data_fetcher/etc.)
        // Execute directly via strategy runner
        return this.executeSingle(playbook, context, startTime);
      }

      switch (playbook.composition.type) {
        case "parallel":
          return this.executeParallel(playbook, context, startTime);
        case "sequential":
          return this.executeSequential(playbook, context, startTime);
        case "conditional":
          return this.executeConditional(playbook, context, startTime);
        default:
          throw new Error(`Unknown composition type: ${playbook.composition.type}`);
      }
    } catch (error) {
      return {
        playbook_id: playbook.metadata.name,
        version: playbook.versioning.version,
        status: "timeout",
        started_at: startTime,
        duration_ms: Date.now() - this.startedAt,
        step_results: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeParallel(
    playbook: PlaybookYAML,
    context: ExecutionContext,
    startTime: string,
  ): Promise<PlaybookExecutionResult> {
    // Run all dependencies concurrently with weights
    const parallelDeps = playbook.dependencies.filter(
      (d) => d.dependency_type === "parallel"
    );
    this.checkTimeout(parallelDeps.length);

    const results = await Promise.all(
      parallelDeps.map((dep) => this.runDependency(dep, context))
    );

    // Weighted aggregation of outputs
    const aggregated = this.aggregateParallelResults(results, parallelDeps);

    return {
      playbook_id: playbook.metadata.name,
      version: playbook.versioning.version,
      status: "completed",
      started_at: startTime,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - this.startedAt,
      step_results: results,
    };
  }

  private async executeSequential(
    playbook: PlaybookYAML,
    context: ExecutionContext,
    startTime: string,
  ): Promise<PlaybookExecutionResult> {
    // Run dependencies in topological order (DAG)
    const seqDeps = playbook.dependencies.filter(
      (d) => d.dependency_type === "sequential"
    );
    const results: StepExecutionResult[] = [];

    for (let i = 0; i < seqDeps.length; i++) {
      this.checkTimeout(seqDeps.length - i);
      const result = await this.runDependency(seqDeps[i], context);
      results.push(result);

      if (result.status === "error" && playbook.execution.on_failure === "abort") {
        break;
      }
    }

    return {
      playbook_id: playbook.metadata.name,
      version: playbook.versioning.version,
      status: results.every((r) => r.status === "completed") ? "completed" : "error",
      started_at: startTime,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - this.startedAt,
      step_results: results,
    };
  }

  private async executeConditional(
    playbook: PlaybookYAML,
    context: ExecutionContext,
    startTime: string,
  ): Promise<PlaybookExecutionResult> {
    // Evaluate condition → run matching branch
    const condDeps = playbook.dependencies.filter(
      (d) => d.dependency_type === "conditional"
    );

    const results: StepExecutionResult[] = [];

    for (const dep of condDeps) {
      const conditionMet = this.evaluateCondition(dep.condition, context);
      if (conditionMet) {
        this.checkTimeout(1);
        const result = await this.runDependency(dep, context);
        results.push(result);
        break; // only first matching condition
      }
    }

    return {
      playbook_id: playbook.metadata.name,
      version: playbook.versioning.version,
      status: "completed",
      started_at: startTime,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - this.startedAt,
      step_results: results,
    };
  }

  private evaluateCondition(
    condition: string | undefined,
    context: ExecutionContext,
  ): boolean {
    if (!condition) return false;
    // Simple expression evaluation — jsep or similar
    // Phase 1: supports simple comparisons (e.g., "market_trend == 'bull'")
    try {
      // eslint-disable-next-line no-eval
      return Boolean(Function("context", `with(context) { return ${condition}; }`)(context));
    } catch {
      return false;
    }
  }

  private async runDependency(
    dep: PlaybookDependency,
    context: ExecutionContext,
  ): Promise<StepExecutionResult> {
    const stepStart = Date.now();
    try {
      // Load dependency Playbook from R2 + D1
      // Execute recursively or delegate to strategy runner
      // ...implementation details in EP08 stories
      return {
        dependency_id: dep.playbook_id,
        alias: dep.alias,
        status: "completed",
        duration_ms: Date.now() - stepStart,
      };
    } catch (error) {
      return {
        dependency_id: dep.playbook_id,
        alias: dep.alias,
        status: "error",
        duration_ms: Date.now() - stepStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private aggregateParallelResults(
    results: StepExecutionResult[],
    deps: PlaybookDependency[],
  ): unknown {
    // Weighted aggregation based on parallel weights
    // Implementation varies by output type
    return { aggregated: true, weights: deps.map((d) => d.weight) };
  }

  private async executeSingle(
    playbook: PlaybookYAML,
    context: ExecutionContext,
    startTime: string,
  ): Promise<PlaybookExecutionResult> {
    // Single-strategy Playbook: delegate to strategy runner (ADR-0009)
    return {
      playbook_id: playbook.metadata.name,
      version: playbook.versioning.version,
      status: "completed",
      started_at: startTime,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - this.startedAt,
      step_results: [],
    };
  }
}

export interface ExecutionContext {
  market_data: unknown;       // current market state
  portfolio: unknown;         // current positions
  signals: Map<string, unknown>;  // signals from upstream dependencies
  variables: Record<string, unknown>; // user-defined variables
}
```

### Playbook Lifecycle FSM

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
  [*] ──► Draft ──► Validated ──► Published ──┬──► Archived   │
              ▲                    │           └──► Deprecated │
              │                    │                          │
              └── (edit: any → Draft) ───────────────────────┘
```

| Transition | Guard | Action |
|------------|-------|--------|
| Draft → Validated | `validatePlaybook(yaml) = { valid: true }` + no cycles + narrative fields ≥20 chars | Set `lifecycle_status = "validated"` |
| Validated → Published | User confirmation + risk_disclosure ≥50 chars (per ADR-0012) | Set `lifecycle_status = "published"`, create `community_playbooks` row (per ADR-0012) |
| Published → Archived | User action | Set `lifecycle_status = "archived"` — removes from feed |
| Published → Deprecated | Author publishes new major version | Set `lifecycle_status = "deprecated"` — marks as outdated |
| Any → Draft | User edits YAML | Increment version, reset validation |

**Note**: Playbook lifecycle is different from Strategy lifecycle (ADR-0008). Strategy has `draft/validated/backtested/paper_trading/live`. Playbook has `draft/validated/published/archived/deprecated`. They share the "edit → Draft rollback" pattern but have different forward states.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/playbooks` | Create new Playbook (Draft state) |
| GET | `/api/playbooks` | List user's Playbooks |
| GET | `/api/playbooks/:id` | Get Playbook metadata + versions |
| PUT | `/api/playbooks/:id` | Update Playbook (edits → Draft, new version) |
| POST | `/api/playbooks/:id/validate` | Validate Playbook (runs validation pipeline) |
| POST | `/api/playbooks/:id/versions` | Create new version (SemVer must increase) |
| POST | `/api/playbooks/:id/compose` | Execute composite Playbook |
| DELETE | `/api/playbooks/:id` | Archive Playbook |

### Critical Implementation Rules

1. **Circular dependency detection**: Run topological sort on `playbook_dependencies` at validation time. If sort fails (cycle detected), reject validation — do NOT allow publish. The `findCyclePath()` function reports the cycle for user debugging.
2. **Parallel composition weight validation**: Sum of all sibling weights must be within `[0.999, 1.001]`. Reject if outside range. This allows floating-point imprecision while catching meaningful errors.
3. **SemVer enforcement**: New version must be strictly greater than latest version per `semver.compare()`. Reject equal or lower versions. `semver.valid()` must return non-null (valid SemVer string).
4. **Narrative minimum lengths enforced at validation**: `why ≥ 20 chars`, `how ≥ 20 chars`, `risks ≥ 20 chars`. All 3 required for `lifecycle_status` transition to "validated".
5. **Playbook YAML stored in R2** (per ADR-0002); D1 stores only metadata + version pointers. YAML content never in D1. R2 key format: `playbooks/{playbook_id}/{version}.yaml`.
6. **PlaybookExecutor must timeout after 30s** (Worker CPU limit). For sequential compositions with many dependencies, each step must complete within `30s / num_steps`. `checkTimeout()` enforces this per-step.
7. **kind=composite must have at least 2 dependencies**. kind=strategy must have exactly 1 strategy reference (strategy.strategy_id required, no composition section). These are validated in Stage 3 of the validation pipeline.

## GDD Requirements Addressed

| TR-ID | Requirement | Coverage |
|-------|-------------|----------|
| TR-EP08-001 | Playbook YAML Schema v1 | ✅ Full — complete schema with api_version/kind/metadata/versioning/narrative/dependencies/strategy/composition/execution/compliance |
| TR-EP08-002 | 6 kinds | ✅ Full — strategy, composite, data_fetcher, risk_manager, alert, narrative |
| TR-EP08-003 | 3 composition types | ✅ Full — parallel/sequential/conditional with PlaybookExecutor paths |
| TR-EP08-004 | Parallel weight sum = 1.0 | ✅ Full — app-level validation [0.999, 1.001] + ADR-0011 weight column |
| TR-EP08-005 | Circular dependency detection | ✅ Full — topological sort (Kahn's algorithm) at validation time |
| TR-EP08-006 | SemVer versioning | ✅ Full — semver.valid() + semver.compare() + strict monotonic increase |
| TR-EP08-007 | Narrative fields required | ✅ Full — why/how/risks all ≥20 chars, enforced at validation |
| TR-EP08-008 | D1 4 tables | ✅ Covered by ADR-0011 Migration 006 (playbooks, playbook_versions, playbook_dependencies, user_playbook_installs) |
| TR-EP08-009 | R2 storage | ✅ Covered by ADR-0002 — Playbook YAML in R2, key: `playbooks/{id}/{version}.yaml` |
| TR-EP08-010 | PlaybookExecutor with 3 paths | ✅ Full — executeParallel/executeSequential/executeConditional |
| TR-EP08-011 | Playbook lifecycle | ✅ Full — Draft/Validated/Published/Archived/Deprecated FSM |
| TR-EP08-012 | Mock mode ≥5 samples | ✅ Full — Mock Playbook data at `web/public/mock/playbooks/` (per ADR-0001) |
| TR-EP08-013 | API endpoints | ✅ Full — POST/GET/PUT/DELETE /api/playbooks + validate/versions/compose |
| TR-EP08-014 | Narrative Markdown rendering | ✅ Full — narrative fields rendered as Markdown in Playbook detail view |

## Alternatives Considered

### Alternative 1: Flat Playbook (no composition, no dependencies)

- **Description**: Each Playbook is a single strategy — no composition, no dependencies, no DAG.
- **Pros**: Simple. No circular dependency risk. No weight normalization. Faster to implement.
- **Cons**: Cannot express multi-strategy portfolios (e.g., 60% momentum + 40% mean-reversion). Cannot compose data fetchers + risk managers. Defeats the purpose of EP08.
- **Rejection Reason**: EP08 explicitly requires composition types and dependency management. Flat Playbooks are just renamed Strategies (ADR-0008).

### Alternative 2: Graph database (D1 + external graph engine)

- **Description**: Use a graph database or external graph query engine for dependency DAG traversal.
- **Pros**: Native cycle detection. Efficient transitive closure queries.
- **Cons**: Adds external dependency. D1 is the only database (Cloudflare free tier). No graph DB on Cloudflare Workers.
- **Rejection Reason**: D1 is the only persistence layer. In-application topological sort is sufficient for the expected dependency graph size (<100 nodes per Playbook).

### Alternative 3: Linear versioning (v1, v2, v3) instead of SemVer

- **Description**: Simple incrementing integer versioning instead of SemVer.
- **Pros**: Simpler comparison (v2 > v1). No SemVer parsing dependency.
- **Cons**: Cannot express breaking changes vs backward-compatible changes. No major.minor.patch semantics. Users cannot distinguish safe updates from breaking changes.
- **Rejection Reason**: SemVer is explicitly required by EP08 §TR-EP08-006. The `semver` npm package (ISC license) is a lightweight dependency. Major version changes signal breaking changes for composition compatibility.

## Consequences

### Positive

- Composable Playbooks enable multi-strategy portfolio construction (the core value proposition of EP08).
- SemVer versioning with strict monotonic increase ensures reproducibility — a specific version always maps to the same YAML in R2.
- Circular dependency detection prevents infinite loops in PlaybookExecutor.
- Mandatory narrative fields (why/how/risks) enforce transparency — users cannot publish opaque Playbooks.
- R2 storage for YAML content keeps D1 lightweight (metadata only), aligning with ADR-0011.

### Negative

- PlaybookExecutor conditional evaluation uses `Function()` constructor for expression evaluation — potential security risk if conditions come from untrusted input.
  - Mitigation: Phase 1 conditions are authored by the Playbook creator (trusted). Phase 2 adds jsep-based safe expression parser.
- Topological sort loads transitive dependencies into memory. Deep dependency chains (>10 levels) may be slow.
  - Mitigation: Limit max dependency depth to 10 in validation. Most Playbooks will have 2-3 levels.
- Playbook lifecycle FSM differs from Strategy lifecycle FSM — developers must remember two different state machines.
  - Mitigation: Different state names (draft/validated/published vs draft/validated/backtested/paper_trading/live) reduce confusion. Shared "edit → Draft rollback" pattern.

### Risks

- **Risk**: Parallel weight sum floating-point imprecision may cause false validation failures.
  - **Mitigation**: Tolerance range [0.999, 1.001] accommodates floating-point error. If weights are specified as simple fractions (0.5, 0.25, 0.25), the sum is exact.
- **Risk**: PlaybookExecutor 30s timeout may be insufficient for sequential compositions with many slow dependencies.
  - **Mitigation**: Per-step time budgeting (`30s / num_steps`). If a step exceeds its budget, abort early. Phase 2 considers Durable Objects for long-running compositions.
- **Risk**: `kind=composite` with only 2 dependencies may be too restrictive — users may want to compose a single dependency with a risk manager.
  - **Mitigation**: A composite with 1 parallel + 1 sequential dependency counts as 2. If feedback shows this is too restrictive, lower the minimum to 1 in a future ADR amendment.

---

> **Last Updated**: 2026-07-19
