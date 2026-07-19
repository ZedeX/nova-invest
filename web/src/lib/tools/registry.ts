/**
 * Tool Protocol registry + dispatcher (ADR-0006).
 *
 * Static registry of Tool descriptors. `executeTool` looks up by name,
 * validates args against the tool's schema (required-field presence check),
 * and invokes execute — converting any thrown error into a ToolResult.error
 * (no exception propagates to the caller, per ADR-0006 §Loop Integration).
 *
 * See: docs/architecture/adr-0006-tool-protocol.md
 */

import type { Tool, ToolCall, ToolResult, ToolSchema } from "./types";

/**
 * Static tool registry. Starts empty; tools are registered via registerTool.
 * Module-level Map is acceptable here — registry is populated at module
 * load (handlers register themselves) and read-only thereafter.
 */
export const TOOL_REGISTRY: Map<string, Tool> = new Map();

/**
 * Register a tool under its `name`. Overwrites existing registration.
 */
export function registerTool(tool: Tool): void {
  TOOL_REGISTRY.set(tool.name, tool);
}

/**
 * Execute a tool by name lookup.
 *
 * Contract:
 *   - Unknown tool name → ToolResult.error (no throw)
 *   - Missing required arg (schema validation) → ToolResult.error, execute NOT called
 *   - Tool.execute throws/rejects → ToolResult.error (no throw propagates)
 *   - Success → ToolResult.output = execute return value
 *   - ToolResult.id always echoes ToolCall.id
 */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const tool = TOOL_REGISTRY.get(call.name);
  if (!tool) {
    return { id: call.id, output: null, error: `Unknown tool: ${call.name}` };
  }

  if (!validateArgs(call.args, tool.schema)) {
    return { id: call.id, output: null, error: `Invalid args for tool: ${call.name}` };
  }

  try {
    const output = await tool.execute(call.args);
    return { id: call.id, output };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { id: call.id, output: null, error: message };
  }
}

/**
 * Lightweight schema validation: every field in schema.required must be
 * present (own-property) on args. Type checks are deferred — Phase 1 only
 * enforces presence, matching ADR-0006 §Validation Criteria.
 */
function validateArgs(args: Record<string, unknown>, schema: ToolSchema): boolean {
  if (!schema.required || schema.required.length === 0) return true;
  for (const field of schema.required) {
    if (!(field in args)) return false;
  }
  return true;
}
