# ADR-0012: Community UGC + Moderation

## Status

Proposed

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + D1 + R2 |
| **Domain** | Community (UGC Publishing + Moderation + Anti-Abuse) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP07 §TR-EP07-001–TR-EP07-014, ADR-0008 (Strategy DSL lifecycle FSM — publish guard), ADR-0009 (Backtest result required for publish), ADR-0011 (D1 schema: community tables + user_playbook_installs), ADR-0002 (R2 for Playbook YAML storage) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Publish guard rejects strategy not in "backtested" lifecycle state; duplicate detection flags identical Playbook YAML by SHA-256 hash; rate limit (5 publishes/day) enforced server-side; rating fraud rejects 5-star from account <7 days old with <3 total ratings; comment depth >2 rejected server-side; "high" severity report auto-hides Playbook |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0008 (Strategy DSL — lifecycle FSM for publish guard: `lifecycle_status IN ('backtested', 'paper_trading', 'live')`), ADR-0009 (Backtest Engine — BacktestResult required for performance snapshot at publish), ADR-0011 (D1 schema: community_playbooks, user_playbook_installs, playbook_ratings, playbook_comments, playbook_reports), ADR-0002 (R2 for Playbook YAML storage) — all Accepted or Proposed with Accepted deps |
| **Enables** | EP07 Community stories, share/publish flow, community feed, rating/comment system |
| **Blocks** | EP07 Community stories cannot start until this ADR is Accepted |
| **Ordering Note** | ADR-0011 must be Accepted first (defines community D1 tables). ADR-0008 lifecycle FSM must be Accepted (publish guard depends on strategy lifecycle states). ADR-0013 (Playbook System) should be Accepted in parallel — share package references Playbook YAML schema. |

## Context

### Problem Statement

EP07 requires a UGC closed-loop: publish → discover → install → rate → comment → report. Key challenges:

1. **Unvetted strategies going public**: Without a publish guard, users could share untested strategies that mislead other users into financial losses.
2. **Spam and abuse**: Unlimited publishing, duplicate content, and fraudulent ratings could overwhelm the community feed and erode trust.
3. **Content moderation at scale**: Manual moderation of all UGC is infeasible; automated severity triage is needed.
4. **Install semantics**: "Install" must create a reference (not a content copy) so that Playbook authors can push updates to all installers.
5. **Rating integrity**: Fresh accounts spamming 5-star ratings inflate Playbook scores, misleading the community.
6. **Comment depth explosion**: Unbounded nesting makes moderation and rendering complex.

### Constraints

- **Cloudflare D1 free tier**: 5M row reads/day. Community tables (playbooks, ratings, comments, reports) expected to have ~1K–10K rows at launch. Well within limits.
- **Cloudflare R2**: Playbook YAML stored per ADR-0002. Community metadata in D1, content in R2.
- **Workers CPU limit**: 30s per request. Anti-abuse checks (duplicate hash, rate limit, rating fraud) must complete in <100ms per request.
- **No external moderation service**: Phase 1 uses rule-based moderation. ML-based content classification is Phase 2.
- **No full-text search**: D1 (SQLite) FTS5 is available but limited. Phase 1 uses LIKE + tag matching. Phase 1.5 adds Vectorize for semantic search.

### Requirements

- Publish guard: Strategy must be in "backtested" or later lifecycle state.
- Share Package = Playbook YAML (R2) + metadata (D1) + performance snapshot + risk disclosure.
- Install creates reference (not copy) — `user_playbook_installs` table (per ADR-0011 Migration 007).
- Rating: 1-5 stars, 1 per user per Playbook, weighted by user reputation.
- Comments: nested 2 levels max (parent + replies).
- Reports: 3 severity tiers, queued for moderator review.
- Anti-abuse: forbidden words filter, content hash duplicate detection, daily publish rate limit (5/user/day), rating fraud detection.
- Feed: chronological + popularity sort; search by tag/author/title.
- Recommendation Phase 1: tag match + popularity; Phase 1.5: Vectorize semantic search.
- Creator incentive: Phase 2 (0.5 Credit per install).

