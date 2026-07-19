# Integration Tests

This directory contains cross-module integration tests for the Nova Invest project.

Integration tests validate that multiple modules work correctly together, such as:
- Agent loop + LLM routing + cost cap enforcement
- R2 cache + data provider fallback chain
- Citation validator + Ask Agent synthesis pipeline
- Playbook executor + community UGC lifecycle

## Running

```bash
# From project root
pnpm --filter web test:integration

# Or directly with vitest
cd web && npx vitest run tests/integration/
```

## Convention

- Each test file covers one cross-cutting concern
- Use MSW (Mock Service Worker) for external HTTP mocking
- Use `vitest` globals and `web/tests/setup.ts` for shared fixtures
