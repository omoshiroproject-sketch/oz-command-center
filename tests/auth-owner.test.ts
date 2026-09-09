import assert from "node:assert/strict";
import test from "node:test";
import { AuthError, requireOwner } from "../packages/auth/src/owner-context";

const env = { SUPABASE_URL: "https://project.example.invalid", SUPABASE_ANON_KEY: "publishable-test-key", OZ_ALLOWED_EMAIL: "owner@example.invalid" };
const request = () => new Request("https://app.example.invalid/api/oz/tasks", { headers: { authorization: "Bearer a-development-token-with-enough-length" } });

test("verified allowlisted Google identity is accepted", async () => {
  const owner = await requireOwner(request(), env, async () => Response.json({
    id: "00000000-0000-4000-8000-000000000001", email: "OWNER@example.invalid",
    email_confirmed_at: "2026-08-23T00:00:00Z", app_metadata: { providers: ["google"] },
  }));
  assert.equal(owner.email, "owner@example.invalid");
});

test("missing bearer token has no shared-owner fallback", async () => {
  await assert.rejects(() => requireOwner(new Request("https://app.example.invalid/api"), env),
    (error: unknown) => error instanceof AuthError && error.status === 401);
});

test("non-allowlisted or non-Google identity is rejected", async () => {
  await assert.rejects(() => requireOwner(request(), env, async () => Response.json({
    id: "00000000-0000-4000-8000-000000000002", email: "other@example.invalid",
    confirmed_at: "2026-08-23T00:00:00Z", app_metadata: { provider: "email" },
  })), (error: unknown) => error instanceof AuthError && error.status === 403);
});
