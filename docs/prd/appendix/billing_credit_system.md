# 附录 A：Credit 计费系统

**附录类型**: 计费规则
**文档性质标签**: [A] + [B] + [C]
**最后更新**: 2026-07-19

---

## 1. 设计目标

- **可预测**：用户能预估每月 Credit 消耗
- **可控制**：用户可设硬上限，避免超支
- **可降级**：Credit 耗尽时降级而非硬阻断
- **Mock 友好**：Mock 模式下不消耗 Credit（演示用）
- **Cloudflare 免费层兼容**：D1 存储元数据，不依赖复杂计费引擎

---

## 2. 用户分层与免费额度

### 2.1 三档资费 [B]

| 档位 | 月费 | 含 Credit | 超出后 | 适合用户 |
|---|---|---|---|---|
| Free | $0 | 100 Credit/月 | 降级模式（仅 Haiku + Mock） | 散户 Alex |
| Pro | $29/月 | 1,000 Credit/月 | 按量付费 $0.05/Credit | Prosumer Brenda（核心目标）|
| Team | $99/月 | 5,000 Credit/月 | 按量付费 $0.04/Credit | 半专业 Charles |
| Enterprise | 定制 | 定制 | 定制 | 团队/机构 |

### 2.2 Credit 充值（按量付费）[B]

| 充值金额 | 单价 | 有效期 |
|---|---|---|
| $5 (100 Credit) | $0.050/Credit | 6 个月 |
| $20 (500 Credit) | $0.040/Credit | 12 个月 |
| $50 (1500 Credit) | $0.033/Credit | 12 个月 |

---

## 3. Credit 消耗规则

### 3.1 按 Action 计费表 [B]

| 操作 | 消耗 Credit | 说明 |
|---|---|---|
| Ask Agent - simple_qa | 1 | Haiku-tier + RAG |
| Ask Agent - deep_research | 5 | Sonnet-tier + 多源 RAG |
| Ask Agent - tool_call | 2 | 中等复杂度 |
| Strategy DSL - validate | 0 | 免费校验 |
| Strategy DSL - LLM 辅助生成 | 3 | BuildAgent 调用 |
| Backtest - 1 标的 1 年 | 2 | 标准 |
| Backtest - 1 标的 5 年 | 5 | 长周期 |
| Backtest - 多标的（每+1 标的） | +1 | 多标的 |
| Backtest - walk-forward | +5 | 复杂模式 |
| Paper Trade - 单次模拟 | 1 | 1 个月模拟 |
| Playbook 发布 | 0 | 免费（鼓励 UGC） |
| Playbook 安装（他人） | 1 | 一次安装费 |
| 高级 RAG 检索（向量库） | 2 | 仅深度研究时触发 |
| 实时行情订阅（24h） | 5 | Phase 2 |

### 3.2 Mock 模式规则 [B] - **关键决策**

**用户决策**：Mock 模式下所有操作 0 Credit 消耗

```typescript
function chargeCredit(action: Action, env: Env): CreditCharge {
  if (env.USE_MOCK === "true") return { amount: 0, reason: "mock_mode" };
  return { amount: CREDIT_TABLE[action], reason: "real_mode" };
}
```

### 3.3 降级链 [B]

```
User Action
  ├─ 检查剩余 Credit
  │   ├─ 充足 → 正常执行（扣 Credit）
  │   ├─ 不足 → 降级（更便宜模型 + 提示用户）
  │   └─ 0 → 仅允许 Mock 数据 + 免费操作（validate/playbook 发布）
```

---

## 4. D1 Schema

### 4.1 表结构 [B]

```sql
-- Credit 余额表（每用户每月一行）
CREATE TABLE credit_balances (
  user_id       TEXT NOT NULL,
  period        TEXT NOT NULL,  -- "2026-07" 月度周期
  plan          TEXT NOT NULL,  -- free / pro / team / enterprise
  granted       INTEGER NOT NULL,  -- 本月授予额度
  used          INTEGER DEFAULT 0,
  topped_up     INTEGER DEFAULT 0,  -- 本月额外充值
  carried_over  INTEGER DEFAULT 0,  -- 上月结转（仅 Team+）
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period)
);

-- Credit 流水表
CREATE TABLE credit_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  action        TEXT NOT NULL,  -- ask_simple / ask_deep / backtest / ...
  amount        INTEGER NOT NULL,  -- 正数=扣除，负数=返还
  balance_after INTEGER NOT NULL,
  metadata      TEXT,  -- JSON: {strategy_id, session_id, ...}
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_credit_tx_user_time ON credit_transactions(user_id, created_at);

-- 充值订单表
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

### 4.2 索引优化 [B]

- `(user_id, period)` 主键：快速查月度余额
- `(user_id, created_at)` 索引：快速查历史流水

---

## 5. 核心 API

### 5.1 余额查询 [B]

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
  forecast_burn_rate: number;  // 预估本月日均消耗
}
```

### 5.2 扣费接口 [B]

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
  degraded: boolean;  // 是否降级
  reason?: string;
}
```

### 5.3 流水查询 [B]

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

## 6. 降级策略详情

### 6.1 降级链表 [B]

| 触发条件 | 降级行为 |
|---|---|
| remaining < action_cost × 1 | 正常执行 + 警告提示 |
| remaining < action_cost × 0.5 | 降级到更便宜模型（Sonnet → Haiku） |
| remaining = 0 | 仅允许 Mock 模式 + 免费操作 |
| 连续 3 次 deep_research 失败 | 建议升级到 Pro |

### 6.2 降级提示文案 [B]

```
⚠️ 你本月 Credit 即将用尽（剩余 23/100）
   - 当前操作将使用更便宜的模型（可能略慢/略简）
   - 升级到 Pro 解锁 10× 额度 →
```

---

## 7. 退款与异常处理

### 7.1 退款规则 [B]

| 场景 | 退款 |
|---|---|
| LLM API 失败导致无响应 | 全额退款 |
| RAG 检索 0 结果但仍扣费 | 全额退款 |
| 用户主动取消回测（进度 < 50%） | 退款 50% |
| 用户主动取消回测（进度 ≥ 50%） | 不退款 |
| 系统维护期间 | 全额退款 + 通知 |

### 7.2 异常处理 [B]

- **Stripe 支付失败**：标记订单 failed，3 天后自动重试
- **D1 余额不一致**：每日对账脚本，差异 > 1% 告警
- **Credit 负数 Bug**：硬阻断 + 紧急修复 + 通知用户

---

## 8. Mock 模式下的 Credit 模拟

### 8.1 模拟余额 [B]

```typescript
// Mock 模式下，所有用户默认余额 1000 Credit（演示充足）
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

### 8.2 Mock 流水 [B]

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

## 9. 监控指标

### 9.1 业务指标 [B]

- **付费转化率**：Free → Pro 升级率
- **ARPU**：每付费用户平均收入
- **Credit 消耗结构**：Ask / Backtest / Paper 各占比
- **降级发生率**：触发降级的用户比例
- **退款率**：退款订单 / 总订单

### 9.2 技术指标 [B]

- 扣费 API p99 延迟 < 100ms
- D1 余额一致性（每日对账 100%）
- Stripe 支付成功率 > 99%

---

## 10. 合规与税务

- **税务**：Credit 充值视为预付款，不开发票；实际消耗时按使用行为判定税务
- **退款**：充值 7 天内未使用可全额退款；已使用部分不退
- **数据保留**：Credit 流水保留 7 年（合规要求）

---

## 11. 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-07-19 | 初稿，含 4 档资费、按 Action 计费表、Mock 0 消耗规则、降级链、退款规则 |
