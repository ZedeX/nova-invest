/**
 * Markowitz Mean-Variance Portfolio Optimization
 *
 * Implements the classical Markowitz framework:
 *   - Tangency portfolio: max Sharpe ratio (w'mu - rf) / sqrt(w'Sigma*w)
 *   - Minimum variance portfolio: min w'Sigma*w s.t. w'1 = 1
 *   - Efficient frontier: parametric sweep of target returns
 *
 * No external optimization libraries — all linear algebra from scratch.
 * For the long-only constraint (w >= 0), uses an iterative
 * active-set approach: solve unconstrained, clamp negatives to zero,
 * redistribute, repeat until convergence.
 *
 * See: Markowitz, H. (1952). "Portfolio Selection". Journal of Finance.
 */

import type { PortfolioConfig, PortfolioResult } from "./types";

// ============ Linear Algebra Primitives ============

/** Matrix-vector multiply: result = A * x */
function matVecMul(A: number[][], x: number[]): number[] {
  return A.map((row) => row.reduce((sum, a, j) => sum + a * x[j], 0));
}

/** Dot product: a . b */
function dot(a: number[], b: number[]): number {
  return a.reduce((sum, ai, i) => sum + ai * b[i], 0);
}

/** Scale a vector: x * s */
function scale(x: number[], s: number): number[] {
  return x.map((xi) => xi * s);
}

/** Subtract two vectors: a - b */
function vecSub(a: number[], b: number[]): number[] {
  return a.map((ai, i) => ai - b[i]);
}

/**
 * Solve linear system Ax = b via Gaussian elimination with partial pivoting.
 * A is modified in-place; b is not.
 * Returns the solution vector x.
 * Throws if the system is singular or near-singular.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  // Create augmented matrix [A | b]
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot row
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) {
      throw new Error("Singular matrix in solveLinearSystem");
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j];
    }
    x[i] = sum / aug[i][i];
  }

  return x;
}

/**
 * Add regularization to covariance matrix: Sigma + epsilon * I.
 * This ensures positive definiteness even with near-singular inputs.
 */
function regularizeMatrix(Sigma: number[][], epsilon: number): number[][] {
  return Sigma.map((row, i) =>
    row.map((val, j) => (i === j ? val + epsilon : val)),
  );
}

// ============ Portfolio Math ============

/** Compute portfolio return: w' * mu */
function portfolioReturn(w: number[], mu: number[]): number {
  return dot(w, mu);
}

/** Compute portfolio variance: w' * Sigma * w */
function portfolioVariance(w: number[], Sigma: number[][]): number {
  return dot(w, matVecMul(Sigma, w));
}

/** Compute Sharpe ratio: (rp - rf) / sigma_p */
function sharpeRatio(rp: number, sigmaP: number, rf: number): number {
  if (sigmaP <= 0) return 0;
  return (rp - rf) / sigmaP;
}

// ============ Core Optimization ============

/**
 * Solve the unconstrained minimum-variance problem:
 *   min w'Sigma*w  s.t. w'1 = 1
 *
 * Analytical solution via Lagrange multipliers:
 *   [Sigma  1] [w*]   [0]
 *   [1'     0] [λ ] = [1]
 *
 * Returns the weight vector w*.
 */
function unconstrainedMinVariance(
  Sigma: number[][],
  n: number,
): number[] {
  // Build augmented system: [Sigma, ones; ones', 0] * [w; lambda] = [0; 1]
  const A: number[][] = Sigma.map((row) => [...row, ...new Array(1).fill(0)]);
  for (let i = 0; i < n; i++) {
    A[i][n] = 1; // last column = 1 vector
  }
  const lastRow = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) lastRow[i] = 1;
  A.push(lastRow);

  const b = new Array(n).fill(0);
  b.push(1);

  const solution = solveLinearSystem(A, b);
  return solution.slice(0, n);
}

/**
 * Solve the unconstrained tangency portfolio (max Sharpe ratio):
 *   max (w'mu - rf) / sqrt(w'Sigma*w)  s.t. w'1 = 1
 *
 * Analytical solution:
 *   w* = Sigma^{-1}(mu - rf*1) / 1'Sigma^{-1}(mu - rf*1)
 *
 * Returns the weight vector w*.
 */
function unconstrainedTangency(
  Sigma: number[][],
  mu: number[],
  rf: number,
  n: number,
): number[] {
  const ones = new Array(n).fill(1);
  const excessMu = vecSub(mu, scale(ones, rf));

  // Solve Sigma * z = excessMu  =>  z = Sigma^{-1} * excessMu
  const z = solveLinearSystem(Sigma, excessMu);

  // Normalize: w = z / sum(z)
  const sumZ = z.reduce((s, zi) => s + zi, 0);
  if (Math.abs(sumZ) < 1e-12) {
    // All excess returns are zero — fall back to min variance
    return unconstrainedMinVariance(Sigma, n);
  }

  return scale(z, 1 / sumZ);
}

