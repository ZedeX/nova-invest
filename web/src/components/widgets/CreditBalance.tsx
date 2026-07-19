/**
 * Credit Balance Widget (Appendix A + Epic 05).
 * Phase 1: Shows Mock balance (1000 credits).
 */

const MOCK_BALANCE = {
  plan: "pro",
  granted: 1000,
  used: 153,
  remaining: 847,
  forecast_burn_rate: 5.1,  // per day
};

export function CreditBalance() {
  const pct = (MOCK_BALANCE.used / MOCK_BALANCE.granted) * 100;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Credits</h3>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 uppercase">
          {MOCK_BALANCE.plan}
        </span>
      </div>

      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 font-mono mb-1">
        {MOCK_BALANCE.remaining}
        <span className="text-sm font-normal text-zinc-500"> / {MOCK_BALANCE.granted}</span>
      </div>

      <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-2">
        <div
          className={`h-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-orange-500" : "bg-green-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Used: {MOCK_BALANCE.used}</span>
        <span>Forecast: {MOCK_BALANCE.forecast_burn_rate}/day</span>
      </div>

      <button className="mt-3 w-full px-3 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
        Top Up
      </button>
    </div>
  );
}
