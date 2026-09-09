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
if (!docker) throw new Error("A running Docker-compatible runtime is required for Phase 1B database verification.");
const containerName = "supabase_db_oz-command-center-development";
const running = spawnSync(docker, ["ps", "--filter", `name=^/${containerName}$`, "--format", "{{.Names}}"], { encoding: "utf8" });
if (running.status !== 0 || running.stdout.trim() !== containerName) throw new Error("The local OZ Supabase database container is not running.");

const sql = String.raw`
\set ON_ERROR_STOP on
begin;

do $$
declare table_name text; role_name text; mutation text;
begin
  foreach table_name in array array['projects','tasks','task_dependencies','task_sources','review_items','audit_logs','external_actions','action_approvals'] loop
    if not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') then
      raise exception 'PHASE1B_SERVICE_SELECT_MISSING';
    end if;
    foreach mutation in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role', format('public.%I', table_name), mutation) then
        raise exception 'PHASE1B_SERVICE_MUTATION_PRESENT';
      end if;
    end loop;
    foreach role_name in array array['anon','authenticated'] loop
      if has_table_privilege(role_name, format('public.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'PHASE1B_BROWSER_PRIVILEGE_PRESENT';
      end if;
    end loop;
    if not (select relrowsecurity from pg_class where oid=format('public.%I', table_name)::regclass) then
      raise exception 'PHASE1B_RLS_DISABLED';
    end if;
  end loop;
end $$;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_project_review uuid; v_project uuid; v_project_null_review uuid; v_project_null uuid;
  v_project_reject_review uuid; v_project_needs_edit_review uuid; v_project_invalid_review uuid;
  v_task_review uuid; v_task uuid;
  v_edit_review uuid; v_status_review uuid; v_status_needs_edit_review uuid; v_status_reject_review uuid;
  v_status_complete_review uuid; v_status_invalid_review uuid; v_reject_review uuid; v_task_needs_edit_review uuid; v_action uuid;
  v_replay jsonb; v_due timestamptz := now() + interval '1 day';
begin
  insert into auth.users(id) values(v_owner);

  v_project_review := (public.oz_create_review(v_owner,'PROJECT_CREATE','MANUAL',
    jsonb_build_object('name','SNS事業','slug','phase1b-sns-project','status','ACTIVE','importance',5,'targetDate','2028-03-31'),null,
    'phase1b-project-create-0001')->>'reviewId')::uuid;
  v_replay := public.oz_create_review(v_owner,'PROJECT_CREATE','MANUAL',
    jsonb_build_object('name','SNS事業','slug','phase1b-sns-project','status','ACTIVE','importance',5,'targetDate','2028-03-31'),null,
    'phase1b-project-create-0001');
  if coalesce((v_replay->>'replayed')::boolean,false) is not true then raise exception 'PROJECT_CREATE_IDEMPOTENCY_REPLAY_FAILED'; end if;
  v_project := (public.oz_resolve_review(v_owner,v_project_review,'APPROVED',null,null,
    'phase1b-project-approve-0001')->>'resourceId')::uuid;
  if (select count(*) from public.projects where id=v_project and owner_id=v_owner and target_date=date '2028-03-31') <> 1 then raise exception 'PROJECT_TARGET_DATE_APPROVAL_FAILED'; end if;
  v_replay := public.oz_resolve_review(v_owner,v_project_review,'APPROVED',null,null,'phase1b-project-approve-0001');
  if coalesce((v_replay->>'replayed')::boolean,false) is not true then raise exception 'PROJECT_APPROVAL_IDEMPOTENCY_REPLAY_FAILED'; end if;

  v_project_null_review := (public.oz_create_review(v_owner,'PROJECT_CREATE','MANUAL',
    jsonb_build_object('name','phase1b-no-target','slug','phase1b-no-target','status','PLANNED','importance',3,'targetDate',null),null,
    'phase1b-project-null-create-0001')->>'reviewId')::uuid;
  v_project_null := (public.oz_resolve_review(v_owner,v_project_null_review,'APPROVED',null,null,
    'phase1b-project-null-approve-0001')->>'resourceId')::uuid;
  if (select count(*) from public.projects where id=v_project_null and owner_id=v_owner and target_date is null) <> 1 then raise exception 'PROJECT_NULL_TARGET_DATE_FAILED'; end if;

  v_project_reject_review := (public.oz_create_review(v_owner,'PROJECT_CREATE','MANUAL',
    jsonb_build_object('name','phase1b-project-rejected','slug','phase1b-project-rejected','targetDate','2028-03-31'),null,
    'phase1b-project-reject-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_project_reject_review,'REJECTED',null,null,'phase1b-project-reject-resolve-0001');
  if exists (select 1 from public.projects where owner_id=v_owner and slug='phase1b-project-rejected') then raise exception 'PROJECT_REJECT_CREATED_FORMAL'; end if;

  v_project_needs_edit_review := (public.oz_create_review(v_owner,'PROJECT_CREATE','MANUAL',
    jsonb_build_object('name','phase1b-project-needs-edit','slug','phase1b-project-needs-edit','targetDate','2028-03-31'),null,
    'phase1b-project-needs-edit-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_project_needs_edit_review,'NEEDS_EDIT',null,null,'phase1b-project-needs-edit-resolve-0001');
  if exists (select 1 from public.projects where owner_id=v_owner and slug='phase1b-project-needs-edit') then raise exception 'PROJECT_NEEDS_EDIT_CREATED_FORMAL'; end if;
  if (select count(*) from public.review_items where id=v_project_needs_edit_review and status='NEEDS_EDIT') <> 1 then raise exception 'PROJECT_NEEDS_EDIT_REVIEW_STATUS_INVALID'; end if;

  v_project_invalid_review := (public.oz_create_review(v_owner,'PROJECT_CREATE','MANUAL',
    jsonb_build_object('name','phase1b-project-invalid','slug','phase1b-project-invalid','targetDate','2028-3-31'),null,
    'phase1b-project-invalid-create-0001')->>'reviewId')::uuid;
  begin
    perform public.oz_resolve_review(v_owner,v_project_invalid_review,'APPROVED',null,null,'phase1b-project-invalid-resolve-0001');
    raise exception 'PROJECT_INVALID_TARGET_DATE_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  if exists (select 1 from public.projects where owner_id=v_owner and slug='phase1b-project-invalid') then raise exception 'PROJECT_INVALID_TARGET_DATE_CREATED_FORMAL'; end if;

  v_task_review := (public.oz_create_review(v_owner,'TASK_CREATE','MANUAL',
    jsonb_build_object('title','phase1b-task','projectId',v_project,'importance',5,'timeLane','DUE','estimatedMinutes',25,'executionEnvironment','PC','dueAt',v_due),null,
    'phase1b-task-create-0001')->>'reviewId')::uuid;
  v_replay := public.oz_create_review(v_owner,'TASK_CREATE','MANUAL',
    jsonb_build_object('title','phase1b-task','projectId',v_project,'importance',5,'timeLane','DUE','estimatedMinutes',25,'executionEnvironment','PC','dueAt',v_due),null,
    'phase1b-task-create-0001');
  if coalesce((v_replay->>'replayed')::boolean,false) is not true then raise exception 'CREATE_IDEMPOTENCY_REPLAY_FAILED'; end if;
  v_task := (public.oz_resolve_review(v_owner,v_task_review,'APPROVED',null,null,
    'phase1b-task-approve-0001')->>'resourceId')::uuid;
  if (select count(*) from public.tasks where id=v_task and owner_id=v_owner and status='UNSTARTED') <> 1 then raise exception 'TASK_APPROVAL_FAILED'; end if;

  v_edit_review := (public.oz_create_review(v_owner,'TASK_EDIT','MANUAL',
    jsonb_build_object('taskId',v_task,'title','phase1b-task-edited','importance',4),v_task,
    'phase1b-task-edit-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_edit_review,'APPROVED',null,null,'phase1b-task-edit-approve-0001');
  if (select count(*) from public.tasks where id=v_task and title='phase1b-task-edited' and importance=4) <> 1 then raise exception 'TASK_EDIT_FAILED'; end if;

  v_status_review := (public.oz_create_review(v_owner,'TASK_STATUS_CHANGE','MANUAL',
    jsonb_build_object('taskId',v_task,'status','IN_PROGRESS'),v_task,
    'phase1b-status-create-0001')->>'reviewId')::uuid;
  v_replay := public.oz_create_review(v_owner,'TASK_STATUS_CHANGE','MANUAL',
    jsonb_build_object('taskId',v_task,'status','IN_PROGRESS'),v_task,
    'phase1b-status-create-0001');
  if coalesce((v_replay->>'replayed')::boolean,false) is not true then raise exception 'STATUS_IDEMPOTENCY_REPLAY_FAILED'; end if;
  if (select count(*) from public.review_items where owner_id=v_owner and target_id=v_task and kind='TASK_STATUS_CHANGE' and candidate_data->>'status'='IN_PROGRESS') <> 1 then
    raise exception 'STATUS_IDEMPOTENCY_DUPLICATE';
  end if;
  if (select count(*) from public.tasks where id=v_task and status='UNSTARTED') <> 1 then raise exception 'STATUS_CHANGED_BEFORE_APPROVAL'; end if;
  perform public.oz_resolve_review(v_owner,v_status_review,'APPROVED',null,null,'phase1b-status-approve-0001');
  if (select count(*) from public.tasks where id=v_task and status='IN_PROGRESS') <> 1 then raise exception 'TASK_STATUS_FAILED'; end if;

  v_status_needs_edit_review := (public.oz_create_review(v_owner,'TASK_STATUS_CHANGE','MANUAL',
    jsonb_build_object('taskId',v_task,'status','WAITING'),v_task,
    'phase1b-status-needs-edit-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_status_needs_edit_review,'NEEDS_EDIT',null,null,'phase1b-status-needs-edit-resolve-0001');
  if (select count(*) from public.tasks where id=v_task and status='IN_PROGRESS') <> 1 then raise exception 'NEEDS_EDIT_CHANGED_FORMAL_STATUS'; end if;
  if (select count(*) from public.review_items where id=v_status_needs_edit_review and status='NEEDS_EDIT') <> 1 then raise exception 'NEEDS_EDIT_REVIEW_STATUS_INVALID'; end if;

  v_status_reject_review := (public.oz_create_review(v_owner,'TASK_STATUS_CHANGE','MANUAL',
    jsonb_build_object('taskId',v_task,'status','ON_HOLD'),v_task,
    'phase1b-status-reject-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_status_reject_review,'REJECTED',null,null,'phase1b-status-reject-resolve-0001');
  if (select count(*) from public.tasks where id=v_task and status='IN_PROGRESS') <> 1 then raise exception 'REJECT_CHANGED_FORMAL_STATUS'; end if;

  v_status_complete_review := (public.oz_create_review(v_owner,'TASK_STATUS_CHANGE','MANUAL',
    jsonb_build_object('taskId',v_task,'status','COMPLETED'),v_task,
    'phase1b-status-complete-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_status_complete_review,'APPROVED',null,null,'phase1b-status-complete-resolve-0001');
  if (select count(*) from public.tasks where id=v_task and status='COMPLETED') <> 1 then raise exception 'TASK_COMPLETION_FAILED'; end if;

  v_status_invalid_review := (public.oz_create_review(v_owner,'TASK_STATUS_CHANGE','MANUAL',
    jsonb_build_object('taskId',v_task,'status','UNSTARTED'),v_task,
    'phase1b-status-invalid-create-0001')->>'reviewId')::uuid;
  begin
    perform public.oz_resolve_review(v_owner,v_status_invalid_review,'APPROVED',null,null,'phase1b-status-invalid-resolve-0001');
    raise exception 'INVALID_TRANSITION_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  if (select count(*) from public.tasks where id=v_task and status='COMPLETED') <> 1 then raise exception 'INVALID_TRANSITION_CHANGED_STATUS'; end if;

  v_reject_review := (public.oz_create_review(v_owner,'TASK_CREATE','MANUAL',jsonb_build_object('title','phase1b-rejected'),null,
    'phase1b-reject-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_reject_review,'REJECTED',null,null,'phase1b-reject-resolve-0001');
  if (select count(*) from public.tasks where owner_id=v_owner and title='phase1b-rejected') <> 0 then raise exception 'REJECT_CREATED_FORMAL_TASK'; end if;

  v_task_needs_edit_review := (public.oz_create_review(v_owner,'TASK_CREATE','MANUAL',jsonb_build_object('title','phase1b-task-needs-edit','projectId',v_project),null,
    'phase1b-task-needs-edit-create-0001')->>'reviewId')::uuid;
  perform public.oz_resolve_review(v_owner,v_task_needs_edit_review,'NEEDS_EDIT',null,null,'phase1b-task-needs-edit-resolve-0001');
  if exists (select 1 from public.tasks where owner_id=v_owner and title='phase1b-task-needs-edit') then raise exception 'TASK_NEEDS_EDIT_CREATED_FORMAL'; end if;
  if (select count(*) from public.review_items where id=v_task_needs_edit_review and status='NEEDS_EDIT') <> 1 then raise exception 'TASK_NEEDS_EDIT_REVIEW_STATUS_INVALID'; end if;

  v_action := (public.oz_propose_external_action(v_owner,'mock-provider','mock-write','{}','phase1b-safe-target-fingerprint',
    'phase1b-action-propose-0001')->>'actionId')::uuid;
  if (select count(*) from public.external_actions where id=v_action and status='PROPOSED' and executed_at is null) <> 1 then raise exception 'ACTION_NOT_PROPOSED_ONLY'; end if;
  perform public.oz_decide_external_action(v_owner,v_action,'APPROVED','phase1b-action-approve-0001');
  if (select count(*) from public.external_actions where id=v_action and status='APPROVED' and executed_at is null) <> 1 then raise exception 'ACTION_APPROVAL_EXECUTED'; end if;

  if exists (
    select 1 from public.audit_logs where owner_id=v_owner
    and ((before_state ?| array['title','name','description','purpose','body','email','token']) or (after_state ?| array['title','name','description','purpose','body','email','token']))
  ) then raise exception 'AUDIT_PRIVATE_FIELD_PRESENT'; end if;
  if (select count(*) from public.audit_logs where owner_id=v_owner and action='REVIEW_CREATED') <> 14 then raise exception 'REVIEW_CREATED_AUDIT_INVALID'; end if;
  if (select count(*) from public.audit_logs where owner_id=v_owner and action='REVIEW_RESOLVED') <> 12 then raise exception 'REVIEW_RESOLVED_AUDIT_INVALID'; end if;
end $$;

rollback;
`;

