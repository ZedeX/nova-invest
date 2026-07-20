/**
 * D1-backed Credit Store (Phase 2 of Appendix A: Credit Billing System).
 *
 * Replaces the in-memory Map from store.ts with D1 persistence.
 * Supports both production (real D1) and local dev (mock D1).
 *
 * Key behaviors (same as in-memory store):
 *   - Mock mode (USE_MOCK=true): all charges are 0
 *   - Degradation chain: normal -> degraded (cheaper model) -> mock_only
 *   - Per-action cost table from billing_credit_system.md S3.1
 *   - Rate limiting: warn at < action_cost, degrade at < 50%, block at 0
 *   - Period tracking: monthly reset based on period column
 *
 * D1 limitations:
 *   - No native transactions; uses sequential read-then-write
 *   - AUTOINCREMENT for ledger id
 */

import type {
  CreditAction,
  CreditPlan,
  DegradationLevel,
} from "./types";
import { ACTION_COSTS, PLAN_CONFIGS } from "./types";

// ============ Minimal D1 binding interface ============
// Avoids pulling @cloudflare/workers-types as a runtime dependency.
// Only declares the methods actually used by this module.

interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

// ============ D1 Row Types ============

interface D1CreditBalanceRow {
  user_id: string;
  period: string;
  plan: string;
  granted: number;
  used: number;
  topped_up: number;
  carried_over: number;
  updated_at: string;
}

export interface D1LedgerRow {
  id: number;
  user_id: string;
  action: string;
  amount: number;
  balance_after: number;
  metadata: string | null;
  created_at: string;
}

export interface D1ChargeResult {
  ok: boolean;
  amount: number;
  remaining: number;
  degraded: boolean;
  degradation_level: DegradationLevel;
  reason?: string;
}

export interface D1BalanceInfo {
  balance: number;
  plan: string;
  degradationLevel: DegradationLevel;
}

// ============ Period helpers ============

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ============ Degradation logic ============

function computeDegradationLevel(remaining: number): DegradationLevel {
  if (remaining <= 0) return "mock_only";
  if (remaining < 1) return "degraded";
  return "normal";
}

// ============ D1 Credit Store ============

export class D1CreditStore {
  constructor(private db: D1Database) {}

  /** Get user's current balance, plan, and degradation level */
  async getBalance(userId: string): Promise<D1BalanceInfo> {
    const period = currentPeriod();
    const row = await this.db
      .prepare(
        "SELECT user_id, period, plan, granted, used, topped_up, carried_over, updated_at " +
        "FROM credit_balances WHERE user_id = ? AND period = ?"
      )
      .bind(userId, period)
      .first<D1CreditBalanceRow>();

    if (!row) {
      // User does not exist for this period; return free plan defaults
      return {
        balance: PLAN_CONFIGS.free.monthlyCredits,
        plan: "free",
        degradationLevel: "normal",
      };
    }

    const remaining = row.granted + row.topped_up + row.carried_over - row.used;
    return {
      balance: remaining,
      plan: row.plan,
      degradationLevel: computeDegradationLevel(remaining),
    };
  }

  /** Charge credits for an action. Returns charge result with degradation info. */
  async charge(
    userId: string,
    action: CreditAction,
    isMock: boolean,
    metadata?: Record<string, unknown>,
  ): Promise<D1ChargeResult> {
    const period = currentPeriod();

    // Rule 1: Mock mode -> 0 charge
    if (isMock) {
      const info = await this.getBalance(userId);
      return {
        ok: true,
        amount: 0,
        remaining: info.balance,
        degraded: false,
        degradation_level: "normal",
        reason: "mock_mode",
      };
    }

    // Rule 2: Free actions -> 0 charge
    const cost = ACTION_COSTS[action];
    if (cost === 0) {
      const info = await this.getBalance(userId);
      return {
        ok: true,
        amount: 0,
        remaining: info.balance,
        degraded: false,
        degradation_level: "normal",
        reason: "free_action",
      };
    }

    // Ensure user has a balance row for this period
    await this.initUser(userId);

    // Fetch current balance
    const row = await this.db
      .prepare(
        "SELECT granted, used, topped_up, carried_over FROM credit_balances WHERE user_id = ? AND period = ?"
      )
      .bind(userId, period)
      .first<D1CreditBalanceRow>();

    if (!row) {
      // Should not happen after initUser, but guard
      return {
        ok: false,
        amount: 0,
        remaining: 0,
        degraded: true,
        degradation_level: "mock_only",
        reason: "No balance record found.",
      };
    }

    const remaining = row.granted + row.topped_up + row.carried_over - row.used;

    // Rule 3: Check remaining -> degradation chain
    if (remaining <= 0) {
      return {
        ok: false,
        amount: 0,
        remaining: 0,
        degraded: true,
        degradation_level: "mock_only",
        reason: "Credit exhausted. Only free actions and mock mode available.",
      };
    }

    let chargeAmount = cost;
    let degraded = false;
    let degradationLevel: DegradationLevel = "normal";

    if (remaining < cost * 0.5) {
      // Degrade: allow operation but with cheaper model (~40% cost)
      chargeAmount = Math.ceil(cost * 0.4);
      degraded = true;
      degradationLevel = "degraded";
    } else if (remaining < cost) {
      // Warn but allow at full cost
      degraded = false;
      degradationLevel = "normal";
    }

    // Deduct balance
    const newUsed = row.used + chargeAmount;
    const newRemaining = row.granted + row.topped_up + row.carried_over - newUsed;

    await this.db
      .prepare(
        "UPDATE credit_balances SET used = ?, updated_at = datetime('now') WHERE user_id = ? AND period = ?"
      )
      .bind(newUsed, userId, period)
      .run();

    // Insert ledger entry
    await this.db
      .prepare(
        "INSERT INTO credit_transactions (user_id, action, amount, balance_after, metadata, created_at) " +
        "VALUES (?, ?, ?, ?, ?, datetime('now'))"
      )
      .bind(
        userId,
        action,
        chargeAmount,
        newRemaining,
        metadata ? JSON.stringify(metadata) : null,
      )
      .run();

    return {
      ok: true,
      amount: chargeAmount,
      remaining: newRemaining,
      degraded,
      degradation_level: degradationLevel,
    };
  }

