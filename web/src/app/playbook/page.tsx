/**
 * Playbook Library Page (Epic 08).
 * Personal + community playbooks with version management.
 */

import Link from "next/link";

const PERSONAL_PLAYBOOKS = [
  {
    id: "pb_001",
    name: "NVDA Earnings Playbook",
    kind: "composite",
    version: "1.2.0",
    updated: "2026-07-15",
    components: 3,
  },
  {
    id: "pb_002",
    name: "Daily Watchlist Scraper",
    kind: "data_fetcher",
    version: "0.3.1",
    updated: "2026-07-10",
    components: 1,
  },
  {
    id: "pb_003",
    name: "Risk Manager v2",
    kind: "risk_manager",
    version: "2.0.0",
    updated: "2026-07-08",
    components: 2,
  },
];

const KIND_COLORS: Record<string, string> = {
  strategy:      "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  composite:     "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  data_fetcher:  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  risk_manager:  "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  alert:         "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  narrative:     "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function PlaybookPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Playbooks</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Compose strategies + data fetchers + risk managers + alerts into reusable, versioned packages.
          </p>
        </div>
        <button className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
          + New Playbook
        </button>
      </div>

      <section>
        <h2 className="text-sm font-semibold mb-3 text-zinc-500">Personal Playbooks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PERSONAL_PLAYBOOKS.map(p => (
            <Link
              key={p.id}
              href={`/playbook/${p.id}`}
              className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 hover:border-blue-400 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-0.5 rounded text-xs ${KIND_COLORS[p.kind]}`}>{p.kind}</span>
                <span className="text-xs text-zinc-500 font-mono">v{p.version}</span>
              </div>
              <h3 className="font-semibold text-sm">{p.name}</h3>
              <div className="text-xs text-zinc-500 mt-2 flex justify-between">
                <span>{p.components} component(s)</span>
                <span>Updated {p.updated}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 text-zinc-500">Composable Kinds</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { k: "strategy",     n: "Strategy" },
            { k: "composite",     n: "Composite" },
            { k: "data_fetcher",  n: "Data Fetcher" },
            { k: "risk_manager",  n: "Risk Manager" },
            { k: "alert",         n: "Alert" },
            { k: "narrative",     n: "Narrative" },
          ].map(t => (
            <div key={t.k} className={`rounded p-2 text-center text-xs ${KIND_COLORS[t.k]}`}>
              {t.n}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 text-zinc-500">Composition Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
            <h3 className="font-medium text-sm mb-1">Parallel</h3>
            <p className="text-xs text-zinc-500">Run components concurrently. Weights must sum to 1.0.</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
            <h3 className="font-medium text-sm mb-1">Sequential</h3>
            <p className="text-xs text-zinc-500">Chain via <code className="font-mono">depends_on</code>. Cycles rejected.</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
            <h3 className="font-medium text-sm mb-1">Conditional</h3>
            <p className="text-xs text-zinc-500">if/then/else branching based on prior output.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 text-zinc-500">Versioning (SemVer)</h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
          <pre className="text-xs font-mono overflow-x-auto"><code>{`version: "1.2.0"
changelog:
  - version: "1.2.0"
    date: "2026-07-15"
    changes:
      - "Added risk_manager component"
      - "Bumped strategy v0.4.0 → v0.5.0"
  - version: "1.1.0"
    date: "2026-07-01"
    changes:
      - "Initial composite release"`}</code></pre>
        </div>
      </section>
    </div>
  );
}
