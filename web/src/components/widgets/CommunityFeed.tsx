"use client";

/**
 * Community Feed Widget (Epic 07 + Epic 05).
 * Loads Mock community Playbook data from /mock/community/index.json.
 */

import { useEffect, useState } from "react";
import type { CommunityPlaybook } from "@/lib/types";

export function CommunityFeed() {
  const [playbooks, setPlaybooks] = useState<CommunityPlaybook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/mock/community/index.json");
        const json = await res.json() as { playbooks?: CommunityPlaybook[] };
        setPlaybooks(json.playbooks || []);
      } catch (e) {
        console.error("Failed to load community feed:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="text-sm text-zinc-400">Loading community...</div>;
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Community Playbooks</h3>
        <a href="/community" className="text-xs text-blue-600 hover:underline">View all</a>
      </div>
      <ul className="space-y-2">
        {playbooks.slice(0, 5).map(pb => (
          <li key={pb.package_id}>
            <a
              href={`/playbook/${pb.playbook_id}`}
              className="block p-3 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{pb.title}</div>
                <div className="text-xs text-amber-500">★ {pb.rating_avg.toFixed(1)}</div>
              </div>
              <div className="text-xs text-zinc-500 mb-1 truncate">{pb.description}</div>
              <div className="flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                <span>by {pb.author.name}</span>
                <span>·</span>
                <span>{pb.installed_count} installs</span>
                {pb.performance && (
                  <>
                    <span>·</span>
                    <span className="text-green-600">{pb.performance.total_return >= 0 ? "+" : ""}{pb.performance.total_return.toFixed(1)}%</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {pb.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {tag}
                  </span>
                ))}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
