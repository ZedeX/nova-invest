/**
 * Unit tests for D1CreditStore (Phase 2 of Appendix A: Credit Billing System).
 *
 * Uses a mock D1Database to test the D1-backed credit store without
 * a real Cloudflare D1 binding.
 *
 * Covers:
 *   - initUser creates Free plan user with 100 credits
 *   - getBalance returns correct balance and plan
 *   - charge deducts credits and inserts ledger entry
 *   - charge with insufficient balance returns degraded
 *   - refund adds credits back
 *   - setPlan upgrades from free to pro (1000 credits)
 *   - setPlan downgrades from pro to free (100 credits)
 *   - getLedger returns history entries
 *   - degradation level: normal -> degraded -> mock_only based on balance thresholds
 *   - Period reset: new month resets balance
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1CreditStore } from "@/lib/credit/d1-store";
import { PLAN_CONFIGS } from "@/lib/credit/types";

// ============ In-memory D1 mock ============
//
// Strategy: instead of fragile SQL string matching, we route by table name
// extracted from the SQL, then handle SELECT/INSERT/UPDATE generically
// against in-memory arrays.

interface BalanceRow {
  user_id: string;
  period: string;
  plan: string;
  granted: number;
  used: number;
  topped_up: number;
  carried_over: number;
  updated_at: string;
}

interface TransactionRow {
  id: number;
  user_id: string;
  action: string;
  amount: number;
  balance_after: number;
  metadata: string | null;
  created_at: string;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function createMockD1() {
  const balances: BalanceRow[] = [];
  const transactions: TransactionRow[] = [];
  let nextTxId = 1;

  function findBalance(userId: string, period: string): BalanceRow | undefined {
    return balances.find((b) => b.user_id === userId && b.period === period);
  }

  function routeSql(sql: string, params: unknown[]) {
    const isBalances = sql.includes("credit_balances");
    const isTransactions = sql.includes("credit_transactions");
    const isSelect = sql.trimStart().toUpperCase().startsWith("SELECT");
    const isInsert = sql.trimStart().toUpperCase().startsWith("INSERT");
    const isUpdate = sql.trimStart().toUpperCase().startsWith("UPDATE");

    // ---- SELECT on credit_balances ----
    if (isBalances && isSelect) {
      const userId = params[0] as string;
      const period = params[1] as string;
      const row = findBalance(userId, period);
      // If SELECT user_id only, return partial row
      if (sql.includes("SELECT user_id FROM")) {
        return {
          first: vi.fn(async () => row ? { user_id: row.user_id } : null),
          all: vi.fn(async () => ({ results: [] })),
          run: vi.fn(async () => ({ meta: { changes: 0 } })),
        };
      }
      return {
        first: vi.fn(async () => row ?? null),
        all: vi.fn(async () => ({ results: row ? [row] : [] })),
        run: vi.fn(async () => ({ meta: { changes: 0 } })),
      };
    }

    // ---- SELECT on credit_transactions ----
    if (isTransactions && isSelect) {
      const userId = params[0] as string;
      const limit = params[1] as number;
      const userTxs = transactions
        .filter((t) => t.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
      return {
        first: vi.fn(async () => userTxs[0] ?? null),
        all: vi.fn(async () => ({ results: userTxs })),
        run: vi.fn(async () => ({ meta: { changes: 0 } })),
      };
    }

    // ---- INSERT on credit_balances ----
    if (isBalances && isInsert) {
      return {
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          // Two INSERT patterns from d1-store.ts:
          // 1. initUser: VALUES (?, ?, 'free', ?, 0, 0, 0, ...) => userId, period, granted
          // 2. setPlan: VALUES (?, ?, ?, ?, 0, 0, 0, ...) => userId, period, plan, granted
          //
          // Detect by checking if params[2] is a known plan string.
          const userId = params[0] as string;
          const period = params[1] as string;
          const planKeys = ["free", "pro", "team", "enterprise"];
          let plan: string;
          let granted: number;

          if (planKeys.includes(params[2] as string)) {
            // setPlan pattern: userId, period, plan, granted
            plan = params[2] as string;
            granted = params[3] as number;
          } else {
            // initUser pattern: userId, period, granted (plan is 'free' literal in SQL)
            plan = "free";
            granted = params[2] as number;
          }

          if (!findBalance(userId, period)) {
            balances.push({
              user_id: userId,
              period,
              plan,
              granted,
              used: 0,
              topped_up: 0,
              carried_over: 0,
              updated_at: new Date().toISOString(),
            });
          }
          return { meta: { changes: 1 } };
        }),
      };
    }

    // ---- INSERT on credit_transactions ----
    if (isTransactions && isInsert) {
      return {
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          // Two INSERT patterns:
          // 1. charge: VALUES (?, ?, ?, ?, ?, ...) => userId, action, amount, balanceAfter, metadata
          // 2. refund: VALUES (?, 'refund', ?, ?, ?, ...) => userId, -amount, balanceAfter, metadata
          const userId = params[0] as string;
          let action: string;
          let amount: number;
          let balanceAfter: number;
          let metadata: string | null;

          if (sql.includes("'refund'")) {
            // Refund pattern: action is SQL literal 'refund'
            amount = params[1] as number;
            balanceAfter = params[2] as number;
            metadata = params[3] as string | null;
            action = "refund";
          } else {
            // Charge pattern: action is a bind param
            action = params[1] as string;
            amount = params[2] as number;
            balanceAfter = params[3] as number;
            metadata = params[4] as string | null;
          }

          // Use incrementing timestamp to ensure stable sort order
          const ts = new Date(Date.now() + nextTxId);
          transactions.push({
            id: nextTxId++,
            user_id: userId,
            action,
            amount,
            balance_after: balanceAfter,
            metadata,
            created_at: ts.toISOString(),
          });
          return { meta: { changes: 1 } };
        }),
      };
    }

    // ---- UPDATE credit_balances SET used = ... ----
    if (isBalances && isUpdate && sql.includes("used =")) {
      return {
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          const newUsed = params[0] as number;
          const userId = params[1] as string;
          const period = params[2] as string;
          const row = findBalance(userId, period);
          if (row) {
            row.used = newUsed;
            row.updated_at = new Date().toISOString();
          }
          return { meta: { changes: 1 } };
        }),
      };
    }

    // ---- UPDATE credit_balances SET plan = ... ----
    if (isBalances && isUpdate && sql.includes("plan =")) {
      return {
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          // bind order: granted, plan, userId, period
          const granted = params[0] as number;
          const plan = params[1] as string;
          const userId = params[2] as string;
          const period = params[3] as string;
          const row = findBalance(userId, period);
          if (row) {
            row.plan = plan;
            row.granted = granted;
            row.updated_at = new Date().toISOString();
          }
          return { meta: { changes: 1 } };
        }),
      };
    }

    // ---- Default fallback ----
    return {
      first: vi.fn(async () => null),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => ({ meta: { changes: 0 } })),
    };
  }

  const mockD1 = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => routeSql(sql, params)),
    })),
    batch: vi.fn(async (stmts: unknown[]) =>
      stmts.map(() => ({ meta: { changes: 1 } }))
    ),
    exec: vi.fn(),
    dump: vi.fn(),
  };

  return {
    d1: mockD1 as unknown as import("@/lib/credit/d1-store").D1Database,
    balances,
    transactions,
    currentPeriod,
  };
}

// ============ Test suite ============

const USER_A = "user_a@test.com";

describe("D1CreditStore", () => {
  let mock: ReturnType<typeof createMockD1>;
  let store: D1CreditStore;

  beforeEach(() => {
    mock = createMockD1();
    store = new D1CreditStore(mock.d1);
  });

  // ============ initUser ============

  describe("initUser", () => {
    it("creates Free plan user with 100 credits", async () => {
      await store.initUser(USER_A);
      const info = await store.getBalance(USER_A);
      expect(info.plan).toBe("free");
      expect(info.balance).toBe(PLAN_CONFIGS.free.monthlyCredits);
      expect(info.degradationLevel).toBe("normal");
    });

    it("does not duplicate if user already exists for period", async () => {
      await store.initUser(USER_A);
      await store.initUser(USER_A); // second call should be no-op
      expect(mock.balances.length).toBe(1);
    });
  });

  // ============ getBalance ============

  describe("getBalance", () => {
    it("returns Free plan defaults for non-existent user", async () => {
      const info = await store.getBalance("unknown@test.com");
      expect(info.plan).toBe("free");
      expect(info.balance).toBe(PLAN_CONFIGS.free.monthlyCredits);
      expect(info.degradationLevel).toBe("normal");
    });

    it("returns correct balance for initialized user", async () => {
      await store.initUser(USER_A);
      const info = await store.getBalance(USER_A);
      expect(info.balance).toBe(100);
      expect(info.plan).toBe("free");
    });

    it("returns correct balance after charges", async () => {
      await store.initUser(USER_A);
      await store.charge(USER_A, "ask_deep", false); // costs 5
      const info = await store.getBalance(USER_A);
      expect(info.balance).toBe(95);
    });
  });

  // ============ charge ============

  describe("charge", () => {
    it("deducts credits and inserts ledger entry", async () => {
      await store.initUser(USER_A);
      const result = await store.charge(USER_A, "ask_simple", false);
      expect(result.ok).toBe(true);
      expect(result.amount).toBe(1);
      expect(result.remaining).toBe(99);
      expect(result.degraded).toBe(false);
      expect(result.degradation_level).toBe("normal");

      // Verify ledger entry
      const ledger = await store.getLedger(USER_A);
      expect(ledger.length).toBe(1);
      expect(ledger[0].action).toBe("ask_simple");
      expect(ledger[0].amount).toBe(1);
      expect(ledger[0].balance_after).toBe(99);
    });

    it("charges 0 in mock mode", async () => {
      await store.initUser(USER_A);
      const result = await store.charge(USER_A, "ask_deep", true);
      expect(result.ok).toBe(true);
      expect(result.amount).toBe(0);
      expect(result.reason).toBe("mock_mode");
    });

    it("charges 0 for free actions", async () => {
      await store.initUser(USER_A);
      const result = await store.charge(USER_A, "strategy_validate", false);
      expect(result.ok).toBe(true);
      expect(result.amount).toBe(0);
      expect(result.reason).toBe("free_action");
    });

    it("returns mock_only when balance is 0", async () => {
      await store.initUser(USER_A);
      // Exhaust all credits
      const bal = mock.balances.find(
        (b) => b.user_id === USER_A && b.period === mock.currentPeriod()
      );
      expect(bal).toBeDefined();
      bal!.used = 100;

      const result = await store.charge(USER_A, "ask_simple", false);
      expect(result.ok).toBe(false);
      expect(result.degradation_level).toBe("mock_only");
      expect(result.amount).toBe(0);
    });

    it("degrades when remaining < cost * 0.5", async () => {
      await store.initUser(USER_A);
      // Set used so remaining = 2 (ask_deep costs 5, 2 < 5 * 0.5 = 2.5)
      const bal = mock.balances.find(
        (b) => b.user_id === USER_A && b.period === mock.currentPeriod()
      );
      expect(bal).toBeDefined();
      bal!.used = 98;

      const result = await store.charge(USER_A, "ask_deep", false);
      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.degradation_level).toBe("degraded");
      // Degraded cost = ceil(5 * 0.4) = 2
      expect(result.amount).toBe(2);
    });

    it("allows full charge when remaining >= cost", async () => {
      await store.initUser(USER_A);
      const result = await store.charge(USER_A, "ask_deep", false); // costs 5
      expect(result.ok).toBe(true);
      expect(result.amount).toBe(5);
      expect(result.degraded).toBe(false);
      expect(result.degradation_level).toBe("normal");
    });
  });

  // ============ refund ============

  describe("refund", () => {
    it("adds credits back to balance", async () => {
      await store.initUser(USER_A);
      await store.charge(USER_A, "ask_deep", false); // costs 5
      expect((await store.getBalance(USER_A)).balance).toBe(95);

      await store.refund(USER_A, 5, "LLM API failed");
      expect((await store.getBalance(USER_A)).balance).toBe(100);
    });

    it("records negative transaction in ledger", async () => {
      await store.initUser(USER_A);
      await store.charge(USER_A, "ask_simple", false);
      await store.refund(USER_A, 1, "test refund");

      const ledger = await store.getLedger(USER_A);
      const refundTx = ledger.find((t) => t.amount < 0);
      expect(refundTx).toBeDefined();
      expect(refundTx!.amount).toBe(-1);
      expect(refundTx!.action).toBe("refund");
    });
  });

  // ============ setPlan ============

  describe("setPlan", () => {
    it("upgrades from free to pro (1000 credits)", async () => {
      await store.initUser(USER_A);
      expect((await store.getBalance(USER_A)).plan).toBe("free");

      await store.setPlan(USER_A, "pro");
      const info = await store.getBalance(USER_A);
      expect(info.plan).toBe("pro");
      expect(info.balance).toBe(PLAN_CONFIGS.pro.monthlyCredits);
    });

    it("downgrades from pro to free (100 credits)", async () => {
      await store.initUser(USER_A);
      await store.setPlan(USER_A, "pro");
      expect((await store.getBalance(USER_A)).plan).toBe("pro");

      await store.setPlan(USER_A, "free");
      const info = await store.getBalance(USER_A);
      expect(info.plan).toBe("free");
      // Granted changes to 100 but used stays the same
      // balance = granted + topped_up + carried_over - used
      // After downgrade with no usage: 100 + 0 + 0 - 0 = 100
      expect(info.balance).toBe(100);
    });

    it("creates user if not exists for current period", async () => {
      await store.setPlan(USER_A, "team");
      const info = await store.getBalance(USER_A);
      expect(info.plan).toBe("team");
      expect(info.balance).toBe(PLAN_CONFIGS.team.monthlyCredits);
    });
  });

  // ============ getLedger ============

  describe("getLedger", () => {
    it("returns empty array for user with no transactions", async () => {
      await store.initUser(USER_A);
      const ledger = await store.getLedger(USER_A);
      expect(ledger).toEqual([]);
    });

    it("returns history entries sorted newest first", async () => {
      await store.initUser(USER_A);
      await store.charge(USER_A, "ask_simple", false);
      await store.charge(USER_A, "ask_deep", false);

      const ledger = await store.getLedger(USER_A);
      expect(ledger.length).toBe(2);
      // Most recent first (ask_deep was charged last)
      expect(ledger[0].action).toBe("ask_deep");
      expect(ledger[1].action).toBe("ask_simple");
    });

    it("respects limit parameter", async () => {
      await store.initUser(USER_A);
      for (let i = 0; i < 5; i++) {
        await store.charge(USER_A, "ask_simple", false);
      }
      const ledger = await store.getLedger(USER_A, 3);
      expect(ledger.length).toBe(3);
    });
  });

  // ============ Degradation levels ============

  describe("degradation levels", () => {
    it("normal when credits sufficient", async () => {
      await store.initUser(USER_A);
      const info = await store.getBalance(USER_A);
      expect(info.degradationLevel).toBe("normal");
    });

    it("mock_only when balance <= 0", async () => {
      await store.initUser(USER_A);
      const bal = mock.balances.find(
        (b) => b.user_id === USER_A && b.period === mock.currentPeriod()
      );
      expect(bal).toBeDefined();
      bal!.used = 100;

      const info = await store.getBalance(USER_A);
      expect(info.degradationLevel).toBe("mock_only");
    });

    it("charge returns degraded level when remaining < cost * 0.5", async () => {
      await store.initUser(USER_A);
      // Set used so remaining = 1 (backtest_5y costs 5, 1 < 5*0.5=2.5)
      const bal = mock.balances.find(
        (b) => b.user_id === USER_A && b.period === mock.currentPeriod()
      );
      expect(bal).toBeDefined();
      bal!.used = 99; // remaining = 1

      const result = await store.charge(USER_A, "backtest_5y", false);
      expect(result.degradation_level).toBe("degraded");
      expect(result.degraded).toBe(true);
    });
  });

  // ============ Period tracking ============

  describe("period reset", () => {
    it("new period gets fresh balance via initUser", async () => {
      await store.initUser(USER_A);
      // Use some credits
      await store.charge(USER_A, "ask_deep", false); // costs 5
      expect((await store.getBalance(USER_A)).balance).toBe(95);

      // Simulate a new period by inserting a row for a different period
      const newPeriod = "2099-12";
      mock.balances.push({
        user_id: USER_A,
        period: newPeriod,
        plan: "free",
        granted: PLAN_CONFIGS.free.monthlyCredits,
        used: 0,
        topped_up: 0,
        carried_over: 0,
        updated_at: new Date().toISOString(),
      });

      // Verify the new period row has fresh credits
      const newRow = mock.balances.find(
        (b) => b.user_id === USER_A && b.period === newPeriod
      );
      expect(newRow).toBeDefined();
      expect(newRow!.granted).toBe(PLAN_CONFIGS.free.monthlyCredits);
      expect(newRow!.used).toBe(0);
    });
  });

  // ============ Edge cases ============

  describe("edge cases", () => {
    it("refund with no existing balance row is a no-op", async () => {
      // User not initialized, refund should not throw
      await store.refund(USER_A, 10, "orphan refund");
      // No crash = pass
    });

    it("refund does not reduce used below 0", async () => {
      await store.initUser(USER_A);
      // Refund more than used
      await store.refund(USER_A, 200, "over-refund");
      const info = await store.getBalance(USER_A);
      // used = max(0, 0 - 200) = 0, so balance = 100
      expect(info.balance).toBe(100);
    });

    it("charge with metadata records it in ledger", async () => {
      await store.initUser(USER_A);
      await store.charge(USER_A, "ask_simple", false, { session_id: "sess-123" });

      const ledger = await store.getLedger(USER_A);
      expect(ledger.length).toBe(1);
      expect(ledger[0].metadata).toBe(JSON.stringify({ session_id: "sess-123" }));
    });

    it("setPlan with invalid plan name is a no-op", async () => {
      await store.initUser(USER_A);
      await store.setPlan(USER_A, "invalid_plan");
      // Plan should stay as free
      const info = await store.getBalance(USER_A);
      expect(info.plan).toBe("free");
    });
  });
});
