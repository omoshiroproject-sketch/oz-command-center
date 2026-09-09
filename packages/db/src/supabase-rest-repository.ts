import type { OwnerContext } from "../../auth/src/owner-context";

export interface SupabaseDataEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export class DataAccessError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "DataAccessError";
  }
}

function configuration(env: SupabaseDataEnvironment) {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceCredential = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !serviceCredential) throw new DataAccessError("Development database is not configured.", 503);
  return { url, serviceCredential };
}

async function request<T>(
  env: SupabaseDataEnvironment,
  owner: OwnerContext,
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const { url, serviceCredential } = configuration(env);
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("apikey", serviceCredential);
    if (serviceCredential.startsWith("sb_secret_")) headers.delete("authorization");
    else headers.set("authorization", `Bearer ${serviceCredential}`);
    headers.set("content-type", "application/json");
    headers.set("accept", "application/json");
    response = await fetcher(`${url}/rest/v1/${path}`, { ...init, headers });
  } catch {
    throw new DataAccessError("Database service is unavailable.", 503);
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new DataAccessError("Database operation failed.", response.status >= 500 ? 503 : 400);
  return value as T;
}

type Row = Record<string, unknown>;

export async function listProjects(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  const rows = await request<Row[]>(env, owner, `projects?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,slug,name,description,status,importance,target_date,progress_counting_mode,created_at,updated_at&order=updated_at.desc&limit=50`, {}, fetcher);
  return rows.map((row) => ({
    id: row.id, slug: row.slug, name: row.name, purpose: row.description ?? "", status: String(row.status ?? "").toLowerCase(), formalStatus: row.status,
    importance: row.importance, targetDate: row.target_date, progressCountingMode: row.progress_counting_mode, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function listTasks(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  const rows = await request<Row[]>(env, owner, `tasks?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,project_id,parent_task_id,title,description,status,time_lane,importance,due_at,estimated_minutes,actual_minutes,assignee_label,delegation_state,delegate_label,execution_environment,travel_allowed,block_reason,created_at,updated_at,completed_at&order=updated_at.desc&limit=500`, {}, fetcher);
  return rows.map((row) => ({
    id: row.id, projectId: row.project_id, parentTaskId: row.parent_task_id, title: row.title, description: row.description,
    status: row.status === "COMPLETED" ? "done" : "open", formalStatus: row.status, timeLane: row.time_lane,
    importance: row.importance, dueAt: row.due_at, estimatedMinutes: row.estimated_minutes,
    actualMinutes: row.actual_minutes, assigneeLabel: row.assignee_label, delegationState: row.delegation_state,
    delegateLabel: row.delegate_label, executionEnvironment: row.execution_environment, travelAllowed: row.travel_allowed,
    blockReason: row.block_reason, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
  }));
}

export async function listTaskDependencies(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  return request<Row[]>(env, owner, `task_dependencies?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,task_id,depends_on_task_id,created_at&order=created_at.asc&limit=1000`, {}, fetcher);
}

export async function listTaskSources(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  return request<Row[]>(env, owner, `task_sources?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,task_id,source_type,source_occurred_at,created_at&order=created_at.desc&limit=1000`, {}, fetcher);
}

export async function listReviews(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  return request<Row[]>(env, owner, `review_items?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,kind,source_type,status,candidate_data,target_type,target_id,approved_entity_type,approved_entity_id,version,created_at,updated_at,resolved_at&order=created_at.desc&limit=100`, {}, fetcher);
}

export async function listAuditLogs(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  return request<Row[]>(env, owner, `audit_logs?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,action,target_type,target_id,outcome,approval_id,trace_id,created_at&order=created_at.desc&limit=100`, {}, fetcher);
}

export async function listExternalActions(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  return request<Row[]>(env, owner, `external_actions?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,provider,action_type,status,result_code,created_at,updated_at&order=created_at.desc&limit=100`, {}, fetcher);
}

export async function listActionApprovals(env: SupabaseDataEnvironment, owner: OwnerContext, fetcher?: typeof fetch) {
  return request<Row[]>(env, owner, `action_approvals?owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,external_action_id,decision,decided_at&order=decided_at.desc&limit=100`, {}, fetcher);
}

export async function createReview(
  env: SupabaseDataEnvironment,
  owner: OwnerContext,
  input: { kind: string; sourceType: string; candidate: Row; targetId?: string | null; idempotencyKey: string },
  fetcher?: typeof fetch,
) {
  return request<Row>(env, owner, "rpc/oz_create_review", {
    method: "POST",
    body: JSON.stringify({ p_owner_id: owner.userId, p_kind: input.kind, p_source_type: input.sourceType, p_candidate: input.candidate, p_target_id: input.targetId ?? null, p_idempotency_key: input.idempotencyKey }),
  }, fetcher);
}

export async function resolveReview(
  env: SupabaseDataEnvironment,
  owner: OwnerContext,
  input: { reviewId: string; decision: string; edits?: Row; reason?: string; idempotencyKey: string },
  fetcher?: typeof fetch,
) {
  return request<Row>(env, owner, "rpc/oz_resolve_review", {
    method: "POST",
    body: JSON.stringify({ p_owner_id: owner.userId, p_review_id: input.reviewId, p_decision: input.decision, p_edits: input.edits ?? null, p_reason: input.reason ?? null, p_idempotency_key: input.idempotencyKey }),
  }, fetcher);
}

export async function decideExternalAction(
  env: SupabaseDataEnvironment,
  owner: OwnerContext,
  input: { actionId: string; decision: "APPROVED" | "REJECTED"; idempotencyKey: string },
  fetcher?: typeof fetch,
) {
  return request<Row>(env, owner, "rpc/oz_decide_external_action", {
    method: "POST",
    body: JSON.stringify({ p_owner_id: owner.userId, p_action_id: input.actionId, p_decision: input.decision, p_idempotency_key: input.idempotencyKey }),
  }, fetcher);
}

export async function proposeExternalAction(
  env: SupabaseDataEnvironment,
  owner: OwnerContext,
  input: { provider: string; actionType: string; requestPayload: Row; targetFingerprint: string; idempotencyKey: string },
  fetcher?: typeof fetch,
) {
  return request<Row>(env, owner, "rpc/oz_propose_external_action", {
    method: "POST",
    body: JSON.stringify({ p_owner_id: owner.userId, p_provider: input.provider, p_action_type: input.actionType, p_request_payload: input.requestPayload, p_target_fingerprint: input.targetFingerprint, p_idempotency_key: input.idempotencyKey }),
  }, fetcher);
}
