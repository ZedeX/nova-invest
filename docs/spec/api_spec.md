# API Specification

**Document type**: Technical spec / API interface
**Document nature tag**: [B] + [C]
**Last updated**: 2026-07-19
**Related**: Aggregated API interfaces of each Epic

---

## 1. Overview

nova-invest API is built on Cloudflare Workers, RESTful style, JSON format.

### 1.1 Base URL

- Local development: `http://localhost:8787`
- Production: `https://nova-invest.<account>.workers.dev`

### 1.2 Generic response format

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
    mock_mode: boolean;  // USE_MOCK status
  };
}
```

### 1.3 Authentication

Before Phase 1.5: no auth (Mock mode defaults to mock-user-1)
Phase 2: JWT Bearer Token

```
Authorization: Bearer <token>
```

---

## 2. Data Layer API (Epic 02)

### 2.1 Get K-lines

```http
GET /api/data/klines?symbol=AAPL&timeframe=1d&from=2024-01-01&to=2025-12-31
```

**Query parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| symbol | string | Yes | Ticker symbol |
| timeframe | enum | Yes | 1m/5m/15m/1h/1d/1w |
| from | ISO date | Yes | Start date |
| to | ISO date | Yes | End date |

**Response**:

```json
{
  "data": {
    "ticker": "AAPL",
    "timeframe": "1d",
    "source": "mock",  // or "yahoo" / "r2_cache"
    "data": [
      { "t": "2024-01-02", "o": 187.15, "h": 188.44, "l": 186.86, "c": 187.31, "v": 82488700 }
    ]
  }
}
```

### 2.2 Get real-time quote

```http
GET /api/data/quote?symbol=AAPL
```

**Response**:

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

### 2.3 Symbol search

```http
GET /api/data/symbols/search?q=Apple
```

### 2.4 Get fundamentals

```http
GET /api/data/fundamentals?symbol=AAPL&period=2024-Q4
```

### 2.5 SSE quote subscription (Phase 2)

```http
GET /api/data/stream/AAPL
Accept: text/event-stream
```

---

## 3. Ask Agent API (Epic 03)

### 3.1 Submit a question

```http
POST /api/ask
Content-Type: application/json

{
  "query": "NVDA 当前价格",
  "session_id": "sess_xxx",
  "user_id": "u_xxx"
}
```

**Response (synchronous)**:

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

### 3.2 Streaming response (SSE)

```http
POST /api/ask/stream
Accept: text/event-stream
```

### 3.3 Get conversation history

```http
GET /api/ask/history?session_id=sess_xxx&limit=50
```

### 3.4 Update user profile

```http
PATCH /api/ask/profile
{
  "risk_tolerance": "moderate",
  "sectors": ["tech", "healthcare"]
}
```

---

## 4. Strategy DSL API (Epic 04)

### 4.1 Create a strategy

```http
POST /api/strategy
Content-Type: application/json