/**
 * Apply long-only constraint via iterative active-set clamping.
 *
 * Algorithm:
 * 1. Solve unconstrained problem
 * 2. Clamp negative weights to min_weight
 * 3. Redistribute the deficit proportionally among positive weights
 * 4. Repeat until convergence (all weights >= min_weight, sum = 1)
 *
 * Max 100 iterations to prevent infinite loops.
 */
function applyLongOnlyConstraint(
  solveFn: () => number[],
  minWeight: number,
  maxWeight: number,
  n: number,
  maxIter = 100,
): number[] {
  let w = solveFn();

  for (let iter = 0; iter < maxIter; iter++) {
    // Clamp to [minWeight, maxWeight]
    const clamped = w.map((wi) => Math.min(maxWeight, Math.max(minWeight, wi)));

    // Check if already feasible
    const sumClamped = clamped.reduce((s, ci) => s + ci, 0);
    const deficit = 1 - sumClamped;

    if (Math.abs(deficit) < 1e-10) {
      // Verify all within bounds
      const feasible = clamped.every(
        (ci) => ci >= minWeight - 1e-10 && ci <= maxWeight + 1e-10,
      );
      if (feasible) return clamped;
    }

    // Redistribute deficit proportionally among free (non-clamped) weights
    const atLower = clamped.map((ci) => ci <= minWeight + 1e-10);
    const atUpper = clamped.map((ci) => ci >= maxWeight - 1e-10);
    const freeIndices = clamped
      .map((_, i) => i)
      .filter((i) => !atLower[i] && !atUpper[i]);

    if (freeIndices.length === 0) {
      // All weights are clamped — even distribution
      return new Array(n).fill(1 / n);
    }

    // Distribute deficit among free weights
    const share = deficit / freeIndices.length;
    const adjusted = clamped.slice();
    for (const i of freeIndices) {
      adjusted[i] += share;
      adjusted[i] = Math.min(maxWeight, Math.max(minWeight, adjusted[i]));
    }

    // Normalize to exactly sum to 1
    const sumAdj = adjusted.reduce((s, ai) => s + ai, 0);
    if (Math.abs(sumAdj - 1) > 1e-10) {
      // Scale free weights to make sum = 1
      const freeSum = freeIndices.reduce((s, i) => s + adjusted[i], 0);
      const targetFreeSum =
        1 - adjusted.reduce((s, ai, i) => (freeIndices.includes(i) ? s : s + ai), 0);
      if (freeSum > 1e-12) {
        const scaleFactor = targetFreeSum / freeSum;
        for (const i of freeIndices) {
          adjusted[i] *= scaleFactor;
          adjusted[i] = Math.min(maxWeight, Math.max(minWeight, adjusted[i]));
        }
      }
    }

    // Check convergence
    const maxChange = Math.max(...w.map((wi, i) => Math.abs(wi - adjusted[i])));
    w = adjusted;
    if (maxChange < 1e-10) break;
  }

  // Final normalization
  const sum = w.reduce((s, wi) => s + wi, 0);
  if (Math.abs(sum - 1) > 1e-10 && sum > 0) {
    w = scale(w, 1 / sum);
  }

  return w;
}

// ============ MarkowitzOptimizer ============

const REGULARIZATION_EPSILON = 1e-10;

export class MarkowitzOptimizer {
  private readonly n: number;
  private readonly mu: number[];
  private readonly Sigma: number[][];
  private readonly rf: number;
  private readonly minWeight: number;
  private readonly maxWeight: number;

  constructor(config: PortfolioConfig) {
    const { expected_returns, covariance_matrix, risk_free_rate, constraints } = config;

    this.n = expected_returns.length;
    this.mu = expected_returns;
    this.rf = risk_free_rate ?? 0;
    this.minWeight = constraints?.min_weight ?? 0;
    this.maxWeight = constraints?.max_weight ?? 1;

    // Validate
    if (this.n === 0) {
      throw new Error("expected_returns must not be empty");
    }
    if (covariance_matrix.length !== this.n) {
      throw new Error(
        `covariance_matrix rows (${covariance_matrix.length}) must match ` +
          `expected_returns length (${this.n})`,
      );
    }
    for (let i = 0; i < this.n; i++) {
      if (covariance_matrix[i].length !== this.n) {
        throw new Error(
          `covariance_matrix row ${i} length (${covariance_matrix[i].length}) must be ${this.n}`,
        );
      }
    }
    if (this.minWeight < 0) {
      throw new Error(`min_weight must be >= 0 (got ${this.minWeight})`);
    }
    if (this.maxWeight <= this.minWeight) {
      throw new Error(
        `max_weight (${this.maxWeight}) must be > min_weight (${this.minWeight})`,
      );
    }

    // Regularize covariance matrix for numerical stability
    this.Sigma = regularizeMatrix(covariance_matrix, REGULARIZATION_EPSILON);
  }

