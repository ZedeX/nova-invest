/**
 * Community UGC types - ADR-0012 + Epic 07 Sprint 8.
 *
 * Phase 1 scope: SharePackage has NO `signature` and NO `license` field.
 * Author signing and CC-BY-NC licensing are explicitly Phase 2 per
 * ADR-0012 §"Critical Implementation Rules".
 *
 * Sprint 8 additions: Rating, Comment (nested 2 levels), Report (severity),
 * Install (reference, no copy), SearchQuery, FeedSortType.
 */

// ============ Phase 1 shapes (preserved for ugc.ts) ============

export interface SharePackage {
  id: string;
  author_id: string;
  playbook_id: string;
  title: string;
  description: string;
  tags: string[];
  created_at: string;
}

export interface CommunityPlaybook {
  id: string;
  share_package_id: string;
  fork_count: number;
  rating_sum: number;
  rating_count: number;
  created_at: string;
}

export interface ModerationResult {
  id: string;
  action: "approve" | "reject" | "flag";
  reason?: string;
  severity?: "low" | "med" | "high";
}

// ============ Sprint 8: Full Community UGC types ============

export type ModerationStatus = "pending" | "approved" | "rejected" | "flagged";

export type FeedSortType = "recent" | "rating" | "installed" | "trending";

/** Published community package (extends SharePackage with moderation + metrics). */
export interface CommunityPackage {
  package_id: string;
  playbook_id: string;
  author_id: string;
  author_name: string;
  title: string;
  description: string;
  tags: string[];
  version: string;
  moderation_status: ModerationStatus;
  installed_count: number;
  rating_sum: number;
  rating_count: number;
  rating_avg: number;
  fork_count: number;
  created_at: string;
  updated_at: string;
}

/** User install record (reference, not copy). */
export interface InstallRecord {
  user_id: string;
  package_id: string;
  playbook_id: string;
  installed_version: string;
  installed_at: string;
}

/** User rating (1-5 stars, one per user per package). */
export interface RatingRecord {
  id: string;
  package_id: string;
  user_id: string;
  rating: number; // 1-5
  created_at: string;
  updated_at: string;
}

/** Comment (supports nested 2 levels via parent_id). */
export interface CommentRecord {
  id: string;
  package_id: string;
  user_id: string;
  user_name: string;
  parent_id: string | null; // null = top-level; id = reply (max depth 2)
  content: string;
  created_at: string;
  updated_at: string;
}

export type ReportSeverity = "low" | "med" | "high";
export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

/** User report (severity-graded). */
export interface ReportRecord {
  id: string;
  package_id: string;
  reporter_id: string;
  reason: string;
  severity: ReportSeverity;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
}

// ============ API request/response types ============

export interface SearchQuery {
  q?: string; // search in title + description
  tags?: string[]; // filter by tags
  author?: string; // filter by author_id or name
  sort?: FeedSortType;
  limit?: number;
  offset?: number;
}

export interface PublishPackageRequest {
  playbook_id: string;
  title: string;
  description: string;
  tags?: string[];
  version: string;
}

export interface RateRequest {
  rating: number; // 1-5
}

export interface CommentRequest {
  content: string;
  parent_id?: string | null;
}

export interface ReportRequest {
  reason: string;
  severity: ReportSeverity;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}
