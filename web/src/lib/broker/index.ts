/**
 * Broker module exports + factory (Epic 06).
 *
 * Phase 1: PaperBroker only (in-memory).
 * Phase 2: AlpacaBroker + IBKRBroker via MCP.
 */

import type { Env } from "../env";
import type { BrokerAdapter } from "./types";
import { PaperBroker } from "./paper-broker";

export * from "./types";
export { PaperBroker } from "./paper-broker";
export { BrokerRiskManager, DEFAULT_RISK_CONFIG, type RiskConfig } from "./risk-manager";

// Module-level singleton (Phase 1: in-memory, single PaperBroker instance)
let _broker: PaperBroker | null = null;

export function getBroker(_env?: Env): BrokerAdapter {
  if (!_broker) {
    _broker = new PaperBroker();
  }
  return _broker;
}

/**
 * For testing: inject a fresh broker instance.
 */
export function setBrokerForTest(broker: PaperBroker | null): void {
  _broker = broker;
}
