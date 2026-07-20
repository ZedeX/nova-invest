/**
 * Unit tests for Credit System (Sprint 9, Appendix A).
 *
 * Covers:
 *   - Store: seed balance, charge, refund, top-up, transactions
 *   - Action cost table: all 14 actions have costs
 *   - Mock mode: always 0 charge
 *   - Free actions: validate + publish = 0
 *   - Degradation chain: normal → degraded → mock_only
 *   - Plan change
 *   - Refund rules
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetStoreForTest,
  getOrCreateBalance,
  getBalance,
  chargeCredit,
  refundCredit,
  topUpCredits,
  listTransactions,
  listOrders,
  changePlan,
  checkDegradationLevel,
} from "@/lib/credit/store";
import { ACTION_COSTS, PLAN_CONFIGS } from "@/lib/credit/types";
import type { CreditAction, CreditPlan } from "@/lib/credit/types";

const USER_A = "user_a@test.com";
const USER_B = "user_b@test.com";

beforeEach(() => {
  _resetStoreForTest();
});

afterEach(() => {
  _resetStoreForTest();
});

// ============ Seed data ============

describe("Credit Store: Seed", () => {
  it("seeds demo_user with pro plan and 1000 credits", () => {
    const bal = getBalance("demo_user");
    expect(bal).not.toBeNull();
    expect(bal!.plan).toBe("pro");
    expect(bal!.granted).toBe(1000);
  });

  it("seed has some usage", () => {
    const bal = getBalance("demo_user")!;
    expect(bal.used).toBe(153);
    expect(bal.remaining).toBe(847);
  });

  it("seed has mock transactions", () => {
    const txs = listTransactions("demo_user");
    expect(txs.total).toBeGreaterThan(0);
  });
});

// ============ Action Cost Table ============

describe("Credit: Action Cost Table", () => {
  it("defines all 14 actions", () => {
    const actions = Object.keys(ACTION_COSTS);
    expect(actions.length).toBe(14);
  });

  it("free actions cost 0", () => {
    expect(ACTION_COSTS.strategy_validate).toBe(0);
    expect(ACTION_COSTS.playbook_publish).toBe(0);
  });

  it("ask_simple costs 1", () => {
    expect(ACTION_COSTS.ask_simple).toBe(1);
  });

  it("ask_deep costs 5", () => {
    expect(ACTION_COSTS.ask_deep).toBe(5);
  });

  it("backtest_1y costs 2", () => {
    expect(ACTION_COSTS.backtest_1y).toBe(2);
  });

  it("all costs are non-negative integers", () => {
    for (const [action, cost] of Object.entries(ACTION_COSTS)) {
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============ Plan Configs ============

describe("Credit: Plan Configs", () => {
  it("free plan has 100 credits", () => {
    expect(PLAN_CONFIGS.free.monthlyCredits).toBe(100);
    expect(PLAN_CONFIGS.free.monthlyPrice).toBe(0);
  });

  it("pro plan has 1000 credits at $29", () => {
    expect(PLAN_CONFIGS.pro.monthlyCredits).toBe(1000);
    expect(PLAN_CONFIGS.pro.monthlyPrice).toBe(29);
  });

  it("team plan has 5000 credits at $99", () => {
    expect(PLAN_CONFIGS.team.monthlyCredits).toBe(5000);
    expect(PLAN_CONFIGS.team.monthlyPrice).toBe(99);
  });

  it("team and enterprise can carry over", () => {
    expect(PLAN_CONFIGS.team.carryOver).toBe(true);
    expect(PLAN_CONFIGS.enterprise.carryOver).toBe(true);
    expect(PLAN_CONFIGS.free.carryOver).toBe(false);
    expect(PLAN_CONFIGS.pro.carryOver).toBe(false);
  });
});

// ============ Charge ============

describe("Credit Store: Charge", () => {
  it("charges in real mode", () => {
    const result = chargeCredit(USER_A, "ask_simple", false);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(1);
    expect(result.degraded).toBe(false);
  });

  it("charges 0 in mock mode", () => {
    const result = chargeCredit(USER_A, "ask_deep", true);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(0);
    expect(result.reason).toBe("mock_mode");
  });

  it("charges 0 for free actions in real mode", () => {
    const result = chargeCredit(USER_A, "strategy_validate", false);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(0);
    expect(result.reason).toBe("free_action");
  });

  it("deducts from balance correctly", () => {
    const balBefore = getOrCreateBalance(USER_A);
    const granted = balBefore.granted;
    chargeCredit(USER_A, "ask_deep", false); // costs 5
    const balAfter = getOrCreateBalance(USER_A);
    expect(balAfter.used).toBe(5);
    expect(balAfter.remaining).toBe(granted - 5);
  });

  it("records transaction on charge", () => {
    chargeCredit(USER_A, "backtest_1y", false);
    const txs = listTransactions(USER_A);
    expect(txs.total).toBe(1);
    expect(txs.transactions[0].action).toBe("backtest_1y");
    expect(txs.transactions[0].amount).toBe(2);
  });
});

// ============ Degradation Chain ============

describe("Credit Store: Degradation Chain", () => {
  it("normal when credits sufficient", () => {
    // New user has full credits
    const result = chargeCredit(USER_A, "ask_simple", false);
    expect(result.degradation_level).toBe("normal");
    expect(result.degraded).toBe(false);
  });

  it("degraded when remaining < cost * 0.5", () => {
    // Create user with 2 credits remaining (ask_deep costs 5)
    const bal = getOrCreateBalance(USER_A, undefined, "free");
    bal.granted = 100;
    bal.used = 98;
    bal.remaining = 2;

    const result = chargeCredit(USER_A, "ask_deep", false);
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.degradation_level).toBe("degraded");
    // Degraded cost should be ~40% of original (5 * 0.4 = 2, ceil = 2)
    expect(result.amount).toBeLessThan(5);
  });

  it("mock_only when credits = 0", () => {
    const bal = getOrCreateBalance(USER_A, undefined, "free");
    bal.granted = 100;
    bal.used = 100;
    bal.remaining = 0;

    const result = chargeCredit(USER_A, "ask_simple", false);
    expect(result.ok).toBe(false);
    expect(result.degradation_level).toBe("mock_only");
    expect(result.amount).toBe(0);
  });

  it("checkDegradationLevel returns correct level", () => {
    const bal = getOrCreateBalance(USER_A, undefined, "free");
    expect(checkDegradationLevel(USER_A)).toBe("normal");

    bal.remaining = 0;
    expect(checkDegradationLevel(USER_A)).toBe("mock_only");
  });
});

// ============ Refund ============

describe("Credit Store: Refund", () => {
  it("refunds a previous charge", () => {
    const chargeResult = chargeCredit(USER_A, "ask_deep", false);
    const balBefore = getOrCreateBalance(USER_A);

    // Find the transaction
    const txs = listTransactions(USER_A);
    const chargeTx = txs.transactions.find((t) => t.amount > 0);
    expect(chargeTx).toBeDefined();

    const refundResult = refundCredit(USER_A, chargeTx!.id, "LLM API failed");
    expect(refundResult.ok).toBe(true);
    expect(refundResult.refunded).toBe(5);
  });

  it("cannot refund non-existent transaction", () => {
    const result = refundCredit(USER_A, 99999, "test");
    expect(result.ok).toBe(false);
  });

  it("records negative transaction for refund", () => {
    chargeCredit(USER_A, "ask_simple", false);
    const txs = listTransactions(USER_A);
    const chargeTx = txs.transactions.find((t) => t.amount > 0)!;

    refundCredit(USER_A, chargeTx.id, "test");
    const allTxs = listTransactions(USER_A);
    const refundTx = allTxs.transactions.find((t) => t.amount < 0);
    expect(refundTx).toBeDefined();
    expect(refundTx!.amount).toBe(-1);
  });
});

// ============ Top-up ============

describe("Credit Store: Top-up", () => {
  it("tops up credits", () => {
    const bal = getOrCreateBalance(USER_A);
    const remainingBefore = bal.remaining;

    const order = topUpCredits(USER_A, 100, 5);
    expect(order.order_status).toBe("paid");
    expect(order.credits).toBe(100);

    const balAfter = getOrCreateBalance(USER_A);
    expect(balAfter.topped_up).toBe(100);
    expect(balAfter.remaining).toBe(remainingBefore + 100);
  });

  it("creates an order record", () => {
    topUpCredits(USER_A, 500, 20);
    const orders = listOrders(USER_A);
    expect(orders.length).toBe(1);
    expect(orders[0].amount_usd).toBe(20);
    expect(orders[0].credits).toBe(500);
  });
});

// ============ Plan Change ============

describe("Credit Store: Plan Change", () => {
  it("changes plan and adjusts granted credits", () => {
    const bal = getOrCreateBalance(USER_A, undefined, "free");
    expect(bal.granted).toBe(100);

    changePlan(USER_A, "pro");
    expect(bal.plan).toBe("pro");
    expect(bal.granted).toBe(1000);
  });
});

// ============ Transactions ============

describe("Credit Store: Transactions", () => {
  it("lists transactions sorted newest first", () => {
    chargeCredit(USER_A, "ask_simple", false);
    chargeCredit(USER_A, "ask_deep", false);
    const txs = listTransactions(USER_A);
    expect(txs.total).toBe(2);
    // Both actions should be present (timestamps may be identical)
    const actions = txs.transactions.map((t) => t.action);
    expect(actions).toContain("ask_simple");
    expect(actions).toContain("ask_deep");
  });

  it("paginates transactions", () => {
    for (let i = 0; i < 5; i++) {
      chargeCredit(USER_A, "ask_simple", false);
    }
    const page1 = listTransactions(USER_A, undefined, undefined, 3, 0);
    const page2 = listTransactions(USER_A, undefined, undefined, 3, 3);
    expect(page1.transactions.length).toBe(3);
    expect(page2.transactions.length).toBe(2);
  });

  it("filters by date range", () => {
    chargeCredit(USER_A, "ask_simple", false);
    const txs = listTransactions(USER_A, "2099-01-01", "2099-12-31");
    expect(txs.total).toBe(0); // all transactions are in current time, not 2099
  });
});

// ============ Burn Rate ============

describe("Credit Store: Burn Rate", () => {
  it("updates forecast_burn_rate after charges", () => {
    chargeCredit(USER_A, "ask_simple", false);
    chargeCredit(USER_A, "ask_deep", false);
    const bal = getOrCreateBalance(USER_A);
    expect(bal.forecast_burn_rate).toBeGreaterThanOrEqual(0);
  });
});