## Decision

**Adopt a UGC closed-loop system with publish guard (strategy lifecycle gate), anti-abuse pipeline (forbidden words + duplicate hash + rate limit + rating fraud), 3-tier report moderation, and 2-level comment nesting. Install creates reference via `user_playbook_installs` (per ADR-0011). Recommendation Phase 1 uses tag match + popularity score.**

### Publish Flow

```
User clicks "Publish Strategy"
        │
        ▼  Step 1: Publish Guard — check strategy lifecycle_status
        │   IF lifecycle_status NOT IN ('backtested', 'paper_trading', 'live')
        │   → REJECT: "Strategy must be backtested before publishing"
        │
        ▼  Step 2: Anti-Abuse — rate limit check
        │   IF user publish count today ≥ 5
        │   → REJECT: "Daily publish limit reached (5/day)"
        │
        ▼  Step 3: Anti-Abuse — forbidden words filter
        │   IF title OR description matches forbidden_words list
        │   → REJECT: "Content violates community guidelines"
        │
        ▼  Step 4: Anti-Abuse — duplicate detection (SHA-256 of Playbook YAML)
        │   IF hash matches existing community_playbook
        │   → WARN: "Similar Playbook already exists" (allow publish with warning)
        │
        ▼  Step 5: Risk disclosure validation
        │   IF risk_disclosure.length < 50
        │   → REJECT: "Risk disclosure must be at least 50 characters"
        │
        ▼  Step 6: Performance snapshot — copy latest BacktestResult metrics
        │   Denormalize into community_playbooks.performance_json
        │
        ▼  Step 7: Create community_playbooks row + reference playbook in R2
        │
        ▼  Step 8: Return package_id
        ▼
Published!
```

### Share Package Structure

```typescript
// web/src/lib/community/types.ts

export interface SharePackage {
  package_id: string;           // "pkg_xxx" — community_playbooks PK
  playbook_id: string;          // references playbooks.id (ADR-0011)
  version: string;              // SemVer of published version
  author_id: string;            // references users.id
  title: string;                // display title
  description: string;          // short description
  tags: string[];               // searchable tags
  risk_disclosure: string;      // ≥50 chars, mandatory
  performance_json: PerformanceSnapshot;  // denormalized from BacktestResult
  yaml_r2_key: string;          // resolved from playbook_versions via ADR-0011
  moderation_status: ModerationStatus;
  installed_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
}

export interface PerformanceSnapshot {
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  // snapshot taken at publish time — does NOT auto-update
  snapshot_at: string;
}

export type ModerationStatus = "active" | "hidden" | "removed" | "banned";

export type ReportSeverity = "high" | "medium" | "low";

export interface CommunityPlaybookRating {
  user_id: string;
  package_id: string;
  rating: number;               // 1-5
  created_at: string;
}

export interface CommunityPlaybookComment {
  id: number;
  package_id: string;
  user_id: string;
  content: string;
  parent_id: number | null;     // null = top-level; if set, parent must be top-level (2 levels max)
  moderation_status: "active" | "hidden" | "deleted";
  created_at: string;
}

export interface CommunityPlaybookReport {
  id: number;
  package_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  severity: ReportSeverity;
  moderation_status: "pending" | "resolved" | "rejected";
  created_at: string;
}
```

### Anti-Abuse Pipeline

