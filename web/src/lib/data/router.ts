/**
 * ProviderRouter (ADR-0016 §ProviderRouter Integration).
 *
 * Multi-source fallback with circuit-breaker integration. Tries providers
 * in declared order, skips tripped ones (via CircuitBreaker.isTripped),
 * records failures/successes, and throws when all providers fail.
 *
 * Note: The ADR-0016 canonical router wraps the existing MarketDataProvider
 * interface (getKlines(symbol, timeframe, from, to) → Kline[]) and includes
 * R2 cache bypass + Mock final fallback. This task-spec implementation uses
 * a simplified RouterProvider interface (getKlines(symbol, timeframe) →
 * KlineResponse) and throws on total failure (per task spec:
 * "throws or returns mock"). The state-machine integration with
 * CircuitBreaker is the load-bearing logic under test.
 *
 * See: docs/architecture/adr-0016-circuit-breaker.md §ProviderRouter Integration
 */

import type { KlineResponse, Timeframe } from "../types";
import { CircuitBreaker } from "./circuit-breaker";

/**
 * Minimal provider interface for the router. The existing MarketDataProvider
 * in `provider.ts` structurally satisfies this via Pick<..., "name" | "getKlines">,
 * but its getKlines returns Kline[] (not KlineResponse) and takes 4 args.
 * Adapters can wrap it; the router itself is generic over this minimal shape.
 */
export interface RouterProvider {
  name: string;
  getKlines(symbol: string, timeframe: Timeframe): Promise<KlineResponse>;
}

export class ProviderRouter {
  constructor(
    private readonly providers: RouterProvider[],
    private readonly breaker: CircuitBreaker,
  ) {}

  /**
   * Select a KlineResponse by trying providers in declared order.
   *
   * Contract:
   *   - Skips providers whose circuit is OPEN (breaker.isTripped === true).
   *   - On provider success: records success to breaker, returns result.
   *   - On provider failure: records failure to breaker, continues to next.
   *   - If all providers fail or are tripped: throws Error.
   */
  async select(symbol: string, timeframe: Timeframe): Promise<KlineResponse> {
    let lastError: Error | null = null;

    for (const provider of this.providers) {
      if (this.breaker.isTripped(provider.name)) {
        continue;
      }
      try {
        const result = await provider.getKlines(symbol, timeframe);
        this.breaker.recordSuccess(provider.name);
        return result;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.breaker.recordFailure(provider.name);
      }
    }

    const reason = lastError ? lastError.message : "all providers tripped";
    throw new Error(`ProviderRouter: all providers failed for ${symbol} (${timeframe}): ${reason}`);
  }
}
