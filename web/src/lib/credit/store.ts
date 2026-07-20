/**
 * Credit Store (Appendix A: Credit Billing System).
 *
 * Phase 1: in-memory store with mock seed balance.
 * Phase 2: D1 persistence + Stripe integration.
 *
 * Key behaviors:
 *   - Mock mode (USE_MOCK=true): all charges are 0
 *   - Degradation chain: normal → degraded (cheaper model) → mock_only
 *   - Per-action cost table from billing_credit_system.md §3.1
 *   - Rate limiting: warn at < action_cost, degrade at < 50%, block at 0
 */

import type {
  CreditAction,
  CreditBalance,
  CreditOrder,
  CreditPlan,
  CreditTransaction,
  ChargeResult,
  DegradationLevel,
  OrderStatus,
} from "./types";
import { ACTION_COSTS, PLAN_CONFIGS } from "./types";

// ============ In-memory store ============

interface CreditStore {
  balances: Map<string, CreditBalance>; // key: `${user_id}:${period}`
  transactions: CreditTransaction[];
  orders: CreditOrder[];
  nextTxId: number;
}

const store: CreditStore = {
  balances: new Map(),
  transactions: [],
  orders: [],
  nextTxId: 1,
};

const DEMO_USER = "demo_user";
const DEMO_PLAN: CreditPlan = "pro";

// ============ Current period helper ============

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function balanceKey(userId: string, period: string): string {
  return `${userId}:${period}`;
}

// ============ Balance management ============

export function getOrCreateBalance(
  userId: string,
  period?: string,
  plan?: CreditPlan,
): CreditBalance {
  const p = period ?? currentPeriod();
  const key = balanceKey(userId, p);
  const existing = store.balances.get(key);
  if (existing) return existing;

  const userPlan = plan ?? DEMO_PLAN;
  const config = PLAN_CONFIGS[userPlan];
  const granted = config.monthlyCredits;
  const balance: CreditBalance = {
    user_id: userId,
    period: p,
    plan: userPlan,
    granted,
    used: 0,
    topped_up: 0,
    carried_over: 0,
    remaining: granted,
    forecast_burn_rate: 0,
  };
  store.balances.set(key, balance);
  return balance;
}

export function getBalance(userId: string, period?: string): CreditBalance | null {
  const p = period ?? currentPeriod();
  return store.balances.get(balanceKey(userId, p)) ?? null;
}

// ============ Charge logic ============

/**
 * Charge credits for an action. Respects:
 *   - Mock mode: always 0 charge
 *   - Free actions: always 0 (strategy_validate, playbook_publish)
 *   - Degradation: if remaining < cost * 0.5 → degraded; if 0 → mock_only
 */
export function chargeCredit(
  userId: string,
  action: CreditAction,
  isMockMode: boolean,
  metadata?: object,
): ChargeResult {
  const period = currentPeriod();
  const balance = getOrCreateBalance(userId, period);

  // Rule 1: Mock mode → 0 charge
  if (isMockMode) {
    return {
      ok: true,
      amount: 0,
      remaining: balance.remaining,
      degraded: false,
      degradation_level: "normal",
      reason: "mock_mode",
    };
  }

  // Rule 2: Free actions → 0 charge
  const cost = ACTION_COSTS[action];
  if (cost === 0) {
    return {
      ok: true,
      amount: 0,
      remaining: balance.remaining,
      degraded: false,
      degradation_level: "normal",
      reason: "free_action",
    };
  }

  // Rule 3: Check remaining → degradation chain
  const remaining = balance.remaining;

  if (remaining <= 0) {
    // Hard block: only mock-only operations allowed
    return {
      ok: false,
      amount: 0,
      remaining: 0,
      degraded: true,
      degradation_level: "mock_only",
      reason: "Credit exhausted. Only free actions and mock mode available.",
    };
  }

  if (remaining < cost * 0.5) {
    // Degrade: allow operation but with cheaper model
    const degradedCost = Math.ceil(cost * 0.4); // ~40% of original cost
    return executeCharge(balance, action, degradedCost, true, "degraded", metadata);
  }

  if (remaining < cost) {
    // Warn but allow
    return executeCharge(balance, action, cost, false, "normal", metadata);
  }

  // Normal charge
  return executeCharge(balance, action, cost, false, "normal", metadata);
}

function executeCharge(
  balance: CreditBalance,
  action: CreditAction,
  amount: number,
  degraded: boolean,
  degradationLevel: DegradationLevel,
  metadata?: object,
): ChargeResult {
  // Deduct from balance
  balance.used += amount;
  balance.remaining = balance.granted + balance.topped_up + balance.carried_over - balance.used;

  // Record transaction
  const tx: CreditTransaction = {
    id: store.nextTxId++,
    user_id: balance.user_id,
    action,
    amount,
    balance_after: balance.remaining,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    created_at: new Date().toISOString(),
  };
  store.transactions.push(tx);

  // Update forecast burn rate (simple: average of last 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentTxs = store.transactions.filter(
    (t) => t.user_id === balance.user_id && t.amount > 0 && new Date(t.created_at).getTime() > sevenDaysAgo,
  );
  const totalRecent = recentTxs.reduce((sum, t) => sum + t.amount, 0);
  balance.forecast_burn_rate = recentTxs.length > 0 ? totalRecent / 7 : 0;

  return {
    ok: true,
    amount,
    remaining: balance.remaining,
    degraded,
    degradation_level: degradationLevel,
  };
}

// ============ Refund ============

