/**
 * Community UGC moderation + scoring — ADR-0012.
 *
 * Implements:
 *   - ModerationQueue: anti-abuse pipeline (4 checks per package)
 *   - computeRating: rating_avg from sum + count (returns 0 when count=0)
 *   - computeTrendingScore: time-decayed popularity score
 *   - computeContentHash: deterministic content hash for deduplication
 *
 * Anti-abuse checks (per ADR-0012 §"Anti-Abuse Pipeline" Phase 1):
 *   1. Title length 1–100 chars
 *   2. Description length 0–500 chars
 *   3. Tag count 0–5
 *   4. Banned words filter (in title or description)
 *
 * NOTE: Rate limit, duplicate hash, rating fraud, comment depth, and report
 * severity triage are server-side (Workers + D1) — out of scope for this
 * client-side module.
 */

import type {
  CommunityPlaybook,
  ModerationResult,
  SharePackage,
} from "./types";

/** Maximum title length in characters. */
const MAX_TITLE_LENGTH = 100;
/** Maximum description length in characters. */
const MAX_DESCRIPTION_LENGTH = 500;
/** Maximum number of tags per package. */
const MAX_TAGS = 5;

/**
 * Banned words list per ADR-0012 §"Anti-Abuse Pipeline" Step 3.
 * Matched case-insensitively as substrings.
 */
const BANNED_WORDS: readonly string[] = [
  "pump and dump",
  "scam",
  "fraud",
  "ponzi",
  "pyramid scheme",
  "spam",
  "get rich quick",
];

/** Half-life for trending score decay (7 days in milliseconds). */
const TRENDING_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute the average rating from sum and count.
 * Returns 0 when rating_count is 0 (avoids divide-by-zero).
 */
export function computeRating(
  rating_sum: number,
  rating_count: number,
): number {
  if (rating_count === 0) return 0;
  return rating_sum / rating_count;
}

/**
 * Compute a trending score for a community playbook.
 *
 * Score = (avg_rating × 10 + fork_count) × recency_decay
 *
 * recency_decay uses a 7-day half-life: a playbook created 7 days ago has
 * a decay of 0.5, 14 days ago has 0.25, etc. This ensures recently created
 * packages trend higher than older packages with identical ratings/forks.
 */
export function computeTrendingScore(
  playbook: CommunityPlaybook,
  now: Date,
): number {
  const createdMs = new Date(playbook.created_at).getTime();
  const nowMs = now.getTime();
  const ageMs = Math.max(0, nowMs - createdMs);
  const recencyDecay = Math.pow(0.5, ageMs / TRENDING_HALF_LIFE_MS);
  const avgRating = computeRating(playbook.rating_sum, playbook.rating_count);
  return (avgRating * 10 + playbook.fork_count) * recencyDecay;
}

/**
 * Compute a deterministic content hash for a SharePackage.
 *
 * Used for duplicate detection (ADR-0012 §"Anti-Abuse Pipeline" Step 4).
 * Uses the cyrb53 hash (synchronous, deterministic, 53-bit) over the
 * JSON-serialised content fields. SHA-256 is async (Web Crypto) and
 * unsuitable for a synchronous API.
 *
 * NOTE: Only content-bearing fields are hashed — `id` and `created_at` are
 * excluded so that two packages with identical content but different ids
 * produce the same hash (true duplicate detection).
 */
export function computeContentHash(pkg: SharePackage): string {
  const content = JSON.stringify({
    author_id: pkg.author_id,
    playbook_id: pkg.playbook_id,
    title: pkg.title,
    description: pkg.description,
    tags: pkg.tags,
  });
  return cyrb53Hex(content);
}

/**
 * cyrb53 — a simple, fast, deterministic 53-bit string hash.
 * Returns a hex string (deterministic across runs and Node versions).
 * Source: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#cyrb53
 */
function cyrb53Hex(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // 53-bit result → 14 hex chars
  return (
    (4294967296 * (2097151 & h2) + (h1 >>> 0))
  ).toString(16).padStart(14, "0");
}

/**
 * Moderation queue — runs anti-abuse checks on submitted packages.
 *
 * Usage:
 *   const queue = new ModerationQueue();
 *   const result = await queue.submit(pkg);       // immediate single check
 *   // OR
 *   queue.enqueue(pkg1); queue.enqueue(pkg2);
 *   const results = await queue.processQueue();   // batch check
 */
export class ModerationQueue {
  /** Pending packages awaiting batch processing. */
  private readonly pending: SharePackage[] = [];

  /**
   * Add a package to the pending queue for later batch processing.
   * Does NOT run any checks — call processQueue() to drain.
   */
  enqueue(pkg: SharePackage): void {
    this.pending.push(pkg);
  }

  /**
   * Run all 4 anti-abuse checks on a single package and return the result.
   * Does NOT add to the pending queue.
   */
  async submit(pkg: SharePackage): Promise<ModerationResult> {
    // Check 1: title length (1–100 chars)
    if (pkg.title.length < 1 || pkg.title.length > MAX_TITLE_LENGTH) {
      return {
        id: pkg.id,
        action: "reject",
        reason: `Title length must be 1–${MAX_TITLE_LENGTH} chars (got ${pkg.title.length})`,
        severity: "med",
      };
    }

    // Check 2: description length (0–500 chars)
    if (pkg.description.length > MAX_DESCRIPTION_LENGTH) {
      return {
        id: pkg.id,
        action: "reject",
        reason: `Description length must be 0–${MAX_DESCRIPTION_LENGTH} chars (got ${pkg.description.length})`,
        severity: "med",
      };
    }

    // Check 3: tag count (0–5)
    if (pkg.tags.length > MAX_TAGS) {
      return {
        id: pkg.id,
        action: "reject",
        reason: `Tag count must be 0–${MAX_TAGS} (got ${pkg.tags.length})`,
        severity: "med",
      };
    }

    // Check 4: banned words (case-insensitive substring match in title or description)
    const lowerTitle = pkg.title.toLowerCase();
    const lowerDesc = pkg.description.toLowerCase();
    for (const word of BANNED_WORDS) {
      if (lowerTitle.includes(word) || lowerDesc.includes(word)) {
        return {
          id: pkg.id,
          action: "flag",
          reason: `Banned word detected: "${word}"`,
          severity: "high",
        };
      }
    }

    // All checks passed
    return { id: pkg.id, action: "approve" };
  }

  /**
   * Drain the pending queue: run submit() on every enqueued package and
   * return all results in submission order. The pending queue is empty
   * after this call.
   */
  async processQueue(): Promise<ModerationResult[]> {
    const batch = this.pending.splice(0);
    const results: ModerationResult[] = [];
    for (const pkg of batch) {
      const result = await this.submit(pkg);
      results.push(result);
    }
    return results;
  }
}
