import { NextRequest, NextResponse } from "next/server";
import { listVersions, publishVersion } from "@/lib/playbook/store";
import type { PublishVersionRequest } from "@/lib/playbook/types";

/**
 * /api/playbooks/[id]/versions
 * - GET  : list all versions of a playbook
 * - POST : publish a new version
 */

const DEMO_USER = "brenda@example.com";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const versions = listVersions(id);
  if (versions.length === 0) {
    return NextResponse.json({ error: `Playbook ${id} not found` }, { status: 404 });
  }
  return NextResponse.json({ count: versions.length, data: versions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Partial<PublishVersionRequest>;
    if (!body.version || !body.yaml) {
      return NextResponse.json(
        { error: "Missing required fields: version, yaml" },
        { status: 400 },
      );
    }
    const result = publishVersion(
      id,
      {
        version: body.version,
        changelog: body.changelog ?? "",
        yaml: body.yaml,
      },
      DEMO_USER,
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ data: { record: result.record, version: result.version } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
