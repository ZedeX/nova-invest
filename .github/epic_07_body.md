# Epic 07: Share & Community

**PRD**: [`docs/prd/epic/07_Share_Community.md`](../docs/prd/epic/07_Share_Community.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P2

## Summary

UGC closed-loop: publish → discover → install → rate → comment → report. Anti-abuse mechanisms.

- Share Package = Playbook + metadata + performance + risk disclosure
- D1 schema: 5 tables (community_playbooks, installs, ratings, comments, reports)
- Anti-abuse: duplicate detection, rate limiting, rating fraud detection
- Mock community data (10 Playbooks)

## Sub-tasks

- [x] Community page (`/community`) with filters + categories — Sprint 8
- [x] CommunityFeed widget (top 5 playbooks) — Sprint 8
- [x] Publish Playbook flow — publishPackage() in community store
- [x] Install flow (one-click install to user's Playbook library) — installPackage()
- [x] Rating system (1-5 stars, weighted by user reputation) — ratePackage() with user dedup
- [x] Comments thread (2 levels deep) — addComment() with parent_id
- [x] Report flow (inappropriate content, broken Playbook, etc.) — reportPackage() with severity auto-flag
- [x] Duplicate detection (content hash) — content_hash in community_playbooks per ADR-0011
- [x] Rate limiting (max 5 publishes per user per day) — anti-cheat in store
- [x] Rating fraud detection (update existing rating, no duplicate) — ratePackage() user dedup

## Acceptance Criteria

- [x] User can publish a Playbook — POST /api/community/playbook
- [x] Install creates a reference in user's library — installPackage() idempotent
- [x] Ratings display with average — rating_avg + rating_count
- [x] Comments threaded 2 levels deep — parent_id + getReplies()
- [x] Reports queue visible to moderators — listReports()
- [x] Duplicate Playbooks flagged — content_hash dedup

## References

- Mock data: 10 mock community playbooks via seedMockPackages()
