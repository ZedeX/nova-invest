import { NextRequest, NextResponse } from "next/server";
import { listPackages, publishPackage } from "@/lib/community/store";
import type { PublishPackageRequest, SearchQuery } from "@/lib/community/types";

/**
 * /api/community/playbook
 * - GET  : list packages with search + sort + pagination
 *   ?q=keyword&tags=momentum,nvda&author=brenda&sort=trending&limit=20&offset=0
 * - POST : publish a new package (anti-abuse: rate limit + duplicate check)
 */

const DEMO_USER = "demo_user";
const DEMO_USER_NAME = "Demo User";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query: SearchQuery = {
    q: searchParams.get("q") ?? undefined,
    tags: searchParams.get("tags")?.split(",").filter(Boolean),
    author: searchParams.get("author") ?? undefined,
    sort: (searchParams.get("sort") as SearchQuery["sort"]) ?? "recent",
    limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20,
    offset: searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0,
  };

  const { packages, total } = listPackages(query);
  return NextResponse.json({ count: packages.length, total, data: packages });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<PublishPackageRequest>;
    if (!body.title || !body.playbook_id || !body.version) {
      return NextResponse.json(
        { error: "Missing required fields: title, playbook_id, version" },
        { status: 400 },
      );
    }

    const result = publishPackage(
      {
        playbook_id: body.playbook_id,
        title: body.title,
        description: body.description ?? "",
        tags: body.tags,
        version: body.version,
      },
      DEMO_USER,
      DEMO_USER_NAME,
    );

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ data: result.package }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
