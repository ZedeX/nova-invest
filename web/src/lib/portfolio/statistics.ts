/**
 * Portfolio Statistics — Pure statistical functions
 *
 * No external dependencies. All computations from scratch.
 */

/**
 * Compute the arithmetic mean of a numeric array.
 * Returns 0 for empty arrays.
 */
export function computeMean(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.reduce((sum, x) => sum + x, 0) / returns.length;
}

/**
 * Compute population variance: E[(X - mu)^2].
 * Returns 0 for empty or single-element arrays.
 */
export function computeVariance(returns: number[]): number {
  if (returns.length <= 1) return 0;
  const mean = computeMean(returns);
  return returns.reduce((sum, x) => sum + (x - mean) ** 2, 0) / returns.length;
}

/**
 * Compute population covariance between two return series.
 * Cov(a, b) = E[(a - mu_a)(b - mu_b)].
 * Both arrays must have the same length. Returns 0 if length <= 1.
 */
export function computeCovariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n <= 1) return 0;
  const meanA = a.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const meanB = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - meanA) * (b[i] - meanB);
  }
  return cov / n;
}

/**
 * Compute Pearson correlation coefficient between two return series.
 * Returns 0 when either series has zero variance.
 */
export function computeCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n <= 1) return 0;
  const cov = computeCovariance(a, b);
  const varA = computeVariance(a.slice(0, n));
  const varB = computeVariance(b.slice(0, n));
  const denom = Math.sqrt(varA * varB);
  if (denom === 0) return 0;
  return cov / denom;
}

/**
 * Build an N×N covariance matrix from a returns matrix.
 *
 * @param returnsMatrix - Array of N return series, each of length T.
 *                        returnsMatrix[i] = returns of asset i over T periods.
 * @returns N×N covariance matrix where element [i][j] = Cov(asset_i, asset_j).
 */
export function buildCovarianceMatrix(returnsMatrix: number[][]): number[][] {
  const n = returnsMatrix.length;
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      // Exploit symmetry: only compute upper triangle, mirror to lower.
      if (j < i) {
        matrix[i][j] = matrix[j][i];
      } else {
        matrix[i][j] = computeCovariance(returnsMatrix[i], returnsMatrix[j]);
      }
    }
  }
  return matrix;
}
