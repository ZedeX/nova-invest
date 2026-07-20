# Strategy DSL Specification

**Document type**: Technical spec / DSL syntax
**Document nature tag**: [B] + [C]
**Last updated**: 2026-07-19
**Related**: Epic 04 Strategy DSL

---

## 1. Overview

nova-invest Strategy DSL v1.0 is a declarative YAML/JSON DSL used to describe trading strategies.

### 1.1 Design Principles

1. **Declarative**: describes "what to do", not "how to do it"
2. **Human-readable**: YAML first
3. **Machine-verifiable**: strict JSON Schema validation
4. **Composable**: can be part of a Playbook (Epic 08)
5. **Backtestable**: integrates with BacktestEngine
6. **Shareable**: serializable as R2 object

---

## 2. DSL Top-Level Structure

```yaml
version: "1.0"
metadata:
  name: string
  author: string
  description: string
  created_at: ISO8601

universe:
  type: "single" | "multi" | "index"
  symbols: [string]
  index?: "SP500" | "NASDAQ100"

schedule:
  frequency: "daily" | "hourly" | "on_event"
  timezone: string

data:
  source: "mock" | "yahoo" | "alpha" | "polygon"
  timeframe: "1m" | "5m" | "15m" | "1h" | "1d" | "1w"
  lookback_days: integer

indicators: [Indicator]

signals:
  entry: Condition
  exit?: Condition

position_sizing:
  method: "percent_equity" | "fixed_amount" | "kelly"
  params: object

risk_management:
  stop_loss?: StopLossConfig
  take_profit?: TakeProfitConfig
  max_positions: integer
  max_drawdown: number

execution:
  order_type: "market" | "limit"
  slippage_bps: number
  commission_bps: number

backtest:
  start_date: ISO8601
  end_date: ISO8601
  initial_capital: number
  benchmark: string
  sample_split?: number  # 0-1, default 0.7
```

---

## 3. Field Specifications

### 3.1 `version`

- Type: string
- Required: Yes
- Allowed values: `"1.0"` (DSL semantic version, different from Playbook SemVer)

### 3.2 `metadata`

| Field | Type | Required | Description |
|---|---|---|---|
| name | string | Yes | Strategy name |
| author | string | Yes | Author |
| description | string | No | Description |
| created_at | ISO8601 | Yes | Creation time |

### 3.3 `universe`

| Field | Type | Required | Description |
|---|---|---|---|
| type | enum | Yes | single/multi/index |
| symbols | string[] | when type != index | Symbol list |
| index | enum | when type = index | SP500/NASDAQ100 |

**Validation rules**:
- When `type=single`, `symbols.length == 1`
- When `type=multi`, `symbols.length >= 2`
- When `type=index`, `symbols` must be empty, `index` is required

### 3.4 `schedule`

| Field | Type | Required | Description |
|---|---|---|---|
| frequency | enum | Yes | daily/hourly/on_event |
| timezone | string | Yes | IANA timezone, e.g. "America/New_York" |

### 3.5 `data`

| Field | Type | Required | Description |
|---|---|---|---|
| source | enum | Yes | mock/yahoo/alpha/polygon |
| timeframe | enum | Yes | 1m/5m/15m/1h/1d/1w |
| lookback_days | integer | Yes | ≥ 30 |

### 3.6 `indicators`

Array, each element:

| Field | Type | Required | Description |
|---|---|---|---|
| name | string | Yes | Unique identifier, used for signals reference |
| type | enum | Yes | SMA/EMA/RSI/MACD/Bollinger/ATR/OBV/VWAP |
| params | object | Yes | Type-related parameters |

#### Indicator Parameter Table

| Type | Required parameters | Optional parameters |
|---|---|---|
| SMA | period: int, field: "close"/"open"/"high"/"low"/"volume" | - |
| EMA | period: int, field | - |
| RSI | period: int | - |
| MACD | fast: int, slow: int, signal: int | - |
| Bollinger | period: int, stdDev: number | - |
| ATR | period: int | - |
| OBV | - | - |
| VWAP | - | - |

### 3.7 `signals`

