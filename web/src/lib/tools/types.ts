/**
 * Tool Protocol types (ADR-0006 — task-spec refined interface).
 *
 * Note: This is the simplified task-spec interface:
 *   ToolCall  = { name, args, id }
 *   ToolResult = { id, output, error?, metadata? }
 *   Tool      = { name, description, schema, execute(args) }
 *
 * The ADR-0006 canonical shapes (parameters, cost_usd, latency_ms, source)
 * are deferred — the task description's interface is internally consistent
 * and sufficient for the registry + executeTool dispatch logic.
 *
 * See: docs/architecture/adr-0006-tool-protocol.md
 */

/**
 * Tool call request shape. `id` correlates ToolResult back to ToolCall
 * for the agent loop (ADR-0004 onToolCall dispatch).
 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

/**
 * Tool result shape. `id` matches the originating ToolCall.id.
 * `error` is set when the tool fails or args fail schema validation;
 * `output` is null in that case.
 */
export interface ToolResult {
  id: string;
  output: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * JSON-Schema-ish parameter schema. Only `required` is enforced by
 * executeTool's lightweight validator (presence check on args).
 */
export interface ToolSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

/**
 * Tool descriptor registered in TOOL_REGISTRY.
 * `execute` is stateless — all state flows through args.
 */
export interface Tool {
  name: string;
  description: string;
  schema: ToolSchema;
  execute(args: Record<string, unknown>): Promise<unknown>;
}
