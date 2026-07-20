/**
 * Playbook Store (Epic 08 §2.9).
 *
 * Phase 1: in-memory store with 5 pre-seeded mock playbooks.
 * Phase 2: D1 + R2 persistence (YAML in R2, metadata in D1).
 *
 * See: docs/prd/epic/08_Playbook_System.md
 */

import type {
  CreatePlaybookRequest,
  LifecycleStatus,
  PlaybookRecord,
  PlaybookVersionRecord,
  PlaybookYAML,
  PublishVersionRequest,
} from "./types";
import { validatePlaybookYAML, validateSemver } from "./validator";

// ============ In-memory store ============

interface PlaybookStoreEntry {
  record: PlaybookRecord;
  versions: Map<string, PlaybookVersionRecord & { yaml: PlaybookYAML }>;
  yaml: PlaybookYAML; // current version YAML
}

const store = new Map<string, PlaybookStoreEntry>();

// ============ CRUD ============

export function listPlaybooks(filter?: {
  kind?: string;
  lifecycle_status?: LifecycleStatus;
}): PlaybookRecord[] {
  let records = Array.from(store.values()).map((e) => e.record);
  if (filter?.kind) {
    records = records.filter((r) => r.kind === filter.kind);
  }
  if (filter?.lifecycle_status) {
    records = records.filter((r) => r.lifecycle_status === filter.lifecycle_status);
  }
  return records;
}

export function getPlaybook(id: string, version?: string): PlaybookYAML | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (version) {
    return entry.versions.get(version)?.yaml ?? null;
  }
  return entry.yaml;
}

export function getPlaybookRecord(id: string): PlaybookRecord | null {
  return store.get(id)?.record ?? null;
}

export function listVersions(playbookId: string): PlaybookVersionRecord[] {
  const entry = store.get(playbookId);
  if (!entry) return [];
  return Array.from(entry.versions.values()).map(({ yaml: _yaml, ...v }) => v);
}

