import assert from "node:assert/strict";
import test from "node:test";

test("authenticated owner receives a complete context response", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("context", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  const dataReads = [];
  let projectReadUrl = "";

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({
      id: "owner-test-id",
      email: "owner@example.invalid",
      email_confirmed_at: "2026-08-23T00:00:00Z",
      app_metadata: { provider: "google", providers: ["google"] },
    });
    if (url.includes("/rest/v1/projects?")) { dataReads.push("projects"); projectReadUrl = url; }
    else if (url.includes("/rest/v1/tasks?")) dataReads.push("tasks");
    else if (url.includes("/rest/v1/review_items?")) dataReads.push("review_items");
    else if (url.includes("/rest/v1/task_dependencies?")) dataReads.push("task_dependencies");
    else if (url.includes("/rest/v1/task_sources?")) dataReads.push("task_sources");
    else if (url.includes("/rest/v1/audit_logs?")) dataReads.push("audit_logs");
    else if (url.includes("/rest/v1/external_actions?")) dataReads.push("external_actions");
    else if (url.includes("/rest/v1/action_approvals?")) dataReads.push("action_approvals");
    else throw new Error("Unexpected local repository request");
    return Response.json([]);
  };

  try {
    const response = await worker.fetch(new Request("http://localhost/api/oz/context", {
      headers: { authorization: "Bearer this-is-a-valid-development-token" },
    }), {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      SUPABASE_URL: "https://project.example.invalid",
      SUPABASE_ANON_KEY: "test-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      OZ_ALLOWED_EMAIL: "owner@example.invalid",
    }, { waitUntil() {}, passThroughOnException() {} });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.projects, []);
    assert.deepEqual(body.tasks, []);
    assert.deepEqual(body.reviews, []);
    assert.deepEqual(body.auditLogs, []);
    assert.deepEqual(body.externalActions, []);
    assert.deepEqual(body.actionApprovals, []);
    assert.match(projectReadUrl, /(?:select=|%2C)id[^&]*target_date/);
    assert.equal(body.integrations.find((integration) => integration.id === "project-database")?.connected, true);
    assert.deepEqual(dataReads.sort(), ["action_approvals", "audit_logs", "external_actions", "projects", "review_items", "task_dependencies", "task_sources", "tasks"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
