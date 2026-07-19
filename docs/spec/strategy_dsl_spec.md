# Strategy DSL Specification

**文档类型**: 技术规格 / DSL 语法
**文档性质标签**: [B] + [C]
**最后更新**: 2026-07-19
**关联**: Epic 04 Strategy DSL

---

## 1. 概述

nova-invest Strategy DSL v1.0 是用于描述交易策略的声明式 YAML/JSON DSL。

### 1.1 设计原则

1. **声明式**：描述"做什么"，不描述"怎么做"
2. **人类可读**：YAML 优先
3. **机器可校验**：JSON Schema 严格校验
4. **可组合**：可作为 Playbook 一部分（Epic 08）
5. **可回测**：与 BacktestEngine 集成
6. **可分享**：可序列化为 R2 对象

---

## 2. DSL 顶层结构

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
  sample_split?: number  # 0-1, 默认 0.7
```

---

## 3. 字段规范

### 3.1 `version`

- 类型：string
- 必须：是
- 允许值：`"1.0"`（DSL 语义版本，与 Playbook SemVer 不同）

### 3.2 `metadata`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| name | string | 是 | 策略名 |
| author | string | 是 | 作者 |
| description | string | 否 | 描述 |
| created_at | ISO8601 | 是 | 创建时间 |

### 3.3 `universe`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| type | enum | 是 | single/multi/index |
| symbols | string[] | type != index 时 | 标的列表 |
| index | enum | type = index 时 | SP500/NASDAQ100 |

**校验规则**：
- `type=single` 时 `symbols.length == 1`
- `type=multi` 时 `symbols.length >= 2`
- `type=index` 时 `symbols` 必须为空，`index` 必填

### 3.4 `schedule`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| frequency | enum | 是 | daily/hourly/on_event |
| timezone | string | 是 | IANA 时区，如 "America/New_York" |

### 3.5 `data`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| source | enum | 是 | mock/yahoo/alpha/polygon |
| timeframe | enum | 是 | 1m/5m/15m/1h/1d/1w |
| lookback_days | integer | 是 | ≥ 30 |

### 3.6 `indicators`

数组，每个元素：

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| name | string | 是 | 唯一标识，用于 signals 引用 |
| type | enum | 是 | SMA/EMA/RSI/MACD/Bollinger/ATR/OBV/VWAP |
| params | object | 是 | 类型相关参数 |

#### 指标参数表

| 类型 | 必填参数 | 可选参数 |
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

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| entry | Condition | 是 | 入场条件 |
| exit | Condition | 否 | 出场条件 |

#### `Condition` 结构

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| condition | string | 是 | 表达式，如 `sma_50 > sma_200 AND rsi_14 < 30` |
| operator | enum | 是 | crossover/crossunder/gt/lt/eq |

#### 表达式语法

支持运算符：

- 比较：`>`, `<`, `>=`, `<=`, `==`, `!=`
- 逻辑：`AND`, `OR`, `NOT`
- 算术：`+`, `-`, `*`, `/`
- 字段引用：`sma_50`, `close`, `volume` 等

**BNF 文法**：

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

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| method | enum | 是 | percent_equity/fixed_amount/kelly |
| params | object | 是 | 方法相关参数 |

#### 各方法参数

| 方法 | 参数 |
|---|---|
| percent_equity | percent: number (0-100) |
| fixed_amount | amount: number (USD) |
| kelly | win_rate: number (0-1), win_loss_ratio: number |

### 3.9 `risk_management`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| stop_loss | StopLossConfig | 否 | 止损 |
| take_profit | TakeProfitConfig | 否 | 止盈 |
| max_positions | integer | 是 | 最大持仓数 |
| max_drawdown | number | 是 | 最大回撤（百分比） |

#### `StopLossConfig`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| type | enum | 是 | percent/absolute/atr_multiple |
| value | number | 是 | 止损阈值 |

#### `TakeProfitConfig`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| type | enum | 是 | percent/absolute/risk_reward_ratio |
| value | number | 是 | 止盈阈值 |

### 3.10 `execution`

| 字段 | 类型 | 必须 | 默认 | 说明 |
|---|---|---|---|---|
| order_type | enum | 是 | market | market/limit |
| slippage_bps | number | 是 | 5 | 滑点（基点） |
| commission_bps | number | 是 | 1 | 佣金（基点） |

### 3.11 `backtest`

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| start_date | ISO8601 | 是 | 起始日期 |
| end_date | ISO8601 | 是 | 结束日期 |
| initial_capital | number | 是 | 初始资金（USD） |
| benchmark | string | 是 | 基准，如 "SPY" |
| sample_split | number | 否 | in/out-of-sample 分割，默认 0.7 |

---

## 4. 完整 JSON Schema

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

## 5. 完整示例

### 5.1 简单双均线策略

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

### 5.2 RSI 超卖反弹策略

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

### 5.3 Bollinger 突破策略

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

## 6. 校验错误码

| 错误码 | 含义 |
|---|---|
| DSL_001 | 缺少必填字段 |
| DSL_002 | 字段类型错误 |
| DSL_003 | 字段值不在允许范围 |
| DSL_004 | universe.type 与 symbols 长度不匹配 |
| DSL_005 | indicator.name 重复 |
| DSL_006 | signals.condition 引用未定义的 indicator |
| DSL_007 | signals.operator 不匹配 condition 类型 |
| DSL_008 | position_sizing.params 缺失 |
| DSL_009 | risk_management.max_drawdown > 100 |
| DSL_010 | backtest.start_date >= end_date |
| DSL_011 | backtest.initial_capital < 1000 |
| DSL_012 | 表达式语法错误 |
| DSL_013 | additional properties 不允许 |

---

## 7. DSL ↔ Playbook 关系

| 项 | Strategy DSL | Playbook |
|---|---|---|
| 范围 | 仅策略本身 | 策略 + 元数据 + 叙事 + 依赖 + 版本 |
| 文件 | 单个 YAML | 含 dsl_ref 引用 或 dsl_inline |
| 版本 | 无版本概念 | SemVer 版本化 |
| 组合 | 不支持 | 支持 parallel/sequential/conditional |
| 分享 | 不直接分享 | 通过 Epic 07 社区分享 |
| 存储 | 可存 D1 (strategies.dsl_yaml) | YAML 存 R2 |

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-07-19 | 初稿，含完整字段规范、JSON Schema、3 个示例、错误码 |
