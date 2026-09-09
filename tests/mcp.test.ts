import assert from "node:assert/strict";
import test from "node:test";
import { OZ_TOOL_NAMES } from "../packages/application/src/tool-contracts";
import { handleMcpProtectedResource, handleMcpRequest, type OzMcpEnvironment } from "../worker/mcp";

const env: OzMcpEnvironment = {
  OZ_MCP_LOCAL_INSPECTOR_TOKEN: "local-inspector-test-token",
  OZ_MCP_LOCAL_OWNER_ID: "00000000-0000-4000-8000-000000000001",
  SUPABASE_URL: "https://project.example.invalid",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  OZ_ALLOWED_EMAIL: "owner@example.invalid",
};
const headers = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
  "x-oz-local-token": "local-inspector-test-token",
};
function request(method: string, params?: Record<string, unknown>, id: number | string = 1, extraHeaders: Record<string, string> = {}) {
  return new Request("http://127.0.0.1:5173/mcp", {
    method: "POST", headers: { ...headers, ...extraHeaders }, body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
  });
}

test("local Streamable HTTP MCP initializes and lists every shared OZ tool", async () => {
  const initialize = await handleMcpRequest(request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }), env);
  assert.equal(initialize.status, 200);
  assert.equal((await initialize.json()).result.protocolVersion, "2025-06-18");

  const response = await handleMcpRequest(request("tools/list"), env);
  const tools = (await response.json()).result.tools;
  assert.deepEqual(tools.map((tool: { name: string }) => tool.name), OZ_TOOL_NAMES);
  for (const tool of tools) {
    assert.equal(typeof tool.inputSchema, "object");
    assert.equal(typeof tool.outputSchema, "object");
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
    assert.equal(typeof tool.annotations.destructiveHint, "boolean");
    assert.equal(typeof tool.annotations.openWorldHint, "boolean");
    assert.ok(["automatic", "explicit"].includes(tool._meta["oz/approval"]));
  }
});

test("MCP rejects anonymous, foreign-origin, and remote production requests", async () => {
  const anonymous = await handleMcpRequest(new Request("http://127.0.0.1:5173/mcp", { method: "POST", headers: { accept: headers.accept, "content-type": headers["content-type"] }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env);
  assert.equal(anonymous.status, 401);

  const foreignOrigin = await handleMcpRequest(request("tools/list", undefined, 2, { origin: "https://foreign.example.invalid" }), env);
  assert.equal(foreignOrigin.status, 403);

  const remote = new Request("https://oz.example.invalid/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }) });
  assert.equal((await handleMcpRequest(remote, env)).status, 503);
  assert.equal(handleMcpProtectedResource(env).status, 503);
});

test("explicit MCP tools cannot treat the model call as owner approval", async () => {
  const response = await handleMcpRequest(request("tools/call", {
    name: "oz_resolve_review",
    arguments: { reviewId: "00000000-0000-4000-8000-000000000002", decision: "APPROVED" },
  }), env);
  const body = await response.json();
  assert.equal(body.result.isError, true);
  assert.equal(body.result.structuredContent.code, "EXPLICIT_APPROVAL_REQUIRED");
});
