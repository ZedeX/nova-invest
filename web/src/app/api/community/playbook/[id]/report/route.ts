import { NextRequest, NextResponse } from "next/server";
import { reportPackage, listReports } from "@/lib/community/store";
import type { ReportRequest, ReportSeverity } from "@/lib/community/types";

/**
 * /api/community/playbook/[id]/report
 * - POST : report package (severity-graded, auto-flags on high or 3+ reports)
 * - GET  : list reports for this package (moderation view)
 */

const DEMO_USER = "demo_user";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Partial<ReportRequest>;
    if (!body.reason) {
      return NextResponse.json({ error: "Missing required field: reason" }, { status: 400 });
    }
    const validSeverities: ReportSeverity[] = ["low", "med", "high"];
    if (!body.severity || !validSeverities.includes(body.severity)) {
      return NextResponse.json({ error: "severity must be low|med|high" }, { status: 400 });
    }
    const result = reportPackage(id, DEMO_USER, body.reason, body.severity);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ data: result.report }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reports = listReports({ packageId: id });
  return NextResponse.json({ count: reports.length, data: reports });
}
