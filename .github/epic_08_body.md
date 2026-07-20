# Epic 08: Playbook System

**PRD**: [`docs/prd/epic/08_Playbook_System.md`](../docs/prd/epic/08_Playbook_System.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P1

## Summary

Composable, versioned (SemVer) packages of strategies + data fetchers + risk managers + alerts + narratives.

- 6 kinds: strategy, composite, data_fetcher, risk_manager, alert, narrative
- 3 composition types: parallel (weight sum=1.0), sequential (depends_on), conditional (if/then/else)
- SemVer versioning with changelog
- Narrative fields required (why / how / risks)
- Circular dependency detection
- D1 schema: `playbooks`, `playbook_versions`, `playbook_dependencies`

## Sub-tasks

- [x] Playbook library page (`/playbook`) — Sprint 7
- [x] 6 kind cards display — Sprint 7
- [x] 3 composition type cards — Sprint 7
- [x] Playbook detail page — /api/playbooks/[id]
- [x] YAML schema validator for Playbook — validatePlaybookYAML() 5-stage pipeline, Sprint 7
- [x] Composition engine (parallel / sequential / conditional) — PlaybookExecutor, Sprint 7
- [x] Circular dependency detection algorithm — DFS white/gray/black, Sprint 7
- [x] SemVer version bumping — parseSemver + isSemverGreater, Sprint 7
- [x] Changelog auto-generation — changelog field in publishVersion(), Sprint 7
- [x] D1 migrations for 3 Playbook tables — Migration 006, Sprint 5
- [x] Narrative fields required validation — validateNarrative(), Sprint 7

## Acceptance Criteria

- [x] All 6 kinds can be instantiated
- [x] Parallel composition requires weight sum = 1.0 (±0.001 tolerance)
- [x] Sequential composition rejects circular dependencies
- [x] Conditional composition supports if/then/else
- [x] SemVer versions strictly increasing
- [x] Narrative fields (why/how/risks) required for publish
- [x] Version history displays changelog

## References

- Spec: `docs/spec/data_model.md` (Playbook tables)
- 5 mock playbooks via seedMockPlaybooks()
