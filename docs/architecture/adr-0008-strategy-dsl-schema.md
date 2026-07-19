# ADR-0008: Strategy DSL Schema (YAML + JSON Schema + Lifecycle)

## Status

Proposed

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 |
| **Domain** | Strategy (DSL Definition + Validation + Lifecycle) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP04 §ID-1–ID-7, `docs/spec/strategy_dsl_spec.md`, ADR-0011 §Migration 004 (strategies + backtest_results tables), ADR-0001 §Mock Mode |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | JSON Schema validates all 3 example strategies; lifecycle FSM rejects invalid transitions; YAML parse → JSON round-trip lossless for DSL v1.0 fields |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (Mock K-line data path for strategy data source), ADR-0011 (D1 strategies + backtest_results tables) — both Accepted |
| **Enables** | ADR-0009 (Backtest Engine — consumes validated Strategy DSL), EP04 implementation stories |
| **Blocks** | Backtest Engine (ADR-0009) cannot run without a validated DSL; Build Agent strategy creation stories |
| **Ordering Note** | Must be Accepted before ADR-0009. ADR-0009.runBacktest() takes a Strategy validated by this ADR's validateStrategy(). |

## Context

### Problem Statement

EP04 requires a YAML-based strategy definition language (DSL v1.0) with:
1. **10 top-level sections** (version, metadata, universe, schedule, data, indicators, signals, position_sizing, risk_management, execution, backtest) — each with typed fields and constraints.
2. **JSON Schema (draft-07) strict validation** — no unknown fields, strict types, required fields enforced.
3. **Strategy lifecycle state machine** — Draft → Validated → Backtested → PaperTrading → Live (5 states, 4 forward transitions, rollback to Draft only).
4. **Signal expression parser** — AND/OR/NOT/>/</= operators on indicator values.
5. **8+ built-in indicators** — SMA, EMA, RSI, MACD, Bollinger, ATR, OBV, VWAP.
6. **3 position sizing methods** — percent_equity, fixed_amount, kelly.
7. **Risk management** — stop_loss (3 types), take_profit (3 types), max_drawdown trigger.
8. **Strategy versioning** — each modification creates a new D1 row with incremented version.

Without a canonical schema ADR:
- Multiple validators could diverge (front-end YAML editor vs Worker-side validation).
- Lifecycle transitions could be enforced inconsistently (UI allows Live without Backtested).
- Indicator naming could drift between DSL definition and BacktestEngine computation.

### Constraints

- **Cloudflare Workers stateless**: Validation function is pure; no module-level schema cache (per FP-0001). JSON Schema document loaded per-request or bundled at deploy time.
- **YAML parsing**: Use `js-yaml` (or equivalent) for YAML→JSON; must not execute arbitrary code (safeLoad only).
- **JSON Schema validation**: Use `ajv` (draft-07) with strict mode (`allErrors: false` for performance, `strict: true` for no additional properties).
- **D1 storage**: Strategy YAML stored as TEXT in `strategies.yaml_dsl` column (per ADR-0011 Migration 004). JSON Schema validation result cached in `strategies.validation_status` (pending/valid/invalid).
- **Signal expressions**: Use `jsep` (JavaScript Expression Parser) for parsing — no eval(), no Function().

## Decision

**Adopt the DSL v1.0 schema defined in `docs/spec/strategy_dsl_spec.md` as canonical. Validation is a 3-stage pipeline: YAML parse → JSON Schema validate → expression parse. Lifecycle FSM is a closed 5-state machine with forward-only transitions (except rollback to Draft).**

### DSL Schema Structure (canonical)

