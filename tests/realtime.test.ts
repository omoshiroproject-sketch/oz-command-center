import assert from "node:assert/strict";
import test from "node:test";
import { OZ_TOOL_NAMES } from "../packages/application/src/tool-contracts";
import { createRealtimeClientSecret, OZ_REALTIME_REVIEW_TOOLS, realtimeSessionConfiguration, safetyIdentifier } from "../worker/realtime";

const owner = { userId: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid", accessToken: "owner-access-token-test-only" };

test("Realtime session defaults to verified model, cedar, WebRTC function tools, and no connector fabrication", () => {
  const session = realtimeSessionConfiguration({});
  assert.equal(session.model, "gpt-realtime-2.1");
  assert.equal(session.audio.output.voice, "cedar");
  assert.equal(session.audio.input.turn_detection.interrupt_response, true);
  const functionTools = session.tools.filter((tool): tool is Extract<(typeof session.tools)[number], { name: unknown }> => "name" in tool);
  assert.deepEqual(functionTools.map((tool) => tool.name), [...OZ_TOOL_NAMES, ...OZ_REALTIME_REVIEW_TOOLS.map((tool) => tool.name)]);
  assert.ok(session.tools.every((tool) => tool.type === "function"));
  assert.match(session.instructions, /oz_prepare_project_review_batch/);
  assert.match(session.instructions, /immediately following user turn/);
});

test("short client-secret endpoint keeps the standard API key server-side", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamAuthorization = "";
  let safety = "";
  let upstreamBody = "";
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    upstreamAuthorization = headers.get("authorization") ?? "";
    safety = headers.get("OpenAI-Safety-Identifier") ?? "";
    upstreamBody = String(init?.body ?? "");
    return Response.json({ value: "ephemeral-client-value-test-only", expires_at: 1_800_000_000 });
  };
  try {
    const response = await createRealtimeClientSecret(new Request("http://localhost/api/realtime/client-secret", { method: "POST" }), {
      OPENAI_API_KEY: "standard-api-key-test-only",
      OZ_SAFETY_IDENTIFIER_SALT: "safety-salt-test-only-0001",
    }, owner);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.value, "ephemeral-client-value-test-only");
    assert.equal(JSON.stringify(body).includes("standard-api-key-test-only"), false);
    assert.equal(upstreamAuthorization, "Bearer standard-api-key-test-only");
    assert.equal(upstreamBody.includes("standard-api-key-test-only"), false);
    assert.notEqual(safety, owner.userId);
    assert.match(safety, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Realtime refuses missing server key or privacy salt without an external call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not call"); };
  try {
    const response = await createRealtimeClientSecret(new Request("http://localhost/api/realtime/client-secret", { method: "POST" }), { OPENAI_API_KEY: "configured-test-key" }, owner);
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("safety identifier is deterministic, salted, and does not expose owner UUID", async () => {
  const env = { OZ_SAFETY_IDENTIFIER_SALT: "safety-salt-test-only-0001" };
  const first = await safetyIdentifier(owner, env);
  const second = await safetyIdentifier(owner, env);
  assert.equal(first, second);
  assert.equal(first.includes(owner.userId), false);
});