  /**
   * Find the tangency portfolio — the portfolio on the efficient frontier
   * with the maximum Sharpe ratio.
   *
   * For the long-only constraint (min_weight = 0), uses iterative
   * active-set clamping on the analytical unconstrained solution.
   */
  optimize(): PortfolioResult {
    // Single asset: trivially weight = 1
    if (this.n === 1) {
      return this.buildResult([1]);
    }

    const w = applyLongOnlyConstraint(
      () => unconstrainedTangency(this.Sigma, this.mu, this.rf, this.n),
      this.minWeight,
      this.maxWeight,
      this.n,
    );

    return this.buildResult(w);
  }

  /**
   * Find the minimum variance portfolio — the portfolio with the lowest
   * risk on the efficient frontier (leftmost point).
   */
  minVariance(): PortfolioResult {
    if (this.n === 1) {
      return this.buildResult([1]);
    }

    const w = this.computeMinVarianceWeights();

    return this.buildResult(w);
  }

  /**
   * Compute the efficient frontier — the set of portfolios that offer
   * the minimum risk for each level of target return.
   *
   * @param points - Number of points on the frontier. Default 50.
   * @returns Array of frontier points sorted by ascending return.
   */
  efficientFrontier(
    points = 50,
  ): Array<{ return: number; risk: number; weights: number[] }> {
    if (this.n === 1) {
      const mu0 = this.mu[0];
      const sig0 = Math.sqrt(Math.max(0, this.Sigma[0][0]));
      return Array.from({ length: points }, () => ({
        return: mu0,
        risk: sig0,
        weights: [1],
      }));
    }

    // Compute min-variance weights directly (no recursion through buildResult)
    const mvWeights = this.computeMinVarianceWeights();
    const minFrontierReturn = portfolioReturn(mvWeights, this.mu);
    // The max return is simply the asset with highest mu (all weight on it)
    const maxFrontierReturn = Math.max(...this.mu);

    const frontier: Array<{ return: number; risk: number; weights: number[] }> = [];

    for (let i = 0; i < points; i++) {
      const t = points === 1 ? 0 : i / (points - 1);
      const targetReturn =
        minFrontierReturn + t * (maxFrontierReturn - minFrontierReturn);

      const w = this.solveForTargetReturn(targetReturn);
      const rp = portfolioReturn(w, this.mu);
      const vp = portfolioVariance(w, this.Sigma);

      frontier.push({
        return: rp,
        risk: Math.sqrt(Math.max(0, vp)),
        weights: w,
      });
    }

    return frontier;
  }

  // ============ Private helpers ============

  /** Compute min-variance weights without building a full result. */
  private computeMinVarianceWeights(): number[] {
    return applyLongOnlyConstraint(
      () => unconstrainedMinVariance(this.Sigma, this.n),
      this.minWeight,
      this.maxWeight,
      this.n,
    );
  }

  /**
   * Solve for the minimum-variance portfolio at a given target return:
   *   min w'Sigma*w  s.t.  w'mu = target,  w'1 = 1
   *
   * Lagrangian system:
   *   [Sigma  mu  1] [w  ]   [0     ]
   *   [mu'    0   0] [lam1] = [target]
   *   [1'     0   0] [lam2]   [1     ]
   */
  private solveForTargetReturn(targetReturn: number): number[] {
    const n = this.n;

    // Build (n+2) × (n+2) augmented system
    const A: number[][] = [];
    for (let i = 0; i < n; i++) {
      A[i] = [...this.Sigma[i], this.mu[i], 1];
    }
    A[n] = [...this.mu, 0, 0];
    A[n + 1] = [...new Array(n).fill(1), 0, 0];

    const b = new Array(n).fill(0);
    b.push(targetReturn);
    b.push(1);

    try {
      const solution = solveLinearSystem(A, b);
      let w = solution.slice(0, n);

      // Apply long-only constraint
      w = applyLongOnlyConstraint(
        () => w,
        this.minWeight,
        this.maxWeight,
        n,
      );

      return w;
    } catch {
      // Fallback: min variance weights
      return this.computeMinVarianceWeights();
    }
  }

  /**
   * Build a PortfolioResult from a weight vector.
   */
  private buildResult(w: number[]): PortfolioResult {
    const rp = portfolioReturn(w, this.mu);
    const vp = portfolioVariance(w, this.Sigma);
    const sp = Math.sqrt(Math.max(0, vp));
    const sr = sharpeRatio(rp, sp, this.rf);
    const frontier = this.efficientFrontier();

    return {
      weights: w,
      expected_return: rp,
      portfolio_variance: vp,
      sharpe_ratio: sr,
      efficient_frontier: frontier,
    };
  }
}