{
  "name": "NVDA MA Cross",
  "dsl_yaml": "version: \"1.0\"\nmetadata:..."
}
```

**Response**:

```json
{
  "data": {
    "id": "str_xxx",
    "status": "draft"
  }
}
```

### 4.2 Validate a strategy

```http
POST /api/strategy/validate
{
  "dsl_yaml": "..."
}
```

**Response**:

```json
{
  "data": {
    "valid": true,
    "errors": []
  }
}
```

Or

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

### 4.3 Run a backtest

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

**Response**:

```json
{
  "data": {
    "backtest_id": "bt_xxx",
    "status": "running",
    "estimated_completion": "2025-12-15T10:00:30Z"
  }
}
```

### 4.4 Query backtest result

```http
GET /api/strategy/:id/backtest/:backtest_id
```

**Response**:

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

### 5.1 Get account

```http
GET /api/broker/account
```

### 5.2 Place an order

```http
POST /api/broker/orders
{
  "symbol": "AAPL",
  "side": "buy",
  "type": "market",
  "quantity": 100,
  "strategy_id": "str_xxx"  // optional
}
```

### 5.3 Cancel an order

```http
DELETE /api/broker/orders/:order_id
```

### 5.4 Query orders

```http
GET /api/broker/orders?status=pending
```

### 5.5 Query positions

```http
GET /api/broker/positions
```

### 5.6 Query trades

```http
GET /api/broker/trades?from=2025-12-01&to=2025-12-31
```

---

## 6. Playbook API (Epic 08)

### 6.1 Create a Playbook

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

### 6.2 Get a Playbook

```http
GET /api/playbooks/:id?version=1.2.0
```

### 6.3 Publish a new version

```http
POST /api/playbooks/:id/versions
{
  "version": "1.3.0",
  "changelog": "Tuned SMA periods",
  "yaml": "..."
}
```

### 6.4 Create a composite Playbook

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

### 6.5 User installs a Playbook

```http
POST /api/playbooks/:id/install
```

### 6.6 List installed Playbooks

```http
GET /api/playbooks/installed
```

---

## 7. Community API (Epic 07)

### 7.1 Publish to community

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

### 7.2 Browse feed

```http
GET /api/community/feed?sort=recent&limit=20&offset=0
```

**Query parameters**:

| Parameter | Type | Default | Description |
|---|---|---|---|
| sort | enum | recent | recent/popular/top_rated |
| limit | int | 20 | 1-100 |
| offset | int | 0 | Pagination |
| tag | string | - | Filter tag |

### 7.3 Search

```http
GET /api/community/search?q=momentum&tag=momentum
```

### 7.4 Get details

```http
GET /api/community/:package_id
```

### 7.5 Install a Playbook

```http
POST /api/community/:package_id/install
```

### 7.6 Rate

```http
POST /api/community/:package_id/rate
{
  "rating": 5
}
```

### 7.7 Comment

```http
POST /api/community/:package_id/comments
{
  "content": "Great strategy!",
  "parent_id": null  // Fill parent comment ID for nested replies
}
```

### 7.8 Report

```http
POST /api/community/:package_id/report
{
  "reason": "plagiarism",
  "description": "This is a copy of my pb_xxx"
}
```

---

## 8. Credits API (Appendix A)

### 8.1 Query balance

```http
GET /api/credits/balance
```

**Response**:

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

### 8.2 Charge

```http
POST /api/credits/charge
{
  "action": "ask_simple",
  "metadata": { "session_id": "sess_xxx" }
}
```

**Response**:

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

Or degraded:

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

### 8.3 Query transactions

```http
GET /api/credits/transactions?from=2026-07-01&to=2026-07-31&limit=50
```

### 8.4 Top up

```http
POST /api/credits/topup
{
  "amount_usd": 20
}
```

**Response**:

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

### 9.1 Create a Watchlist

```http
POST /api/watchlists
{
  "name": "我的科技股"
}
```

### 9.2 List Watchlists

```http
GET /api/watchlists
```

### 9.3 Add a symbol

```http
POST /api/watchlists/:id/items
{
  "ticker": "AAPL"
}
```

### 9.4 Remove a symbol

```http
DELETE /api/watchlists/:id/items/:ticker
```

---

## 10. Health & Status API

### 10.1 Health check

```http
GET /api/health
```

**Response**:

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

### 10.2 System status

```http
GET /api/status
```

Returns more detailed service status and quota usage.

---

## 11. Error code table

| Module | Error code | HTTP status | Meaning |
|---|---|---|---|
| Common | ERR_001 | 400 | Invalid request parameter |
| Common | ERR_002 | 401 | Unauthenticated |
| Common | ERR_003 | 403 | No permission |
| Common | ERR_004 | 404 | Resource not found |
| Common | ERR_005 | 429 | Rate limited |
| Common | ERR_006 | 500 | Internal error |
| Common | ERR_007 | 503 | Service unavailable |
| Data | DATA_001 | 404 | Symbol not found |
| Data | DATA_002 | 429 | Data source rate limited |
| Ask | ASK_001 | 400 | Query cannot be understood |
| Ask | ASK_002 | 503 | LLM service unavailable |
| Strategy | STR_001 | 400 | DSL validation failed |
| Strategy | STR_002 | 404 | Strategy not found |
| Strategy | STR_003 | 409 | Operation not allowed in current state |
| Broker | BRK_001 | 400 | Order validation failed |
| Broker | BRK_002 | 400 | Insufficient funds |
| Broker | BRK_003 | 400 | Insufficient position |
| Broker | BRK_004 | 409 | Operation not allowed in current order state |
| Playbook | PB_001 | 400 | Playbook validation failed |
| Playbook | PB_002 | 400 | Circular dependency |
| Playbook | PB_003 | 400 | Composite weights do not sum to 1.0 |
| Playbook | PB_004 | 400 | Invalid version number |
| Community | CM_001 | 400 | Duplicate publish |
| Community | CM_002 | 429 | Publish frequency exceeded |
| Community | CM_003 | 404 | Playbook has been taken down |
| Credits | CR_001 | 402 | Insufficient credits |
| Credits | CR_002 | 400 | Invalid top-up amount |

---

## 12. Rate limit policy

| Endpoint | Rate limit |
|---|---|
| /api/ask | 60 req/min/user |
| /api/strategy/backtest | 10 req/hour/user |
| /api/broker/orders | 100 req/hour/user |
| /api/community/* | 200 req/hour/user |
| /api/credits/topup | 5 req/hour/user |
| Others | 1000 req/hour/user |

---

## 13. Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-07-19 | Initial draft, covering 8 Epics + 1 Appendix with 50+ endpoints |
