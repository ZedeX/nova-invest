/**
 * Playbook Executor (Epic 08 §2.4, ID-7).
 *
 * Executes PlaybookYAML by kind:
 *   - strategy:      delegate to BacktestEngine or Broker (Phase 1: log only)
 *   - composite:     dispatch by composition type
 *     - parallel:    split capital by weight, run all children concurrently
 *     - sequential:  run in order, pass state between steps
 *     - conditional: evaluate if-rule, run then or else branch
 *   - data_fetcher:  fetch data (Phase 1: no-op stub)
 *   - risk_manager:  apply risk rules (Phase 1: log only)
 *   - alert:         send alert (Phase 1: log only)
 *   - narrative:     not executable, return skipped
 *
 * See: docs/prd/epic/08_Playbook_System.md
 */

import type { BacktestConfig } from "@/lib/backtest/types";
import type {
  Composition,
  ExecutionContext,
  ExecutionResult,
  PlaybookYAML,
} from "./types";
import { parseAndCompile } from "@/lib/dsl/parser";
import { BacktestEngine } from "@/lib/backtest/engine";

/** Loader function: fetch a child PlaybookYAML by ID. */
export type PlaybookLoader = (id: string) => Promise<PlaybookYAML | null>;

export class PlaybookExecutor {
  constructor(private loader: PlaybookLoader) {}

