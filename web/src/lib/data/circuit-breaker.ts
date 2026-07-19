/**
 * Circuit Breaker (ADR-0016 — in-memory synchronous state machine).
 *
 * Three-state per-key breaker: CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN.
 *
 * Note: This is the in-memory synchronous variant per the task spec.
 * The ADR-0016 canonical design is KV-backed + async (Cloudflare Workers
 * stateless). The in-memory version is the PRD stub that ADR-0016
 * §Alternative 1 explicitly rejects for production — but it correctly
 * implements the state-machine logic and is unit-testable with fake timers.
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

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  trippedAt: number; // Date.now() when OPEN was entered (0 if never tripped)
}

export class CircuitBreaker {
  private readonly entries = new Map<string, CircuitEntry>();
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CB_CONFIG, ...config };
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
      return;
    }
    // CLOSED
    e.failures += 1;
    if (e.failures >= this.config.threshold) {
      e.state = "OPEN";
      e.trippedAt = Date.now();
    }
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
  }

  /**
   * Force-reset `key` to CLOSED (admin/monitoring use). Deletes the entry
   * so the next access creates a fresh CLOSED entry.
   */
  reset(key: string): void {
    this.entries.delete(key);
  }
}
