/**
 * Technical indicator calculations (pure functions).
 *
 * Per Epic 05 Sprint 5: SMA/EMA/RSI overlays on KlineChart.
 * All functions are pure: (input[]) -> output[], no side effects.
 */

import type { Kline } from "@/lib/types";

/** A single point on an indicator line. */
export interface IndicatorPoint {
  time: string;
  value: number;
}

/**
 * Simple Moving Average.
 * Returns N-1 fewer points than input (first period-1 are undefined).
 */
export function sma(klines: Kline[], period: number): IndicatorPoint[] {
  if (period <= 0) return [];
  const out: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < klines.length; i++) {
    sum += klines[i].c;
    if (i >= period) sum -= klines[i - period].c;
    if (i >= period - 1) {
      out.push({ time: klines[i].t, value: sum / period });
    }
  }
  return out;
}

/**
 * Exponential Moving Average.
 * Smoothing factor alpha = 2 / (period + 1).
 * First value is SMA(period) as the seed.
 */
export function ema(klines: Kline[], period: number): IndicatorPoint[] {
  if (period <= 0 || klines.length < period) return [];
  const alpha = 2 / (period + 1);
  const out: IndicatorPoint[] = [];
  let prev: number;
  // Seed: SMA of first `period` closes
  let seed = 0;
  for (let i = 0; i < period; i++) seed += klines[i].c;
  seed /= period;
  prev = seed;
  out.push({ time: klines[period - 1].t, value: seed });
  for (let i = period; i < klines.length; i++) {
    const v = alpha * klines[i].c + (1 - alpha) * prev;
    out.push({ time: klines[i].t, value: v });
    prev = v;
  }
  return out;
}

/**
 * Relative Strength Index (Wilder's smoothing).
 * Returns values in [0, 100]. RSI > 70 = overbought, RSI < 30 = oversold.
 */
export function rsi(klines: Kline[], period = 14): IndicatorPoint[] {
  if (period <= 0 || klines.length <= period) return [];
  const out: IndicatorPoint[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  // Initial averages over first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = klines[i].c - klines[i - 1].c;
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  out.push({ time: klines[period].t, value: 100 - 100 / (1 + rs0) });
  // Wilder smoothing for the rest
  for (let i = period + 1; i < klines.length; i++) {
    const change = klines[i].c - klines[i - 1].c;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out.push({ time: klines[i].t, value: 100 - 100 / (1 + rs) });
  }
  return out;
}