const verification = spawnSync(docker, ["exec", "-i", containerName, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
  input: sql,
  encoding: "utf8",
});
if (verification.status !== 0) {
  const knownMarkers = [
    "PHASE1B_SERVICE_SELECT_MISSING", "PHASE1B_SERVICE_MUTATION_PRESENT", "PHASE1B_BROWSER_PRIVILEGE_PRESENT", "PHASE1B_RLS_DISABLED",
    "PROJECT_TARGET_DATE_APPROVAL_FAILED", "PROJECT_CREATE_IDEMPOTENCY_REPLAY_FAILED", "PROJECT_APPROVAL_IDEMPOTENCY_REPLAY_FAILED",
    "PROJECT_NULL_TARGET_DATE_FAILED", "PROJECT_REJECT_CREATED_FORMAL", "PROJECT_NEEDS_EDIT_CREATED_FORMAL", "PROJECT_NEEDS_EDIT_REVIEW_STATUS_INVALID",
    "PROJECT_INVALID_TARGET_DATE_ACCEPTED", "PROJECT_INVALID_TARGET_DATE_CREATED_FORMAL",
    "CREATE_IDEMPOTENCY_REPLAY_FAILED", "TASK_APPROVAL_FAILED", "TASK_EDIT_FAILED", "TASK_STATUS_FAILED",
    "STATUS_IDEMPOTENCY_REPLAY_FAILED", "STATUS_IDEMPOTENCY_DUPLICATE", "STATUS_CHANGED_BEFORE_APPROVAL",
    "NEEDS_EDIT_CHANGED_FORMAL_STATUS", "NEEDS_EDIT_REVIEW_STATUS_INVALID", "REJECT_CHANGED_FORMAL_STATUS",
    "TASK_COMPLETION_FAILED", "INVALID_TRANSITION_ACCEPTED", "INVALID_TRANSITION_CHANGED_STATUS",
    "REJECT_CREATED_FORMAL_TASK", "TASK_NEEDS_EDIT_CREATED_FORMAL", "TASK_NEEDS_EDIT_REVIEW_STATUS_INVALID",
    "ACTION_NOT_PROPOSED_ONLY", "ACTION_APPROVAL_EXECUTED", "AUDIT_PRIVATE_FIELD_PRESENT",
    "REVIEW_CREATED_AUDIT_INVALID", "REVIEW_RESOLVED_AUDIT_INVALID",
  ];
  const marker = knownMarkers.find((value) => verification.stderr.includes(value))
    ?? (/permission denied/i.test(verification.stderr) ? "PERMISSION_ASSERTION_FAILED"
      : /does not exist/i.test(verification.stderr) ? "TEST_OBJECT_MISSING"
        : /invalid input/i.test(verification.stderr) ? "INVALID_TEST_VALUE" : "UNCLASSIFIED_TEST_FAILURE");
  throw new Error(`Local Phase 1B database verification failed (${marker}).`);
}

console.log("Verified local Phase 1B permissions, RLS, reviewed project target dates, project/task approval/rejection/needs-edit effects, transition validation, idempotency, audit redaction, external PROPOSED/approval boundaries, and rollback isolation.");
