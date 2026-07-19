# API Specification

**文档类型**: 技术规格 / API 接口
**文档性质标签**: [B] + [C]
**最后更新**: 2026-07-19
**关联**: 各 Epic 的 API 接口聚合

---

## 1. 概述

nova-invest API 基于 Cloudflare Workers，RESTful 风格，JSON 格式。

### 1.1 Base URL

- 本地开发：`http://localhost:8787`
- 生产：`https://nova-invest.<account>.workers.dev`

### 1.2 通用响应格式

```typescript
interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: object;
  };
  meta?: {
    request_id: string;
    timestamp: string;
    mock_mode: boolean;  // USE_MOCK 状态
  };
}
```

### 1.3 鉴权

Phase 1.5 之前：无鉴权（Mock 模式默认 mock-user-1）
Phase 2：JWT Bearer Token

```
Authorization: Bearer <token>
```

---

## 2. Data Layer API (Epic 02)

### 2.1 获取 K 线

```http
GET /api/data/klines?symbol=AAPL&timeframe=1d&from=2024-01-01&to=2025-12-31
```

**Query 参数**：

| 参数 | 类型 | 必须 | 说明 |
|---|---|---|---|
| symbol | string | 是 | 标的代码 |
| timeframe | enum | 是 | 1m/5m/15m/1h/1d/1w |
| from | ISO date | 是 | 起始日期 |
| to | ISO date | 是 | 结束日期 |

**响应**：

```json
{
  "data": {
    "ticker": "AAPL",
    "timeframe": "1d",
    "source": "mock",  // 或 "yahoo" / "r2_cache"
    "data": [
      { "t": "2024-01-02", "o": 187.15, "h": 188.44, "l": 186.86, "c": 187.31, "v": 82488700 }
    ]
  }
}
```

### 2.2 获取实时报价

```http
GET /api/data/quote?symbol=AAPL
```

**响应**：

```json
{
  "data": {
    "symbol": "AAPL",
    "bid": 187.45,
    "ask": 187.50,
    "last": 187.48,
    "change": 0.17,
    "change_percent": 0.09,
    "volume": 52341200,
    "timestamp": "2025-12-15T20:00:00Z"
  }
}
```

### 2.3 标的搜索

```http
GET /api/data/symbols/search?q=Apple
```

### 2.4 获取基本面

```http
GET /api/data/fundamentals?symbol=AAPL&period=2024-Q4
```

### 2.5 SSE 行情订阅（Phase 2）

```http
GET /api/data/stream/AAPL
Accept: text/event-stream
```

---

## 3. Ask Agent API (Epic 03)

### 3.1 提交问答

```http
POST /api/ask
Content-Type: application/json

{
  "query": "NVDA 当前价格",
  "session_id": "sess_xxx",
  "user_id": "u_xxx"
}
```

**响应（同步）**：

```json
{
  "data": {
    "answer": {
      "summary": "NVDA 当前价格为 $187.31（截至 2025-12-15 收盘）。",
      "numeric_facts": [
        { "value": 187.31, "unit": "USD", "source": "yahoo",
          "quote": "AAPL Close 187.31 2025-12-15", "confidence": 0.95 }
      ],
      "citations": [
        { "source": "yahoo", "url": "https://finance.yahoo.com/quote/NVDA", "quote": "..." }
      ],
      "confidence": 0.95,
      "intent": "simple_qa",
      "cost": { "credits_used": 1, "model": "haiku-tier" }
    }
  }
}
```

### 3.2 流式响应（SSE）

```http
POST /api/ask/stream
Accept: text/event-stream
```

### 3.3 获取对话历史

```http
GET /api/ask/history?session_id=sess_xxx&limit=50
```

### 3.4 更新用户画像

```http
PATCH /api/ask/profile
{
  "risk_tolerance": "moderate",
  "sectors": ["tech", "healthcare"]
}
```

---

## 4. Strategy DSL API (Epic 04)

### 4.1 创建策略

```http
POST /api/strategy
Content-Type: application/json

{
  "name": "NVDA MA Cross",
  "dsl_yaml": "version: \"1.0\"\nmetadata:..."
}
```

**响应**：

```json
{
  "data": {
    "id": "str_xxx",
    "status": "draft"
  }
}
```

### 4.2 校验策略

```http
POST /api/strategy/validate
{
  "dsl_yaml": "..."
}
```

**响应**：

```json
{
  "data": {
    "valid": true,
    "errors": []
  }
}
```

或

```json
{
  "data": {
    "valid": false,
    "errors": [
      { "code": "DSL_001", "field": "universe.symbols", "message": "symbols is required" }
    ]
  }
}
```

### 4.3 运行回测

