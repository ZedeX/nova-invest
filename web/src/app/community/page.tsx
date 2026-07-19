/**
 * Community Feed Page (Epic 07).
 * Browse, install, rate community-shared Playbooks.
 */

import { CommunityFeed } from "@/components/widgets/CommunityFeed";

const FILTERS = ["Trending", "Top Rated", "New", "Most Installed"];

const CATEGORIES = [
  { name: "Momentum",    count: 23 },
  { name: "Mean Reversion", count: 18 },
  { name: "Breakout",    count: 15 },
  { name: "Earnings",    count: 11 },
  { name: "Risk Mgmt",   count: 9 },
  { name: "Data Fetchers", count: 7 },
];

export default function CommunityPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Discover, install, rate, and remix community-shared Playbooks.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f, i) => (
          <button
            key={f}
            className={`px-3 py-1.5 rounded text-sm ${i === 0 ? "bg-blue-600 text-white" : "border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-2">Categories</h3>
            <ul className="space-y-1">
              {CATEGORIES.map(c => (
                <li key={c.name} className="flex justify-between text-sm">
                  <a href="#" className="hover:underline">{c.name}</a>
                  <span className="text-zinc-500 text-xs">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <main className="lg:col-span-9">
          <CommunityFeed />
        </main>
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center">
        <h3 className="text-sm font-semibold mb-1">Publish Your Playbook</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Share your Playbook to the community. Requires validated backtest + risk disclosure.
        </p>
        <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
          Publish a Playbook
        </button>
      </div>
    </div>
  );
}
