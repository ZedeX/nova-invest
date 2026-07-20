import { NextRequest, NextResponse } from "next/server";
import { installPackage, listInstalls } from "@/lib/community/store";

/**
 * /api/community/playbook/[id]/install
 * - POST : install package (creates reference, not copy)
 * - GET  : list user's installed packages
 */

const DEMO_USER = "demo_user";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = installPackage(id, DEMO_USER);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ data: result.install }, { status: 201 });
}

export async function GET() {
  const installs = listInstalls(DEMO_USER);
  return NextResponse.json({ count: installs.length, data: installs });
}