```typescript
// web/src/lib/community/anti-abuse.ts

export interface AntiAbuseResult {
  allowed: boolean;
  warnings: AntiAbuseWarning[];
  errors: AntiAbuseError[];
}

export interface AntiAbuseWarning {
  code: "duplicate_content";
  message: string;
  details?: Record<string, unknown>;
}

export interface AntiAbuseError {
  code: "rate_limit_exceeded" | "forbidden_content" | "risk_disclosure_too_short" | "lifecycle_guard_failed";
  message: string;
}

export async function checkPublishGuard(
  strategyId: string,
  db: D1Database,
): Promise<boolean> {
  const strategy = await db.prepare(
    "SELECT lifecycle_status FROM strategies WHERE id = ?"
  ).bind(strategyId).first();
  return strategy?.lifecycle_status !== null &&
    ["backtested", "paper_trading", "live"].includes(strategy.lifecycle_status);
}

export async function checkRateLimit(
  userId: string,
  db: D1Database,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.prepare(
    "SELECT COUNT(*) as cnt FROM community_playbooks WHERE author_id = ? AND DATE(created_at) = ?"
  ).bind(userId, today).first();
  return (result?.cnt as number) < 5;
}

export async function checkDuplicate(
  yamlContent: string,
  db: D1Database,
): Promise<AntiAbuseWarning | null> {
  const hash = await computeSHA256(yamlContent);
  const existing = await db.prepare(
    "SELECT package_id, title FROM community_playbooks WHERE content_hash = ?"
  ).bind(hash).first();
  if (existing) {
    return {
      code: "duplicate_content",
      message: `Similar Playbook already exists: "${existing.title}"`,
      details: { existing_package_id: existing.package_id },
    };
  }
  return null;
}

export async function checkRatingFraud(
  userId: string,
  rating: number,
  db: D1Database,
): Promise<boolean> {
  if (rating < 5) return true; // fraud check only for 5-star ratings
  const user = await db.prepare(
    "SELECT created_at FROM users WHERE id = ?"
  ).bind(userId).first();
  const accountAge = Date.now() - new Date(user.created_at).getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (accountAge < sevenDays) {
    const ratingCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM playbook_ratings WHERE user_id = ?"
    ).bind(userId).first();
    if ((ratingCount?.cnt as number) < 3) {
      return false; // reject: new account with few ratings giving 5-star
    }
  }
  return true;
}

async function computeSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

### Comment Depth Enforcement

```typescript
// web/src/lib/community/comment-guard.ts

export async function validateCommentDepth(
  parentId: number | null,
  db: D1Database,
): Promise<{ valid: boolean; error?: string }> {
  if (parentId === null) {
    // Top-level comment — always allowed
    return { valid: true };
  }

  // Check if parent is already a reply (has its own parent_id)
  const parent = await db.prepare(
    "SELECT parent_id FROM playbook_comments WHERE id = ?"
  ).bind(parentId).first();

  if (!parent) {
    return { valid: false, error: "Parent comment not found" };
  }

  if (parent.parent_id !== null) {
    // Parent is already a reply — reject deeper nesting
    return { valid: false, error: "Comment depth limited to 2 levels (no nested replies)" };
  }

  return { valid: true };
}
```

### Report Moderation Flow

```
Report submitted (severity: high/medium/low)
        │
        ├── severity = "high"
        │   ├── Auto-hide Playbook (SET moderation_status = 'hidden')
        │   ├── Notify moderator via dashboard notification
        │   └── Playbook invisible until moderator reviews
        │
        ├── severity = "medium"
        │   ├── Queue for moderator review
        │   └── Playbook remains visible
        │
        └── severity = "low"
            ├── Queue for moderator review (lower priority)
            └── Playbook remains visible

Moderator reviews:
        │
        ├── Approve report → SET moderation_status = 'removed' or 'banned'
        │   ├── 'removed': single Playbook removed
        │   └── 'banned': all Playbooks by this author hidden
        │
        └── Reject report → SET report moderation_status = 'rejected'
            └── If auto-hidden, restore to 'active'
```

### Feed + Recommendation

```typescript
// web/src/lib/community/feed.ts

export type FeedSort = "chronological" | "popularity";

export interface FeedQuery {
  sort: FeedSort;
  tags?: string[];        // filter by tag
  author_id?: string;     // filter by author
  search?: string;        // title/description LIKE search
  page: number;           // pagination
  page_size: number;      // default 20
}

export interface FeedResult {
  packages: SharePackage[];
  total: number;
  page: number;
}

