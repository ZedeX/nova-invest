# ADR-0017: Credit Billing System

## Status

Accepted

## Phase-1 Simplified Variants Accepted (2026-07-20)

- **Phase-1 Accepted Variant**: in-memory credit store with demo user seed data, no Stripe integration, auto-approved top-ups.
- **Rationale**: Cloudflare Workers dev environment + Phase 1 does not require payment processing. The in-memory store correctly implements the 4-tier plan system, per-action billing, and degradation chain. Multi-user persistence is only relevant when Stripe integration goes live in Phase 2.
- **Phase-1 Compliance**: ACCEPTED as Phase-1 compliant. The in-memory store violates FP-0001/FP-0002 (no module-level state on Workers) but this is acceptable for Phase 1 where all billing is demo-mode and D1 persistence is deferred.
- **Migration Trigger**: When `ENVIRONMENT=production` with real user accounts, MUST migrate to D1-backed store before deployment.

## Phase-2 Deferral Notes

- **Status**: Phase-1 implements in-memory store; D1 persistence + Stripe integration deferred to Phase-2.
- **Current Implementation**: `web/src/lib/credit/store.ts` (in-memory Map, NOT D1)
- **Phase-2 Deferrals**:
  - D1-backed balance persistence (replace in-memory Map)
  - Stripe checkout integration (replace auto-approve top-up)
  - Stripe webhook handler for `order_status: "paid"` transitions
  - Multi-user authentication + balance isolation
  - Team/Enterprise plan features (credit pooling, admin dashboards)
  - Credit carry-over logic (Team+ only)

## Date

2026-07-20

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 15 + Cloudflare Workers 4 + D1 |
| **Domain** | Billing (Core Monetization) |
| **Knowledge Risk** | LOW |
| **References Consulted** | billing_credit_system.md §1-5, ADR-0003 (LLM routing), ADR-0011 (D1 Schema) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | 14 action costs match spec; mock mode charges 0; degradation chain normal→degraded→mock_only; free actions cost 0; ADR-0011 Rule #6 compliance (`order_status` not `status`) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0003 (LLM routing — credit charging integrated into `/api/ask`), ADR-0011 (D1 Schema — Migration 0010 credit tables), ADR-0001 (USE_MOCK — mock mode charges 0 credits) |
| **Enables** | Sprint 9 Billing + Deployment; monetization infrastructure for all paid features |
| **Blocks** | Phase-2 Stripe integration; Team/Enterprise features |
| **Ordering Note** | Must be Accepted before any production billing deployment. |

## Context

### Problem Statement

The platform needs a billing system to monetize AI-powered features (Ask Agent, Strategy DSL, Backtest, Community Playbooks). Key requirements:

1. **Per-action billing**: Users pay credits per action (ask_simple=1, ask_deep=5, backtest_1y=2, etc.) — not flat subscription.
2. **4-tier plan system**: Free (50 credits/mo), Pro (1000), Team (5000), Enterprise (custom) with monthly quotas.
3. **Degradation chain**: When credits run low, degrade to cheaper models; when exhausted, block non-free actions.
4. **Free actions**: `strategy_validate` and `playbook_publish` cost 0 credits to encourage strategy creation and community sharing.
5. **Mock mode exemption**: In mock mode, all actions are 0 credits (no billing impact during development).
6. **Top-up**: Users can purchase additional credits. Phase 1: auto-approve. Phase 2: Stripe integration.

Per `billing_credit_system.md` §1-5, the credit system is the core monetization mechanism for all AI-powered features.

### Constraints

- **ADR-0011 Rule #6**: No bare `status` column — credit_orders uses `order_status`.
- **Mock mode exemption**: All credit charges must return 0 in mock mode (ADR-0001).
- **D1 schema**: 3 new tables (credit_balances, credit_transactions, credit_orders) in Migration 0010.
- **Phase 1**: No Stripe, no multi-user auth, auto-approved top-ups only.
- **Free action policy**: strategy_validate and playbook_publish are always 0 credits regardless of plan.

