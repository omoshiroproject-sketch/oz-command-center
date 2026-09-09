import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(projectRoot, "supabase", "migrations");
const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
const migrationEntries = await Promise.all(migrationFiles.map(async (file) => [file, await readFile(path.join(migrationsDirectory, file), "utf8")]));
const sql = migrationEntries.map(([, contents]) => contents).join("\n");
const contextRead = migrationEntries.find(([file]) => file === "202608230002_phase1a_context_read.sql")?.[1] ?? "";
const phase1b = migrationEntries.find(([file]) => file === "202608230003_phase1b_review_mutations.sql")?.[1] ?? "";
const projectTargetDate = migrationEntries.find(([file]) => file === "202608250001_phase1b_project_target_date.sql")?.[1] ?? "";
const tables = ["projects","tasks","task_dependencies","task_sources","review_items","external_actions","action_approvals","idempotency_keys","audit_logs"];
for (const table of tables) {
  if (!new RegExp(`create table if not exists public\\.${table}\\b`, "i").test(sql)) throw new Error(`Missing table migration: ${table}`);
  if (!new RegExp(`alter table public\\.${table} enable row level security`, "i").test(sql)) throw new Error(`Missing RLS: ${table}`);
}
for (const fn of ["oz_create_review", "oz_resolve_review", "oz_propose_external_action", "oz_decide_external_action", "oz_task_transition_allowed"]) {
  if (!sql.includes(`function public.${fn}`)) throw new Error(`Missing function: ${fn}`);
}
const topLevelSql = sql.replace(/\bas\s+(\$[a-zA-Z0-9_]*\$)[\s\S]*?\1/gi, " as [FUNCTION_BODY] ");
if (/insert\s+into\s+public\.(projects|tasks)\b/i.test(topLevelSql)) {
  throw new Error("Migrations must not seed formal project/task rows outside reviewed functions.");
}
for (const table of ["projects", "tasks", "review_items"]) {
  if (!new RegExp(`revoke all on table public\\.${table} from service_role`, "i").test(contextRead)) {
    throw new Error(`Missing service-role least-privilege reset: ${table}`);
  }
  if (!new RegExp(`grant select on table public\\.${table} to service_role`, "i").test(contextRead)) {
    throw new Error(`Missing service-only context read grant: ${table}`);
  }
  if (!new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i").test(contextRead)) {
    throw new Error(`Missing browser-role revoke: ${table}`);
  }
}
if (/grant\s+(?:all|insert|update|delete|truncate|references|trigger)\b/i.test(contextRead)) {
  throw new Error("Context read migration grants a mutation privilege.");
}
if (/disable\s+row\s+level\s+security/i.test(contextRead)) throw new Error("Context read migration must preserve RLS.");
for (const table of ["task_dependencies", "task_sources", "audit_logs", "external_actions", "action_approvals"]) {
  if (!new RegExp(`revoke all on table public\\.${table} from service_role`, "i").test(phase1b)) throw new Error(`Missing Phase 1B service-role reset: ${table}`);
  if (!new RegExp(`grant select on table public\\.${table} to service_role`, "i").test(phase1b)) throw new Error(`Missing Phase 1B server-only read grant: ${table}`);
  if (!new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i").test(phase1b)) throw new Error(`Missing Phase 1B browser-role revoke: ${table}`);
}
if (/disable\s+row\s+level\s+security/i.test(phase1b)) throw new Error("Phase 1B migration must preserve RLS.");
if (!/alter table public\.projects add column if not exists target_date date null/i.test(projectTargetDate)) throw new Error("Missing nullable project target date migration.");
if (!/insert into public\.projects\([^)]*target_date\)/i.test(projectTargetDate)) throw new Error("Project approval does not persist target_date.");
if (/alter table public\.[a-z_]+\s+(?:enable|disable) row level security/i.test(projectTargetDate)) throw new Error("Project target-date migration must not change RLS.");
if (/grant\s+[^;]*\b(?:anon|authenticated)\b/i.test(projectTargetDate)) throw new Error("Project target-date migration must not grant browser-role access.");
console.log(`Verified ${tables.length} tables, ${migrationFiles.length} migrations, RLS, reviewed RPC boundaries, project target dates, least-privilege reads, and no formal/legacy seed import.`);
