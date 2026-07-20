# Appendix A: Credit Billing System

**Appendix Type**: Billing Rules
**Document Nature Tag**: [A] + [B] + [C]
**Last Updated**: 2026-07-19

---

## 1. Design Goals

- **Predictable**: Users can estimate monthly Credit consumption
- **Controllable**: Users can set hard caps, avoid overspending
- **Degradable**: When Credits run out, degrade rather than hard-block
- **Mock-friendly**: Mock mode consumes no Credits (for demos)
- **Cloudflare free-tier compatible**: D1 stores metadata, doesn't depend on complex billing engine

---

## 2. User Tiers and Free Allowance

### 2.1 Three Pricing Tiers [B]

| Tier | Monthly Fee | Included Credits | After Exceedance | Suitable Users |
|---|---|---|---|---|
| Free | $0 | 100 Credit/month | Degraded mode (Haiku + Mock only) | Retail Alex |
| Pro | $29/month | 1,000 Credit/month | Pay-as-you-go $0.05/Credit | Prosumer Brenda (core target)|
| Team | $99/month | 5,000 Credit/month | Pay-as-you-go $0.04/Credit | Semi-professional Charles |
| Enterprise | Custom | Custom | Custom | Teams/institutions |

### 2.2 Credit Top-up (Pay-as-you-go) [B]

| Top-up Amount | Unit Price | Validity |
|---|---|---|
| $5 (100 Credit) | $0.050/Credit | 6 months |
| $20 (500 Credit) | $0.040/Credit | 12 months |
| $50 (1500 Credit) | $0.033/Credit | 12 months |

---

## 3. Credit Consumption Rules

### 3.1 Per-Action Billing Table [B]

| Operation | Credit Cost | Description |
|---|---|---|
| Ask Agent - simple_qa | 1 | Haiku-tier + RAG |
| Ask Agent - deep_research | 5 | Sonnet-tier + multi-source RAG |
| Ask Agent - tool_call | 2 | Medium complexity |
| Strategy DSL - validate | 0 | Free validation |
| Strategy DSL - LLM-assisted generation | 3 | BuildAgent call |
| Backtest - 1 ticker 1 year | 2 | Standard |
| Backtest - 1 ticker 5 years | 5 | Long period |
| Backtest - multi-ticker (per +1 ticker) | +1 | Multi-ticker |
| Backtest - walk-forward | +5 | Complex mode |
| Paper Trade - single simulation | 1 | 1 month simulation |
| Playbook publish | 0 | Free (encourage UGC) |
| Playbook install (others) | 1 | One-time install fee |
| Advanced RAG retrieval (vector DB) | 2 | Only triggered for deep research |
| Real-time quote subscription (24h) | 5 | Phase 2 |

### 3.2 Mock Mode Rules [B] - **Key Decision**

**User decision**: All operations in Mock mode consume 0 Credits

```typescript
function chargeCredit(action: Action, env: Env): CreditCharge {
  if (env.USE_MOCK === "true") return { amount: 0, reason: "mock_mode" };
  return { amount: CREDIT_TABLE[action], reason: "real_mode" };
}
```

### 3.3 Degradation Chain [B]

```
User Action
  ├─ Check remaining Credit
  │   ├─ Sufficient → normal execution (deduct Credit)
  │   ├─ Insufficient → degrade (cheaper model + notify user)
  │   └─ 0 → only allow Mock data + free operations (validate/playbook publish)
```

---

## 4. D1 Schema

### 4.1 Table Structure [B]

```sql
-- Credit balance table (one row per user per month)
CREATE TABLE credit_balances (
  user_id       TEXT NOT NULL,
  period        TEXT NOT NULL,  -- "2026-07" monthly period
  plan          TEXT NOT NULL,  -- free / pro / team / enterprise
  granted       INTEGER NOT NULL,  -- granted amount this month
  used          INTEGER DEFAULT 0,
  topped_up     INTEGER DEFAULT 0,  -- extra top-up this month
  carried_over  INTEGER DEFAULT 0,  -- carried from last month (Team+ only)
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period)
);

-- Credit transaction table
CREATE TABLE credit_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  action        TEXT NOT NULL,  -- ask_simple / ask_deep / backtest / ...
  amount        INTEGER NOT NULL,  -- positive=deduct, negative=refund
  balance_after INTEGER NOT NULL,
  metadata      TEXT,  -- JSON: {strategy_id, session_id, ...}
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_credit_tx_user_time ON credit_transactions(user_id, created_at);

-- Top-up order table
CREATE TABLE credit_orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  amount_usd    REAL NOT NULL,
  credits       INTEGER NOT NULL,
  status        TEXT NOT NULL,  -- pending / paid / failed
  stripe_id     TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### 4.2 Index Optimization [B]

- `(user_id, period)` primary key: fast monthly balance lookup
- `(user_id, created_at)` index: fast historical transaction lookup

---

## 5. Core API

### 5.1 Balance Query [B]

```typescript
// GET /api/credits/balance
interface BalanceResponse {
  user_id: string;
  period: string;        // "2026-07"
  plan: string;
  remaining: number;     // = granted + topped_up + carried_over - used
  used: number;
  granted: number;
  topped_up: number;
  forecast_burn_rate: number;  // estimated daily consumption this month
}
```

### 5.2 Charge Interface [B]

```typescript
// POST /api/credits/charge
interface ChargeRequest {
  action: Action;
  metadata?: object;
}