### Requirements

- 14 action types with defined credit costs per `billing_credit_system.md` §3.1
- 4 plan tiers (Free/Pro/Team/Enterprise) with monthly credit quotas
- Degradation chain: normal → degraded (~40% cost, cheaper model) → mock_only (blocked)
- Credit balance tracking per user per monthly period
- Transaction ledger for audit trail
- Top-up order system (Phase 2: Stripe webhook integration)
- Refund mechanism for failed operations
- Burn rate forecasting (7-day rolling average)

## Decision

**Adopt a per-action credit billing system with 4-tier plans, degradation chain, and in-memory store for Phase 1. D1 persistence and Stripe integration deferred to Phase 2.**

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ API Routes                                                   │
│                                                              │
│  POST /api/ask                                               │
│    1. classifyIntent() → QueryIntent                         │
│    2. intentToCreditAction(intent) → CreditAction            │
│    3. chargeCredit(user, action, isMockMode)                 │
│       ├─ mock mode → 0 charge, normal                       │
│       ├─ free action → 0 charge, normal                     │
│       ├─ remaining >= cost → normal charge                   │
│       ├─ remaining < cost*0.5 → degraded (~40% cost)        │
│       └─ remaining = 0 → mock_only (blocked, return 402)    │
│    4. Execute LLM/data query                                 │
│    5. Return response + credit info                          │
│                                                              │
│  GET  /api/credits/balance    → current balance              │
│  POST /api/credits/charge     → charge an action             │
│  GET  /api/credits/transactions → transaction history        │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Credit Store (Phase 1: in-memory; Phase 2: D1)              │
│                                                              │
│  balances: Map<`${userId}:${period}`, CreditBalance>         │
│  transactions: CreditTransaction[]                           │
│  orders: CreditOrder[]                                       │
│                                                              │
│  Key functions:                                              │
│    getOrCreateBalance() → CreditBalance                      │
│    chargeCredit() → ChargeResult { ok, amount, degraded }   │
│    refundCredit() → { ok, refunded, remaining }             │
│    topUpCredits() → CreditOrder (Phase 2: Stripe webhook)   │
│    checkDegradationLevel() → DegradationLevel                │
│    changePlan() → CreditBalance                              │
│    listTransactions() → { transactions, total }             │
│    seedDemoBalance() → seeds demo_user (Pro, 1000 credits)  │
└──────────────────────────────────────────────────────────────┘
```

### Action Cost Table

| Action | Credits | Category |
|--------|---------|----------|
| `ask_simple` | 1 | Ask Agent |
| `ask_deep` | 5 | Ask Agent |
| `ask_tool_call` | 2 | Ask Agent |
| `strategy_validate` | 0 | Strategy DSL |
| `strategy_llm_generate` | 3 | Strategy DSL |
| `backtest_1y` | 2 | Backtest |
| `backtest_5y` | 5 | Backtest |
| `backtest_extra_symbol` | 1 | Backtest |
| `backtest_walk_forward` | 5 | Backtest |
| `paper_trade` | 1 | Trading |
| `playbook_publish` | 0 | Community |
| `playbook_install` | 1 | Community |
| `rag_advanced` | 2 | RAG |
| `realtime_quote_24h` | 5 | Data |

### Plan Tiers

| Plan | Monthly Credits | Price | Carry-Over |
|------|----------------|-------|------------|
| Free | 50 | $0/mo | No |
| Pro | 1000 | $29/mo | No |
| Team | 5000 | $99/mo | Yes |
| Enterprise | Custom | Custom | Yes |

### Degradation Chain

```
  remaining >= cost
       │
       ▼
  ┌──────────┐
  │  NORMAL   │  Full cost, best model
  └──────────┘
       │ remaining < cost
       ▼
  ┌──────────┐
  │ DEGRADED  │  ~40% cost, cheaper model (e.g., Haiku instead of Sonnet)
  └──────────┘
       │ remaining = 0
       ▼
  ┌──────────┐
  │MOCK_ONLY │  Blocked — only free actions and mock mode available
  └──────────┘