| Field | Type | Required | Description |
|---|---|---|---|
| entry | Condition | Yes | Entry condition |
| exit | Condition | No | Exit condition |

#### `Condition` Structure

| Field | Type | Required | Description |
|---|---|---|---|
| condition | string | Yes | Expression, e.g. `sma_50 > sma_200 AND rsi_14 < 30` |
| operator | enum | Yes | crossover/crossunder/gt/lt/eq |

#### Expression Syntax

Supported operators:

- Comparison: `>`, `<`, `>=`, `<=`, `==`, `!=`
- Logical: `AND`, `OR`, `NOT`
- Arithmetic: `+`, `-`, `*`, `/`
- Field reference: `sma_50`, `close`, `volume`, etc.

**BNF Grammar**:

```bnf
expr        := or_expr
or_expr     := and_expr ("OR" and_expr)*
and_expr    := not_expr ("AND" not_expr)*
not_expr    := "NOT" not_expr | comparison
comparison  := additive (comp_op additive)?
comp_op     := ">" | "<" | ">=" | "<=" | "==" | "!="
additive    := multiplicative (("+" | "-") multiplicative)*
multiplicative := primary (("*" | "/") primary)*
primary     := number | identifier | "(" expr ")"
identifier  := [a-zA-Z_][a-zA-Z0-9_]*
number      := [0-9]+("." [0-9]+)?
```

### 3.8 `position_sizing`

| Field | Type | Required | Description |
|---|---|---|---|
| method | enum | Yes | percent_equity/fixed_amount/kelly |
| params | object | Yes | Method-related parameters |

#### Method Parameters

| Method | Parameters |
|---|---|
| percent_equity | percent: number (0-100) |
| fixed_amount | amount: number (USD) |
| kelly | win_rate: number (0-1), win_loss_ratio: number |

### 3.9 `risk_management`

| Field | Type | Required | Description |
|---|---|---|---|
| stop_loss | StopLossConfig | No | Stop loss |
| take_profit | TakeProfitConfig | No | Take profit |
| max_positions | integer | Yes | Maximum number of positions |
| max_drawdown | number | Yes | Maximum drawdown (percentage) |

#### `StopLossConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| type | enum | Yes | percent/absolute/atr_multiple |
| value | number | Yes | Stop loss threshold |

#### `TakeProfitConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| type | enum | Yes | percent/absolute/risk_reward_ratio |
| value | number | Yes | Take profit threshold |

### 3.10 `execution`

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| order_type | enum | Yes | market | market/limit |
| slippage_bps | number | Yes | 5 | Slippage (basis points) |
| commission_bps | number | Yes | 1 | Commission (basis points) |

### 3.11 `backtest`

| Field | Type | Required | Description |
|---|---|---|---|
| start_date | ISO8601 | Yes | Start date |
| end_date | ISO8601 | Yes | End date |
| initial_capital | number | Yes | Initial capital (USD) |
| benchmark | string | Yes | Benchmark, e.g. "SPY" |
| sample_split | number | No | in/out-of-sample split, default 0.7 |

---

