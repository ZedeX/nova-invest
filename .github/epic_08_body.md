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
- D1 schema: `playbooks`, `playbook_versions`, `playbook_dependencies`, `user_playbooks`

## Sub-tasks

- [x] Playbook library page (`/playbook`) with 3 personal Playbooks
- [x] 6 kind cards display
- [x] 3 composition type cards
- [ ] Playbook detail page (`/playbook/[id]`)
- [ ] YAML schema validator for Playbook
- [ ] Composition engine (parallel / sequential / conditional)
- [ ] Circular dependency detection algorithm
- [ ] SemVer version bumping UI
- [ ] Changelog auto-generation
- [ ] D1 migrations for 4 Playbook tables
- [ ] Narrative fields required validation

## Acceptance Criteria

- [ ] All 6 kinds can be instantiated
- [ ] Parallel composition requires weight sum = 1.0
- [ ] Sequential composition rejects circular dependencies
- [ ] Conditional composition supports if/then/else
- [ ] SemVer versions strictly increasing
- [ ] Narrative fields (why/how/risks) required for publish
- [ ] Version history displays changelog

## References

- Spec: `docs/spec/data_model.md` (Playbook tables)
- Mock data: 3 personal Playbooks in UI