/** Phase 1: tag match + popularity score */
export function computePopularityScore(pkg: SharePackage): number {
  // Weighted: installs × 1.0 + rating_avg × 10.0 + rating_count × 0.5
  return (
    pkg.installed_count * 1.0 +
    pkg.rating_avg * 10.0 +
    pkg.rating_count * 0.5
  );
}

/** Phase 1.5: Vectorize semantic search (future) */
// export async function semanticSearch(query: string): Promise<string[]> { ... }
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/community/publish` | Publish strategy as community Playbook (runs anti-abuse pipeline) |
| GET | `/api/community/feed` | Feed with sort/filter/pagination |
| GET | `/api/community/playbooks/:package_id` | Get single SharePackage details |
| POST | `/api/community/install` | Install a Playbook (creates `user_playbook_installs` row) |
| POST | `/api/community/rate` | Rate a Playbook (1-5 stars, fraud check) |
| POST | `/api/community/comment` | Comment on a Playbook (depth guard) |
| POST | `/api/community/report` | Report a Playbook (severity triage) |
| GET | `/api/community/search` | Search by tag/author/title (Phase 1: LIKE) |

### Critical Implementation Rules

1. **Publish guard**: D1 write to `community_playbooks` only if `strategy.lifecycle_status IN ('backtested', 'paper_trading', 'live')` — enforced server-side (Worker). Client-side guard is UX-only; server must re-verify.
2. **Risk disclosure: mandatory text field (≥50 chars)** explaining strategy risks — cannot be empty on publish. Enforced in anti-abuse pipeline Step 5.
3. **Performance snapshot**: latest `BacktestResult` metrics copied to `community_playbooks.performance_json` at publish time. This is **denormalized** for feed display performance — avoids JOINing backtest_results per feed item. Snapshot does NOT auto-update if strategy is re-backtested.
4. **Rate limit: 5 publishes per user per day** — tracked in D1 (`community_playbooks` created_at per author_id per date). Checked before publish in anti-abuse pipeline Step 2.
5. **Duplicate detection: SHA-256 hash of Playbook YAML content** — if hash matches existing `community_playbook.content_hash`, flag as duplicate (allow publish with warning, don't block). Warnings returned to client for display.
6. **Rating fraud: reject 5-star rating from user accounts created <7 days ago AND with <3 total ratings given**. This prevents fresh bot accounts from inflating ratings. Non-5-star ratings bypass this check.
7. **Comment depth: server-side reject if parent_id references a comment that already has a parent_id** (max 2 levels). Enforced in `validateCommentDepth()`. Client should also disable reply button on level-2 comments.
8. **Moderation: reports with severity="high" auto-hide the Playbook** (`moderation_status = 'hidden'`) until moderator reviews. Severity="medium"/"low" just queue for review — Playbook remains visible.

## GDD Requirements Addressed

| TR-ID | Requirement | Coverage |
|-------|-------------|----------|
| TR-EP07-001 | Share Package definition | ✅ Full — SharePackage interface with YAML + metadata + performance + risk disclosure |
| TR-EP07-002 | D1 5 tables | ✅ Covered by ADR-0011 Migration 007 (community_playbooks, user_playbook_installs, playbook_ratings, playbook_comments, playbook_reports) |
| TR-EP07-003 | Publish flow | ✅ Full — 8-step pipeline with publish guard + anti-abuse |
| TR-EP07-004 | Feed stream | ✅ Full — chronological + popularity sort, pagination |
| TR-EP07-005 | Search | ✅ Full — tag/author/title LIKE search (Phase 1); Vectorize (Phase 1.5) |
| TR-EP07-006 | Install creates reference | ✅ Covered by ADR-0011 — user_playbook_installs references playbook_id + package_id |
| TR-EP07-007 | Rating 1-5 with dedup | ✅ Full — PRIMARY KEY (user_id, package_id) prevents duplicate ratings |
| TR-EP07-008 | Comments 2 layers | ✅ Full — server-side depth guard, max 2 levels |
| TR-EP07-009 | Report severity tiers | ✅ Full — high/medium/low with auto-hide on high |
| TR-EP07-010 | AntiAbuseFilter | ✅ Full — forbidden words + duplicate hash + rate limit + rating fraud |
| TR-EP07-011 | R2 storage | ✅ Covered by ADR-0002 — Playbook YAML in R2 |
| TR-EP07-012 | Mock mode samples | ✅ Full — Mock community data at `web/public/mock/community/` (per ADR-0001) |
| TR-EP07-013 | Creator incentive | ✅ Phase 2 — 0.5 Credit per install, not in Phase 1 scope |
| TR-EP07-014 | Recommendation algorithm | ✅ Full — Phase 1 tag match + popularity score; Phase 1.5 Vectorize semantic search |

## Alternatives Considered

### Alternative 1: Full content moderation (human review all submissions)

- **Description**: Every published Playbook is reviewed by a human moderator before going live.
- **Pros**: Highest content quality. No harmful content reaches the community.
- **Cons**: Does not scale. Launch with 0 moderators. Delays publish from seconds to hours/days. Bad UX.
- **Rejection Reason**: Automated anti-abuse + severity-based triage is more scalable. Human moderation for reported content only.

### Alternative 2: Flat comments (no nesting)

- **Description**: Comments are flat — no replies, no threading.
- **Pros**: Simpler schema. Simpler rendering. No depth enforcement needed.
- **Cons**: Poor UX for discussions. No way to reply to specific comments. Community engagement suffers.
- **Rejection Reason**: 2-level nesting balances UX and complexity. Deeper nesting is unnecessary for investment strategy discussions.

### Alternative 3: Weighted rating by user reputation score

- **Description**: Rating weight is proportional to user reputation (account age, activity, own Playbook ratings).
- **Pros**: More accurate community ratings. Reduces impact of low-quality ratings.
- **Cons**: Complex reputation system. Opacity — users don't understand why their rating has less weight. Potential for reputation gaming.
- **Rejection Reason**: Phase 1 uses simple 5-star average. Rating fraud detection (Rule #6) handles the worst abuse. Weighted ratings are Phase 2 if simple average proves insufficient.

## Consequences

### Positive

- Publish guard ensures only backtested strategies reach the community, protecting users from untested strategies.
- Anti-abuse pipeline (4 checks) catches most spam/abuse automatically without human moderation.
- Denormalized performance snapshot avoids expensive JOINs on the feed page.
- Reference-based installs (not copies) allow Playbook authors to push updates to all installers.
- Severity-based report triage focuses moderator attention on the most harmful content.

### Negative

- Denormalized `performance_json` does not auto-update when a strategy is re-backtested. The feed may show stale metrics. Mitigation: add "Last updated" timestamp; Phase 2 adds periodic snapshot refresh.
- SHA-256 duplicate detection may produce false positives (two independently created strategies with identical YAML). The warning-only approach (don't block) mitigates this.
- Rating fraud check (account age <7 days AND <3 ratings) may reject legitimate new users who genuinely want to give 5 stars. Mitigation: they can still rate 1-4 stars; 5-star is unlocked after 3 ratings or 7 days.
- Forbidden words list requires manual curation. No ML-based content classification in Phase 1.

### Risks

- **Risk**: Daily publish rate limit (5/user/day) may frustrate power users who create many strategies.
  - **Mitigation**: Rate limit is per-user per-day, not per-hour. Power users can spread publishes across days. Phase 2 may increase limit based on user reputation.
- **Risk**: `community_playbooks.content_hash` column must be added to ADR-0011 Migration 007 schema (not currently present).
  - **Mitigation**: ADR-0011 amendment required. `content_hash TEXT` column added to `community_playbooks` table. No FK impact.
- **Risk**: Moderator queue may grow unbounded if reports are submitted faster than moderators can review.
  - **Mitigation**: High-severity reports auto-hide content immediately (no moderator action needed for protection). Queue depth >100 triggers alert. Phase 2 adds ML-assisted triage.

---

> **Last Updated**: 2026-07-19
