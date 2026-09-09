import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /事業一覧/);
  assert.match(html, /id=["']businessList["']/);
  assert.doesNotMatch(html, /id=["']demoModeBtn["']/);
  assert.doesNotMatch(html, /data-action=["'](?:prev|next|auto)["']/);
  assert.doesNotMatch(html, /id=["']contextTags["']/);
  assert.match(html, /id=["']networkBtn["']/);
  assert.match(html, /id=["']fullscreenBtn["']/);
  assert.match(html, /<time id=["']clock["']>--:--:--<\/time>/);
  assert.doesNotMatch(html, /data-oz-runtime|data-oz-mode|data-oz-right-view|data-oz-state/);
  assert.doesNotMatch(html, /fixtures\/oz-demo-v1\.js|oz-latency-metrics\.js|oz-network\.js|oz-workspace\.js|live-oz\.js/);

  const demoResponse = await worker.fetch(
    new Request("http://localhost/demo", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(demoResponse.status, 200);
  const demoHtml = await demoResponse.text();
  assert.match(demoHtml, /id=["']demoModeBtn["']/);
  assert.match(demoHtml, /\bhidden=["']{2}/);
  assert.match(demoHtml, /data-action=["']prev["']/);
  assert.match(demoHtml, /data-action=["']next["']/);
  assert.match(demoHtml, /data-action=["']auto["']/);
  assert.match(demoHtml, /id=["']contextTags["']/);
  assert.match(demoHtml, /data-demo-only=["']true["'][^>]*hidden=["']{2}/);
  assert.doesNotMatch(demoHtml, /data-oz-runtime|fixtures\/oz-demo-v1\.js|oz-latency-metrics\.js|oz-network\.js|oz-workspace\.js|live-oz\.js/);
});

test("reports Realtime and integration configuration without exposing secrets", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/auth/v1/user")) return Response.json({
      id: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid",
      email_confirmed_at: "2026-08-23T00:00:00Z", app_metadata: { provider: "google", providers: ["google"] },
    });
    throw new Error("Unexpected network request");
  };
  const response = await worker.fetch(new Request("http://localhost/health", {
    headers: { authorization: "Bearer this-is-a-valid-development-token" },
  }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    SUPABASE_URL: "https://project.example.invalid", SUPABASE_ANON_KEY: "test-publishable-key", SUPABASE_SERVICE_ROLE_KEY: "test-service-key", OZ_ALLOWED_EMAIL: "owner@example.invalid",
  }, { waitUntil() {}, passThroughOnException() {} });
  globalThis.fetch = originalFetch;

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.liveOzConfigured, false);
  assert.equal(body.realtimeModel, "gpt-realtime-2.1");
  assert.equal(body.integrations.find((integration) => integration.id === "project-database")?.connected, true);
  assert.ok(body.integrations.filter((integration) => integration.id !== "project-database").every((integration) => integration.connected === false));
  assert.equal(JSON.stringify(body).includes("OPENAI_API_KEY"), false);
});

test("rejects Realtime short client-secret creation when local configuration is absent", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("session", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/auth/v1/user")) return Response.json({
      id: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid",
      confirmed_at: "2026-08-23T00:00:00Z", identities: [{ provider: "google" }],
    });
    throw new Error("Unexpected network request");
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/realtime/client-secret", {
      method: "POST",
      headers: { authorization: "Bearer this-is-a-valid-development-token" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      SUPABASE_URL: "https://project.example.invalid", SUPABASE_ANON_KEY: "test-publishable-key", OZ_ALLOWED_EMAIL: "owner@example.invalid",
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  globalThis.fetch = originalFetch;

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "OPENAI_NOT_CONFIGURED");
  assert.match(body.error.message, /local\/development/);
});

test("rejects unauthenticated API access without an owner fallback", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("unauthenticated", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/api/oz/context"), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    SUPABASE_URL: "https://project.example.invalid", SUPABASE_ANON_KEY: "test-publishable-key", OZ_ALLOWED_EMAIL: "owner@example.invalid",
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 401);
});

test("rejects a non-owner token before Realtime client-secret creation", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("realtime-owner", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  let openAiCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/auth/v1/user")) return Response.json({
      id: "00000000-0000-4000-8000-000000000002", email: "other@example.invalid",
      confirmed_at: "2026-08-23T00:00:00Z", identities: [{ provider: "google" }],
    });
    openAiCalls += 1;
    throw new Error("Unexpected external request");
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/realtime/client-secret", { method: "POST", headers: { authorization: "Bearer this-is-a-valid-development-token" } }), {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      SUPABASE_URL: "https://project.example.invalid", SUPABASE_PUBLISHABLE_KEY: "publishable-test", OZ_ALLOWED_EMAIL: "owner@example.invalid",
      OPENAI_API_KEY: "configured-test-key", OZ_SAFETY_IDENTIFIER_SALT: "configured-safety-salt-test",
    }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 403);
    assert.equal(openAiCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