```http
POST /api/strategy/:id/backtest
{
  "start_date": "2024-01-01",
  "end_date": "2025-12-31",
  "initial_capital": 100000,
  "benchmark": "SPY",
  "sample_split": 0.7
}
```

**响应**：

```json
{
  "data": {
    "backtest_id": "bt_xxx",
    "status": "running",
    "estimated_completion": "2025-12-15T10:00:30Z"
  }
}
```

### 4.4 查询回测结果

```http
GET /api/strategy/:id/backtest/:backtest_id
```

**响应**：

```json
{
  "data": {
    "status": "completed",
    "result": {
      "trades": [
        { "entry_date": "2024-03-15", "entry_price": 170.5, "exit_date": "2024-06-20",
          "exit_price": 195.2, "return": 14.5, "return_pct": 14.5 }
      ],
      "equity_curve": [
        { "date": "2024-01-02", "equity": 100000 },
        { "date": "2024-01-03", "equity": 100250 }
      ],
      "metrics": {
        "total_return": 23.5,
        "cagr": 11.7,
        "sharpe_ratio": 1.42,
        "max_drawdown": 8.3,
        "win_rate": 58,
        "profit_factor": 1.8,
        "sortino_ratio": 1.6,
        "calmar_ratio": 1.4
      },
      "benchmark_return": 18.2,
      "alpha": 5.3,
      "beta": 1.15,
      "sample_split": {
        "in_sample": { "period": "2024-01-01 to 2025-03-31", "sharpe": 1.8 },
        "out_of_sample": { "period": "2025-04-01 to 2025-12-31", "sharpe": 1.1 }
      }
    }
  }
}
```

---

## 5. Broker API (Epic 06)

### 5.1 获取账户

```http
GET /api/broker/account
```

### 5.2 下单

```http
POST /api/broker/orders
{
  "symbol": "AAPL",
  "side": "buy",
  "type": "market",
  "quantity": 100,
  "strategy_id": "str_xxx"  // 可选
}
```

### 5.3 撤单

```http
DELETE /api/broker/orders/:order_id
```

### 5.4 查询订单

```http
GET /api/broker/orders?status=pending
```

### 5.5 查询持仓

```http
GET /api/broker/positions
```

### 5.6 查询成交

```http
GET /api/broker/trades?from=2025-12-01&to=2025-12-31
```

---

## 6. Playbook API (Epic 08)

### 6.1 创建 Playbook

```http
POST /api/playbooks
{
  "title": "NVDA MA Cross Playbook",
  "kind": "strategy",
  "dsl_yaml": "...",
  "narrative": {
    "why": "...",
    "how": "...",
    "risks": ["..."]
  }
}
```

### 6.2 获取 Playbook

```http
GET /api/playbooks/:id?version=1.2.0
```

### 6.3 发布新版本

```http
POST /api/playbooks/:id/versions
{
  "version": "1.3.0",
  "changelog": "Tuned SMA periods",
  "yaml": "..."
}
```

### 6.4 创建组合 Playbook

```http
POST /api/playbooks/:id/compose
{
  "composition": {
    "type": "parallel",
    "allocation": [
      { "playbook_id": "pb_a", "weight": 0.5 },
      { "playbook_id": "pb_b", "weight": 0.3 },
      { "playbook_id": "pb_c", "weight": 0.2 }
    ]
  }
}
```

### 6.5 用户安装 Playbook

```http
POST /api/playbooks/:id/install
```

### 6.6 列出已安装

```http
GET /api/playbooks/installed
```

---

## 7. Community API (Epic 07)

### 7.1 发布到社区

```http
POST /api/community/publish
{
  "playbook_id": "pb_xxx",
  "version": "1.0.0",
  "title": "NVDA MA Cross",
  "description": "...",
  "tags": ["momentum", "single-stock"]
}
```

### 7.2 浏览 Feed

```http
GET /api/community/feed?sort=recent&limit=20&offset=0
```

**Query 参数**：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| sort | enum | recent | recent/popular/top_rated |
| limit | int | 20 | 1-100 |
| offset | int | 0 | 分页 |
| tag | string | - | 过滤标签 |

### 7.3 搜索

```http
GET /api/community/search?q=momentum&tag=momentum
```

### 7.4 获取详情

```http
GET /api/community/:package_id
```

### 7.5 安装 Playbook

```http
POST /api/community/:package_id/install
```

### 7.6 评分

```http
POST /api/community/:package_id/rate
{
  "rating": 5
}
```

### 7.7 评论

```http
POST /api/community/:package_id/comments
{
  "content": "Great strategy!",
  "parent_id": null  // 嵌套回复时填父评论 ID
}
```

### 7.8 举报

```http
POST /api/community/:package_id/report
{
  "reason": "plagiarism",
  "description": "This is a copy of my pb_xxx"
}
```

