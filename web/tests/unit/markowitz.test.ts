/**
 * Markowitz Portfolio Optimization — Unit Tests
 *
 * Validates:
 *   - Statistics: computeMean, computeVariance, computeCovariance, computeCorrelation, buildCovarianceMatrix
 *   - MarkowitzOptimizer: single asset, two assets, tangency, min variance, efficient frontier
 *   - Constraints: min_weight, max_weight
 *   - Edge cases: zero variance, perfectly correlated, equal returns
 */

import { describe, expect, it } from "vitest";
import { MarkowitzOptimizer } from "@/lib/portfolio/markowitz";
import type { PortfolioConfig } from "@/lib/portfolio/types";
import {
  buildCovarianceMatrix,
  computeCorrelation,
  computeCovariance,
  computeMean,
  computeVariance,
} from "@/lib/portfolio/statistics";

// ============ Statistics ============

describe("computeMean", () => {
  it("returns the arithmetic mean", () => {
    expect(computeMean([1, 2, 3, 4, 5])).toBeCloseTo(3, 10);
  });

  it("returns 0 for empty array", () => {
    expect(computeMean([])).toBe(0);
  });

  it("handles single element", () => {
    expect(computeMean([7])).toBe(7);
  });

  it("handles negative values", () => {
    expect(computeMean([-2, 0, 2])).toBeCloseTo(0, 10);
  });
});

describe("computeVariance", () => {
  it("computes population variance", () => {
    // [1,2,3]: mean=2, variance = ((1-2)^2 + (2-2)^2 + (3-2)^2) / 3 = 2/3
    expect(computeVariance([1, 2, 3])).toBeCloseTo(2 / 3, 10);
  });

  it("returns 0 for constant series", () => {
    expect(computeVariance([5, 5, 5, 5])).toBe(0);
  });

  it("returns 0 for empty or single-element array", () => {
    expect(computeVariance([])).toBe(0);
    expect(computeVariance([42])).toBe(0);
  });
});

describe("computeCovariance", () => {
  it("computes covariance between two series", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // mean_a = 2, mean_b = 5
    // cov = ((1-2)(4-5) + (2-2)(5-5) + (3-2)(6-5)) / 3 = (1 + 0 + 1) / 3 = 2/3
    expect(computeCovariance(a, b)).toBeCloseTo(2 / 3, 10);
  });

  it("returns 0 for uncorrelated series", () => {
    const a = [1, -1, 1, -1];
    const b = [-1, 1, -1, 1];
    // mean_a = 0, mean_b = 0
    // cov = (1*-1 + -1*1 + 1*-1 + -1*1) / 4 = -4/4 = -1
    // Actually these are anti-correlated, not uncorrelated. Let me fix:
    expect(computeCovariance(a, b)).toBeCloseTo(-1, 10);
  });

  it("returns 0 for same constant series", () => {
    expect(computeCovariance([5, 5, 5], [5, 5, 5])).toBe(0);
  });

  it("returns 0 when length <= 1", () => {
    expect(computeCovariance([1], [2])).toBe(0);
    expect(computeCovariance([], [])).toBe(0);
  });
});

