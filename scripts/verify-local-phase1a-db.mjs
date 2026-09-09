import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const dockerCandidates = [
  process.env.DOCKER_BIN,
  "/Applications/Docker.app/Contents/Resources/bin/docker",
  "docker",
].filter(Boolean);

function commandWorks(command) {
  if (command.includes("/") && !existsSync(command)) return false;
  return spawnSync(command, ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).status === 0;
}

const docker = dockerCandidates.find(commandWorks);
if (!docker) throw new Error("A running Docker-compatible runtime is required for local database verification.");

const containerName = "supabase_db_oz-command-center-development";
const running = spawnSync(docker, ["ps", "--filter", `name=^/${containerName}$`, "--format", "{{.Names}}"], { encoding: "utf8" });
if (running.status !== 0 || running.stdout.trim() !== containerName) {
  throw new Error("The local OZ Supabase database container is not running.");
}

const sql = String.raw`
\set ON_ERROR_STOP on
begin;

do $$
declare
  table_name text;
  role_name text;
  mutation text;
begin
  foreach table_name in array array['projects','tasks','review_items'] loop
    if not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') then
      raise exception 'SERVICE_ROLE_CONTEXT_SELECT_MISSING';
    end if;
    foreach mutation in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role', format('public.%I', table_name), mutation) then
        raise exception 'SERVICE_ROLE_CONTEXT_MUTATION_PRESENT';
      end if;
    end loop;
    foreach role_name in array array['anon','authenticated'] loop
      if has_table_privilege(role_name, format('public.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'BROWSER_ROLE_TABLE_PRIVILEGE_PRESENT';
      end if;
    end loop;
    if not (select relrowsecurity from pg_class where oid=format('public.%I', table_name)::regclass) then
      raise exception 'RLS_DISABLED';
    end if;
  end loop;
end $$;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_owner_id uuid := gen_random_uuid();
  approve_review_id uuid;
  reject_review_id uuid;
begin
  insert into auth.users(id) values(v_owner_id);

  approve_review_id := (public.oz_create_review(
    v_owner_id, 'TASK_CREATE', 'QUICK_ADD', jsonb_build_object('title','approve-candidate'), null,
    'db-flow-create-approve-0001'
  )->>'reviewId')::uuid;
  perform public.oz_resolve_review(
    v_owner_id, approve_review_id, 'APPROVED', null::jsonb, null::text,
    'db-flow-resolve-approve-0001'
  );
  if (select count(*) from public.tasks where owner_id=v_owner_id and title='approve-candidate') <> 1 then
    raise exception 'APPROVE_TASK_COUNT_INVALID';
  end if;

  reject_review_id := (public.oz_create_review(
    v_owner_id, 'TASK_CREATE', 'QUICK_ADD', jsonb_build_object('title','reject-candidate'), null,
    'db-flow-create-reject-0001'
  )->>'reviewId')::uuid;
  perform public.oz_resolve_review(
    v_owner_id, reject_review_id, 'REJECTED', null::jsonb, null::text,
    'db-flow-resolve-reject-0001'
  );
  if (select count(*) from public.tasks where owner_id=v_owner_id and title='reject-candidate') <> 0 then
    raise exception 'REJECT_TASK_COUNT_INVALID';
  end if;
  if (select count(*) from public.audit_logs where owner_id=v_owner_id and action in ('REVIEW_CREATED','REVIEW_RESOLVED') and outcome='SUCCEEDED') <> 4 then
    raise exception 'REVIEW_AUDIT_COUNT_INVALID';
  end if;
end $$;

rollback;
`;

const verification = spawnSync(docker, ["exec", "-i", containerName, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
  input: sql,
  encoding: "utf8",
});
if (verification.status !== 0) {
  const knownMarkers = [
    "SERVICE_ROLE_CONTEXT_SELECT_MISSING",
    "SERVICE_ROLE_CONTEXT_MUTATION_PRESENT",
    "BROWSER_ROLE_TABLE_PRIVILEGE_PRESENT",
    "RLS_DISABLED",
    "APPROVE_TASK_COUNT_INVALID",
    "REJECT_TASK_COUNT_INVALID",
    "REVIEW_AUDIT_COUNT_INVALID",
  ];
  const marker = knownMarkers.find((value) => verification.stderr.includes(value))
    ?? (/invalid privilege type/i.test(verification.stderr) ? "INVALID_PRIVILEGE_ASSERTION"
      : /permission denied/i.test(verification.stderr) ? "PERMISSION_ASSERTION_FAILED"
        : /ambiguous/i.test(verification.stderr) ? "AMBIGUOUS_TEST_QUERY"
          : /does not exist/i.test(verification.stderr) ? "TEST_OBJECT_MISSING" : "UNCLASSIFIED_TEST_FAILURE");
  throw new Error(`Local database permission and review-flow verification failed (${marker}).`);
}

console.log("Verified local context permissions, RLS, approval/rejection task counts, audit records, and rollback isolation.");
