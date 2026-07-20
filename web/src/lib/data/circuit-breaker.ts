/**
 * Circuit Breaker (ADR-0016 — in-memory synchronous state machine + KV store seam).
 *
 * Three-state per-key breaker: CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN.
 *
 * Phase 1 (default): in-memory Map via MemoryCircuitBreakerStore.
 * Phase 2: KV-backed via KVCircuitBreakerStore (Cloudflare Workers KV
 * persistence across isolate restarts).
 *
 * The CircuitBreakerStore abstraction allows the breaker to swap its
 * persistence backend without changing the state-machine logic. The sync
 * public API (isTripped/getState/recordFailure/recordSuccess/reset) is
 * preserved for backward compatibility — the MemoryCircuitBreakerStore
 * resolves synchronously under the hood, and the breaker eagerly hydrates
 * from the store on construction when a store is provided.
 *
 * Default config: threshold=5 consecutive failures → OPEN,
 * cooldownMs=60000 → HALF_OPEN, 1 success in HALF_OPEN → CLOSED.
 *
 * See: docs/architecture/adr-0016-circuit-breaker.md
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Consecutive failures required to trip (default: 5). */
  threshold: number;
  /** Cooldown duration in ms before HALF_OPEN probe (default: 60000). */
  cooldownMs: number;
}

export const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  threshold: 5,
  cooldownMs: 60_000,
};

// ============ Store Abstraction (ADR-0016 Phase 2) ============

/** Store abstraction — allows Mock (Map) or KV (Workers KV) backing. */
export interface CircuitBreakerStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** In-memory Map store (Phase 1 default). */
export class MemoryCircuitBreakerStore implements CircuitBreakerStore {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && Date.now() >= entry.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs ? Date.now() + ttlMs : 0;
    this.data.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

/** Workers KV store (Phase 2). */
export class KVCircuitBreakerStore implements CircuitBreakerStore {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    await this.kv.put(key, value, {
      expirationTtl: ttlMs ? Math.ceil(ttlMs / 1000) : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}

// ============ CircuitEntry (internal) ============

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  trippedAt: number; // Date.now() when OPEN was entered (0 if never tripped)
}

/** Serialize a CircuitEntry to a JSON string for store persistence. */
function serializeEntry(entry: CircuitEntry): string {
  return JSON.stringify(entry);
}

/** Deserialize a CircuitEntry from a store value. Returns CLOSED default on parse failure. */
function deserializeEntry(raw: string | null): CircuitEntry {
  if (!raw) return { state: "CLOSED", failures: 0, trippedAt: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.state === "string" &&
      typeof parsed.failures === "number" &&
      typeof parsed.trippedAt === "number"
    ) {
      return parsed as CircuitEntry;
    }
  } catch {
    // Malformed data — reset to safe default.
  }
  return { state: "CLOSED", failures: 0, trippedAt: 0 };
}

// ============ CircuitBreaker ============

export class CircuitBreaker {
  private readonly entries = new Map<string, CircuitEntry>();
  private readonly config: CircuitBreakerConfig;
  private readonly store: CircuitBreakerStore;

  constructor(config: Partial<CircuitBreakerConfig> = {}, store?: CircuitBreakerStore) {
    this.config = { ...DEFAULT_CB_CONFIG, ...config };
    this.store = store ?? new MemoryCircuitBreakerStore();
  }

  /**
   * Returns the entry for `key`, creating a fresh CLOSED entry if absent.
   * Performs the lazy OPEN → HALF_OPEN transition when cooldown has elapsed.
   */
  private entry(key: string): CircuitEntry {
    let e = this.entries.get(key);
    if (!e) {
      e = { state: "CLOSED", failures: 0, trippedAt: 0 };
      this.entries.set(key, e);
    }
    // Lazy transition: if OPEN and cooldown expired, move to HALF_OPEN.
    if (e.state === "OPEN" && Date.now() >= e.trippedAt + this.config.cooldownMs) {
      e.state = "HALF_OPEN";
    }
    return e;
  }

  /**
   * Persist entry to the store (fire-and-forget for sync API compat).
   * Errors are silently swallowed — the in-memory state is the source of
   * truth for the sync API; store persistence is best-effort.
   */
  private persist(key: string, e: CircuitEntry): void {
    this.store.set(`cb:${key}`, serializeEntry(e), this.config.cooldownMs * 2).catch(() => {});
  }

  /**
   * true iff the key is in OPEN state (should be skipped in fallback chain).
   * HALF_OPEN returns false (probe request allowed).
   */
  isTripped(key: string): boolean {
    return this.entry(key).state === "OPEN";
  }

  /**
   * Current state for `key`. Triggers lazy OPEN → HALF_OPEN transition
   * if cooldown has elapsed at query time.
   */
  getState(key: string): CircuitState {
    return this.entry(key).state;
  }

  /**
   * Record a failure for `key`:
   *   - CLOSED: increment count; if count >= threshold → OPEN (set trippedAt).
   *   - HALF_OPEN: re-trip immediately → OPEN (fresh trippedAt, fresh cooldown).
   *   - OPEN: no-op (already tripped).
   */
  recordFailure(key: string): void {
    const e = this.entry(key);
    if (e.state === "OPEN") return;
    if (e.state === "HALF_OPEN") {
      e.state = "OPEN";
      e.trippedAt = Date.now();
      e.failures += 1;
      this.persist(key, e);
      return;
    }
    // CLOSED
    e.failures += 1;
    if (e.failures >= this.config.threshold) {
      e.state = "OPEN";
      e.trippedAt = Date.now();
    }
    this.persist(key, e);
  }

  /**
   * Record a success for `key`:
   *   - HALF_OPEN: probe succeeded → CLOSED (reset count).
   *   - CLOSED: reset failure count to 0.
   *   - OPEN: should not happen (isTripped would have skipped), but reset anyway.
   */
  recordSuccess(key: string): void {
    const e = this.entry(key);
    e.state = "CLOSED";
    e.failures = 0;
    e.trippedAt = 0;
    this.persist(key, e);
  }

  /**
   * Force-reset `key` to CLOSED (admin/monitoring use). Deletes the entry
   * so the next access creates a fresh CLOSED entry.
   */
  reset(key: string): void {
    this.entries.delete(key);
    this.store.delete(`cb:${key}`).catch(() => {});
  }

  /**
   * Hydrate the in-memory entry for `key` from the store.
   * Useful after isolate restart to restore persisted state.
   * Overwrites any existing in-memory entry for this key.
   */
  async hydrate(key: string): Promise<void> {
    const raw = await this.store.get(`cb:${key}`);
    const entry = deserializeEntry(raw);
    this.entries.set(key, entry);
  }
}