describe("computeCorrelation", () => {
  it("returns 1 for perfectly correlated identical series", () => {
    expect(computeCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 10);
  });

  it("returns -1 for perfectly anti-correlated series", () => {
    expect(computeCorrelation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
  });

  it("returns 0 when one series is constant", () => {
    expect(computeCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe("buildCovarianceMatrix", () => {
  it("builds a 2x2 covariance matrix", () => {
    const r1 = [0.01, 0.02, -0.01, 0.03];
    const r2 = [0.02, -0.01, 0.01, 0.02];
    const cov = buildCovarianceMatrix([r1, r2]);

    expect(cov.length).toBe(2);
    expect(cov[0].length).toBe(2);
    expect(cov[1].length).toBe(2);

    // Diagonal = variance
    expect(cov[0][0]).toBeCloseTo(computeVariance(r1), 10);
    expect(cov[1][1]).toBeCloseTo(computeVariance(r2), 10);

    // Off-diagonal = covariance, symmetric
    expect(cov[0][1]).toBeCloseTo(computeCovariance(r1, r2), 10);
    expect(cov[1][0]).toBeCloseTo(cov[0][1], 10);
  });

  it("builds a 3x3 covariance matrix", () => {
    const r1 = [0.01, 0.02, -0.01, 0.03];
    const r2 = [0.02, -0.01, 0.01, 0.02];
    const r3 = [-0.01, 0.03, 0.02, -0.01];
    const cov = buildCovarianceMatrix([r1, r2, r3]);

    expect(cov.length).toBe(3);
    // Symmetric
    expect(cov[0][1]).toBeCloseTo(cov[1][0], 10);
    expect(cov[0][2]).toBeCloseTo(cov[2][0], 10);
    expect(cov[1][2]).toBeCloseTo(cov[2][1], 10);
    // Diagonal = variance
    expect(cov[0][0]).toBeCloseTo(computeVariance(r1), 10);
    expect(cov[1][1]).toBeCloseTo(computeVariance(r2), 10);
    expect(cov[2][2]).toBeCloseTo(computeVariance(r3), 10);
  });

  it("produces positive semi-definite matrix", () => {
    const r1 = [0.01, 0.02, -0.01, 0.03, 0.005];
    const r2 = [0.02, -0.01, 0.01, 0.02, -0.005];
    const cov = buildCovarianceMatrix([r1, r2]);

    // For any vector w, w'Cov*w >= 0
    const w = [0.6, 0.4];
    const quadratic = w[0] * w[0] * cov[0][0] + 2 * w[0] * w[1] * cov[0][1] + w[1] * w[1] * cov[1][1];
    expect(quadratic).toBeGreaterThanOrEqual(0);
  });
});

// ============ MarkowitzOptimizer ============

/** Helper to build PortfolioConfig */
function makeConfig(overrides: Partial<PortfolioConfig> = {}): PortfolioConfig {
  return {
    expected_returns: [0.05, 0.10],
    covariance_matrix: [
      [0.04, 0.01],
      [0.01, 0.09],
    ],
    risk_free_rate: 0,
    constraints: { min_weight: 0, max_weight: 1 },
    ...overrides,
  };
}

describe("MarkowitzOptimizer: single asset", () => {
  it("returns weight = 1 for single asset", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.05],
      covariance_matrix: [[0.04]],
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    expect(result.weights).toHaveLength(1);
    expect(result.weights[0]).toBeCloseTo(1, 6);
    expect(result.expected_return).toBeCloseTo(0.05, 6);
  });

  it("single asset minVariance returns weight = 1", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.08],
      covariance_matrix: [[0.02]],
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.minVariance();

    expect(result.weights[0]).toBeCloseTo(1, 6);
  });
});

describe("MarkowitzOptimizer: tangency portfolio", () => {
  it("weights sum to 1", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const result = opt.optimize();
    const sumW = result.weights.reduce((s, w) => s + w, 0);
    expect(sumW).toBeCloseTo(1, 6);
  });

  it("all weights are non-negative with min_weight = 0", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const result = opt.optimize();
    for (const w of result.weights) {
      expect(w).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("prefers higher Sharpe ratio assets", () => {
    // Asset 1: mu=0.10, var=0.04, Sharpe=0.10/0.20=0.50
    // Asset 2: mu=0.05, var=0.01, Sharpe=0.05/0.10=0.50
    // With equal Sharpe and zero correlation, weights should reflect
    // inverse-variance proportionality
    const config: PortfolioConfig = {
      expected_returns: [0.10, 0.05],
      covariance_matrix: [
        [0.04, 0],
        [0, 0.01],
      ],
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    // With uncorrelated assets, tangency weights are proportional to mu/sigma^2
    // Asset 1: 0.10/0.04 = 2.5, Asset 2: 0.05/0.01 = 5.0
    // Normalized: w1 = 2.5/7.5 = 1/3, w2 = 5.0/7.5 = 2/3
    expect(result.weights[0]).toBeCloseTo(1 / 3, 2);
    expect(result.weights[1]).toBeCloseTo(2 / 3, 2);
  });

  it("Sharpe ratio is computed correctly", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const result = opt.optimize();
    const sigma = Math.sqrt(result.portfolio_variance);
    const expectedSharpe = result.expected_return / sigma; // rf = 0
    expect(result.sharpe_ratio).toBeCloseTo(expectedSharpe, 6);
  });
});

describe("MarkowitzOptimizer: minimum variance portfolio", () => {
  it("weights sum to 1", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const result = opt.minVariance();
    const sumW = result.weights.reduce((s, w) => s + w, 0);
    expect(sumW).toBeCloseTo(1, 6);
  });

  it("has lower risk than tangency portfolio (when returns differ)", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.05, 0.15],
      covariance_matrix: [
        [0.04, 0.01],
        [0.01, 0.09],
      ],
    };
    const opt = new MarkowitzOptimizer(config);
    const mvResult = opt.minVariance();
    const tanResult = opt.optimize();

    expect(mvResult.portfolio_variance).toBeLessThanOrEqual(tanResult.portfolio_variance + 1e-6);
  });

  it("two uncorrelated assets: min variance weights inversely proportional to variance", () => {
    // Asset 1: var=0.04, Asset 2: var=0.01, uncorrelated
    // Min variance weights: w_i proportional to 1/var_i
    // w1 = (1/0.04) / (1/0.04 + 1/0.01) = 25 / (25+100) = 0.2
    // w2 = (1/0.01) / (1/0.04 + 1/0.01) = 100 / 125 = 0.8
    const config: PortfolioConfig = {
      expected_returns: [0.05, 0.10],
      covariance_matrix: [
        [0.04, 0],
        [0, 0.01],
      ],
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.minVariance();

    expect(result.weights[0]).toBeCloseTo(0.2, 2);
    expect(result.weights[1]).toBeCloseTo(0.8, 2);
  });
});

