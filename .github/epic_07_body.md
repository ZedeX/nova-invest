# Epic 07: Share & Community

**PRD**: [`docs/prd/epic/07_Share_Community.md`](../docs/prd/epic/07_Share_Community.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P2

## Summary

UGC closed-loop: publish → discover → install → rate → comment → report. Anti-abuse mechanisms.

- Share Package = Playbook + metadata + performance + risk disclosure
- D1 schema: 5 tables (community_playbooks, installs, ratings, comments, reports)
- Anti-abuse: duplicate detection, rate limiting, rating fraud detection
- Mock community data (4 Playbooks + index)

## Sub-tasks

- [x] Community page (`/community`) with filters + categories
- [x] CommunityFeed widget (top 5 playbooks)
- [ ] Publish Playbook flow (requires validated backtest + risk disclosure)
- [ ] Install flow (one-click install to user's Playbook library)
- [ ] Rating system (1-5 stars, weighted by user reputation)
- [ ] Comments thread
- [ ] Report flow (inappropriate content, broken Playbook, etc.)
- [ ] Duplicate detection (content hash + semantic similarity)
- [ ] Rate limiting (max 5 publishes per user per day)
- [ ] Rating fraud detection (multiple 5-star from new accounts)

## Acceptance Criteria

- [ ] User can publish a Playbook only if it has validated backtest
- [ ] Install creates a copy in user's library
- [ ] Ratings display with weighted average
- [ ] Comments threaded 2 levels deep
- [ ] Reports queue visible to moderators
- [ ] Duplicate Playbooks flagged within 1 hour

## References

- Mock data: `web/public/mock/community/` (4 Playbooks + index.json)
