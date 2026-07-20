import { NextRequest, NextResponse } from "next/server";
import { ratePackage, getRating } from "@/lib/community/store";
import type { RateRequest } from "@/lib/community/types";

/**
 * /api/community/playbook/[id]/rate
 * - POST : rate package 1-5 stars (dedup: 1 per user, update if exists)
 * - GET  : get current user's rating for this package
 */

const DEMO_USER = "demo_user";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Partial<RateRequest>;
    if (body.rating === undefined) {
      return NextResponse.json({ error: "Missing required field: rating" }, { status: 400 });
    }
    const result = ratePackage(id, DEMO_USER, body.rating);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ data: result.rating }, { status: 201 });
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
  const rating = getRating(id, DEMO_USER);
  return NextResponse.json({ data: rating });
}