export function createPlaybook(
  req: CreatePlaybookRequest,
  authorId: string,
): { record: PlaybookRecord; yaml: PlaybookYAML } | { error: string } {
  // Parse YAML to PlaybookYAML
  let pb: PlaybookYAML;
  try {
    pb = JSON.parse(req.yaml) as PlaybookYAML;
  } catch {
    return { error: "Invalid YAML/JSON format" };
  }

  // Apply request fields if not in YAML
  pb.kind = req.kind;
  if (!pb.metadata) {
    pb.metadata = {
      id: `pb_${Date.now().toString(36)}`,
      title: req.title,
      description: req.description,
      author: { id: authorId, name: authorId },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  if (!pb.versioning) {
    pb.versioning = {
      semantic_version: "1.0.0",
      changelog: [{ version: "1.0.0", date: new Date().toISOString().slice(0, 10), changes: "Initial version" }],
    };
  }
  if (req.narrative) pb.narrative = req.narrative;
  if (req.strategy) pb.strategy = req.strategy;
  if (req.composition) pb.composition = req.composition;

  // Validate
  const validation = validatePlaybookYAML(pb);
  if (!validation.ok) {
    return { error: validation.reason ?? "Validation failed" };
  }

  // Check ID collision
  if (store.has(pb.metadata.id)) {
    return { error: `Playbook ${pb.metadata.id} already exists` };
  }

  const now = new Date().toISOString();
  const record: PlaybookRecord = {
    id: pb.metadata.id,
    title: pb.metadata.title,
    description: pb.metadata.description,
    author_id: authorId,
    kind: pb.kind,
    current_version: pb.versioning.semantic_version,
    lifecycle_status: "draft",
    created_at: now,
    updated_at: now,
  };

  const versionRecord: PlaybookVersionRecord & { yaml: PlaybookYAML } = {
    playbook_id: pb.metadata.id,
    version: pb.versioning.semantic_version,
    yaml_r2_key: `playbooks/${pb.metadata.id}/${pb.versioning.semantic_version}.yaml`,
    changelog: pb.versioning.changelog[0]?.changes ?? "Initial version",
    published_by: authorId,
    published_at: now,
    yaml: pb,
  };

  store.set(pb.metadata.id, {
    record,
    versions: new Map([[versionRecord.version, versionRecord]]),
    yaml: pb,
  });

  return { record, yaml: pb };
}

export function publishVersion(
  playbookId: string,
  req: PublishVersionRequest,
  authorId: string,
): { record: PlaybookRecord; version: PlaybookVersionRecord } | { error: string } {
  const entry = store.get(playbookId);
  if (!entry) return { error: `Playbook ${playbookId} not found` };

  // Validate SemVer
  const semverCheck = validateSemver(req.version, entry.record.current_version);
  if (!semverCheck.ok) return { error: semverCheck.reason ?? "SemVer validation failed" };

  // Parse new YAML
  let newYaml: PlaybookYAML;
  try {
    newYaml = JSON.parse(req.yaml) as PlaybookYAML;
  } catch {
    return { error: "Invalid YAML/JSON format" };
  }

  // Validate new YAML (must be greater version)
  const validation = validatePlaybookYAML(newYaml, entry.record.current_version);
  if (!validation.ok) return { error: validation.reason ?? "Playbook validation failed" };

  const now = new Date().toISOString();
  const versionRecord: PlaybookVersionRecord & { yaml: PlaybookYAML } = {
    playbook_id: playbookId,
    version: req.version,
    yaml_r2_key: `playbooks/${playbookId}/${req.version}.yaml`,
    changelog: req.changelog,
    published_by: authorId,
    published_at: now,
    yaml: newYaml,
  };

  entry.versions.set(req.version, versionRecord);
  entry.yaml = newYaml;
  entry.record.current_version = req.version;
  entry.record.updated_at = now;

  return {
    record: entry.record,
    version: { ...versionRecord, yaml: undefined } as PlaybookVersionRecord,
  };
}

export function updateLifecycleStatus(
  playbookId: string,
  status: LifecycleStatus,
): { ok: boolean; error?: string } {
  const entry = store.get(playbookId);
  if (!entry) return { ok: false, error: `Playbook ${playbookId} not found` };
  entry.record.lifecycle_status = status;
  entry.record.updated_at = new Date().toISOString();
  return { ok: true };
}

export function deletePlaybook(playbookId: string): boolean {
  return store.delete(playbookId);
}

// ============ Test helper ============

export function _resetStoreForTest(): void {
  store.clear();
  seedMockPlaybooks();
}

// ============ Mock seed data ============

export function seedMockPlaybooks(): void {
  if (store.size > 0) return;

  const now = "2025-12-15T10:00:00Z";
  const authorId = "brenda@example.com";

  const seeds: Array<{ record: PlaybookRecord; yaml: PlaybookYAML }> = [
    // 1. Strategy: NVDA MA Cross
    {
      record: {
        id: "pb_nvda_macross",
        title: "NVDA 双均线金叉策略",
        description: "50/200 SMA crossover for NVDA, paper-tested 6 months",
        author_id: authorId,
        kind: "strategy",
        current_version: "1.2.0",
        lifecycle_status: "published",
        created_at: now,
        updated_at: now,
      },
      yaml: {
        api_version: "playbook.nova-invest.dev/v1",
        kind: "strategy",
        metadata: {
          id: "pb_nvda_macross",
          title: "NVDA 双均线金叉策略",
          description: "50/200 SMA crossover for NVDA, paper-tested 6 months",
          author: { id: authorId, name: "Brenda Liu" },
          created_at: now,
          updated_at: now,
        },
        versioning: {
          semantic_version: "1.2.0",
          changelog: [
            { version: "1.0.0", date: "2025-10-01", changes: "Initial version" },
            { version: "1.1.0", date: "2025-11-01", changes: "Added stop-loss at 7%" },
            { version: "1.2.0", date: "2025-12-15", changes: "Tuned SMA periods based on backtest" },
          ],
        },
        narrative: {
          why: "NVDA is a high-momentum stock in bull markets. The 50/200 SMA crossover captures medium-term trends while filtering short-term noise.",
          how: "Buy when 50-day SMA crosses above 200-day SMA. Sell on crossunder. Use 10% position sizing with 7% stop-loss.",
          risks: ["Whipsaw in sideways markets", "Lagging signal; may enter late", "No protection against gap-down moves"],
          references: ["https://www.investopedia.com/terms/d/deathcross.asp"],
        },
        strategy: { dsl_ref: "r2://strategies/str_nvda_macross_v1.2.yaml" },
        execution: { default_mode: "paper", schedule: "daily", max_concurrent: 1 },
        compliance: { risk_warning: "Past performance does not guarantee future results.", license: "CC-BY-4.0", commercial_use: true },
      },
    },

    // 2. Strategy: AAPL RSI
    {
      record: {
        id: "pb_aapl_rsi",
        title: "AAPL RSI Oversold Bounce",
        description: "Buy AAPL when RSI(14) < 30, sell when RSI > 70",
        author_id: authorId,
        kind: "strategy",
        current_version: "1.0.0",
        lifecycle_status: "published",
        created_at: now,
        updated_at: now,
      },
      yaml: {
        api_version: "playbook.nova-invest.dev/v1",
        kind: "strategy",
        metadata: {
          id: "pb_aapl_rsi",
          title: "AAPL RSI Oversold Bounce",
          description: "Buy AAPL when RSI(14) < 30, sell when RSI > 70",
          author: { id: authorId, name: "Brenda Liu" },
          created_at: now,
          updated_at: now,
        },
        versioning: {
          semantic_version: "1.0.0",
          changelog: [{ version: "1.0.0", date: "2025-10-15", changes: "Initial version" }],
        },
        narrative: {
          why: "AAPL tends to bounce back from oversold conditions due to strong fundamentals and institutional support.",
          how: "Buy when RSI(14) drops below 30. Sell when RSI exceeds 70. Use 5% position sizing.",
          risks: ["RSI can stay oversold in bear markets", "False signals during earnings season"],
        },
        strategy: { dsl_ref: "r2://strategies/str_aapl_rsi_v1.0.yaml" },
      },
    },

    // 3. Composite: Momentum Combo (parallel 50/30/20)
    {
      record: {
        id: "pb_momentum_combo",
        title: "Momentum Combo (50/30/20)",
        description: "Parallel allocation: 50% MA Cross + 30% RSI + 20% Bollinger",
        author_id: authorId,
        kind: "composite",
        current_version: "1.0.0",
        lifecycle_status: "published",
        created_at: now,
        updated_at: now,
      },
      yaml: {
        api_version: "playbook.nova-invest.dev/v1",
        kind: "composite",
        metadata: {
          id: "pb_momentum_combo",
          title: "Momentum Combo (50/30/20)",
          description: "Parallel allocation: 50% MA Cross + 30% RSI + 20% Bollinger",
          author: { id: authorId, name: "Brenda Liu" },
          created_at: now,
          updated_at: now,
        },
        versioning: {
          semantic_version: "1.0.0",
          changelog: [{ version: "1.0.0", date: "2025-11-20", changes: "Initial combo" }],
        },
        narrative: {
          why: "Combining 3 uncorrelated momentum signals reduces single-strategy risk while maintaining upside capture.",
          how: "Allocate 50% to MA Cross, 30% to RSI, 20% to Bollinger Breakout. Rebalance weekly.",
          risks: ["Correlation increases in market crashes", "Over-allocation to tech sector"],
        },
        composition: {
          type: "parallel",
          allocation: [
            { playbook_id: "pb_nvda_macross", weight: 0.5 },
            { playbook_id: "pb_aapl_rsi", weight: 0.3 },
            { playbook_id: "pb_tsla_bollinger", weight: 0.2 },
          ],
        },
      },
    },

    // 4. Strategy: TSLA Bollinger (referenced by combo)
    {
      record: {
        id: "pb_tsla_bollinger",
        title: "TSLA Bollinger Breakout",
        description: "Buy TSLA on upper Bollinger Band breakout",
        author_id: authorId,
        kind: "strategy",
        current_version: "1.1.0",
        lifecycle_status: "published",
        created_at: now,
        updated_at: now,
      },
      yaml: {
        api_version: "playbook.nova-invest.dev/v1",
        kind: "strategy",
        metadata: {
          id: "pb_tsla_bollinger",
          title: "TSLA Bollinger Breakout",
          description: "Buy TSLA on upper Bollinger Band breakout",
          author: { id: authorId, name: "Brenda Liu" },
          created_at: now,
          updated_at: now,
        },
        versioning: {
          semantic_version: "1.1.0",
          changelog: [
            { version: "1.0.0", date: "2025-09-01", changes: "Initial version" },
            { version: "1.1.0", date: "2025-10-15", changes: "Adjusted band width to 2.5 sigma" },
          ],
        },
        narrative: {
          why: "TSLA's high volatility makes Bollinger Band breakouts a reliable momentum signal.",
          how: "Buy when price closes above upper Bollinger Band (2.5 sigma, 20-period). Sell at middle band.",
          risks: ["False breakouts in low-volume periods", "High volatility = large position swings"],
        },
        strategy: { dsl_ref: "r2://strategies/str_tsla_bollinger_v1.1.yaml" },
      },
    },

    // 5. Narrative: NVDA Investment Thesis
    {
      record: {
        id: "pb_nvda_thesis",
        title: "NVDA Investment Thesis 2026",
        description: "Long-term thesis on NVDA: AI infra monopoly + data center growth",
        author_id: authorId,
        kind: "narrative",
        current_version: "1.0.0",
        lifecycle_status: "published",
        created_at: now,
        updated_at: now,
      },
      yaml: {
        api_version: "playbook.nova-invest.dev/v1",
        kind: "narrative",
        metadata: {
          id: "pb_nvda_thesis",
          title: "NVDA Investment Thesis 2026",
          description: "Long-term thesis on NVDA: AI infra monopoly + data center growth",
          author: { id: authorId, name: "Brenda Liu" },
          created_at: now,
          updated_at: now,
        },
        versioning: {
          semantic_version: "1.0.0",
          changelog: [{ version: "1.0.0", date: "2025-12-01", changes: "Initial thesis" }],
        },
        narrative: {
          why: "NVIDIA's CUDA ecosystem + GPU monopoly in AI training creates a durable moat for the next 3-5 years.",
          how: "Accumulate on dips below 25x forward P/E. Hold core position through 2026. Trim above 40x P/E.",
          risks: ["Competition from custom ASICs (TPU, Trainium)", "Geopolitical: China export restrictions", "AI bubble deflation risk"],
          references: ["https://investor.nvidia.com", "My backtest: pb_nvda_macross"],
          lessons_learned: "NVDA's 2024 split made options more accessible; consider LEAPS for leveraged exposure.",
        },
      },
    },
  ];

  for (const seed of seeds) {
    const versionRecord: PlaybookVersionRecord & { yaml: PlaybookYAML } = {
      playbook_id: seed.record.id,
      version: seed.record.current_version,
      yaml_r2_key: `playbooks/${seed.record.id}/${seed.record.current_version}.yaml`,
      changelog: seed.yaml.versioning.changelog[0]?.changes ?? "Initial",
      published_by: seed.record.author_id,
      published_at: seed.record.created_at,
      yaml: seed.yaml,
    };
    store.set(seed.record.id, {
      record: seed.record,
      versions: new Map([[versionRecord.version, versionRecord]]),
      yaml: seed.yaml,
    });
  }
}

// Auto-seed on module load
seedMockPlaybooks();