```yaml
version: "1.0"
metadata:
  name: string          # required
  author: string        # required
  description: string   # optional
  created_at: ISO8601   # required

universe:
  type: "single" | "multi" | "index"  # required
  symbols: [string]     # required, min 1
  index?: "SP500" | "NASDAQ100"

schedule:
  frequency: "daily" | "hourly" | "on_event"  # required
  timezone: string      # required, IANA tz

data:
  source: "mock" | "yahoo" | "alpha" | "polygon"  # required
  timeframe: "1m" | "5m" | "15m" | "1h" | "1d" | "1w"  # required
  lookback_days: integer  # required, min 30

indicators:
  - name: string        # must match built-in registry
    params: object      # indicator-specific parameters

signals:
  entry: string         # jsep expression referencing indicator names
  exit?: string         # optional, same syntax

position_sizing:
  method: "percent_equity" | "fixed_amount" | "kelly"
  params: object        # method-specific parameters

risk_management:
  stop_loss?: { type: "fixed"|"trailing"|"atr_based", value: number }
  take_profit?: { type: "fixed"|"trailing"|"risk_ratio", value: number }
  max_positions: integer  # min 1
  max_drawdown: number    # 0-1, trigger level

execution:
  order_type: "market" | "limit"
  slippage_bps: number    # default 5
  commission_bps: number  # default 0

backtest:
  start_date: ISO8601
  end_date: ISO8601
  initial_capital: number  # min 1000
  benchmark: string        # ticker for comparison
  sample_split?: number    # 0-1, default 0.7 (70/30 in/out-of-sample)
```

### Validation Pipeline (3 stages)

```
YAML string
    │
    ▼  Stage 1: js-yaml safeLoad()
JSON object
    │
    ▼  Stage 2: ajv.validate(schema, json)
Validated JSON  ──── if invalid → { valid: false, errors: AjvError[] }
    │
    ▼  Stage 3: jsep.parse(signal.entry) + jsep.parse(signal.exit?)
Parsed signals  ──── if parse fails → { valid: false, errors: ParseError[] }
    │
    ▼
{ valid: true, strategy: ValidatedStrategy }
```

**Key rule**: All 3 stages must pass for `validation_status = "valid"`. Any failure blocks lifecycle transition to Validated.

### Strategy Lifecycle FSM

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
  [*] ──► Draft ──► Validated ──► Backtested ──► PaperTrading ──► Live
              ▲                                          │
              │              (rollback)                  │
              └──────────────────────────────────────────┘
              │                                          │
              └─── (edit: any state → Draft) ────────────┘
```

| Transition | Guard | Action |
|------------|-------|--------|
| Draft → Validated | `validateStrategy(yaml) = { valid: true }` | Set `validation_status = "valid"`, `validated_at = now()` |
| Validated → Backtested | `backtest_result_id IS NOT NULL` | Set `lifecycle_status = "backtested"` (set by ADR-0009) |
| Backtested → PaperTrading | User confirmation | Set `lifecycle_status = "paper_trading"` |
| PaperTrading → Live | User confirmation + risk check | Set `lifecycle_status = "live"` |
| Any → Draft | User edits YAML | Increment version, reset `validation_status = "pending"` |

**Critical rule**: Strategy cannot transition to Live without passing through Backtested. This prevents untested strategies from executing real orders.

### Built-in Indicator Registry

| # | Name | Parameters | Output |
|---|------|-----------|--------|
| 1 | SMA | `{ period: integer }` | Single value series |
| 2 | EMA | `{ period: integer }` | Single value series |
| 3 | RSI | `{ period: integer, default 14 }` | Single value series (0–100) |
| 4 | MACD | `{ fast: 12, slow: 26, signal: 9 }` | 3 series (macd, signal, histogram) |
| 5 | Bollinger | `{ period: 20, std_dev: 2 }` | 3 series (upper, middle, lower) |
| 6 | ATR | `{ period: integer, default 14 }` | Single value series |
| 7 | OBV | `{}` | Single value series (cumulative volume) |
| 8 | VWAP | `{}` | Single value series |

Signal expressions reference indicator outputs by `indicator_name` (single-output) or `indicator_name.field` (multi-output, e.g., `macd.histogram`).

### Position Sizing Methods

| Method | Parameters | Formula |
|--------|-----------|---------|
| `percent_equity` | `{ percent: number }` | `shares = (equity × percent) / price` |
| `fixed_amount` | `{ amount: number }` | `shares = amount / price` |
| `kelly` | `{ fraction: number, default 0.5 }` | `f* = (p×b - q) / b; shares = (equity × f* × fraction) / price` where p=win_rate, b=avg_win/avg_loss, q=1-p |

### Key Interfaces

```typescript
// web/src/lib/strategy/schema.ts

/** 3-stage validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  strategy?: ValidatedStrategy;  // present only if valid=true
}

export interface ValidationError {
  stage: "yaml_parse" | "json_schema" | "expression_parse";
  message: string;
  path?: string;  // JSON path for schema errors
}

/** Canonical validated strategy shape */
export interface ValidatedStrategy {
  version: "1.0";
  metadata: StrategyMetadata;
  universe: Universe;
  schedule: Schedule;
  data: DataConfig;
  indicators: IndicatorConfig[];
  signals: SignalConfig;
  position_sizing: PositionSizingConfig;
  risk_management: RiskManagementConfig;
  execution: ExecutionConfig;
  backtest: BacktestConfig;
}

