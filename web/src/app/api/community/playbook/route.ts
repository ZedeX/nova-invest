import { NextRequest, NextResponse } from "next/server";

/**
 * Community Playbook API
 * - GET  /api/community/playbook       - List published playbooks
 * - POST /api/community/playbook       - Publish a new playbook
 */

// In-memory store for Phase 1
declare global {
  var __COMMUNITY_PLAYBOOKS: CommunityPlaybook[] | undefined;
}

interface CommunityPlaybook {
  package_id: string;
  playbook_id: string;
  author_id: string;
  title: string;
  description: string;
  tags: string[];
  version: string;
  moderation_status: "pending" | "approved" | "rejected";
  installed_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
}

function getStore(): CommunityPlaybook[] {
  if (!globalThis.__COMMUNITY_PLAYBOOKS) {
    globalThis.__COMMUNITY_PLAYBOOKS = [];
  }
  return globalThis.__COMMUNITY_PLAYBOOKS;
}

function genId(): string {
  return `pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET /api/community/playbook - List published playbooks
 * Query params: ?sort=rating|installed|recent&limit=20&offset=0
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") || "recent";
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const playbooks = getStore().filter(p => p.moderation_status === "approved");

  // Sort
  switch (sort) {
    case "rating":
      playbooks.sort((a, b) => b.rating_avg - a.rating_avg);
      break;
    case "installed":
      playbooks.sort((a, b) => b.installed_count - a.installed_count);
      break;
    case "recent":
    default:
      playbooks.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  // Paginate
  const paginated = playbooks.slice(offset, offset + limit);

  return NextResponse.json({
    count: paginated.length,
    total: playbooks.length,
    data: paginated,
  });
}

/**
 * POST /api/community/playbook - Publish a new playbook
 * Body: { title, description, tags?, playbook_id, version, yaml_content }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      title?: string;
      description?: string;
      tags?: string[];
      playbook_id?: string;
      version?: string;
      yaml_content?: string;
    };

    if (!body.title || !body.playbook_id || !body.version) {
      return NextResponse.json(
        { error: "Missing required fields: title, playbook_id, version" },
        { status: 400 },
      );
    }

    const record: CommunityPlaybook = {
      package_id: genId(),
      playbook_id: body.playbook_id,
      author_id: "demo_user", // Phase 1: single user
      title: body.title,
      description: body.description || "",
      tags: body.tags || [],
      version: body.version,
      moderation_status: "pending", // All UGC starts as pending per ADR-0012
      installed_count: 0,
      rating_avg: 0,
      rating_count: 0,
      created_at: new Date().toISOString(),
    };

    getStore().push(record);

    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
