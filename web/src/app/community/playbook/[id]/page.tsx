"use client";

/**
 * Community Playbook Detail Page (Epic 07, Sprint 8).
 * View package details, install, rate, comment, report.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  CommunityPackage,
  CommentRecord,
  RatingRecord,
} from "@/lib/community/types";

export default function PlaybookDetailPage() {
  const params = useParams<{ id: string }>();
  const packageId = params.id;

  const [pkg, setPkg] = useState<CommunityPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [userRating, setUserRating] = useState<RatingRecord | null>(null);
  const [installing, setInstalling] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSeverity, setReportSeverity] = useState<"low" | "med" | "high">("low");
  const [showReportForm, setShowReportForm] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Callbacks that handlers can invoke to refresh data
  const refreshPackage = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/playbook?limit=100`);
      const json = await res.json() as { data: CommunityPackage[] };
      const found = json.data.find((p) => p.package_id === packageId);
      setPkg(found ?? null);
    } catch {
      // ignore
    }
  }, [packageId]);

  const refreshComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/playbook/${packageId}/comments`);
      const json = await res.json() as { data: CommentRecord[] };
      setComments(json.data ?? []);
    } catch {
      // ignore
    }
  }, [packageId]);

  const _refreshRating = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/playbook/${packageId}/rate`);
      const json = await res.json() as { data: RatingRecord | null };
      setUserRating(json.data ?? null);
    } catch {
      // ignore
    }
  }, [packageId]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAll() {
      setLoading(true);
      try {
        const [pkgRes, cmtRes, rateRes] = await Promise.all([
          fetch(`/api/community/playbook?limit=100`, { signal: controller.signal }),
          fetch(`/api/community/playbook/${packageId}/comments`, { signal: controller.signal }),
          fetch(`/api/community/playbook/${packageId}/rate`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;

        const pkgJson = await pkgRes.json() as { data: CommunityPackage[] };
        const found = pkgJson.data.find((p) => p.package_id === packageId);
        setPkg(found ?? null);

        const cmtJson = await cmtRes.json() as { data: CommentRecord[] };
        setComments(cmtJson.data ?? []);

        const rateJson = await rateRes.json() as { data: RatingRecord | null };
        setUserRating(rateJson.data ?? null);
      } catch {
        if (controller.signal.aborted) return;
        // ignore
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadAll();
    return () => { controller.abort(); };
  }, [packageId]);

  async function handleInstall() {
    setInstalling(true);
    try {
      const res = await fetch(`/api/community/playbook/${packageId}/install`, { method: "POST" });
      const json = await res.json() as { error?: string };
      if (res.ok) {
        setMessage("Installed successfully!");
        refreshPackage(); // refresh installed_count
      } else {
        setMessage(json.error ?? "Install failed");
      }
    } catch {
      setMessage("Install failed");
    } finally {
      setInstalling(false);
    }
  }

  async function handleRate(rating: number) {
    setSubmittingRating(true);
    try {
      const res = await fetch(`/api/community/playbook/${packageId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      const json = await res.json() as { data?: RatingRecord; error?: string };
      if (res.ok) {
        setUserRating(json.data ?? null);
        refreshPackage(); // refresh rating_avg
        setMessage(`Rated ${rating} star${rating !== 1 ? "s" : ""}`);
      } else {
        setMessage(json.error ?? "Rating failed");
      }
    } catch {
      setMessage("Rating failed");
    } finally {
      setSubmittingRating(false);
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/community/playbook/${packageId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText, parent_id: replyTo }),
      });
      const json = await res.json() as { error?: string };
      if (res.ok) {
        setCommentText("");
        setReplyTo(null);
        refreshComments();
        setMessage("Comment added!");
      } else {
        setMessage(json.error ?? "Comment failed");
      }
    } catch {
      setMessage("Comment failed");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      const res = await fetch(
        `/api/community/playbook/${packageId}/comments?comment_id=${commentId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        refreshComments();
      }
    } catch {
      // ignore
    }
  }

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportReason.trim()) return;
    setSubmittingReport(true);
    try {
      const res = await fetch(`/api/community/playbook/${packageId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason, severity: reportSeverity }),
      });
      const json = await res.json() as { error?: string };
      if (res.ok) {
        setReportReason("");
        setShowReportForm(false);
        setMessage("Report submitted. Thank you.");
      } else {
        setMessage(json.error ?? "Report failed");
      }
    } catch {
      setMessage("Report failed");
    } finally {
      setSubmittingReport(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading...</div>;
  }

  if (!pkg) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-zinc-400">Package not found.</p>
        <Link href="/community" className="text-sm text-blue-600 hover:underline">
          Back to Community
        </Link>
      </div>
    );
  }

  // Build comment tree (2 levels)
  const topLevelComments = comments.filter((c) => c.parent_id === null);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="text-xs text-zinc-500">
        <Link href="/community" className="hover:underline text-blue-600">Community</Link>
        <span className="mx-1">/</span>
        <span>{pkg.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pkg.title}</h1>
          <p className="text-sm text-zinc-500 mt-1">by {pkg.author_name} · v{pkg.version}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">{pkg.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {pkg.tags.map((tag) => (
              <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 shrink-0"
        >
          {installing ? "Installing..." : "Install"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-center">
          <div className="text-lg font-semibold">{pkg.installed_count}</div>
          <div className="text-xs text-zinc-500">Installs</div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-center">
          <div className="text-lg font-semibold text-amber-500">★ {pkg.rating_avg > 0 ? pkg.rating_avg.toFixed(1) : "–"}</div>
          <div className="text-xs text-zinc-500">{pkg.rating_count} rating{pkg.rating_count !== 1 ? "s" : ""}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-center">
          <div className="text-lg font-semibold">{pkg.fork_count}</div>
          <div className="text-xs text-zinc-500">Forks</div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-center">
          <div className="text-lg font-semibold">{comments.length}</div>
          <div className="text-xs text-zinc-500">Comments</div>
        </div>
      </div>

      {/* Rating */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold mb-2">Rate this Playbook</h3>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleRate(star)}
              disabled={submittingRating}
              className={`text-xl ${
                userRating && star <= userRating.rating
                  ? "text-amber-500"
                  : "text-zinc-300 dark:text-zinc-700"
              } hover:text-amber-400 transition-colors disabled:opacity-50`}
            >
              ★
            </button>
          ))}
          {userRating && (
            <span className="text-xs text-zinc-500 ml-2">Your rating: {userRating.rating} star{userRating.rating !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold mb-3">Comments ({comments.length})</h3>

        {/* Comment form */}
        <form onSubmit={handleComment} className="mb-4">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
            maxLength={1000}
            rows={3}
            className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50"
            >
              {submittingComment ? "Submitting..." : replyTo ? "Reply" : "Comment"}
            </button>
            {replyTo && (
              <button
                type="button"
                onClick={() => { setReplyTo(null); setCommentText(""); }}
                className="text-xs text-zinc-500 hover:underline"
              >
                Cancel reply
              </button>
            )}
            <span className="text-xs text-zinc-400 ml-auto">{commentText.length}/1000</span>
          </div>
        </form>

        {/* Comment list */}
        {topLevelComments.length === 0 ? (
          <p className="text-xs text-zinc-400">No comments yet. Be the first!</p>
        ) : (
          <ul className="space-y-3">
            {topLevelComments.map((cmt) => (
              <li key={cmt.id}>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{cmt.user_name}</span>
                      <span className="text-xs text-zinc-400">{new Date(cmt.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5">{cmt.content}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <button
                        onClick={() => { setReplyTo(cmt.id); setCommentText(""); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => handleDeleteComment(cmt.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                {/* Replies */}
                {getReplies(cmt.id).map((reply) => (
                  <div key={reply.id} className="ml-6 mt-2 flex items-start gap-2 border-l-2 border-zinc-200 dark:border-zinc-800 pl-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{reply.user_name}</span>
                        <span className="text-xs text-zinc-400">{new Date(reply.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5">{reply.content}</p>
                      <button
                        onClick={() => handleDeleteComment(reply.id)}
                        className="text-xs text-red-500 hover:underline mt-1"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Report */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        {!showReportForm ? (
          <button
            onClick={() => setShowReportForm(true)}
            className="text-xs text-red-500 hover:underline"
          >
            Report this Playbook
          </button>
        ) : (
          <form onSubmit={handleReport} className="space-y-3">
            <h3 className="text-sm font-semibold">Report Playbook</h3>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">Severity:</label>
              {(["low", "med", "high"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setReportSeverity(s)}
                  className={`px-2 py-1 rounded text-xs ${
                    reportSeverity === s
                      ? s === "high" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : s === "med" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      : "border border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  {s === "low" ? "Low" : s === "med" ? "Medium" : "High"}
                </button>
              ))}
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue..."
              rows={2}
              className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submittingReport || !reportReason.trim()}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
              >
                {submittingReport ? "Submitting..." : "Submit Report"}
              </button>
              <button
                type="button"
                onClick={() => setShowReportForm(false)}
                className="text-xs text-zinc-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Feedback message */}
      {message && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded bg-zinc-800 text-white text-sm shadow-lg z-50">
          {message}
          <button onClick={() => setMessage(null)} className="ml-3 text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Back link */}
      <div>
        <Link href="/community" className="text-sm text-blue-600 hover:underline">
          ← Back to Community
        </Link>
      </div>
    </div>
  );
}