interface ChargeResponse {
  ok: boolean;
  amount: number;
  remaining: number;
  degraded: boolean;  // whether degraded
  reason?: string;
}
```

### 5.3 Transaction Query [B]

```typescript
// GET /api/credits/transactions?from=2026-07-01&to=2026-07-31
interface TransactionList {
  transactions: Array<{
    id: number;
    action: string;
    amount: number;
    balance_after: number;
    metadata: object;
    created_at: string;
  }>;
  total: number;
}
```

---

## 6. Degradation Strategy Details

### 6.1 Degradation Chain Table [B]

| Trigger Condition | Degradation Behavior |
|---|---|
| remaining < action_cost × 1 | Normal execution + warning |
| remaining < action_cost × 0.5 | Degrade to cheaper model (Sonnet → Haiku) |
| remaining = 0 | Only allow Mock mode + free operations |
| 3 consecutive deep_research failures | Suggest upgrade to Pro |

### 6.2 Degradation Notification Copy [B]

```
⚠️ Your Credit is running low this month (23/100 remaining)
   - This operation will use a cheaper model (may be slightly slower/simpler)
   - Upgrade to Pro to unlock 10× quota →
```

---

## 7. Refund and Exception Handling

### 7.1 Refund Rules [B]

| Scenario | Refund |
|---|---|
| LLM API failure with no response | Full refund |
| RAG retrieval 0 results but still charged | Full refund |
| User cancels backtest (progress < 50%) | 50% refund |
| User cancels backtest (progress ≥ 50%) | No refund |
| During system maintenance | Full refund + notification |

### 7.2 Exception Handling [B]

- **Stripe payment failure**: mark order failed, auto-retry after 3 days
- **D1 balance inconsistency**: daily reconciliation script, alert if difference > 1%
- **Credit negative bug**: hard block + emergency fix + notify user

---

## 8. Credit Simulation in Mock Mode

### 8.1 Simulated Balance [B]

```typescript
// In Mock mode, all users default to 1000 Credit balance (sufficient for demos)
const MOCK_BALANCE = {
  user_id: "mock-user",
  period: "2026-07",
  plan: "pro",
  granted: 1000,
  used: 0,
  topped_up: 0,
  carried_over: 0
};
```

### 8.2 Mock Transactions [B]

```json
{
  "transactions": [
    { "id": 1, "action": "ask_simple",    "amount": 1,  "balance_after": 999 },
    { "id": 2, "action": "backtest_1y",  "amount": 2,  "balance_after": 997 },
    { "id": 3, "action": "ask_deep",     "amount": 0,  "balance_after": 997, "reason": "mock_mode" }
  ]
}
```

---

## 9. Monitoring Metrics

### 9.1 Business Metrics [B]

- **Paid conversion rate**: Free → Pro upgrade rate
- **ARPU**: Average revenue per paying user
- **Credit consumption structure**: Ask / Backtest / Paper proportions
- **Degradation occurrence rate**: Proportion of users triggering degradation
- **Refund rate**: Refund orders / Total orders

### 9.2 Technical Metrics [B]

- Charge API p99 latency < 100ms
- D1 balance consistency (daily reconciliation 100%)
- Stripe payment success rate > 99%

---

## 10. Compliance and Tax

- **Tax**: Credit top-up treated as prepayment, no invoice; actual consumption triggers tax based on usage behavior
- **Refund**: Full refund within 7 days of top-up if unused; used portion non-refundable
- **Data retention**: Credit transactions retained for 7 years (compliance requirement)

---

## 11. Version History

| Version | Date | Changes |
|---|---|---|
| 0.1 | 2026-07-19 | Initial draft, including 4 pricing tiers, per-action billing table, Mock 0 consumption rule, degradation chain, refund rules |