export function refundCredit(
  userId: string,
  originalTxId: number,
  reason: string,
): { ok: boolean; refunded: number; remaining: number } {
  const originalTx = store.transactions.find(
    (t) => t.id === originalTxId && t.user_id === userId && t.amount > 0,
  );
  if (!originalTx) {
    return { ok: false, refunded: 0, remaining: 0 };
  }

  const balance = getOrCreateBalance(userId);
  const refundAmount = originalTx.amount;

  // Credit back
  balance.used -= refundAmount;
  balance.remaining = balance.granted + balance.topped_up + balance.carried_over - balance.used;

  // Record refund transaction
  const tx: CreditTransaction = {
    id: store.nextTxId++,
    user_id: userId,
    action: originalTx.action,
    amount: -refundAmount,
    balance_after: balance.remaining,
    metadata: JSON.stringify({ refund_reason: reason, original_tx_id: originalTxId }),
    created_at: new Date().toISOString(),
  };
  store.transactions.push(tx);

  return { ok: true, refunded: refundAmount, remaining: balance.remaining };
}

// ============ Top-up (Phase 2: Stripe placeholder) ============

export function topUpCredits(
  userId: string,
  credits: number,
  amountUsd: number,
): CreditOrder {
  const period = currentPeriod();
  const balance = getOrCreateBalance(userId, period);

  // Create order
  const order: CreditOrder = {
    id: `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: userId,
    amount_usd: amountUsd,
    credits,
    order_status: "pending", // Phase 2: Stripe webhook will update to "paid"
    stripe_id: null,
    created_at: new Date().toISOString(),
  };
  store.orders.push(order);

  // Phase 1: auto-approve (no Stripe)
  order.order_status = "paid";
  balance.topped_up += credits;
  balance.remaining = balance.granted + balance.topped_up + balance.carried_over - balance.used;

  return order;
}

// ============ Transaction history ============

export function listTransactions(
  userId: string,
  from?: string,
  to?: string,
  limit = 50,
  offset = 0,
): { transactions: CreditTransaction[]; total: number } {
  let txs = store.transactions.filter((t) => t.user_id === userId);

  if (from) {
    txs = txs.filter((t) => t.created_at >= from);
  }
  if (to) {
    txs = txs.filter((t) => t.created_at <= to);
  }

  txs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = txs.length;
  return {
    transactions: txs.slice(offset, offset + limit),
    total,
  };
}

// ============ Orders ============

export function listOrders(userId: string): CreditOrder[] {
  return store.orders
    .filter((o) => o.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function updateOrderStatus(orderId: string, status: OrderStatus, stripeId?: string): boolean {
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) return false;
  order.order_status = status;
  if (stripeId) order.stripe_id = stripeId;
  return true;
}

// ============ Degradation check ============

export function checkDegradationLevel(userId: string): DegradationLevel {
  const balance = getOrCreateBalance(userId);
  if (balance.remaining <= 0) return "mock_only";
  // Average action cost ~2 credits
  if (balance.remaining < 1) return "degraded";
  return "normal";
}

// ============ Plan change ============

export function changePlan(userId: string, newPlan: CreditPlan): CreditBalance {
  const period = currentPeriod();
  const balance = getOrCreateBalance(userId, period);
  const config = PLAN_CONFIGS[newPlan];

  balance.plan = newPlan;
  balance.granted = config.monthlyCredits;
  balance.remaining = balance.granted + balance.topped_up + balance.carried_over - balance.used;

  return balance;
}

// ============ Test helper ============

export function _resetStoreForTest(): void {
  store.balances.clear();
  store.transactions.length = 0;
  store.orders.length = 0;
  store.nextTxId = 1;
  seedDemoBalance();
}

// ============ Mock seed ============

export function seedDemoBalance(): void {
  const period = currentPeriod();
  const key = balanceKey(DEMO_USER, period);
  if (store.balances.has(key)) return;

  const config = PLAN_CONFIGS[DEMO_PLAN];
  store.balances.set(key, {
    user_id: DEMO_USER,
    period,
    plan: DEMO_PLAN,
    granted: config.monthlyCredits,
    used: 153, // mock: some usage already
    topped_up: 0,
    carried_over: 0,
    remaining: config.monthlyCredits - 153,
    forecast_burn_rate: 5.1,
  });

  // Seed some mock transactions
  const baseDate = new Date();
  const mockTxs: Array<{ action: CreditAction; amount: number; daysAgo: number }> = [
    { action: "ask_simple", amount: 1, daysAgo: 0 },
    { action: "ask_deep", amount: 5, daysAgo: 1 },
    { action: "backtest_1y", amount: 2, daysAgo: 2 },
    { action: "strategy_llm_generate", amount: 3, daysAgo: 3 },
    { action: "paper_trade", amount: 1, daysAgo: 5 },
    { action: "ask_tool_call", amount: 2, daysAgo: 6 },
    { action: "backtest_5y", amount: 5, daysAgo: 7 },
  ];

  let balance = 1000;
  for (let i = mockTxs.length - 1; i >= 0; i--) {
    const tx = mockTxs[i];
    const date = new Date(baseDate);
    date.setDate(date.getDate() - tx.daysAgo);
    balance -= tx.amount;
    store.transactions.push({
      id: store.nextTxId++,
      user_id: DEMO_USER,
      action: tx.action,
      amount: tx.amount,
      balance_after: balance,
      created_at: date.toISOString(),
    });
  }
}

// Auto-seed on module load
seedDemoBalance();
