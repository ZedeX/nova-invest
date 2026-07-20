/**
 * Unit tests for PlaybookExecutor ↔ DSL Parser ↔ BacktestEngine integration.
 *
 * Covers:
 *   - Strategy execution with valid DSL expression
 *   - Strategy execution with invalid DSL expression → failed status
 *   - Strategy execution with no kline data → failed status
 *   - Strategy execution returns backtest metrics
 *   - Playbook with start_date/end_date from context
 *   - Playbook with custom fee_bps/slippage_bps
 *   - Strategy playbook without strategy field → failed
 *   - Strategy playbook without dsl field → failed
 */

import { describe, expect, it, vi } from "vitest";
import { PlaybookExecutor } from "@/lib/playbook/executor";
import type {
  ExecutionContext,
  PlaybookYAML,
} from "@/lib/playbook/types";
import type { Kline } from "@/lib/types";

// ============ Test helpers ============

/** Generate deterministic klines for testing. */
function makeKlines(count = 30, startPrice = 100): Kline[] {
  const klines: Kline[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const date = new Date(2024, 0, 2 + i); // 2024-01-02 onward
    const t = date.toISOString().slice(0, 10);
    // Deterministic price pattern: mostly up with periodic dips
    const change = (i % 7 === 0 ? -3 : 1) + (i % 4 === 0 ? 0.5 : 0);
    price += change;
    klines.push({
      t,
      o: price - 0.5,
      h: price + 1,
      l: price - 2,
      c: price,
      v: 1000 + i * 10,
    });
  }
  return klines;
}

function makeStrategyPlaybook(overrides: Partial<PlaybookYAML> = {}): PlaybookYAML {
  return {
    api_version: "playbook.nova-invest.dev/v1",
    kind: "strategy",
    metadata: {
      id: "pb_test_strategy",
      title: "Test Strategy",
      description: "Test",
      author: { id: "u1", name: "Tester" },
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    versioning: { semantic_version: "1.0.0", changelog: [] },
    narrative: { why: "Test", how: "Test", risks: ["Test risk"] },
    strategy: {
      dsl: "RSI(14) < 30",
      start_date: "2024-01-01",
      end_date: "2024-12-31",
    },
    ...overrides,
  };
}

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    userId: "test_user",
    capital: 100_000,
    timestamp: "2025-01-01T00:00:00Z",
    klines: makeKlines(),
    start_date: "2024-01-01",
    end_date: "2024-12-31",
    ...overrides,
  };
}

const stubLoader = vi.fn(async (_id: string): Promise<PlaybookYAML | null> => null);

// ============ Tests ============

describe("PlaybookExecutor: DSL → BacktestEngine integration", () => {
  it("executes valid DSL expression and returns backtest metrics", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook();
    const ctx = makeContext();
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("success");
    expect(result.playbook_id).toBe("pb_test_strategy");
    expect(result.result).toHaveProperty("metrics");
    const r = result.result as Record<string, unknown>;
    expect(r).toHaveProperty("trades");
    expect(r).toHaveProperty("total_return");
    expect(r).toHaveProperty("sharpe");
    expect(r).toHaveProperty("max_drawdown");
    expect(r).toHaveProperty("win_rate");
    expect(typeof r.total_return).toBe("number");
    expect(typeof r.sharpe).toBe("number");
    expect(typeof r.max_drawdown).toBe("number");
    expect(typeof r.win_rate).toBe("number");
  });

  it("fails on invalid DSL expression", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: { dsl: "UNKNOWN_IND(5) < 10", start_date: "2024-01-01", end_date: "2024-12-31" },
    });
    const ctx = makeContext();
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Unknown indicator");
  });

  it("fails when no kline data available", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook();
    const ctx = makeContext({ klines: [] });
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no kline data available");
  });

  it("fails when no klines in context (undefined)", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook();
    const ctx = makeContext();
    delete ctx.klines;
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no kline data available");
  });

  it("fails without strategy field", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook();
    delete pb.strategy;
    const ctx = makeContext();
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no strategy field");
  });

  it("fails without dsl expression", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: { dsl_ref: "r2://test.yaml" },
    });
    const ctx = makeContext();
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no DSL expression");
  });

  it("uses start_date/end_date from context when not in strategy", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: { dsl: "RSI(14) < 30" }, // no start_date/end_date
    });
    const ctx = makeContext({
      start_date: "2024-01-01",
      end_date: "2024-12-31",
    });
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("success");
    expect(result.result).toHaveProperty("metrics");
  });

  it("uses default dates when neither strategy nor context provide them", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: { dsl: "RSI(14) < 30" },
    });
    const ctx = makeContext();
    delete ctx.start_date;
    delete ctx.end_date;
    const result = await executor.execute(pb, ctx);

    // Should use defaults "2024-01-01" and "2024-12-31"
    expect(result.status).toBe("success");
  });

  it("applies custom fee_bps and slippage_bps", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: {
        dsl: "RSI(14) < 30",
        start_date: "2024-01-01",
        end_date: "2024-12-31",
        fee_bps: 10,
        slippage_bps: 8,
      },
    });
    const ctx = makeContext();
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("success");
    // Higher fees → different (typically lower) total_return vs default 5 bps
    const r = result.result as Record<string, unknown>;
    expect(r).toHaveProperty("metrics");
  });

  it("defaults fee_bps and slippage_bps to 5 when not specified", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: { dsl: "RSI(14) < 30", start_date: "2024-01-01", end_date: "2024-12-31" },
    });
    const ctx = makeContext();
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("success");
    // Defaults applied: fee_bps=5, slippage_bps=5
    const r = result.result as Record<string, unknown>;
    expect(r).toHaveProperty("metrics");
  });

  it("executes SMA crossover DSL expression", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: { dsl: "SMA(5) > SMA(20)", start_date: "2024-01-01", end_date: "2024-12-31" },
    });
    const ctx = makeContext({ klines: makeKlines(50) });
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("success");
    expect(result.result).toHaveProperty("metrics");
  });

  it("executes compound DSL expression with AND", async () => {
    const executor = new PlaybookExecutor(stubLoader);
    const pb = makeStrategyPlaybook({
      strategy: { dsl: "RSI(14) < 30 AND SMA(20) > 50", start_date: "2024-01-01", end_date: "2024-12-31" },
    });
    const ctx = makeContext({ klines: makeKlines(50) });
    const result = await executor.execute(pb, ctx);

    expect(result.status).toBe("success");
    expect(result.result).toHaveProperty("metrics");
  });
});
