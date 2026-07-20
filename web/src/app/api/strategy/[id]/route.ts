import { NextRequest, NextResponse } from "next/server";

// Re-use the in-memory store from the parent route
// In Phase 2 this will be replaced with D1 queries
declare global {
  var __STRATEGY_STORE: Map<string, StrategyRecord> | undefined;
}

interface StrategyRecord {
  id: string;
  user_id: string;
  name: string;
  dsl_yaml: string;
  lifecycle_status: "draft" | "active" | "archived";
  created_at: string;
  updated_at: string;
}

function getStore(): Map<string, StrategyRecord> {
  if (!globalThis.__STRATEGY_STORE) {
    globalThis.__STRATEGY_STORE = new Map();
  }
  return globalThis.__STRATEGY_STORE;
}

/**
 * GET /api/strategy/[id] - Get a strategy by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();
  const record = store.get(id);

  if (!record) {
    return NextResponse.json({ error: "Strategy not found", id }, { status: 404 });
  }

  return NextResponse.json(record);
}

/**
 * PUT /api/strategy/[id] - Update a strategy
 * Body: { name?, dsl_yaml?, lifecycle_status? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();
  const record = store.get(id);

  if (!record) {
    return NextResponse.json({ error: "Strategy not found", id }, { status: 404 });
  }

  try {
    const body = await request.json() as Partial<StrategyRecord>;
    const updated: StrategyRecord = {
      ...record,
      ...body,
      id: record.id, // ID is immutable
      user_id: record.user_id, // user_id is immutable
      updated_at: new Date().toISOString(),
    };
    store.set(id, updated);

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/strategy/[id] - Delete a strategy
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();

  if (!store.has(id)) {
    return NextResponse.json({ error: "Strategy not found", id }, { status: 404 });
  }

  store.delete(id);
  return NextResponse.json({ success: true, id });
}
