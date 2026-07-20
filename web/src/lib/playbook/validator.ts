/**
 * Playbook Validator (Epic 08 §2.4-2.6, ID-2 to ID-5).
 *
 * Validation pipeline:
 *   1. Schema validation - required fields present
 *   2. SemVer validation - version is valid and > current
 *   3. Narrative validation - why/how/risks required
 *   4. Composition validation - parallel weight sum = 1.0
 *   5. Circular dependency detection - DFS cycle check
 *
 * See: docs/prd/epic/08_Playbook_System.md
 */

import type {
  Composition,
  Narrative,
  PlaybookKind,
  PlaybookYAML,
  ValidationResult,
} from "./types";

// ============ SemVer validation (ID-2) ============

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse "1.2.3" -> [1, 2, 3]. Returns null if invalid. */
export function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(SEMVER_RE);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Check if `newV` > `oldV` per semver comparison rules. */
export function isSemverGreater(newV: string, oldV: string): boolean {
  const n = parseSemver(newV);
  const o = parseSemver(oldV);
  if (!n || !o) return false;
  for (let i = 0; i < 3; i++) {
    if (n[i] > o[i]) return true;
    if (n[i] < o[i]) return false;
  }
  return false; // equal
}

export function validateSemver(newVersion: string, currentVersion?: string): ValidationResult {
  if (!parseSemver(newVersion)) {
    return { ok: false, reason: `Invalid semver: ${newVersion}` };
  }
  if (currentVersion !== undefined && !isSemverGreater(newVersion, currentVersion)) {
    return {
      ok: false,
      reason: `Version ${newVersion} must be greater than current ${currentVersion}`,
    };
  }
  return { ok: true };
}

// ============ Narrative validation (ID-5) ============

export function validateNarrative(n: Narrative): ValidationResult {
  if (!n.why || n.why.trim().length === 0) {
    return { ok: false, reason: "narrative.why is required" };
  }
  if (!n.how || n.how.trim().length === 0) {
    return { ok: false, reason: "narrative.how is required" };
  }
  if (!n.risks || n.risks.length === 0) {
    return { ok: false, reason: "narrative.risks must have at least 1 entry" };
  }
  return { ok: true };
}

// ============ Composition validation (ID-3) ============

export function validateComposition(comp: Composition): ValidationResult {
  switch (comp.type) {
    case "parallel": {
      if (!comp.allocation || comp.allocation.length === 0) {
        return { ok: false, reason: "parallel composition requires allocation" };
      }
      const total = comp.allocation.reduce((s, a) => s + a.weight, 0);
      if (Math.abs(total - 1.0) > 0.001) {
        return {
          ok: false,
          reason: `Total weight must equal 1.0 (got ${total.toFixed(4)})`,
        };
      }
      // Each weight must be in [0, 1]
      for (const a of comp.allocation) {
        if (a.weight < 0 || a.weight > 1) {
          return {
            ok: false,
            reason: `Weight ${a.weight} for ${a.playbook_id} must be in [0, 1]`,
          };
        }
      }
      return { ok: true };
    }

    case "sequential": {
      if (!comp.sequence || comp.sequence.length === 0) {
        return { ok: false, reason: "sequential composition requires sequence" };
      }
      // Each depends_on must reference an earlier step
      const ids = new Set<string>();
      for (const step of comp.sequence) {
        if (step.depends_on && !ids.has(step.depends_on)) {
          return {
            ok: false,
            reason: `depends_on "${step.depends_on}" not found in prior steps`,
          };
        }
        ids.add(step.playbook_id);
      }
      return { ok: true };
    }

    case "conditional": {
      if (!comp.condition) {
        return { ok: false, reason: "conditional composition requires condition" };
      }
      if (!comp.condition.if || !comp.condition.then) {
        return { ok: false, reason: "condition requires if + then" };
      }
      return { ok: true };
    }

    default:
      return { ok: false, reason: `Unknown composition type: ${comp.type}` };
  }
}

