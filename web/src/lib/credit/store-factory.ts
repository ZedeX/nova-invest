/**
 * Credit Store Factory.
 *
 * Returns a D1CreditStore when a D1Database binding is available,
 * otherwise falls back to the in-memory store for local dev.
 *
 * Usage:
 *   // In Cloudflare Worker (env.DB available):
 *   const store = getCreditStore(env.DB);
 *
 *   // In local dev (no D1):
 *   const store = getCreditStore();
 */

import { D1CreditStore } from "./d1-store";
import type { D1Database } from "./d1-store";
import * as InMemoryStore from "./store";

export type CreditStoreBackend = D1CreditStore | typeof InMemoryStore;

export function getCreditStore(db?: D1Database): CreditStoreBackend {
  if (db) {
    return new D1CreditStore(db);
  }
  // Fall back to in-memory module for local dev without D1
  return InMemoryStore;
}
