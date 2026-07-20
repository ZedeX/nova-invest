/**
 * Broker Risk Manager (Epic 06 §2.8).
 *
 * 5 hard constraints per PRD ID-4:
 *   1. Single order value > $50,000 -> reject
 *   2. Daily trade count > 100 -> reject
 *   3. Single ticker position > 30% of equity -> reject (buy only)
 *   4. Insufficient funds -> reject (buy only)
 *   5. Insufficient shares -> reject (sell only)
 */

import type { OrderRequest, ValidationResult, BrokerAccount, Position } from "./types";

export interface RiskConfig {
  maxOrderValue: number;
  maxDailyTrades: number;
  maxPositionPercent: number; // 30 = 30%
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxOrderValue: 50_000,
  maxDailyTrades: 100,
  maxPositionPercent: 30,
};

export class BrokerRiskManager {
  constructor(private config: RiskConfig = DEFAULT_RISK_CONFIG) {}

  validateOrder(
    order: OrderRequest,
    account: BrokerAccount,
    positions: Position[],
    dailyTradeCount: number,
    estimatedPrice: number,
  ): ValidationResult {
    // Rule 1: Single order value cap
    const orderValue = order.quantity * estimatedPrice;
    if (orderValue > this.config.maxOrderValue) {
      return {
        ok: false,
        reason: `Order exceeds max value ($${orderValue.toFixed(2)} > $${this.config.maxOrderValue})`,
      };
    }

    // Rule 2: Daily trade count cap
    if (dailyTradeCount >= this.config.maxDailyTrades) {
      return {
        ok: false,
        reason: `Daily trade limit reached (${dailyTradeCount} >= ${this.config.maxDailyTrades})`,
      };
    }

    // Rule 4: Insufficient funds (buy only) - checked BEFORE position percent
    // because insufficient funds implies the position percent would also fail.
    if (order.side === "buy") {
      if (orderValue > account.balance) {
        return {
          ok: false,
          reason: `Insufficient funds (need $${orderValue.toFixed(2)}, have $${account.balance.toFixed(2)})`,
        };
      }
    }

    // Rule 3: Single ticker position percent cap (buy only)
    if (order.side === "buy") {
      const equity = account.balance + this.sumPositionValue(positions);
      const existingPos = positions.find((p) => p.ticker === order.ticker);
      const existingValue = (existingPos?.quantity ?? 0) * (existingPos?.current_price ?? estimatedPrice);
      const newPct = ((existingValue + orderValue) / equity) * 100;
      if (newPct > this.config.maxPositionPercent) {
        return {
          ok: false,
          reason: `Position in ${order.ticker} would exceed ${this.config.maxPositionPercent}% of equity (${newPct.toFixed(1)}%)`,
        };
      }
    }

    // Rule 5: Insufficient shares (sell only)
    if (order.side === "sell") {
      const pos = positions.find((p) => p.ticker === order.ticker);
      const held = pos?.quantity ?? 0;
      if (order.quantity > held) {
        return {
          ok: false,
          reason: `Insufficient shares (have ${held}, want ${order.quantity})`,
        };
      }
    }

    return { ok: true };
  }

  private sumPositionValue(positions: Position[]): number {
    return positions.reduce((sum, p) => sum + p.quantity * (p.current_price ?? p.avg_price), 0);
  }
}
