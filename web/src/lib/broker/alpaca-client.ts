/**
 * AlpacaClient - Low-level HTTP client for Alpaca APIs.
 *
 * Trading API:  https://paper-api.alpaca.markets/v2
 * Data API:     https://data.alpaca.markets/v2
 *
 * Rate limit: 200 req/min per account (simple counter).
 */

export interface AlpacaConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string; // e.g. https://paper-api.alpaca.markets/v2
}

const DATA_BASE_URL = "https://data.alpaca.markets/v2";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 200;

export class AlpacaClient {
  private requestTimestamps: number[] = [];

  constructor(private config: AlpacaConfig) {}

  async get<T>(path: string, base: "trading" | "data" = "trading"): Promise<T> {
    const url = base === "trading" ? `${this.config.baseUrl}${path}` : `${DATA_BASE_URL}${path}`;
    return this.request<T>(url, { method: "GET" });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    return this.request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    return this.request<T>(url, { method: "DELETE" });
  }

  // ---- internal ----

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    this.enforceRateLimit();

    const headers: Record<string, string> = {
      "APCA-API-KEY-ID": this.config.apiKey,
      "APCA-API-SECRET-KEY": this.config.secretKey,
      ...(init.headers as Record<string, string> | undefined),
    };

    const res = await fetch(url, { ...init, headers });
    this.recordRequest();

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        // res.text() may not be available in all environments
      }
      const msg = `Alpaca API ${res.status}: ${body || res.statusText}`;
      throw new AlpacaApiError(res.status, msg);
    }

    // 204 No Content (e.g. successful DELETE)
    if (res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  private enforceRateLimit(): void {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoff);

    if (this.requestTimestamps.length >= RATE_LIMIT_MAX) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
      if (waitMs > 0) {
        throw new AlpacaApiError(
          429,
          `Alpaca rate limit reached: ${RATE_LIMIT_MAX} req/min. Retry after ${waitMs}ms.`,
        );
      }
    }
  }
}

export class AlpacaApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AlpacaApiError";
  }
}
