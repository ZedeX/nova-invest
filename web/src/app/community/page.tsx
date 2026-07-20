"use client";

/**
 * Community Feed Page (Epic 07, Sprint 8).
 * Browse, search, install, rate community-shared Playbooks.
 */

import { useState } from "react";
import { CommunityFeed } from "@/components/widgets/CommunityFeed";

const CATEGORIES = [
  { name: "momentum", label: "Momentum" },
  { name: "reversal", label: "Mean Reversion" },
  { name: "breakout", label: "Breakout" },
  { name: "dca", label: "DCA" },
  { name: "etf", label: "ETF" },
  { name: "bonds", label: "Bonds" },
  { name: "crypto", label: "Crypto" },
  { name: "risk-management", label: "Risk Mgmt" },
];

export default function CommunityPage() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | undefined>();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setActiveSearch(search);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Discover, install, rate, and remix community-shared Playbooks.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search playbooks by title or description..."
          className="flex-1 px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          Search
        </button>
        {activeSearch && (
          <button
            type="button"
            onClick={() => { setSearch(""); setActiveSearch(""); }}
            className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
        )}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar: categories */}
        <aside className="lg:col-span-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-2">Categories</h3>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => setActiveTag(undefined)}
                  className={`w-full text-left text-sm px-2 py-1 rounded ${
                    !activeTag ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  All
                </button>
              </li>
              {CATEGORIES.map((c) => (
                <li key={c.name}>
                  <button
                    onClick={() => setActiveTag(activeTag === c.name ? undefined : c.name)}
                    className={`w-full text-left text-sm px-2 py-1 rounded ${
                      activeTag === c.name
                        ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main feed */}
        <main className="lg:col-span-9">
          <CommunityFeed searchQuery={activeSearch || undefined} tagFilter={activeTag} />
        </main>
      </div>

      {/* Publish CTA */}
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
