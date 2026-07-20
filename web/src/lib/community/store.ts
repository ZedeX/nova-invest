/**
 * Community Store (Epic 07, ADR-0012).
 *
 * Phase 1: in-memory store with 10 pre-seeded mock community packages.
 * Phase 2: D1 persistence (community_playbooks + ratings + comments + reports).
 *
 * Anti-abuse: rate limit (5 publishes/hour/user), duplicate content hash check,
 * rating dedup (1 per user), comment depth limit (2 levels), report severity triage.
 *
 * See: docs/prd/epic/07_Community_UGC.md
 */

import type {
  CommentRecord,
  CommunityPackage,
  FeedSortType,
  InstallRecord,
  ModerationStatus,
  PublishPackageRequest,
  RatingRecord,
  ReportRecord,
  ReportSeverity,
  ReportStatus,
  SearchQuery,
  ValidationResult,
} from "./types";
import { computeContentHash } from "./ugc";

// ============ In-memory store ============

interface Store {
  packages: Map<string, CommunityPackage>;
  installs: InstallRecord[];
  ratings: Map<string, RatingRecord>; // key: `${package_id}:${user_id}`
  comments: CommentRecord[];
  reports: ReportRecord[];
  publishTimestamps: Map<string, number[]>; // user_id -> [timestamps]
  contentHashes: Set<string>;
}

