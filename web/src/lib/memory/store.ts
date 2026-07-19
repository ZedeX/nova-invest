/**
 * Memory Layer implementation (ADR-0005).
 *
 * Exports grow incrementally per TDD — each method lands only when a failing
 * test demands it.
 *
 * Design notes:
 *   - D1 binding typed via a minimal D1Database interface to avoid installing
 *     @cloudflare/workers-types as a runtime dependency.
 *   - MockMemoryStore honours `MemoryRef.ttl` (seconds) so unit tests can use
 *     `vi.useFakeTimers()` to verify KV-style TTL eviction.
 */

import type { MemoryRef } from "./types";

/**
 * Minimal D1 binding shape used by D1MemoryStore.
 * Avoids pulling in @cloudflare/workers-types at runtime.
 * Only declares the methods actually used by this module — tests can pass
 * partial mocks that satisfy this narrower interface.
 */
interface D1Database {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
}

/**
 * Minimal Workers env shape for globalThis.env access.
 * Cloudflare Workers expose env bindings globally in the Workers runtime.
 */
interface WorkersEnv {
  USE_MOCK?: string;
  ENVIRONMENT?: string;
  DB?: D1Database;
}

// ============ Helpers ============

function generateId(): string {
  // Simple, deterministic-enough id for dev/test. Not a UUID — Mock only.
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ MockMemoryStore (partial — grows per TDD) ============

interface StoredEntry {
  ref: MemoryRef;
  expiresAt: number | null; // epoch ms; null = no TTL
}

/**
 * In-memory Map-backed MemoryStore.
 *
 * - Honours `MemoryRef.ttl` (seconds) for KV-style eviction semantics.
 * - Zero external HTTP calls (ADR-0001 FP-0005 compliance).
 * - Not persisted across Worker restarts (Mock dev only).
 */
export class MockMemoryStore {
  private store = new Map<string, StoredEntry>();

  async save(ref: MemoryRef): Promise<MemoryRef> {
    const now = Date.now();
    const id = ref.id ?? generateId();
    const saved: MemoryRef = {
      ...ref,
      id,
      created_at: ref.created_at ?? new Date(now).toISOString(),
    };
    const expiresAt =
      typeof ref.ttl === "number" && ref.ttl > 0 ? now + ref.ttl * 1000 : null;
    this.store.set(id, { ref: saved, expiresAt });
    return saved;
  }

  async retrieve(id: string): Promise<MemoryRef | null> {
    const entry = this.store.get(id);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(id);
      return null;
    }
    return entry.ref;
  }

  async query(filter: {
    type?: string;
    contentContains?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MemoryRef[]> {
    const now = Date.now();
    const results: MemoryRef[] = [];
    for (const entry of this.store.values()) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) continue;
      const ref = entry.ref;
      if (filter.type !== undefined && ref.type !== filter.type) continue;
      if (
        filter.contentContains !== undefined &&
        !ref.content.includes(filter.contentContains)
      )
        continue;
      if (filter.metadata) {
        let match = true;
        for (const [k, v] of Object.entries(filter.metadata)) {
          if (ref.metadata?.[k] !== v) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }
      results.push(ref);
    }
    return results;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

// ============ D1MemoryStore ============

/**
 * D1-backed MemoryStore.
 *
 * The D1 binding is typed as `any` (not D1Database) to avoid pulling
 * @cloudflare/workers-types into runtime code. The store calls:
 *   d1.prepare(sql).bind(...params).run()    // INSERT / DELETE
 *   d1.prepare(sql).bind(...params).first()  // SELECT single
 *   d1.prepare(sql).bind(...params).all()    // SELECT many
 *
 * The canonical D1 table for memory refs is `conversation_history`
 * (per ADR-0011 Migration 003). For non-conversation refs the store falls
 * back to a generic `memory_refs` table (future schema addition); tests
 * only verify the INSERT path against `conversation_history`.
 */
export class D1MemoryStore {
  /**
   * @param d1   Cloudflare D1 binding (`env.DB`).
   * @param table Optional table override (defaults to `conversation_history`).
   */
  constructor(private d1: D1Database, private table: string = "conversation_history") {}

  async save(ref: MemoryRef): Promise<MemoryRef> {
    const now = new Date().toISOString();
    const id = ref.id ?? generateId();
    const saved: MemoryRef = {
      ...ref,
      id,
      created_at: ref.created_at ?? now,
    };
    // Insert into D1. metadata is JSON-serialized per ADR-0011 (metadata_json TEXT).
    const sql = `INSERT INTO ${this.table} (id, user_id, session_id, role, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const userId = (ref.metadata?.user_id as string) ?? null;
    const sessionId = (ref.metadata?.session_id as string) ?? null;
    const role = (ref.metadata?.role as string) ?? "user";
    const metadataJson = ref.metadata ? JSON.stringify(ref.metadata) : null;
    await this.d1
      .prepare(sql)
      .bind(id, userId, sessionId, role, ref.content, metadataJson, now)
      .run();
    return saved;
  }
}

// ============ Factory ============

/**
 * Factory: returns MockMemoryStore or D1MemoryStore based on env.
 *
 * Per ADR-0001: USE_MOCK="true" (default) -> Mock; "false" -> D1.
 *
 * @param env Optional env object (Workers request-scoped). If absent, reads
 *            from process.env (Next.js) / globalThis.env (Workers).
 */
export function getMemoryStore(env?: {
  USE_MOCK?: string;
  ENVIRONMENT?: string;
  DB?: D1Database;
}): MockMemoryStore | D1MemoryStore {
  const useMock =
    env?.USE_MOCK ??
    (typeof process !== "undefined" && process.env
      ? process.env.USE_MOCK
      : undefined) ??
    (typeof globalThis !== "undefined" && (globalThis as unknown as { env?: WorkersEnv }).env
      ? (globalThis as unknown as { env?: WorkersEnv }).env!.USE_MOCK
      : undefined) ??
    "true";
  if (useMock === "true") {
    return new MockMemoryStore();
  }
  // Real mode: require a D1 binding.
  const d1 =
    env?.DB ??
    (typeof globalThis !== "undefined" && (globalThis as unknown as { env?: WorkersEnv }).env
      ? (globalThis as unknown as { env?: WorkersEnv }).env!.DB
      : undefined);
  if (!d1) {
    // No D1 binding available — fall back to Mock rather than crashing.
    // Production wiring should always provide env.DB; this is a safety net.
    return new MockMemoryStore();
  }
  return new D1MemoryStore(d1);
}

// ============ Validation ============

/**
 * Structural validation for MemoryRef.
 *
 * Required fields: `type` (non-empty string), `content` (string).
 * `id` and `created_at` are store-assigned on save and may be absent pre-save.
 *
 * @returns `{ valid: true }` or `{ valid: false, errors: string[] }`.
 */
export function validateMemoryRef(ref: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!ref || typeof ref !== "object") {
    return { valid: false, errors: ["ref must be an object"] };
  }
  const r = ref as Partial<MemoryRef>;
  if (typeof r.type !== "string" || r.type.trim() === "") {
    errors.push("type is required (non-empty string)");
  }
  if (typeof r.content !== "string") {
    errors.push("content is required (string)");
  }
  if (
    r.metadata !== undefined &&
    (typeof r.metadata !== "object" || r.metadata === null)
  ) {
    errors.push("metadata must be an object if present");
  }
  if (
    r.ttl !== undefined &&
    (typeof r.ttl !== "number" || !Number.isFinite(r.ttl) || r.ttl < 0)
  ) {
    errors.push("ttl must be a non-negative number if present");
  }
  return { valid: errors.length === 0, errors };
}