## 4. Complete JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NovaInvest Strategy DSL v1.0",
  "type": "object",
  "required": ["version", "metadata", "universe", "schedule", "data",
               "indicators", "signals", "position_sizing",
               "risk_management", "execution", "backtest"],
  "properties": {
    "version": { "type": "string", "enum": ["1.0"] },
    "metadata": {
      "type": "object",
      "required": ["name", "author", "created_at"],
      "properties": {
        "name": { "type": "string", "minLength": 1, "maxLength": 100 },
        "author": { "type": "string" },
        "description": { "type": "string" },
        "created_at": { "type": "string", "format": "date-time" }
      }
    },
    "universe": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "enum": ["single", "multi", "index"] },
        "symbols": {
          "type": "array",
          "items": { "type": "string", "pattern": "^[A-Z]{1,5}$" }
        },
        "index": { "enum": ["SP500", "NASDAQ100"] }
      }
    },
    "schedule": {
      "type": "object",
      "required": ["frequency", "timezone"],
      "properties": {
        "frequency": { "enum": ["daily", "hourly", "on_event"] },
        "timezone": { "type": "string" }
      }
    },
    "data": {
      "type": "object",
      "required": ["source", "timeframe", "lookback_days"],
      "properties": {
        "source": { "enum": ["mock", "yahoo", "alpha", "polygon"] },
        "timeframe": { "enum": ["1m", "5m", "15m", "1h", "1d", "1w"] },
        "lookback_days": { "type": "integer", "minimum": 30 }
      }
    },
    "indicators": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type", "params"],
        "properties": {
          "name": { "type": "string", "pattern": "^[a-z_][a-z0-9_]*$" },
          "type": { "enum": ["SMA", "EMA", "RSI", "MACD", "Bollinger", "ATR", "OBV", "VWAP"] },
          "params": { "type": "object" }
        }
      }
    },
    "signals": {
      "type": "object",
      "required": ["entry"],
      "properties": {
        "entry": { "$ref": "#/definitions/condition" },
        "exit": { "$ref": "#/definitions/condition" }
      }
    },
    "position_sizing": {
      "type": "object",
      "required": ["method", "params"],
      "properties": {
        "method": { "enum": ["percent_equity", "fixed_amount", "kelly"] },
        "params": { "type": "object" }
      }
    },
    "risk_management": {
      "type": "object",
      "required": ["max_positions", "max_drawdown"],
      "properties": {
        "stop_loss": { "$ref": "#/definitions/stopConfig" },
        "take_profit": { "$ref": "#/definitions/stopConfig" },
        "max_positions": { "type": "integer", "minimum": 1 },
        "max_drawdown": { "type": "number", "minimum": 0, "maximum": 100 }
      }
    },
    "execution": {
      "type": "object",
      "required": ["order_type", "slippage_bps", "commission_bps"],
      "properties": {
        "order_type": { "enum": ["market", "limit"] },
        "slippage_bps": { "type": "number", "minimum": 0, "maximum": 100 },
        "commission_bps": { "type": "number", "minimum": 0, "maximum": 50 }
      }
    },
    "backtest": {
      "type": "object",
      "required": ["start_date", "end_date", "initial_capital", "benchmark"],
      "properties": {
        "start_date": { "type": "string", "format": "date" },
        "end_date": { "type": "string", "format": "date" },
        "initial_capital": { "type": "number", "minimum": 1000 },
        "benchmark": { "type": "string", "pattern": "^[A-Z]{1,5}$" },
        "sample_split": { "type": "number", "minimum": 0.5, "maximum": 0.9, "default": 0.7 }
      }
    }
  },
  "definitions": {
    "condition": {
      "type": "object",
      "required": ["condition", "operator"],
      "properties": {
        "condition": { "type": "string", "minLength": 1 },
        "operator": { "enum": ["crossover", "crossunder", "gt", "lt", "eq"] }
      }
    },
    "stopConfig": {
      "type": "object",
      "required": ["type", "value"],
      "properties": {
        "type": { "enum": ["percent", "absolute", "atr_multiple", "risk_reward_ratio"] },
        "value": { "type": "number", "minimum": 0 }
      }
    }
  },
  "additionalProperties": false
}
```

---

## 5. Complete Examples

### 5.1 Simple Dual Moving Average Strategy

```yaml
version: "1.0"
metadata:
  name: "AAPL MA Cross"
  author: "brenda@example.com"
  description: "50/200 SMA crossover on AAPL"
  created_at: "2025-12-15T10:00:00Z"

universe:
  type: "single"
  symbols: ["AAPL"]

schedule:
  frequency: "daily"
  timezone: "America/New_York"

data:
  source: "mock"
  timeframe: "1d"
  lookback_days: 250

indicators:
  - name: "sma_50"
    type: "SMA"
    params: { period: 50, field: "close" }
  - name: "sma_200"
    type: "SMA"
    params: { period: 200, field: "close" }

signals:
  entry:
    condition: "sma_50 > sma_200"
    operator: "crossover"
  exit:
    condition: "sma_50 < sma_200"
    operator: "crossunder"

position_sizing:
  method: "percent_equity"
  params: { percent: 10 }

