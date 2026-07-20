"use client";

/**
 * Credit Balance Widget (Appendix A + Epic 05).
 * Calls /api/credits/balance for live data.
 * Shows plan badge, remaining/granted, usage bar, burn rate, and top-up button.
 */

import { useEffect, useState } from "react";
import type { CreditBalance as CreditBalanceType } from "@/lib/credit/types";

export function CreditBalance() {
  const [balance, setBalance] = useState<CreditBalanceType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/credits/balance", { signal: controller.signal });
        if (controller.signal.aborted) return;
        const json = await res.json() as { data: CreditBalanceType };
        setBalance(json.data);
      } catch {
        if (controller.signal.aborted) return;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => { controller.abort(); };
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Credits</h3>
        <div className="text-sm text-zinc-400 mt-2">Loading...</div>
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Credits</h3>
        <div className="text-sm text-zinc-400 mt-2">Unable to load balance</div>
      </div>
    );
  }

  const pct = balance.granted > 0 ? (balance.used / balance.granted) * 100 : 0;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Credits</h3>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 uppercase">
          {balance.plan}
        </span>
      </div>

      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 font-mono mb-1">
        {balance.remaining}
        <span className="text-sm font-normal text-zinc-500"> / {balance.granted}</span>
      </div>

      <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-2">
        <div
          className={`h-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-orange-500" : "bg-green-500"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Used: {balance.used}</span>
        <span>Forecast: {balance.forecast_burn_rate.toFixed(1)}/day</span>
      </div>

      {balance.topped_up > 0 && (
        <div className="text-xs text-zinc-500 mt-1">
          Topped up: +{balance.topped_up}
        </div>
      )}

      <button className="mt-3 w-full px-3 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
        Top Up
      </button>
    </div>
  );
}
