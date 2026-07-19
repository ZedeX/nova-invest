/**
 * TDD Spec — ADR-0006: Tool Protocol (Static Registry + Native Function Call)
 *
 * Validates the tool protocol interface defined in:
 *   docs/architecture/adr-0006-tool-protocol.md
 *
 * Note: This implementation follows the task-spec interface
 *   ToolCall  = { name, args, id }
 *   ToolResult = { id, output, error?, metadata? }
 *   Tool      = { name, description, schema, execute(args) }
 * which is a simplified, self-consistent refinement of the ADR-0006
 * canonical shapes (parameters→args, no cost/latency trace fields).
 *
 * Test strategy:
 *   - vi.resetModules() before each test to get a fresh TOOL_REGISTRY
 *     (registry is module-level Map state).
 *   - Dynamic imports so each test sees the fresh registry.
 *   - USE_MOCK=true per project convention (tests/setup.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ADR-0006: Tool Protocol (registry + executeTool)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.USE_MOCK = "true";
  });

  // ---------- §Validation Criteria ----------

  it("TOOL_REGISTRY starts empty (no default tools registered)", async () => {
    const { TOOL_REGISTRY } = await import("@/lib/tools/registry");
    expect(TOOL_REGISTRY.size).toBe(0);
  });

  it("registerTool(tool) adds the tool to TOOL_REGISTRY", async () => {
    const { TOOL_REGISTRY, registerTool } = await import("@/lib/tools/registry");
    const tool = {
      name: "get_quote",
      description: "Get current price quote",
      schema: { type: "object" as const, properties: { ticker: { type: "string" } }, required: ["ticker"] },
      execute: vi.fn().mockResolvedValue({ price: 150 }),
    };
    registerTool(tool);
    expect(TOOL_REGISTRY.get("get_quote")).toBe(tool);
    expect(TOOL_REGISTRY.size).toBe(1);
  });

  it("executeTool(call) looks up tool by name and calls execute, returning output", async () => {
    const { registerTool, executeTool } = await import("@/lib/tools/registry");
    const execMock = vi.fn().mockResolvedValue({ price: 200 });
    registerTool({
      name: "get_quote",
      description: "Get quote",
      schema: { type: "object", properties: { ticker: { type: "string" } }, required: ["ticker"] },
      execute: execMock,
    });
    const result = await executeTool({ name: "get_quote", args: { ticker: "AAPL" }, id: "call-1" });
    expect(execMock).toHaveBeenCalledWith({ ticker: "AAPL" });
    expect(result.output).toEqual({ price: 200 });
    expect(result.error).toBeUndefined();
  });

  it("executeTool with unknown tool name returns ToolResult with error", async () => {
    const { executeTool } = await import("@/lib/tools/registry");
    const result = await executeTool({ name: "nonexistent_tool", args: {}, id: "call-2" });
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("nonexistent_tool");
    expect(result.output).toBeNull();
  });

  it("Tool.execute throws → ToolResult.error is set (no exception propagates)", async () => {
    const { registerTool, executeTool } = await import("@/lib/tools/registry");
    registerTool({
      name: "failing_tool",
      description: "Always fails",
      schema: { type: "object", properties: {}, required: [] },
      execute: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const result = await executeTool({ name: "failing_tool", args: {}, id: "call-3" });
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("boom");
    expect(result.output).toBeNull();
  });

  it("ToolResult.id matches ToolCall.id (call/result correlation)", async () => {
    const { registerTool, executeTool } = await import("@/lib/tools/registry");
    registerTool({
      name: "echo",
      description: "Echo",
      schema: { type: "object", properties: {}, required: [] },
      execute: vi.fn().mockResolvedValue("ok"),
    });
    const result = await executeTool({ name: "echo", args: {}, id: "trace-id-xyz" });
    expect(result.id).toBe("trace-id-xyz");
  });

  it("Tool schema validation: missing required arg → error result, execute NOT called", async () => {
    const { registerTool, executeTool } = await import("@/lib/tools/registry");
    const execMock = vi.fn().mockResolvedValue("should-not-reach");
    registerTool({
      name: "get_quote",
      description: "Get quote",
      schema: {
        type: "object",
        properties: { ticker: { type: "string" } },
        required: ["ticker"],
      },
      execute: execMock,
    });
    // Missing required `ticker` arg
    const result = await executeTool({ name: "get_quote", args: {}, id: "call-4" });
    expect(result.error).toBeTruthy();
    expect(result.output).toBeNull();
    expect(execMock).not.toHaveBeenCalled();
  });
});