risk_management:
  stop_loss: { type: "percent", value: 7 }
  take_profit: { type: "percent", value: 20 }
  max_positions: 5
  max_drawdown: 15

execution:
  order_type: "market"
  slippage_bps: 5
  commission_bps: 1

backtest:
  start_date: "2024-01-01"
  end_date: "2025-12-31"
  initial_capital: 100000
  benchmark: "SPY"
  sample_split: 0.7
```

### 5.2 RSI Oversold Rebound Strategy

```yaml
version: "1.0"
metadata:
  name: "NVDA RSI Oversold"
  author: "brenda@example.com"
  created_at: "2025-12-15T10:00:00Z"

universe:
  type: "single"
  symbols: ["NVDA"]

schedule: { frequency: "daily", timezone: "America/New_York" }
data: { source: "mock", timeframe: "1d", lookback_days: 100 }

indicators:
  - name: "rsi_14"
    type: "RSI"
    params: { period: 14 }

signals:
  entry: { condition: "rsi_14 < 30", operator: "lt" }
  exit:  { condition: "rsi_14 > 70", operator: "gt" }

position_sizing: { method: "percent_equity", params: { percent: 5 } }

risk_management:
  stop_loss: { type: "percent", value: 5 }
  take_profit: { type: "percent", value: 15 }
  max_positions: 3
  max_drawdown: 10

execution: { order_type: "market", slippage_bps: 5, commission_bps: 1 }

backtest:
  start_date: "2024-01-01"
  end_date: "2025-12-31"
  initial_capital: 100000
  benchmark: "SPY"
```

### 5.3 Bollinger Breakout Strategy

```yaml
version: "1.0"
metadata:
  name: "TSLA Bollinger Breakout"
  author: "alex@example.com"
  created_at: "2025-12-15T10:00:00Z"

universe:
  type: "single"
  symbols: ["TSLA"]

schedule: { frequency: "daily", timezone: "America/New_York" }
data: { source: "mock", timeframe: "1d", lookback_days: 200 }

indicators:
  - name: "bb"
    type: "Bollinger"
    params: { period: 20, stdDev: 2 }

signals:
  entry: { condition: "close > bb.upper", operator: "gt" }
  exit:  { condition: "close < bb.middle", operator: "lt" }

position_sizing: { method: "percent_equity", params: { percent: 8 } }

risk_management:
  stop_loss: { type: "percent", value: 5 }
  max_positions: 5
  max_drawdown: 12

execution: { order_type: "market", slippage_bps: 5, commission_bps: 1 }

backtest:
  start_date: "2024-01-01"
  end_date: "2025-12-31"
  initial_capital: 100000
  benchmark: "SPY"
```

---

## 6. Validation Error Codes

| Error code | Meaning |
|---|---|
| DSL_001 | Missing required field |
| DSL_002 | Field type error |
| DSL_003 | Field value not in allowed range |
| DSL_004 | universe.type and symbols length mismatch |
| DSL_005 | indicator.name duplicate |
| DSL_006 | signals.condition references undefined indicator |
| DSL_007 | signals.operator does not match condition type |
| DSL_008 | position_sizing.params missing |
| DSL_009 | risk_management.max_drawdown > 100 |
| DSL_010 | backtest.start_date >= end_date |
| DSL_011 | backtest.initial_capital < 1000 |
| DSL_012 | Expression syntax error |
| DSL_013 | Additional properties not allowed |

---

## 7. DSL ↔ Playbook Relationship

| Item | Strategy DSL | Playbook |
|---|---|---|
| Scope | Strategy only | Strategy + metadata + narrative + dependencies + version |
| File | Single YAML | Contains dsl_ref reference or dsl_inline |
| Version | No version concept | SemVer versioned |
| Composition | Not supported | Supports parallel/sequential/conditional |
| Sharing | Not directly shared | Shared via Epic 07 community |
| Storage | Can be stored in D1 (strategies.dsl_yaml) | YAML stored in R2 |

---

## 8. Version History

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-07-19 | Initial draft, including complete field specs, JSON Schema, 3 examples, error codes |