```

### Key Interfaces

```typescript
// web/src/lib/credit/types.ts

export type CreditPlan = "free" | "pro" | "team" | "enterprise";
export type CreditAction =
  | "ask_simple" | "ask_deep" | "ask_tool_call"
  | "strategy_validate" | "strategy_llm_generate"
  | "backtest_1y" | "backtest_5y" | "backtest_extra_symbol" | "backtest_walk_forward"
  | "paper_trade" | "playbook_publish" | "playbook_install"
  | "rag_advanced" | "realtime_quote_24h";
export type DegradationLevel = "normal" | "degraded" | "mock_only";

export const ACTION_COSTS: Record<CreditAction, number>;
export const PLAN_CONFIGS: Record<CreditPlan, PlanConfig>;

export interface CreditBalance {
  user_id: string;
  period: string;        // "YYYY-MM"
  plan: CreditPlan;
  granted: number;
  used: number;
  topped_up: number;
  carried_over: number;
  remaining: number;
  forecast_burn_rate: number;
}

export interface ChargeResult {
  ok: boolean;
  amount: number;
  remaining: number;
  degraded: boolean;
  degradation_level: DegradationLevel;
  reason?: string;
}

export interface CreditOrder {
  id: string;
  user_id: string;
  amount_usd: number;
  credits: number;
  order_status: "pending" | "paid" | "failed";  // NOT "status" per ADR-0011 Rule #6
  stripe_id: string | null;
  created_at: string;
}
```

### Critical Implementation Rules

1. **Mock mode → 0 credits**: When `isMockMode()` is true, `chargeCredit()` always returns 0. This ensures development and demo usage never consumes real credits.

2. **Free actions → 0 credits**: `strategy_validate` and `playbook_publish` cost 0 regardless of plan. This encourages strategy creation and community sharing per PRD §2.6.

3. **`order_status` not `status`**: Per ADR-0011 Rule #6, the `credit_orders` table uses `order_status` column, not bare `status`. This is enforced in migration SQL, schema.ts, types.ts, and store.ts.

4. **Degradation thresholds**: `remaining >= cost` → normal; `remaining < cost * 0.5` → degraded (~40% cost); `remaining <= 0` → mock_only (blocked). The degraded cost is `Math.ceil(cost * 0.4)`.

5. **Auto-approve top-ups in Phase 1**: `topUpCredits()` immediately sets `order_status` to `"paid"` and credits the balance. Phase 2 will add Stripe webhook handler.

6. **Burn rate from last 7 days**: `forecast_burn_rate` is calculated as total debits from the last 7 days divided by 7. This gives a simple daily average for forecasting.

7. **Demo user seed**: On module load, `seedDemoBalance()` creates a demo_user with Pro plan, 1000 granted, 153 used, 847 remaining, and 7 mock transactions. This ensures the dashboard and settings pages have data to display.

### D1 Schema (Migration 0010)

```sql
CREATE TABLE IF NOT EXISTS credit_balances (
  user_id       TEXT NOT NULL,
  period        TEXT NOT NULL,
  plan          TEXT NOT NULL,
  granted       INTEGER NOT NULL,
  used          INTEGER DEFAULT 0,
  topped_up     INTEGER DEFAULT 0,
  carried_over  INTEGER DEFAULT 0,
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  action        TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  metadata      TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  amount_usd    REAL NOT NULL,
  credits       INTEGER NOT NULL,
  order_status  TEXT NOT NULL,  -- NOT 'status' per ADR-0011 Rule #6
  stripe_id     TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

## Alternatives Considered

### Alternative 1: Flat subscription (no per-action billing)

- **Description**: Monthly subscription with unlimited usage within plan tier.
- **Pros**: Simpler implementation; no credit counting; no degradation logic.
- **Cons**: No cost control for heavy users; cannot differentiate between cheap (ask_simple=1) and expensive (ask_deep=5) actions; no incentive for users to optimize usage; abuse vector for automated scripts.
- **Rejection Reason**: Per-action billing is fundamental to the business model (billing_credit_system.md §1). It aligns cost with value delivered and prevents abuse.

### Alternative 2: Token-based billing (charge per LLM token)

- **Description**: Bill users based on actual LLM token consumption (input + output tokens).
- **Pros**: Precise cost tracking; direct alignment with provider costs; no arbitrary action costs.
- **Cons**: Unpredictable for users (same query can cost different amounts); requires token metering infrastructure; doesn't account for non-LLM costs (data API calls, compute); difficult to show upfront pricing.
- **Rejection Reason**: Action-based billing is more user-friendly and predictable. Users know "ask_deep costs 5 credits" before they ask.

### Alternative 3: D1-backed store from Day 1

- **Description**: Implement D1 persistence immediately instead of in-memory store.
- **Pros**: No migration needed later; multi-user ready from start; state survives Worker restarts.
- **Cons**: Adds D1 read/write latency to every credit operation; requires D1 binding in dev; over-engineering for Phase 1 where all users are demo_user; blocks development on D1 setup.
- **Rejection Reason**: Phase 1 uses demo_user with mock data. D1 persistence is only needed when real user accounts exist. In-memory store with `_resetStoreForTest()` mirrors the community store pattern successfully used in Sprint 8.

## Consequences

### Positive

- **Monetization infrastructure**: All AI-powered features can be billed per-action, enabling the 4-tier plan business model.
- **Degradation chain**: Graceful degradation instead of hard cutoff — users get cheaper model instead of complete block when credits are low.
- **Mock mode exemption**: Development and demo usage never consumes credits, ensuring frictionless development.
- **Free actions**: Strategy validation and playbook publishing cost 0, encouraging the community growth flywheel.
- **Extensible**: New actions can be added to `CreditAction` union and `ACTION_COSTS` record without architectural changes.
- **Audit trail**: Every credit charge is recorded as a transaction with balance_after for reconciliation.

### Negative

- **In-memory store**: State lost on Worker restart; not shared across instances; violates FP-0001/FP-0002. Acceptable for Phase 1 (demo_user only).
- **No Stripe integration**: Top-ups are auto-approved with no payment verification. Acceptable for Phase 1 where credits are virtual.
- **No multi-user**: All operations use `demo_user`. Real user authentication needed for Phase 2.
- **Degradation model mapping not implemented**: The ADR specifies degraded mode uses a cheaper model, but the actual model-switching logic in `getLLM()` is not yet connected to the degradation level.

### Risks

- **Risk**: In-memory store race conditions under concurrent requests.
  - **Mitigation**: Phase 1 runs single-isolate dev server; production Phase 2 uses D1 (ACID transactions).
- **Risk**: Action costs become stale as LLM provider pricing changes.
  - **Mitigation**: ACTION_COSTS is a single record in types.ts — easy to update. Phase 2 can load from D1 config table.
- **Risk**: Degradation model mapping incomplete — `chargeCredit()` returns `degraded: true` but `/api/ask` doesn't switch to cheaper model.
  - **Mitigation**: Phase 1.5 task: connect `degradation_level` to `getLLM()` model selection (already scaffolded in ADR-0003).

## GDD Requirements Addressed

| TR-ID | Requirement | How This ADR Addresses It |
|-------|-------------|---------------------------|
| billing_credit_system.md §1 | 4-tier plan system | PLAN_CONFIGS: Free(50), Pro(1000), Team(5000), Enterprise(custom) |
| billing_credit_system.md §3.1 | Per-action credit costs | ACTION_COSTS: 14 actions with defined costs |
| billing_credit_system.md §3.2 | Degradation chain | 3 levels: normal, degraded (~40% cost), mock_only (blocked) |
| billing_credit_system.md §3.3 | Free actions | strategy_validate=0, playbook_publish=0 |
| billing_credit_system.md §4 | D1 schema | Migration 0010: 3 tables (credit_balances, credit_transactions, credit_orders) |
| billing_credit_system.md §5 | Refund rules | refundCredit() with original transaction lookup |
| ADR-0011 Rule #6 | No bare `status` column | credit_orders uses `order_status` |
| ADR-0003 | LLM cost control | chargeCredit() integrated into /api/ask route |

## Performance Implications

| Operation | Latency | Notes |
|-----------|---------|-------|
| `chargeCredit()` — in-memory | <1ms | Map lookup + array push |
| `GET /api/credits/balance` | <5ms | Map lookup + JSON serialization |
| `GET /api/credits/transactions` | <5ms | Array filter + sort + slice |
| `POST /api/credits/charge` | <5ms | chargeCredit() + JSON serialization |
| `/api/ask` with credit charging | +<1ms | Negligible overhead on top of LLM call |

Phase 2 (D1-backed) estimated latencies:
| Operation | Latency | Notes |
|-----------|---------|-------|
| `chargeCredit()` — D1 read+write | ~20-40ms | D1 read + D1 write |
| `GET /api/credits/balance` | ~10-20ms | D1 read |
| `topUpCredits()` — Stripe webhook | ~200-500ms | Stripe API call + D1 write |

## Migration Plan

Phase 1 → Phase 2 migration steps:

1. Add D1 binding for `CREDIT_DB` in `wrangler.toml`
2. Replace in-memory `Map` with D1 queries in `store.ts`
3. Add Stripe checkout session creation in `topUpCredits()`
4. Add Stripe webhook handler (`/api/webhooks/stripe`) for `order_status` updates
5. Add user authentication middleware to extract `userId` from JWT/session
6. Replace `DEMO_USER` constant with authenticated user ID
7. Add Team plan carry-over logic (credit_balances.carried_over)
8. Add Enterprise plan custom quota logic
9. Update unit tests to use D1 mock
10. Add integration tests with real D1 + Stripe test mode

## Validation Criteria

- [x] 14 action types defined in `CreditAction` union
- [x] ACTION_COSTS record maps all 14 actions to their credit costs
- [x] 4 plan tiers defined in PLAN_CONFIGS with monthly credits and prices
- [x] Mock mode charges 0 credits for all actions
- [x] Free actions (strategy_validate, playbook_publish) cost 0 in all modes
- [x] Degradation chain: remaining >= cost → normal; remaining < cost*0.5 → degraded; remaining = 0 → mock_only
- [x] Degraded cost is ~40% of original (Math.ceil(cost * 0.4))
- [x] credit_orders uses `order_status` (not `status`) per ADR-0011 Rule #6
- [x] Migration 0010 creates 3 credit tables with correct schema
- [x] schema.ts includes 3 new TABLE_NAMES and SCHEMA entries
- [x] /api/ask returns 402 when credits exhausted
- [x] /api/ask response includes `credits` object with charged, remaining, degraded, degradation_level
- [x] CreditBalance widget fetches from /api/credits/balance API
- [x] Settings page shows live credit balance and recent transactions
- [x] Demo user seed: Pro plan, 1000 granted, 153 used, 847 remaining
- [x] Unit tests: 32 tests covering seed, costs, plans, charge, degradation, refund, top-up, plan change, transactions, burn rate
- [x] Integration tests: 10 tests covering balance, charge, transactions, exhaustion flows
- [x] E2E tests: 4 tests covering settings page, dashboard widget, ask agent

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) — Mock mode exempts credit charging
- **ADR-0003** (LLM routing) — Credit charging integrated into /api/ask route
- **ADR-0011** (D1 Schema Master) — Migration 0010 adds 3 credit tables; Rule #6 enforced
- **billing_credit_system.md** — Source spec for 4-tier plans, action costs, degradation, refund rules
- **Roadmap.md §2.10** — Sprint 9 definition

---

> **Last Updated**: 2026-07-20
