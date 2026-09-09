import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { requireOwner } from "../packages/auth/src/owner-context";
import { listProjects } from "../packages/db/src/supabase-rest-repository";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const owner = { userId: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid", accessToken: "owner-token-test-only" };

test("owner auth prefers the new publishable key and keeps the owner token in Authorization", async () => {
  let apikey = ""; let authorization = "";
  await requireOwner(new Request("https://app.example.invalid/api", { headers: { authorization: "Bearer owner-development-access-token" } }), {
    SUPABASE_URL: "https://project.example.invalid", SUPABASE_PUBLISHABLE_KEY: "new-publishable-test", SUPABASE_ANON_KEY: "legacy-publishable-test", OZ_ALLOWED_EMAIL: owner.email,
  }, async (_input, init) => {
    const headers = new Headers(init?.headers); apikey = headers.get("apikey") ?? ""; authorization = headers.get("authorization") ?? "";
    return Response.json({ id: owner.userId, email: owner.email, confirmed_at: "2026-08-23T00:00:00Z", identities: [{ provider: "google" }] });
  });
  assert.equal(apikey, "new-publishable-test");
  assert.equal(authorization, "Bearer owner-development-access-token");
});

test("opaque Supabase secret key is never used as a Bearer token and legacy service-role fallback still works", async () => {
  const observed: Array<{ apikey: string | null; authorization: string | null }> = [];
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers); observed.push({ apikey: headers.get("apikey"), authorization: headers.get("authorization") }); return Response.json([]);
  };
  await listProjects({ SUPABASE_URL: "https://project.example.invalid", SUPABASE_SECRET_KEY: "sb_secret_short" }, owner, fetcher);
  await listProjects({ SUPABASE_URL: "https://project.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "legacy-service-test" }, owner, fetcher);
  assert.deepEqual(observed[0], { apikey: "sb_secret_short", authorization: null });
  assert.deepEqual(observed[1], { apikey: "legacy-service-test", authorization: "Bearer legacy-service-test" });
});

test("project repository exposes target_date as targetDate", async () => {
  let requestedUrl = "";
  const projects = await listProjects(
    { SUPABASE_URL: "https://project.example.invalid", SUPABASE_SECRET_KEY: "sb_secret_test_only" },
    owner,
    async (input) => {
      requestedUrl = String(input);
      return Response.json([{ id: "project-test", name: "Project", description: "Purpose", status: "ACTIVE", importance: 5, target_date: "2028-03-31" }]);
    },
  );
  assert.match(requestedUrl, /select=[^&]*target_date/);
  assert.equal(projects[0].targetDate, "2028-03-31");
  assert.equal(Object.hasOwn(projects[0], "deadline"), false);
});

test("browser key is publishable-only and Edge JWT verification remains an explicit config contract", async () => {
  const browser = await readFile(path.join(root, "app/supabase-auth.tsx"), "utf8");
  const config = await readFile(path.join(root, "supabase/config.toml"), "utf8");
  assert.match(browser, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(browser, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(config, /\[functions\.oz-job-dispatch\][\s\S]*verify_jwt = true/);
});