// ============ Circular dependency detection (ID-4) ============

/**
 * Detect cycles in the playbook dependency graph using DFS with
 * white/gray/black coloring. O(V+E).
 *
 * @param graph  Map of playbook_id -> [dependency playbook_ids]
 * @returns      cycle path (e.g., ["A","B","A"]) or [] if acyclic.
 */
export function detectCircularDependency(
  graph: Map<string, string[]>,
): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    path.push(node);
    const deps = graph.get(node) ?? [];
    for (const dep of deps) {
      const c = color.get(dep) ?? WHITE;
      if (c === GRAY) {
        // Found cycle: extract from path
        const cycleStart = path.indexOf(dep);
        return [...path.slice(cycleStart), dep];
      }
      if (c === WHITE) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      }
    }
    color.set(node, BLACK);
    path.pop();
    return null;
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }
  return [];
}

/**
 * Build a dependency graph from a composition + a resolver that fetches
 * child playbook compositions (for nested composites).
 */
export function buildDependencyGraph(
  rootId: string,
  composition: Composition | undefined,
  resolver: (id: string) => Composition | undefined,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  function addNode(id: string, comp?: Composition) {
    if (graph.has(id)) return;
    const deps: string[] = [];
    if (comp) {
      if (comp.type === "parallel" && comp.allocation) {
        for (const a of comp.allocation) {
          deps.push(a.playbook_id);
          addNode(a.playbook_id, resolver(a.playbook_id));
        }
      } else if (comp.type === "sequential" && comp.sequence) {
        for (const s of comp.sequence) {
          deps.push(s.playbook_id);
          addNode(s.playbook_id, resolver(s.playbook_id));
        }
      } else if (comp.type === "conditional" && comp.condition) {
        deps.push(comp.condition.then);
        addNode(comp.condition.then, resolver(comp.condition.then));
        if (comp.condition.else) {
          deps.push(comp.condition.else);
          addNode(comp.condition.else, resolver(comp.condition.else));
        }
      }
    }
    graph.set(id, deps);
  }

  addNode(rootId, composition);
  return graph;
}

// ============ Full Playbook validation ============

const VALID_KINDS: PlaybookKind[] = [
  "strategy", "composite", "data_fetcher", "risk_manager", "alert", "narrative",
];

export function validatePlaybookYAML(
  pb: PlaybookYAML,
  currentVersion?: string,
): ValidationResult {
  // 1. Schema validation
  if (!pb.api_version || !pb.api_version.startsWith("playbook.nova-invest.dev/")) {
    return { ok: false, reason: "api_version must start with 'playbook.nova-invest.dev/'" };
  }
  if (!VALID_KINDS.includes(pb.kind)) {
    return { ok: false, reason: `Invalid kind: ${pb.kind}` };
  }
  if (!pb.metadata?.id || !pb.metadata?.title || !pb.metadata?.description) {
    return { ok: false, reason: "metadata.id, title, description are required" };
  }
  if (!pb.metadata?.author?.id) {
    return { ok: false, reason: "metadata.author.id is required" };
  }

  // 2. SemVer validation
  const semverResult = validateSemver(pb.versioning?.semantic_version, currentVersion);
  if (!semverResult.ok) return semverResult;

  // 3. Narrative validation
  if (!pb.narrative) {
    return { ok: false, reason: "narrative is required" };
  }
  const narrativeResult = validateNarrative(pb.narrative);
  if (!narrativeResult.ok) return narrativeResult;

  // 4. Kind-specific validation
  if (pb.kind === "strategy" && !pb.strategy) {
    return { ok: false, reason: "strategy kind requires strategy field" };
  }
  if (pb.kind === "composite") {
    if (!pb.composition) {
      return { ok: false, reason: "composite kind requires composition field" };
    }
    const compResult = validateComposition(pb.composition);
    if (!compResult.ok) return compResult;
  }

  return { ok: true };
}
