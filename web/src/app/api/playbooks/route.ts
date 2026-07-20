import { NextRequest, NextResponse } from "next/server";
import {
  listPlaybooks,
  createPlaybook,
} from "@/lib/playbook/store";
import type { CreatePlaybookRequest } from "@/lib/playbook/types";

/**
 * /api/playbooks
 * - GET  : list all playbooks (optional ?kind=strategy&status=published)
 * - POST : create a new playbook
 */

const DEMO_USER = "brenda@example.com";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? undefined;
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const records = listPlaybooks({
    kind,
    lifecycle_status: status as "draft" | "published" | "archived" | "deprecated" | undefined,
  });
  return NextResponse.json({ count: records.length, data: records });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CreatePlaybookRequest>;

    if (!body.title || !body.kind) {
      return NextResponse.json(
        { error: "Missing required fields: title, kind" },
        { status: 400 },
      );
    }

    const result = createPlaybook(
      {
        title: body.title,
        description: body.description ?? "",
        kind: body.kind,
        yaml: body.yaml ?? "{}",
        narrative: body.narrative ?? { why: "", how: "", risks: [] },
        strategy: body.strategy,
        composition: body.composition,
      },
      DEMO_USER,
    );

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ data: result.record }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
