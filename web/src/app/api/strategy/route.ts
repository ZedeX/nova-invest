import { NextRequest, NextResponse } from "next/server";

/**
 * Strategy CRUD API
 * - GET    /api/strategy         - List user strategies
 * - POST   /api/strategy         - Create new strategy
 * - GET    /api/strategy/[id]    - Get strategy by ID
 * - PUT    /api/strategy/[id]    - Update strategy
 * - DELETE /api/strategy/[id]    - Delete strategy
 */

// In-memory store for Phase 1 (D1 persistence in Phase 2)
// keyed by user_id + strategy_id
const STRATEGY_STORE = new Map<string, StrategyRecord>();

interface StrategyRecord {
  id: string;
  user_id: string;
  name: string;
  dsl_yaml: string;
  lifecycle_status: "draft" | "active" | "archived";
  created_at: string;
  updated_at: string;
}

function genId(): string {
  return `strat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET /api/strategy - List strategies for a user
 * Phase 1: returns all strategies (single-user demo)
 */
export async function GET() {
  const strategies = Array.from(STRATEGY_STORE.values());
  return NextResponse.json({
    count: strategies.length,
    data: strategies,
  });
}

/**
 * POST /api/strategy - Create a new strategy
 * Body: { name: string, dsl_yaml: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; dsl_yaml?: string };

    if (!body.name || !body.dsl_yaml) {
      return NextResponse.json(
        { error: "Missing required fields: name, dsl_yaml" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const record: StrategyRecord = {
      id: genId(),
      user_id: "demo_user", // Phase 1: single user
      name: body.name,
      dsl_yaml: body.dsl_yaml,
      lifecycle_status: "draft",
      created_at: now,
      updated_at: now,
    };

    STRATEGY_STORE.set(record.id, record);

    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
