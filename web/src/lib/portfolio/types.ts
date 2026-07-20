/**
 * Portfolio Optimization — Type definitions
 *
 * Defines the contracts for Markowitz mean-variance portfolio optimization:
 *   - AssetReturn     — input: per-asset/strategy daily returns
 *   - PortfolioConfig — optimizer input: expected returns + covariance + constraints
 *   - PortfolioResult — optimizer output: weights + metrics + efficient frontier
 *   - PortfolioAllocation — single asset weight
 *   - FrontierPoint      — point on the efficient frontier
 */

/** Daily returns for a single asset or strategy. */
export interface AssetReturn {
  symbol: string;
  returns: number[];
}

/** Single asset allocation with its weight. */
export interface PortfolioAllocation {
  symbol: string;
  weight: number;
}

/** Point on the efficient frontier. */
export interface FrontierPoint {
  target_return: number;
  portfolio_risk: number;
  sharpe_ratio: number;
  allocations: PortfolioAllocation[];
}

/** Configuration for Markowitz optimization. */
export interface PortfolioConfig {
  /** Mean return per asset/strategy (length N). */
  expected_returns: number[];
  /** N×N covariance matrix (must be symmetric positive semi-definite). */
  covariance_matrix: number[][];
  /** Risk-free rate for Sharpe ratio computation. Default 0. */
  risk_free_rate?: number;
  /** Weight constraints. */
  constraints?: {
    /** Minimum weight per asset. Default 0 (no short selling). */
    min_weight?: number;
    /** Maximum weight per asset. Default 1. */
    max_weight?: number;
  };
}

/** Result of portfolio optimization. */
export interface PortfolioResult {
  /** Optimal weights summing to 1. */
  weights: number[];
  /** Portfolio expected return = w' * mu. */
  expected_return: number;
  /** Portfolio variance = w' * Sigma * w. */
  portfolio_variance: number;
  /** Sharpe ratio = (return - rf) / std. */
  sharpe_ratio: number;
  /** Efficient frontier points. */
  efficient_frontier: Array<{
    return: number;
    risk: number;
    weights: number[];
  }>;
}