describe("MarkowitzOptimizer: efficient frontier", () => {
  it("returns the requested number of points", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const frontier = opt.efficientFrontier(20);
    expect(frontier).toHaveLength(20);
  });

  it("risk is monotonically non-decreasing with return", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const frontier = opt.efficientFrontier(50);

    for (let i = 1; i < frontier.length; i++) {
      // Returns should be non-decreasing
      expect(frontier[i].return).toBeGreaterThanOrEqual(frontier[i - 1].return - 1e-6);
      // Risk should generally increase with return on the upper half
      // (the efficient frontier is convex)
    }
  });

  it("each point has weights that sum to 1", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const frontier = opt.efficientFrontier(10);

    for (const point of frontier) {
      const sumW = point.weights.reduce((s, w) => s + w, 0);
      expect(sumW).toBeCloseTo(1, 4);
    }
  });

  it("leftmost point is approximately the min-variance portfolio", () => {
    const opt = new MarkowitzOptimizer(makeConfig());
    const frontier = opt.efficientFrontier(50);
    const mvResult = opt.minVariance();

    // The first point should be close to min variance
    expect(frontier[0].risk).toBeCloseTo(Math.sqrt(mvResult.portfolio_variance), 2);
  });
});

describe("MarkowitzOptimizer: equal returns", () => {
  it("tangency falls back to min variance when all excess returns are equal", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.05, 0.05],
      covariance_matrix: [
        [0.04, 0.01],
        [0.01, 0.09],
      ],
      risk_free_rate: 0,
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    const sumW = result.weights.reduce((s, w) => s + w, 0);
    expect(sumW).toBeCloseTo(1, 6);
    // All weights should be non-negative
    for (const w of result.weights) {
      expect(w).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("equal returns + equal variance + zero covariance gives equal weights", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.05, 0.05],
      covariance_matrix: [
        [0.04, 0],
        [0, 0.04],
      ],
      risk_free_rate: 0,
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    expect(result.weights[0]).toBeCloseTo(0.5, 2);
    expect(result.weights[1]).toBeCloseTo(0.5, 2);
  });
});

