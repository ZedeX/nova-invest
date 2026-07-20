import { NextRequest, NextResponse } from "next/server";
import { addComment, listComments, deleteComment } from "@/lib/community/store";
import type { CommentRequest } from "@/lib/community/types";

/**
 * /api/community/playbook/[id]/comments
 * - GET   : list comments (sorted oldest first, includes replies)
 * - POST  : add comment (supports parent_id for 2-level nesting)
 * - DELETE: delete comment (only by author, ?comment_id=xxx)
 */

const DEMO_USER = "demo_user";
const DEMO_USER_NAME = "Demo User";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const comments = listComments(id);
  return NextResponse.json({ count: comments.length, data: comments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Partial<CommentRequest>;
    if (!body.content) {
      return NextResponse.json({ error: "Missing required field: content" }, { status: 400 });
    }
    const result = addComment(id, DEMO_USER, DEMO_USER_NAME, body.content, body.parent_id ?? null);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ data: result.comment }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const commentId = new URL(request.url).searchParams.get("comment_id");
  if (!commentId) {
    return NextResponse.json({ error: "?comment_id= query param required" }, { status: 400 });
  }
  const ok = deleteComment(commentId, DEMO_USER);
  if (!ok) {
    return NextResponse.json({ error: "Comment not found or not owned by user" }, { status: 404 });
  }
  return NextResponse.json({ data: { deleted: commentId, package_id: id } });
}
