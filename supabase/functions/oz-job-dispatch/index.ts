import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { captureSafeException } from "../_shared/safe-monitoring.ts";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

Deno.serve(async (request) => {
  const traceId = crypto.randomUUID();
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed", traceId }, 405);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const allowedEmail = (Deno.env.get("OZ_ALLOWED_EMAIL") ?? "").trim().toLowerCase();
    const authorization = request.headers.get("authorization") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !allowedEmail) return json({ error: "Service is not configured", traceId }, 503);

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, authorization } });
    if (!authResponse.ok) return json({ error: "Authentication is required", traceId }, 401);
    const user = await authResponse.json();
    const providers = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [];
    const hasGoogle = user?.app_metadata?.provider === "google" || providers.includes("google")
      || user?.identities?.some((identity: { provider?: string }) => identity.provider === "google");
    if (!hasGoogle || String(user?.email ?? "").trim().toLowerCase() !== allowedEmail) {
      return json({ error: "Account is not allowed", traceId }, 403);
    }

    const body = await request.json();
    const jobType = typeof body?.jobType === "string" ? body.jobType.trim().slice(0, 80) : "";
    const resourceId = typeof body?.resourceId === "string" ? body.resourceId : "";
    const workloadClass = body?.workloadClass === "LONG" ? "LONG" : "SHORT";
    if (!jobType || !/^[0-9a-f-]{36}$/i.test(resourceId)) return json({ error: "Invalid job reference", traceId }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { error } = await admin.schema("pgmq_public").rpc("send", {
      queue_name: "oz_jobs",
      message: { jobType, resourceId, workloadClass, ownerId: user.id, traceId },
      sleep_seconds: 0,
    });
    if (error) throw new Error("QUEUE_WRITE_FAILED");

    return json({ accepted: true, traceId, workloadClass, execution: workloadClass === "LONG" ? "EXTERNAL_WORKER_REQUIRED" : "EDGE_ELIGIBLE" }, 202);
  } catch (error) {
    captureSafeException(error, { operation: "oz-job-dispatch", traceId, code: "DISPATCH_FAILED", status: 500 });
    return json({ error: "Job dispatch failed", traceId }, 500);
  }
});