  async execute(
    playbook: PlaybookYAML,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const id = playbook.metadata.id;

    try {
      switch (playbook.kind) {
        case "strategy":
          return await this.runStrategy(playbook, context);

        case "composite":
          if (!playbook.composition) {
            return { playbook_id: id, status: "failed", error: "composite kind requires composition" };
          }
          return await this.runComposite(playbook.composition, context);

        case "data_fetcher":
          // Phase 1: no-op stub
          return { playbook_id: id, status: "success", result: "data_fetched (stub)" };

        case "risk_manager":
          // Phase 1: log only
          console.log(`[PlaybookExecutor] risk_manager ${id} applied`);
          return { playbook_id: id, status: "success", result: "risk_rules_applied (stub)" };

        case "alert":
          // Phase 1: log only
          console.log(`[PlaybookExecutor] alert ${id} sent`);
          return { playbook_id: id, status: "success", result: "alert_sent (stub)" };

        case "narrative":
          // Not executable
          return { playbook_id: id, status: "skipped", result: "narrative kind is not executable" };

        default:
          return { playbook_id: id, status: "failed", error: `Unknown kind: ${playbook.kind}` };
      }
    } catch (e) {
      return {
        playbook_id: id,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ============ Strategy execution ============

  private async runStrategy(
    playbook: PlaybookYAML,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    if (!playbook.strategy) {
      return { playbook_id: playbook.metadata.id, status: "failed", error: "no strategy field" };
    }

    const dsl = playbook.strategy.dsl;
    if (!dsl) {
      return { playbook_id: playbook.metadata.id, status: "failed", error: "no DSL expression" };
    }

    try {
      // Parse and compile DSL expression to Strategy
      const { strategy } = parseAndCompile(dsl);

      // Create backtest config from strategy + context
      const config: BacktestConfig = {
        strategy,
        start_date: playbook.strategy.start_date ?? context.start_date ?? "2024-01-01",
        end_date: playbook.strategy.end_date ?? context.end_date ?? "2024-12-31",
        initial_capital: context.capital,
        fee_bps: playbook.strategy.fee_bps ?? 5,
        slippage_bps: playbook.strategy.slippage_bps ?? 5,
      };

      const engine = new BacktestEngine(config);

      // Get klines from context or mock data
      const klines = context.klines ?? [];
      if (klines.length === 0) {
        return { playbook_id: playbook.metadata.id, status: "failed", error: "no kline data available" };
      }

      const result = await engine.run(klines);

      return {
        playbook_id: playbook.metadata.id,
        status: "success",
        result: {
          trades: result.trades.length,
          total_return: result.metrics.total_return,
          sharpe: result.metrics.sharpe,
          max_drawdown: result.metrics.max_drawdown,
          win_rate: result.metrics.win_rate,
          metrics: result.metrics,
        },
      };
    } catch (e) {
      return {
        playbook_id: playbook.metadata.id,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ============ Composite execution ============

  private async runComposite(
    comp: Composition,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    switch (comp.type) {
      case "parallel":
        return await this.runParallel(comp, context);
      case "sequential":
        return await this.runSequential(comp, context);
      case "conditional":
        return await this.runConditional(comp, context);
      default:
        return { playbook_id: "composite", status: "failed", error: `Unknown composition type: ${comp.type}` };
    }
  }

  /** Parallel: split capital by weight, run all children concurrently. */
  private async runParallel(
    comp: Composition,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    if (!comp.allocation) {
      return { playbook_id: "parallel", status: "failed", error: "no allocation" };
    }
    const children = await Promise.all(
      comp.allocation.map(async (a) => {
        const childCapital = context.capital * a.weight;
        const childCtx: ExecutionContext = { ...context, capital: childCapital };
        const child = await this.loader(a.playbook_id);
        if (!child) {
          return {
            playbook_id: a.playbook_id,
            status: "failed" as const,
            error: `Playbook ${a.playbook_id} not found`,
          };
        }
        return this.execute(child, childCtx);
      }),
    );
    return {
      playbook_id: "parallel",
      status: "success",
      children: await Promise.all(children),
    };
  }

  /** Sequential: run in order, pass state between steps. */
  private async runSequential(
    comp: Composition,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    if (!comp.sequence) {
      return { playbook_id: "sequential", status: "failed", error: "no sequence" };
    }
    const results: ExecutionResult[] = [];
    const state: Record<string, unknown> = { ...context.state };

    for (const step of comp.sequence) {
      const child = await this.loader(step.playbook_id);
      if (!child) {
        results.push({
          playbook_id: step.playbook_id,
          status: "failed",
          error: `Playbook ${step.playbook_id} not found`,
        });
        break; // Stop sequence on failure
      }
      const childCtx: ExecutionContext = { ...context, state };
      const result = await this.execute(child, childCtx);
      results.push(result);

      if (result.status === "failed") {
        break; // Stop sequence on failure
      }

      // Merge result into state for next step
      if (result.result && typeof result.result === "object") {
        Object.assign(state, result.result);
      }
    }

    return {
      playbook_id: "sequential",
      status: results.some((r) => r.status === "failed") ? "failed" : "success",
      children: results,
    };
  }

  /** Conditional: evaluate if-rule, run then or else branch. */
  private async runConditional(
    comp: Composition,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    if (!comp.condition) {
      return { playbook_id: "conditional", status: "failed", error: "no condition" };
    }
    const cond = comp.condition;
    const fieldValue = context.state?.[cond.if.field] ?? cond.if.value;
    const matches = evaluateCondition(fieldValue, cond.if.op, cond.if.value);

    const targetId = matches ? cond.then : cond.else;
    if (!targetId) {
      return {
        playbook_id: "conditional",
        status: "success",
        result: { condition_met: matches, branch: "none" },
      };
    }

    const child = await this.loader(targetId);
    if (!child) {
      return {
        playbook_id: "conditional",
        status: "failed",
        error: `Playbook ${targetId} not found`,
      };
    }
    const childResult = await this.execute(child, context);
    return {
      playbook_id: "conditional",
      status: "success",
      result: { condition_met: matches, branch: matches ? "then" : "else" },
      children: [childResult],
    };
  }
}

/** Evaluate a simple condition: fieldValue OP targetValue. */
function evaluateCondition(fieldValue: unknown, op: string, targetValue: unknown): boolean {
  const a = Number(fieldValue);
  const b = Number(targetValue);
  if (isNaN(a) || isNaN(b)) return false;
  switch (op) {
    case ">":  return a > b;
    case "<":  return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case "==": return a === b;
    case "!=": return a !== b;
    default:   return false;
  }
}