---

## 8. Credits API (Appendix A)

### 8.1 查询余额

```http
GET /api/credits/balance
```

**响应**：

```json
{
  "data": {
    "user_id": "u_xxx",
    "period": "2026-07",
    "plan": "pro",
    "remaining": 847,
    "used": 153,
    "granted": 1000,
    "topped_up": 0,
    "carried_over": 0,
    "forecast_burn_rate": 5.1
  }
}
```

### 8.2 扣费

```http
POST /api/credits/charge
{
  "action": "ask_simple",
  "metadata": { "session_id": "sess_xxx" }
}
```

**响应**：

```json
{
  "data": {
    "ok": true,
    "amount": 1,
    "remaining": 846,
    "degraded": false
  }
}
```

或降级：

```json
{
  "data": {
    "ok": true,
    "amount": 0,
    "remaining": 0,
    "degraded": true,
    "reason": "Insufficient credits, using degraded mode"
  }
}
```

### 8.3 查询流水

```http
GET /api/credits/transactions?from=2026-07-01&to=2026-07-31&limit=50
```

### 8.4 充值

```http
POST /api/credits/topup
{
  "amount_usd": 20
}
```

**响应**：

```json
{
  "data": {
    "order_id": "ord_xxx",
    "stripe_checkout_url": "https://checkout.stripe.com/..."
  }
}
```

### 8.5 Stripe Webhook

```http
POST /api/credits/webhook/stripe
Stripe-Signature: ...
```

---

## 9. Watchlist API (Epic 02)

### 9.1 创建 Watchlist

```http
POST /api/watchlists
{
  "name": "我的科技股"
}
```

### 9.2 列出 Watchlists

```http
GET /api/watchlists
```

### 9.3 添加标的

```http
POST /api/watchlists/:id/items
{
  "ticker": "AAPL"
}
```

### 9.4 删除标的

```http
DELETE /api/watchlists/:id/items/:ticker
```

---

## 10. Health & Status API

### 10.1 健康检查

```http
GET /api/health
```

**响应**：

```json
{
  "data": {
    "status": "ok",
    "mode": "mock",
    "version": "0.1.0",
    "services": {
      "d1": "ok",
      "r2": "ok",
      "vectorize": "ok",
      "kv": "ok"
    }
  }
}
```

### 10.2 系统状态

```http
GET /api/status
```

返回更详细的服务状态和配额使用情况。

---

## 11. 错误码总表

| 模块 | 错误码 | HTTP 状态 | 含义 |
|---|---|---|---|
| 通用 | ERR_001 | 400 | 请求参数错误 |
| 通用 | ERR_002 | 401 | 未鉴权 |
| 通用 | ERR_003 | 403 | 无权限 |
| 通用 | ERR_004 | 404 | 资源不存在 |
| 通用 | ERR_005 | 429 | 限流 |
| 通用 | ERR_006 | 500 | 内部错误 |
| 通用 | ERR_007 | 503 | 服务不可用 |
| Data | DATA_001 | 404 | 标的不存在 |
| Data | DATA_002 | 429 | 数据源限流 |
| Ask | ASK_001 | 400 | 查询无法理解 |
| Ask | ASK_002 | 503 | LLM 服务不可用 |
| Strategy | STR_001 | 400 | DSL 校验失败 |
| Strategy | STR_002 | 404 | 策略不存在 |
| Strategy | STR_003 | 409 | 状态不允许操作 |
| Broker | BRK_001 | 400 | 订单校验失败 |
| Broker | BRK_002 | 400 | 资金不足 |
| Broker | BRK_003 | 400 | 持仓不足 |
| Broker | BRK_004 | 409 | 订单状态不允许操作 |
| Playbook | PB_001 | 400 | Playbook 校验失败 |
| Playbook | PB_002 | 400 | 循环依赖 |
| Playbook | PB_003 | 400 | 组合权重不等于 1.0 |
| Playbook | PB_004 | 400 | 版本号非法 |
| Community | CM_001 | 400 | 重复发布 |
| Community | CM_002 | 429 | 发布频率超限 |
| Community | CM_003 | 404 | Playbook 已下架 |
| Credits | CR_001 | 402 | Credit 不足 |
| Credits | CR_002 | 400 | 充值金额非法 |

---

## 12. 限流策略

| 端点 | 限流 |
|---|---|
| /api/ask | 60 req/min/user |
| /api/strategy/backtest | 10 req/hour/user |
| /api/broker/orders | 100 req/hour/user |
| /api/community/* | 200 req/hour/user |
| /api/credits/topup | 5 req/hour/user |
| 其他 | 1000 req/hour/user |

---

## 13. 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-07-19 | 初稿，覆盖 8 Epic + 1 Appendix 共 50+ 端点 |