const store: Store = {
  packages: new Map(),
  installs: [],
  ratings: new Map(),
  comments: [],
  reports: [],
  publishTimestamps: new Map(),
  contentHashes: new Set(),
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;
const MAX_COMMENT_DEPTH = 2;
const MAX_TAGS = 5;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

// ============ ID generators ============

function genPackageId(): string {
  return `pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
function genRatingId(): string {
  return `rtg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
function genCommentId(): string {
  return `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
function genReportId(): string {
  return `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ============ Anti-abuse checks ============

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = store.publishTimestamps.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  store.publishTimestamps.set(userId, recent);
  return recent.length < RATE_LIMIT_MAX;
}

function checkDuplicateContent(title: string, description: string): boolean {
  const hash = computeContentHash({ title, description } as never);
  return !store.contentHashes.has(hash);
}

function validatePackage(req: PublishPackageRequest): ValidationResult {
  if (!req.title || req.title.length === 0 || req.title.length > MAX_TITLE_LENGTH) {
    return { ok: false, reason: `Title must be 1-${MAX_TITLE_LENGTH} chars` };
  }
  if (req.description && req.description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, reason: `Description must be <= ${MAX_DESCRIPTION_LENGTH} chars` };
  }
  if (req.tags && req.tags.length > MAX_TAGS) {
    return { ok: false, reason: `Max ${MAX_TAGS} tags allowed` };
  }
  if (!req.playbook_id || !req.version) {
    return { ok: false, reason: "playbook_id and version are required" };
  }
  return { ok: true };
}

// ============ Package CRUD ============

export function listPackages(query: SearchQuery = {}): { packages: CommunityPackage[]; total: number } {
  let pkgs = Array.from(store.packages.values());

  // Only show approved packages in public feed
  pkgs = pkgs.filter((p) => p.moderation_status === "approved");

  // Search
  if (query.q) {
    const q = query.q.toLowerCase();
    pkgs = pkgs.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }

  // Tag filter
  if (query.tags && query.tags.length > 0) {
    pkgs = pkgs.filter((p) => query.tags!.every((t) => p.tags.includes(t)));
  }

  // Author filter
  if (query.author) {
    const a = query.author.toLowerCase();
    pkgs = pkgs.filter(
      (p) =>
        p.author_id.toLowerCase().includes(a) ||
        p.author_name.toLowerCase().includes(a),
    );
  }

  // Sort
  const sort: FeedSortType = query.sort ?? "recent";
  switch (sort) {
    case "rating":
      pkgs.sort((a, b) => b.rating_avg - a.rating_avg);
      break;
    case "installed":
      pkgs.sort((a, b) => b.installed_count - a.installed_count);
      break;
    case "trending":
      // Trending = rating_avg * 0.4 + installed_count * 0.3 + recency * 0.3
      pkgs.sort((a, b) => computeTrending(b) - computeTrending(a));
      break;
    case "recent":
    default:
      pkgs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const total = pkgs.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;
  return { packages: pkgs.slice(offset, offset + limit), total };
}

function computeTrending(p: CommunityPackage): number {
  const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - ageDays / 30); // decay over 30 days
  return p.rating_avg * 0.4 + Math.log10(p.installed_count + 1) * 0.3 + recency * 0.3;
}

export function getPackage(packageId: string): CommunityPackage | null {
  return store.packages.get(packageId) ?? null;
}

export function publishPackage(
  req: PublishPackageRequest,
  authorId: string,
  authorName: string,
): { package: CommunityPackage } | { error: string } {
  // Validate
  const validation = validatePackage(req);
  if (!validation.ok) return { error: validation.reason ?? "Validation failed" };

  // Rate limit
  if (!checkRateLimit(authorId)) {
    return { error: `Rate limit: max ${RATE_LIMIT_MAX} publishes per hour` };
  }

  // Duplicate check
  if (!checkDuplicateContent(req.title, req.description)) {
    return { error: "Duplicate content detected" };
  }

  const now = new Date().toISOString();
  const pkg: CommunityPackage = {
    package_id: genPackageId(),
    playbook_id: req.playbook_id,
    author_id: authorId,
    author_name: authorName,
    title: req.title,
    description: req.description,
    tags: req.tags ?? [],
    version: req.version,
    moderation_status: "approved", // Phase 1: auto-approve (moderation pipeline in ugc.ts)
    installed_count: 0,
    rating_sum: 0,
    rating_count: 0,
    rating_avg: 0,
    fork_count: 0,
    created_at: now,
    updated_at: now,
  };

  store.packages.set(pkg.package_id, pkg);

  // Record content hash + timestamp
  store.contentHashes.add(computeContentHash({ title: req.title, description: req.description } as never));
  const timestamps = store.publishTimestamps.get(authorId) ?? [];
  timestamps.push(Date.now());
  store.publishTimestamps.set(authorId, timestamps);

  return { package: pkg };
}

export function updateModerationStatus(
  packageId: string,
  status: ModerationStatus,
): { ok: boolean; error?: string } {
  const pkg = store.packages.get(packageId);
  if (!pkg) return { ok: false, error: "Package not found" };
  pkg.moderation_status = status;
  pkg.updated_at = new Date().toISOString();
  return { ok: true };
}

export function deletePackage(packageId: string): boolean {
  return store.packages.delete(packageId);
}

// ============ Install (reference, not copy) ============

export function installPackage(
  packageId: string,
  userId: string,
): { install: InstallRecord } | { error: string } {
  const pkg = store.packages.get(packageId);
  if (!pkg) return { error: "Package not found" };
  if (pkg.moderation_status !== "approved") {
    return { error: "Package not approved for install" };
  }

  // Check if already installed (idempotent)
  const existing = store.installs.find(
    (i) => i.package_id === packageId && i.user_id === userId,
  );
  if (existing) return { install: existing };

  const install: InstallRecord = {
    user_id: userId,
    package_id: packageId,
    playbook_id: pkg.playbook_id,
    installed_version: pkg.version,
    installed_at: new Date().toISOString(),
  };
  store.installs.push(install);
  pkg.installed_count++;
  pkg.updated_at = new Date().toISOString();
  return { install };
}

export function listInstalls(userId: string): InstallRecord[] {
  return store.installs.filter((i) => i.user_id === userId);
}

// ============ Rating (1-5 stars, dedup per user) ============

export function ratePackage(
  packageId: string,
  userId: string,
  rating: number,
): { rating: RatingRecord } | { error: string } {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { error: "Rating must be an integer 1-5" };
  }

  const pkg = store.packages.get(packageId);
  if (!pkg) return { error: "Package not found" };

  const key = `${packageId}:${userId}`;
  const now = new Date().toISOString();
  const existing = store.ratings.get(key);

  if (existing) {
    // Update existing rating (dedup = 1 per user)
    const oldRating = existing.rating;
    existing.rating = rating;
    existing.updated_at = now;
    // Adjust sum
    pkg.rating_sum = pkg.rating_sum - oldRating + rating;
  } else {
    // New rating
    const record: RatingRecord = {
      id: genRatingId(),
      package_id: packageId,
      user_id: userId,
      rating,
      created_at: now,
      updated_at: now,
    };
    store.ratings.set(key, record);
    pkg.rating_sum += rating;
    pkg.rating_count++;
  }

  pkg.rating_avg = pkg.rating_count > 0 ? pkg.rating_sum / pkg.rating_count : 0;
  pkg.updated_at = now;
  return { rating: store.ratings.get(key)! };
}

export function getRating(packageId: string, userId: string): RatingRecord | null {
  return store.ratings.get(`${packageId}:${userId}`) ?? null;
}

// ============ Comments (nested 2 levels) ============

