/**
 * Community UGC types — ADR-0012.
 *
 * Phase 1 scope: SharePackage has NO `signature` and NO `license` field.
 * Author signing and CC-BY-NC licensing are explicitly Phase 2 per
 * ADR-0012 §"Critical Implementation Rules".
 *
 * NOTE: This is the simplified Phase 1 SharePackage shape used by the
 * ModerationQueue anti-abuse pipeline. The full SharePackage (with
 * performance_json, yaml_r2_key, etc.) lives in `web/src/lib/types.ts`
 * as `CommunityPlaybook` for feed display.
 */

/**
 * SharePackage submitted by a user for community publication.
 * Per ADR-0012 Phase 1: NO signature, NO license field.
 */
export interface SharePackage {
  /** Unique package identifier. */
  id: string;
  /** Author user id (references users.id). */
  author_id: string;
  /** Underlying playbook id (references playbooks.id per ADR-0011). */
  playbook_id: string;
  /** Display title (1–100 chars per anti-abuse check). */
  title: string;
  /** Short description (0–500 chars per anti-abuse check). */
  description: string;
  /** Searchable tags (0–5 per anti-abuse check). */
  tags: string[];
  /** ISO timestamp of submission. */
  created_at: string;
}

/**
 * Community playbook aggregate — tracks fork count and rating aggregates.
 * Used by computeTrendingScore.
 */
export interface CommunityPlaybook {
  /** Unique playbook identifier. */
  id: string;
  /** References SharePackage.id. */
  share_package_id: string;
  /** Number of times this playbook has been forked. */
  fork_count: number;
  /** Sum of all ratings (1–5 stars each). */
  rating_sum: number;
  /** Total number of ratings. */
  rating_count: number;
  /** ISO timestamp of creation. */
  created_at: string;
}

/**
 * Result of a moderation action on a submitted package.
 * - approve: package passes all anti-abuse checks
 * - reject: package fails a hard check (length, tag count)
 * - flag: package triggers soft check (banned words) — needs human review
 */
export interface ModerationResult {
  /** Package id this result applies to. */
  id: string;
  /** Moderation action taken. */
  action: "approve" | "reject" | "flag";
  /** Optional human-readable reason for reject/flag. */
  reason?: string;
  /** Optional severity for flagged packages. */
  severity?: "low" | "med" | "high";
}
