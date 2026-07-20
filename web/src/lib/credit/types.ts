/**
 * Credit System Types (Appendix A: Credit Billing System).
 *
 * Phase 1: in-memory store with mock seed data.
 * Phase 2: D1 persistence + Stripe integration.
 *
 * Per billing_credit_system.md:
 *   - 4 tiers: Free/Pro/Team/Enterprise
 *   - Per-action billing table
 *   - Mock mode: 0 credit consumption
 *   - Degradation chain: normal → cheap model → mock-only
 */

// ============ Plan & Tier ============

export type CreditPlan = "free" | "pro" | "team" | "enterprise";

export interface PlanConfig {
  name: string;
  monthlyPrice: number;
  monthlyCredits: number;
  overagePricePerCredit: number;
  carryOver: boolean;
}

export const PLAN_CONFIGS: Record<CreditPlan, PlanConfig> = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    monthlyCredits: 100,
    overagePricePerCredit: 0, // no overage, degrades instead
    carryOver: false,
  },
  pro: {
    name: "Pro",
    monthlyPrice: 29,
    monthlyCredits: 1000,
    overagePricePerCredit: 0.05,
    carryOver: false,
  },
  team: {
    name: "Team",
    monthlyPrice: 99,
    monthlyCredits: 5000,
    overagePricePerCredit: 0.04,
    carryOver: true,
  },
  enterprise: {
    name: "Enterprise",
    monthlyPrice: 0, // custom
    monthlyCredits: 0, // custom
    overagePricePerCredit: 0, // custom
    carryOver: true,
  },
};

// ============ Action Cost Table ============

export type CreditAction =
  | "ask_simple"
  | "ask_deep"
  | "ask_tool_call"
  | "strategy_validate"
  | "strategy_llm_generate"
  | "backtest_1y"
  | "backtest_5y"
  | "backtest_extra_symbol"
  | "backtest_walk_forward"
  | "paper_trade"
  | "playbook_publish"
  | "playbook_install"
  | "rag_advanced"
  | "realtime_quote_24h";

export const ACTION_COSTS: Record<CreditAction, number> = {
  ask_simple: 1,
  ask_deep: 5,
  ask_tool_call: 2,
  strategy_validate: 0,
  strategy_llm_generate: 3,
  backtest_1y: 2,
  backtest_5y: 5,
  backtest_extra_symbol: 1,
  backtest_walk_forward: 5,
  paper_trade: 1,
  playbook_publish: 0,
  playbook_install: 1,
  rag_advanced: 2,
  realtime_quote_24h: 5,
};

// ============ Balance ============

export interface CreditBalance {
  user_id: string;
  period: string; // "YYYY-MM"
  plan: CreditPlan;
  granted: number;
  used: number;
  topped_up: number;
  carried_over: number;
  remaining: number;
  forecast_burn_rate: number; // daily burn rate estimate
}

// ============ Transaction ============

export interface CreditTransaction {
  id: number;
  user_id: string;
  action: CreditAction;
  amount: number; // positive = debit, negative = refund
  balance_after: number;
  metadata?: string; // JSON string
  created_at: string;
}

// ============ Charge Result ============

export type DegradationLevel = "normal" | "degraded" | "mock_only";

export interface ChargeResult {
  ok: boolean;
  amount: number;
  remaining: number;
  degraded: boolean;
  degradation_level: DegradationLevel;
  reason?: string;
}

// ============ Order (Phase 2: Stripe) ============

export type OrderStatus = "pending" | "paid" | "failed";

export interface CreditOrder {
  id: string;
  user_id: string;
  amount_usd: number;
  credits: number;
  order_status: OrderStatus; // per ADR-0011 Rule #6: no bare 'status' column
  stripe_id: string | null;
  created_at: string;
}

// ============ Refund Rules ============

export interface RefundRule {
  scenario: string;
  refund: string;
}
