/**
 * Broker module exports + factory (Epic 06).
 *
 * Phase 1: PaperBroker only (in-memory).
 * Phase 2: AlpacaBroker + IBKRBroker via MCP.
 */

import type { Env } from "../env";
import type { BrokerAdapter } from "./types";
import { PaperBroker } from "./paper-broker";
import { AlpacaBrokerAdapter } from "./alpaca-adapter";

export * from "./types";
export { PaperBroker } from "./paper-broker";
export { AlpacaBrokerAdapter } from "./alpaca-adapter";
export { AlpacaClient, AlpacaApiError, type AlpacaConfig } from "./alpaca-client";
export { BrokerRiskManager, DEFAULT_RISK_CONFIG, type RiskConfig } from "./risk-manager";

// Module-level singleton
let _broker: BrokerAdapter | null = null;

export function getBroker(env?: Env): BrokerAdapter {
  if (!_broker) {
    _broker = createBrokerAdapter(env);
  }
  return _broker;
}

/**
 * Factory: create a BrokerAdapter based on mode and available env vars.
 */
export function createBrokerAdapter(env?: Env): BrokerAdapter {
  if (env?.ALPACA_API_KEY) {
    return new AlpacaBrokerAdapter({
      apiKey: env.ALPACA_API_KEY,
      secretKey: env.ALPACA_SECRET_KEY ?? "",
      baseUrl: env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets/v2",
    });
  }
  return new PaperBroker();
}

/**
 * For testing: inject a fresh broker instance.
 */
export function setBrokerForTest(broker: BrokerAdapter | null): void {
  _broker = broker;
}
