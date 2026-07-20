import { NextRequest, NextResponse } from "next/server";
import {
  getPlaybook,
  getPlaybookRecord,
  deletePlaybook,
  updateLifecycleStatus,
} from "@/lib/playbook/store";

/**
 * /api/playbooks/[id]
 * - GET    : get playbook (optional ?version=1.2.0)
 * - DELETE : delete playbook
 * - PATCH  : update lifecycle status (?status=archived)
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const version = request.nextUrl.searchParams.get("version") ?? undefined;
  const yaml = getPlaybook(id, version);
  if (!yaml) {
    return NextResponse.json({ error: `Playbook ${id} not found` }, { status: 404 });
  }
  const record = getPlaybookRecord(id);
  return NextResponse.json({ data: { record, yaml } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = deletePlaybook(id);
  if (!ok) {
    return NextResponse.json({ error: `Playbook ${id} not found` }, { status: 404 });
  }
  return NextResponse.json({ data: { deleted: id } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const status = request.nextUrl.searchParams.get("status");
  if (!status) {
    return NextResponse.json({ error: "?status= query param required" }, { status: 400 });
  }
  const validStatuses = ["draft", "published", "archived", "deprecated"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }
  const result = updateLifecycleStatus(id, status as "draft" | "published" | "archived" | "deprecated");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ data: { id, status } });
}
