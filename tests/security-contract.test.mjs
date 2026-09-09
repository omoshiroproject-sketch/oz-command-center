import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(path.join(root, "supabase/migrations/202608230001_phase1a_core.sql"), "utf8");
const contextReadMigration = await readFile(path.join(root, "supabase/migrations/202608230002_phase1a_context_read.sql"), "utf8");
const phase1bMigration = await readFile(path.join(root, "supabase/migrations/202608230003_phase1b_review_mutations.sql"), "utf8");
const projectTargetDateMigration = await readFile(path.join(root, "supabase/migrations/202608250001_phase1b_project_target_date.sql"), "utf8");

test("approval, audit, idempotency and RLS are migration-enforced", () => {
  assert.match(migration, /security definer set search_path = public, extensions/);
  assert.match(migration, /digest\(p_idempotency_key,\s*'sha256'\)/);
  assert.match(migration, /REVIEW_CREATED/);
  assert.match(migration, /REVIEW_RESOLVED/);
  assert.match(migration, /EXTERNAL_ACTION_DECIDED/);
  assert.match(migration, /AUDIT_LOGS_ARE_APPEND_ONLY/);
  assert.doesNotMatch(migration, /grant select on table public\..* to authenticated/);
  assert.match(migration, /grant execute on function public\.oz_resolve_review\(uuid,uuid.*to service_role/);
  assert.match(migration, /SERVICE_BOUNDARY_REQUIRED/);
});

test("Phase 1B context extensions remain server-select-only and reviewed mutations", () => {
  for (const table of ["task_dependencies", "task_sources", "audit_logs", "external_actions", "action_approvals"]) {
    assert.match(phase1bMigration, new RegExp(`grant select on table public\\.${table} to service_role`, "i"));
    assert.match(phase1bMigration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"));
  }
  assert.match(phase1bMigration, /PROJECT_CREATE/);
  assert.match(phase1bMigration, /TASK_EDIT/);
  assert.match(phase1bMigration, /TASK_STATUS_CHANGE/);
  assert.doesNotMatch(phase1bMigration, /disable\s+row\s+level\s+security/i);
});

test("the original Phase 1A migration is unchanged", () => {
  assert.equal(createHash("sha256").update(migration).digest("hex"), "a63d46ba0b91d6e9307fbfb586e441a66f923c70eea16ec8ca09938f987d8529");
});

test("project target dates stay inside the reviewed owner-only boundary", () => {
  assert.match(projectTargetDateMigration, /alter table public\.projects add column if not exists target_date date null/i);
  assert.match(projectTargetDateMigration, /projects_owner_target_date_idx[\s\S]*owner_id, target_date[\s\S]*target_date is not null/i);
  assert.match(projectTargetDateMigration, /PROJECT_CREATE[\s\S]*PROJECT_TARGET_DATE_INVALID[\s\S]*insert into public\.projects\([^)]*target_date\)/i);
  assert.match(projectTargetDateMigration, /grant execute on function public\.oz_resolve_review\([^;]+\) to service_role/i);
  assert.doesNotMatch(projectTargetDateMigration, /alter table public\.[a-z_]+\s+(?:enable|disable) row level security/i);
  assert.doesNotMatch(projectTargetDateMigration, /grant\s+[^;]*\b(?:anon|authenticated)\b/i);
  assert.doesNotMatch(projectTargetDateMigration, /grant\s+(?:all|insert|update|delete|truncate|references|trigger)\b/i);
  assert.doesNotMatch(projectTargetDateMigration, /(?:before_state|after_state)[\s\S]{0,300}(?:name|description|purpose|email|token)/i);
});

test("context reads are granted only to the server service role", () => {
  const grants = [...contextReadMigration.matchAll(/grant\s+([^;]+);/gi)].map((match) => match[1].replace(/\s+/g, " ").trim().toLowerCase());
  assert.deepEqual(grants, [
    "select on table public.projects to service_role",
    "select on table public.tasks to service_role",
    "select on table public.review_items to service_role",
  ]);
  for (const table of ["projects", "tasks", "review_items"]) {
    assert.match(contextReadMigration, new RegExp(`revoke all on table public\\.${table} from service_role`, "i"));
    assert.match(contextReadMigration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"));
  }
  assert.doesNotMatch(contextReadMigration, /grant\s+[^;]*\b(?:anon|authenticated)\b/i);
  assert.doesNotMatch(contextReadMigration, /grant\s+(?:all|insert|update|delete|truncate|references|trigger)\b/i);
  assert.doesNotMatch(contextReadMigration, /disable\s+row\s+level\s+security/i);
});

test("quick add and voice paths create review candidates, not formal tasks", async () => {
  const source = await readFile(path.join(root, "worker/oz-data.ts"), "utf8");
  const service = await readFile(path.join(root, "packages/application/src/oz-tool-service.ts"), "utf8");
  assert.match(source, /oz_create_task_candidate/);
  assert.match(service, /kind: "TASK_CREATE"/);
  assert.match(service, /requiresApproval: true, formalTaskCreated: false/);
  assert.doesNotMatch(source + service, /insert\s+into\s+.*tasks/i);
  assert.doesNotMatch(source + service, /CREATE TABLE/i);
});

test("Realtime handles the documented MCP approval conversation item", async () => {
  const source = await readFile(path.join(root, "public/live-oz.js"), "utf8");
  assert.match(source, /case 'conversation\.item\.done': if \(event\.item\?\.type === 'mcp_approval_request'\) showMcpApproval\(event\.item\)/);
  assert.match(source, /type:'mcp_approval_response'/);
  assert.match(source, /approval_request_id:approvalId/);
});

test("runtime and historical migration contain no owner fallback or data seed", async () => {
  const worker = await readFile(path.join(root, "worker/oz-data.ts"), "utf8");
  const legacy = await readFile(path.join(root, "drizzle/0001_empty_stranger.sql"), "utf8");
  assert.doesNotMatch(worker + legacy, /oz-command-center-owner|INSERT OR IGNORE/);
});
