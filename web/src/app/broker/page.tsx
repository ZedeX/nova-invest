/**
 * Paper Broker Page (Epic 06).
 * Paper trading account with order placement + positions.
 */

import { PositionsTable } from "@/components/widgets/PositionsTable";

const ORDERS = [
  { id: "ord_001", ts: "2026-07-18 09:32:14", sym: "AAPL", side: "BUY",  type: "MARKET", qty: 100, price: 224.50, status: "FILLED" },
  { id: "ord_002", ts: "2026-07-18 10:15:42", sym: "NVDA", side: "BUY",  type: "LIMIT",  qty: 50,  price: 132.00, status: "FILLED" },
  { id: "ord_003", ts: "2026-07-17 14:23:01", sym: "TSLA", side: "SELL", type: "STOP",   qty: 30,  price: 245.00, status: "FILLED" },
  { id: "ord_004", ts: "2026-07-18 11:08:55", sym: "MSFT", side: "BUY",  type: "LIMIT",  qty: 80,  price: 415.00, status: "PENDING" },
  { id: "ord_005", ts: "2026-07-18 13:42:20", sym: "AMZN", side: "SELL", type: "MARKET", qty: 20,  price: null,    status: "CANCELLED" },
];

const STATUS_COLORS: Record<string, string> = {
  FILLED:    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  PENDING:   "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  CANCELLED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  REJECTED:  "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function BrokerPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paper Broker</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Simulated broker with 5bps slippage. Real broker integration via MCP server (Phase 2).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Account Value", value: "$118,420" },
          { label: "Cash", value: "$23,180" },
          { label: "Positions Value", value: "$95,240" },
          { label: "Unrealized P&L", value: "+$1,840", color: "text-green-600" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
            <div className="text-xs text-zinc-500">{s.label}</div>
            <div className={`text-lg font-mono font-semibold ${s.color ?? ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Place Order</h3>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Symbol</label>
              <input defaultValue="AAPL" className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Side</label>
                <select className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm">
                  <option>BUY</option>
                  <option>SELL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Type</label>
                <select className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm">
                  <option>MARKET</option>
                  <option>LIMIT</option>
                  <option>STOP</option>
                  <option>STOP_LIMIT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Qty</label>
                <input type="number" defaultValue={100} className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Limit Price</label>
                <input type="number" step="0.01" placeholder="—" className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono" />
              </div>
            </div>
            <button className="w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
              Submit Order
            </button>
            <p className="text-xs text-zinc-500">
              Mock broker fills instantly at last price + 5bps slippage.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <PositionsTable />

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-3">Recent Orders</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                    <th className="text-left py-2">Order ID</th>
                    <th className="text-left">Time</th>
                    <th className="text-left">Symbol</th>
                    <th className="text-left">Side</th>
                    <th className="text-left">Type</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Price</th>
                    <th className="text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDERS.map(o => (
                    <tr key={o.id} className="border-b border-zinc-100 dark:border-zinc-900">
                      <td className="py-2 font-mono">{o.id}</td>
                      <td>{o.ts}</td>
                      <td className="font-mono">{o.sym}</td>
                      <td className={o.side === "BUY" ? "text-green-600" : "text-red-600"}>{o.side}</td>
                      <td>{o.type}</td>
                      <td className="text-right font-mono">{o.qty}</td>
                      <td className="text-right font-mono">{o.price ? `$${o.price.toFixed(2)}` : "MKT"}</td>
                      <td>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[o.status]}`}>{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