export function addComment(
  packageId: string,
  userId: string,
  userName: string,
  content: string,
  parentId: string | null = null,
): { comment: CommentRecord } | { error: string } {
  const pkg = store.packages.get(packageId);
  if (!pkg) return { error: "Package not found" };
  if (!content || content.trim().length === 0) {
    return { error: "Comment content cannot be empty" };
  }
  if (content.length > 1000) {
    return { error: "Comment must be <= 1000 chars" };
  }

  // Depth check: max 2 levels (top-level + 1 reply)
  if (parentId) {
    const parent = store.comments.find((c) => c.id === parentId && c.package_id === packageId);
    if (!parent) return { error: "Parent comment not found" };
    if (parent.parent_id !== null) {
      return { error: `Max comment depth is ${MAX_COMMENT_DEPTH} levels` };
    }
  }

  const now = new Date().toISOString();
  const comment: CommentRecord = {
    id: genCommentId(),
    package_id: packageId,
    user_id: userId,
    user_name: userName,
    parent_id: parentId,
    content: content.trim(),
    created_at: now,
    updated_at: now,
  };
  store.comments.push(comment);
  return { comment };
}

export function listComments(packageId: string): CommentRecord[] {
  return store.comments
    .filter((c) => c.package_id === packageId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function deleteComment(commentId: string, userId: string): boolean {
  const idx = store.comments.findIndex((c) => c.id === commentId && c.user_id === userId);
  if (idx === -1) return false;
  store.comments.splice(idx, 1);
  // Also delete child replies
  const childIds = store.comments.filter((c) => c.parent_id === commentId).map((c) => c.id);
  for (const cid of childIds) {
    const cidx = store.comments.findIndex((c) => c.id === cid);
    if (cidx !== -1) store.comments.splice(cidx, 1);
  }
  return true;
}

// ============ Reports (severity-graded) ============

export function reportPackage(
  packageId: string,
  reporterId: string,
  reason: string,
  severity: ReportSeverity,
): { report: ReportRecord } | { error: string } {
  const pkg = store.packages.get(packageId);
  if (!pkg) return { error: "Package not found" };
  if (!reason || reason.trim().length === 0) {
    return { error: "Report reason is required" };
  }

  // Check if user already reported this package
  const existing = store.reports.find(
    (r) => r.package_id === packageId && r.reporter_id === reporterId,
  );
  if (existing) {
    return { error: "You have already reported this package" };
  }

  const report: ReportRecord = {
    id: genReportId(),
    package_id: packageId,
    reporter_id: reporterId,
    reason: reason.trim(),
    severity,
    status: "pending",
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  store.reports.push(report);

  // Auto-flag package if high severity or multiple reports
  const reportCount = store.reports.filter((r) => r.package_id === packageId).length;
  if (severity === "high" || reportCount >= 3) {
    pkg.moderation_status = "flagged";
    pkg.updated_at = new Date().toISOString();
  }

  return { report };
}

export function listReports(filter?: {
  packageId?: string;
  status?: ReportStatus;
  severity?: ReportSeverity;
}): ReportRecord[] {
  let reports = Array.from(store.reports);
  if (filter?.packageId) reports = reports.filter((r) => r.package_id === filter.packageId);
  if (filter?.status) reports = reports.filter((r) => r.status === filter.status);
  if (filter?.severity) reports = reports.filter((r) => r.severity === filter.severity);
  return reports.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function resolveReport(
  reportId: string,
  status: ReportStatus,
): { ok: boolean; error?: string } {
  const report = store.reports.find((r) => r.id === reportId);
  if (!report) return { ok: false, error: "Report not found" };
  report.status = status;
  report.resolved_at = new Date().toISOString();
  return { ok: true };
}

// ============ Test helper ============

export function _resetStoreForTest(): void {
  store.packages.clear();
  store.installs.length = 0;
  store.ratings.clear();
  store.comments.length = 0;
  store.reports.length = 0;
  store.publishTimestamps.clear();
  store.contentHashes.clear();
  seedMockPackages();
}

// ============ Mock seed data (10 packages) ============

export function seedMockPackages(): void {
  if (store.packages.size > 0) return;

  const authors = [
    { id: "brenda@example.com", name: "Brenda Liu" },
    { id: "alice@example.com", name: "Alice Chen" },
    { id: "bob@example.com", name: "Bob Wang" },
    { id: "carol@example.com", name: "Carol Zhang" },
  ];

  const seeds: Array<Omit<CommunityPackage, "package_id" | "created_at" | "updated_at" | "rating_avg">> = [
    { playbook_id: "pb_nvda_macross", author_id: authors[0].id, author_name: authors[0].name, title: "NVDA 双均线金叉策略", description: "50/200 SMA crossover for NVDA, paper-tested 6 months", tags: ["momentum", "nvda", "sma"], version: "1.2.0", moderation_status: "approved", installed_count: 42, rating_sum: 180, rating_count: 38, fork_count: 5 },
    { playbook_id: "pb_aapl_rsi", author_id: authors[0].id, author_name: authors[0].name, title: "AAPL RSI Oversold Bounce", description: "Buy AAPL when RSI(14) < 30, sell when RSI > 70", tags: ["mean-reversion", "aapl", "rsi"], version: "1.0.0", moderation_status: "approved", installed_count: 28, rating_sum: 120, rating_count: 25, fork_count: 2 },
    { playbook_id: "pb_momentum_combo", author_id: authors[0].id, author_name: authors[0].name, title: "Momentum Combo (50/30/20)", description: "Parallel: 50% MA Cross + 30% RSI + 20% Bollinger", tags: ["composite", "momentum", "diversified"], version: "1.0.0", moderation_status: "approved", installed_count: 67, rating_sum: 290, rating_count: 58, fork_count: 12 },
    { playbook_id: "pb_tsla_bollinger", author_id: authors[1].id, author_name: authors[1].name, title: "TSLA Bollinger Breakout", description: "Buy TSLA on upper Bollinger Band breakout (2.5 sigma)", tags: ["breakout", "tsla", "bollinger"], version: "1.1.0", moderation_status: "approved", installed_count: 35, rating_sum: 140, rating_count: 30, fork_count: 3 },
    { playbook_id: "pb_nvda_thesis", author_id: authors[0].id, author_name: authors[0].name, title: "NVDA Investment Thesis 2026", description: "Long-term thesis: AI infra monopoly + data center growth", tags: ["thesis", "nvda", "long-term"], version: "1.0.0", moderation_status: "approved", installed_count: 89, rating_sum: 384, rating_count: 80, fork_count: 8 },
    { playbook_id: "pb_msft_dca", author_id: authors[2].id, author_name: authors[2].name, title: "MSFT Weekly DCA Strategy", description: "Dollar-cost average into MSFT every Monday", tags: ["dca", "msft", "passive"], version: "1.0.0", moderation_status: "approved", installed_count: 15, rating_sum: 65, rating_count: 13, fork_count: 1 },
    { playbook_id: "pb_spy_hold", author_id: authors[3].id, author_name: authors[3].name, title: "SPY Buy and Hold with Drawdown Protection", description: "Hold SPY, trim when drawdown > 15%", tags: ["etf", "spy", "risk-management"], version: "1.0.0", moderation_status: "approved", installed_count: 52, rating_sum: 220, rating_count: 45, fork_count: 4 },
    { playbook_id: "pb_qqq_momentum", author_id: authors[1].id, author_name: authors[1].name, title: "QQQ Momentum Rotator", description: "Rotate between QQQ top 10 by momentum score", tags: ["rotation", "qqq", "momentum"], version: "1.0.0", moderation_status: "approved", installed_count: 23, rating_sum: 95, rating_count: 20, fork_count: 2 },
    { playbook_id: "pb_bond_ladder", author_id: authors[3].id, author_name: authors[3].name, title: "Treasury Bond Ladder", description: "Build 5-year Treasury ladder, rebalance annually", tags: ["bonds", "passive", "income"], version: "1.0.0", moderation_status: "approved", installed_count: 18, rating_sum: 72, rating_count: 15, fork_count: 0 },
    { playbook_id: "pb_crypto_dca", author_id: authors[2].id, author_name: authors[2].name, title: "BTC+ETH Daily DCA", description: "Daily DCA into BTC (60%) + ETH (40%)", tags: ["crypto", "dca", "btc"], version: "1.0.0", moderation_status: "approved", installed_count: 41, rating_sum: 175, rating_count: 35, fork_count: 6 },
  ];

  const now = "2025-12-15T10:00:00Z";
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const pkg: CommunityPackage = {
      ...seed,
      package_id: `pkg_seed_${String(i + 1).padStart(2, "0")}`,
      rating_avg: seed.rating_count > 0 ? seed.rating_sum / seed.rating_count : 0,
      created_at: now,
      updated_at: now,
    };
    store.packages.set(pkg.package_id, pkg);
  }
}

// Auto-seed on module load
seedMockPackages();
