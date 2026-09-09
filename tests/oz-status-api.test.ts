import assert from "node:assert/strict";
import test from "node:test";
import { handleOzApi } from "../worker/oz-data";

test("status proposal API returns a review-only success contract", async () => {
  const originalFetch = globalThis.fetch;
  let rpcCalls = 0;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/rest\/v1\/rpc\/oz_create_review$/);
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.equal(body.p_kind, "TASK_STATUS_CHANGE");
    assert.equal(body.p_candidate.status, "IN_PROGRESS");
    rpcCalls += 1;
    return Response.json({ reviewId: "00000000-0000-4000-8000-000000000020", status: "PENDING", replayed: false });
  };
  try {
    const response = await handleOzApi(
      new Request("http://127.0.0.1:5173/api/oz/tools", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "status-api-idempotency-0001",
          "x-oz-tool-source": "MANUAL",
        },
        body: JSON.stringify({
          name: "oz_propose_task_status_change",
          arguments: { taskId: "00000000-0000-4000-8000-000000000010", status: "IN_PROGRESS" },
        }),
      }),
      { SUPABASE_URL: "https://project.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" },
      { userId: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid", accessToken: "test-access-token-not-a-secret" },
      "/api/oz/tools",
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as { result: { code: string; data: { requiresApproval: boolean; taskChanged: boolean } } };
    assert.equal(payload.result.code, "TASK_STATUS_PROPOSED");
    assert.equal(payload.result.data.requiresApproval, true);
    assert.equal(payload.result.data.taskChanged, false);
    assert.equal(rpcCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review resolution route returns the strict tool success and outcome contract", async () => {
  const originalFetch = globalThis.fetch;
  const reviewId = "00000000-0000-4000-8000-000000000021";
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/rest\/v1\/rpc\/oz_resolve_review$/);
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.equal(body.p_review_id, reviewId);
    assert.equal(body.p_decision, "APPROVED");
    assert.equal(body.p_idempotency_key, "review-resolution-contract-0001");
    return Response.json({ reviewId, resourceId: "00000000-0000-4000-8000-000000000031", resourceType: "project", status: "APPROVED", replayed: false });
  };
  try {
    const response = await handleOzApi(
      new Request(`http://127.0.0.1:5173/api/oz/reviews/${reviewId}/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "review-resolution-contract-0001",
          "x-oz-explicit-approval": "true",
          "x-oz-tool-source": "MANUAL",
        },
        body: JSON.stringify({ decision: "APPROVED" }),
      }),
      { SUPABASE_URL: "https://project.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" },
      { userId: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid", accessToken: "test-access-token-not-a-secret" },
      `/api/oz/reviews/${reviewId}/resolve`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as { result: { ok: boolean; code: string; data: { outcome: { reviewId: string; status: string; replayed: boolean } } } };
    assert.equal(payload.result.ok, true);
    assert.equal(payload.result.code, "REVIEW_RESOLVED");
    assert.equal(payload.result.data.outcome.reviewId, reviewId);
    assert.equal(payload.result.data.outcome.status, "APPROVED");
    assert.equal(payload.result.data.outcome.replayed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