  /** Refund credits to a user */
  async refund(userId: string, amount: number, reason: string): Promise<void> {
    const period = currentPeriod();

    // Fetch current balance
    const row = await this.db
      .prepare(
        "SELECT used, granted, topped_up, carried_over FROM credit_balances WHERE user_id = ? AND period = ?"
      )
      .bind(userId, period)
      .first<D1CreditBalanceRow>();

    if (!row) return;

    const newUsed = Math.max(0, row.used - amount);
    const newRemaining = row.granted + row.topped_up + row.carried_over - newUsed;

    // Update balance
    await this.db
      .prepare(
        "UPDATE credit_balances SET used = ?, updated_at = datetime('now') WHERE user_id = ? AND period = ?"
      )
      .bind(newUsed, userId, period)
      .run();

    // Insert refund ledger entry (negative amount)
    await this.db
      .prepare(
        "INSERT INTO credit_transactions (user_id, action, amount, balance_after, metadata, created_at) " +
        "VALUES (?, 'refund', ?, ?, ?, datetime('now'))"
      )
      .bind(userId, -amount, newRemaining, JSON.stringify({ refund_reason: reason }))
      .run();
  }

  /** Upgrade or downgrade user plan. Resets granted credits to new plan amount. */
  async setPlan(userId: string, plan: string): Promise<void> {
    const period = currentPeriod();
    const config = PLAN_CONFIGS[plan as CreditPlan];
    if (!config) return;

    // Check if user exists for this period
    const row = await this.db
      .prepare(
        "SELECT used, topped_up, carried_over FROM credit_balances WHERE user_id = ? AND period = ?"
      )
      .bind(userId, period)
      .first<D1CreditBalanceRow>();

    if (row) {
      // Update existing row
      await this.db
        .prepare(
          "UPDATE credit_balances SET plan = ?, granted = ?, updated_at = datetime('now') WHERE user_id = ? AND period = ?"
        )
        .bind(config.monthlyCredits, plan, userId, period)
        .run();
    } else {
      // Insert new row
      await this.db
        .prepare(
          "INSERT INTO credit_balances (user_id, period, plan, granted, used, topped_up, carried_over, updated_at) " +
          "VALUES (?, ?, ?, ?, 0, 0, 0, datetime('now'))"
        )
        .bind(userId, period, plan, config.monthlyCredits)
        .run();
    }
  }

  /** Get ledger history for a user */
  async getLedger(userId: string, limit = 50): Promise<D1LedgerRow[]> {
    const result = await this.db
      .prepare(
        "SELECT id, user_id, action, amount, balance_after, metadata, created_at " +
        "FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
      )
      .bind(userId, limit)
      .all<D1LedgerRow>();

    return result.results;
  }

  /** Initialize a new user with Free plan and default credits for current period */
  async initUser(userId: string): Promise<void> {
    const period = currentPeriod();

    // Check if user already exists for this period
    const existing = await this.db
      .prepare(
        "SELECT user_id FROM credit_balances WHERE user_id = ? AND period = ?"
      )
      .bind(userId, period)
      .first();

    if (existing) return;

    const config = PLAN_CONFIGS.free;
    await this.db
      .prepare(
        "INSERT INTO credit_balances (user_id, period, plan, granted, used, topped_up, carried_over, updated_at) " +
        "VALUES (?, ?, 'free', ?, 0, 0, 0, datetime('now'))"
      )
      .bind(userId, period, config.monthlyCredits)
      .run();
  }
}