/** Lifecycle state machine */
export type StrategyLifecycle =
  | "draft"
  | "validated"
  | "backtested"
  | "paper_trading"
  | "live";

export interface StrategyLifecycleTransition {
  from: StrategyLifecycle;
  to: StrategyLifecycle;
  guard: (strategy: ValidatedStrategy, ctx: TransitionContext) => boolean;
  action: (strategy: ValidatedStrategy, ctx: TransitionContext) => void;
}

// Validation function — pure, no side effects
export function validateStrategy(yamlString: string): ValidationResult;
```

### Critical Implementation Rules

1. **YAML parsing must use safe mode**: `js-yaml.load(yaml, { schema: DEFAULT_SAFE_SCHEMA })`. Never use `yaml.load()` without schema option — arbitrary code execution risk.
2. **JSON Schema strict mode**: `ajv` with `strict: true` — reject additional properties, enforce required fields. No "additionalProperties: true" anywhere in the schema.
3. **Expression parsing must not eval()**: `jsep.parse()` returns AST — never convert to eval-able string.
4. **Lifecycle guard enforcement**: The lifecycle FSM must be enforced server-side (Worker), not client-side only. Client can suggest transitions; server must verify guard before writing D1.
5. **Version immutability**: Once a strategy version is in state "backtested" or later, its YAML is immutable. Edits create a new version (new D1 row with version+1). This prevents backtest-result mismatch.
6. **Indicator name registry is closed**: Only the 8 built-in indicators above are valid in DSL v1.0. Custom indicators are Phase 2 (requires ADR amendment).

## GDD Requirements Addressed

| TR-ID | Requirement | Coverage |
|-------|-------------|----------|
| TR-EP04-001 | YAML DSL v1.0 schema with 10 sections | ✅ Full — canonical schema defined above |
| TR-EP04-002 | JSON Schema strict validation | ✅ Full — 3-stage pipeline with ajv strict mode |
| TR-EP04-003 | Strategy lifecycle FSM (5 states) | ✅ Full — closed FSM with guards |
| TR-EP04-006 | Built-in indicator library ≥8 | ✅ Full — 8 indicators in registry |
| TR-EP04-007 | Signal expression parser (jsep) | ✅ Full — jsep with AST, no eval() |
| TR-EP04-008 | Position sizing 3 methods | ✅ Full — percent_equity/fixed_amount/kelly |
| TR-EP04-009 | Risk management (stop_loss 3 types, take_profit 3 types, max_drawdown) | ✅ Full — all 3+3 types + max_drawdown |
| TR-EP04-015 | 3 example strategies | ✅ Full — defined in strategy_dsl_spec.md |
| TR-EP04-016 | Strategy versioning | ✅ Full — version immutability + new version on edit |
| TR-EP04-010 | D1 schema: strategies + backtest_results | ✅ Covered by ADR-0011 Migration 004 |
| TR-EP04-011 | Mock mode backtest data | ✅ Covered by ADR-0001 |

## Consequences

### Positive

- Canonical schema prevents front-end/Worker validation drift.
- Lifecycle FSM with server-side guards prevents untested strategies from going Live.
- 3-stage validation catches errors early (malformed YAML → schema violations → bad expressions).
- Version immutability ensures backtest results always match the strategy that produced them.

### Negative

- YAML parsing adds ~50ms to validation on Workers (acceptable — not in hot path).
- JSON Schema strict mode means any DSL extension requires schema update (intentional — prevents accidental fields).
- Kelly criterion position sizing requires win_rate/avg_win/avg_loss from backtest — not available at validation time. Kelly params must be backtest-derived (ADR-0009 provides these).

### Risks

- **jsep expression complexity**: Complex nested expressions (e.g., `(rsi < 30 AND macd.histogram > 0) OR (bollinger.lower > close)`) may hit jsep parse limits. Mitigation: document max expression depth (3 levels), test with all 3 example strategies.
- **YAML schema evolution**: v1.1 additions will need backward compat. Mitigation: `version` field enables future schema dispatching.

---

> **Last Updated**: 2026-07-19
