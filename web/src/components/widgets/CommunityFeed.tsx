"use client";

/**
 * Community Feed Widget (Epic 07 + Epic 05).
 * Calls /api/community/playbook to list community packages.
 * Supports search, sort, tag filter, and pagination.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CommunityPackage, FeedSortType } from "@/lib/community/types";

interface FeedProps {
  /** Initial sort order (default: "trending") */
  initialSort?: FeedSortType;
  /** Tag filter from parent */
  tagFilter?: string;
  /** Search query from parent */
  searchQuery?: string;
  /** Max items to show (default: 5 for dashboard widget, undefined for full page) */
  maxItems?: number;
}

export function CommunityFeed({
  initialSort = "trending",
  tagFilter,
  searchQuery,
  maxItems,
}: FeedProps) {
  const [packages, setPackages] = useState<CommunityPackage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<FeedSortType>(initialSort);
  const [offset, setOffset] = useState(0);
  const limit = maxItems ?? 20;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("sort", sort);
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        if (searchQuery) params.set("q", searchQuery);
        if (tagFilter) params.set("tags", tagFilter);

        const res = await fetch(`/api/community/playbook?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const json = await res.json() as { data: CommunityPackage[]; total: number };
        setPackages(json.data ?? []);
        setTotal(json.total ?? 0);
      } catch (e) {
        if (controller.signal.aborted) return;
        console.error("Failed to load community feed:", e);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => { controller.abort(); };
  }, [sort, offset, limit, searchQuery, tagFilter]);

  if (loading) {
    return <div className="text-sm text-zinc-400">Loading community...</div>;
  }

  const sortOptions: { value: FeedSortType; label: string }[] = [
    { value: "trending", label: "Trending" },
    { value: "rating", label: "Top Rated" },
    { value: "recent", label: "New" },
    { value: "installed", label: "Most Installed" },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Community</h3>
      {/* Sort tabs (only when not in dashboard widget mode) */}
      {!maxItems && (
        <div className="flex items-center gap-2">
          {sortOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setSort(opt.value); setOffset(0); }}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                sort === opt.value
                  ? "bg-blue-600 text-white"
                  : "border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-zinc-500">{total} playbook{total !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Package list */}
      {packages.length === 0 ? (
        <div className="text-sm text-zinc-400 py-8 text-center">No playbooks found.</div>
      ) : (
        <ul className="space-y-2">
          {packages.map((pkg) => (
            <li key={pkg.package_id}>
              <Link
                href={`/community/playbook/${pkg.package_id}`}
                className="block p-3 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{pkg.title}</div>
                  <div className="text-xs text-amber-500 shrink-0 ml-2">
                    ★ {pkg.rating_avg > 0 ? pkg.rating_avg.toFixed(1) : "–"}
                  </div>
                </div>
                <div className="text-xs text-zinc-500 mb-1 truncate">{pkg.description}</div>
                <div className="flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>by {pkg.author_name}</span>
                  <span>·</span>
                  <span>{pkg.installed_count} install{pkg.installed_count !== 1 ? "s" : ""}</span>
                  {pkg.fork_count > 0 && (
                    <>
                      <span>·</span>
                      <span>{pkg.fork_count} fork{pkg.fork_count !== 1 ? "s" : ""}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {pkg.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination (only in full page mode) */}
      {!maxItems && total > limit && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Prev
          </button>
          <span className="text-xs text-zinc-500">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      )}

      {/* "View all" link for dashboard widget mode */}
      {maxItems && (
        <div className="text-center">
          <Link href="/community" className="text-xs text-blue-600 hover:underline">
            View all community playbooks
          </Link>
        </div>
      )}
    </div>
  );
}