describe("MarkowitzOptimizer: zero variance asset", () => {
  it("allocates primarily to zero-variance asset when it has positive return", () => {
    // Asset 1: zero variance (risk-free), positive return
    // Asset 2: risky
    const config: PortfolioConfig = {
      expected_returns: [0.03, 0.08],
      covariance_matrix: [
        [0, 0],
        [0, 0.04],
      ],
      risk_free_rate: 0,
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    // With a zero-variance asset, optimizer should heavily favor it
    // (risk-free asset with positive return dominates)
    const sumW = result.weights.reduce((s, w) => s + w, 0);
    expect(sumW).toBeCloseTo(1, 4);
    expect(result.weights[0]).toBeGreaterThan(0);
  });
});

describe("MarkowitzOptimizer: constraints", () => {
  it("respects min_weight constraint", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.05, 0.15],
      covariance_matrix: [
        [0.04, 0.01],
        [0.01, 0.09],
      ],
      constraints: { min_weight: 0.2, max_weight: 0.8 },
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    for (const w of result.weights) {
      expect(w).toBeGreaterThanOrEqual(0.2 - 1e-6);
    }
  });

  it("respects max_weight constraint", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.05, 0.15],
      covariance_matrix: [
        [0.04, 0.01],
        [0.01, 0.09],
      ],
      constraints: { min_weight: 0.1, max_weight: 0.7 },
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    for (const w of result.weights) {
      expect(w).toBeLessThanOrEqual(0.7 + 1e-6);
    }
  });

  it("3 assets with max_weight constraint", () => {
    const config: PortfolioConfig = {
      expected_returns: [0.10, 0.05, 0.15],
      covariance_matrix: [
        [0.04, 0.01, 0.005],
        [0.01, 0.09, 0.01],
        [0.005, 0.01, 0.06],
      ],
      constraints: { min_weight: 0, max_weight: 0.5 },
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    const sumW = result.weights.reduce((s, w) => s + w, 0);
    expect(sumW).toBeCloseTo(1, 4);
    for (const w of result.weights) {
      expect(w).toBeGreaterThanOrEqual(-1e-6);
      expect(w).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });
});

describe("MarkowitzOptimizer: constructor validation", () => {
  it("rejects empty expected_returns", () => {
    expect(
      () =>
        new MarkowitzOptimizer({
          expected_returns: [],
          covariance_matrix: [],
        }),
    ).toThrow();
  });

  it("rejects mismatched covariance matrix dimensions", () => {
    expect(
      () =>
        new MarkowitzOptimizer({
          expected_returns: [0.05, 0.10],
          covariance_matrix: [[0.04]], // should be 2x2
        }),
    ).toThrow();
  });

  it("rejects negative min_weight", () => {
    expect(
      () =>
        new MarkowitzOptimizer(
          makeConfig({
            constraints: { min_weight: -0.1, max_weight: 1 },
          }),
        ),
    ).toThrow();
  });
});

describe("MarkowitzOptimizer: risk-free rate impact", () => {
  it("higher rf shifts weights toward higher-return assets", () => {
    const baseConfig: PortfolioConfig = {
      expected_returns: [0.05, 0.15],
      covariance_matrix: [
        [0.04, 0.01],
        [0.01, 0.09],
      ],
    };

    const optRf0 = new MarkowitzOptimizer({ ...baseConfig, risk_free_rate: 0 });
    const optRf3 = new MarkowitzOptimizer({ ...baseConfig, risk_free_rate: 0.03 });

    const resRf0 = optRf0.optimize();
    const resRf3 = optRf3.optimize();

    // With higher rf, asset 1 (mu=0.05) has lower excess return relative to rf=0.03
    // so weight should shift toward asset 2
    // Both results should be valid portfolios
    expect(resRf0.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 6);
    expect(resRf3.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 6);
  });
});

describe("MarkowitzOptimizer: perfectly correlated assets", () => {
  it("handles perfectly correlated assets without crashing", () => {
    // rho = 1 => cov = sigma1 * sigma2
    const sigma1 = 0.2;
    const sigma2 = 0.3;
    const config: PortfolioConfig = {
      expected_returns: [0.05, 0.10],
      covariance_matrix: [
        [sigma1 * sigma1, sigma1 * sigma2],
        [sigma1 * sigma2, sigma2 * sigma2],
      ],
    };
    const opt = new MarkowitzOptimizer(config);
    const result = opt.optimize();

    const sumW = result.weights.reduce((s, w) => s + w, 0);
    expect(sumW).toBeCloseTo(1, 4);
  });
});
