import { NextRequest, NextResponse } from "next/server";
import { getPlaybook } from "@/lib/playbook/store";
import { PlaybookExecutor } from "@/lib/playbook/executor";
import type { ExecutionContext } from "@/lib/playbook/types";

/**
 * POST /api/playbooks/[id]/execute
 * Executes the playbook with the given context.
 *
 * Body: { capital?: number, state?: Record<string, unknown> }
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const playbook = getPlaybook(id);
  if (!playbook) {
    return NextResponse.json({ error: `Playbook ${id} not found` }, { status: 404 });
  }

  let body: { capital?: number; state?: Record<string, unknown> };
  try {
    body = (await request.json()) as { capital?: number; state?: Record<string, unknown> };
  } catch {
    body = {};
  }

  const context: ExecutionContext = {
    userId: "demo_user",
    capital: body.capital ?? 100_000,
    timestamp: new Date().toISOString(),
    state: body.state ?? {},
  };

  // Loader: fetch child playbooks from store
  const loader = async (childId: string) => getPlaybook(childId);
  const executor = new PlaybookExecutor(loader);

  const result = await executor.execute(playbook, context);
  return NextResponse.json({ data: result });
}
