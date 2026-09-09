-- OZ COMMAND CENTER Phase 1A
-- PostgreSQL/Supabase is the formal source of truth. No legacy D1 rows are imported here.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgmq cascade;
create extension if not exists pg_cron with schema extensions;

do $$ begin create type public.project_status as enum ('IDEA','PLANNED','ACTIVE','ON_HOLD','COMPLETED','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_status as enum ('UNSTARTED','IN_PROGRESS','WAITING','ON_HOLD','COMPLETED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.review_status as enum ('PENDING','APPROVED','REJECTED','NEEDS_EDIT'); exception when duplicate_object then null; end $$;
do $$ begin create type public.review_kind as enum ('TASK_CREATE','TASK_STATUS_CHANGE','TASK_EDIT','PROJECT_CREATE','EXTERNAL_ACTION'); exception when duplicate_object then null; end $$;
do $$ begin create type public.review_source_type as enum ('QUICK_ADD','VOICE','CHAT','EMAIL','MEETING','CONNECTOR','MANUAL'); exception when duplicate_object then null; end $$;
do $$ begin create type public.external_action_status as enum ('PROPOSED','APPROVED','EXECUTING','SUCCEEDED','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.approval_decision as enum ('APPROVED','REJECTED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.idempotency_status as enum ('PROCESSING','SUCCEEDED','FAILED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.execution_environment as enum ('ANY','MOBILE','PC','TRAVEL_OK','CALL','IN_PERSON'); exception when duplicate_object then null; end $$;
do $$ begin create type public.time_lane as enum ('DUE','TODAY_IF_POSSIBLE','SOMEDAY'); exception when duplicate_object then null; end $$;
do $$ begin create type public.delegation_state as enum ('SELF','CANDIDATE','DELEGATED'); exception when duplicate_object then null; end $$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug varchar(120) not null,
  name varchar(180) not null,
  description text,
  status public.project_status not null default 'PLANNED',
  importance integer not null default 3 check (importance between 1 and 5),
  progress_counting_mode varchar(32) not null default 'LEAF_TASKS' check (progress_counting_mode in ('ALL_TASKS','LEAF_TASKS','TOP_LEVEL')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete set null,
  title varchar(180) not null check (length(btrim(title)) > 0),
  description text,
  status public.task_status not null default 'UNSTARTED',
  time_lane public.time_lane not null default 'SOMEDAY',
  importance integer not null default 3 check (importance between 1 and 5),
  urgency_override real,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes >= 0),
  assignee_label varchar(180),
  delegation_state public.delegation_state not null default 'SELF',
  delegate_label varchar(180),
  contact_channel varchar(80),
  execution_environment public.execution_environment not null default 'ANY',
  location varchar(240),
  travel_allowed boolean not null default false,
  block_reason text,
  due_at timestamptz,
  calendar_block_external_id varchar(240),
  progress_eligible boolean not null default true,
  created_by uuid not null references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_task_id is null or parent_task_id <> id)
);

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists public.task_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  source_type public.review_source_type not null,
  source_locator text,
  evidence_excerpt text,
  source_occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind public.review_kind not null,
  source_type public.review_source_type not null,
  status public.review_status not null default 'PENDING',
  candidate_data jsonb not null check (jsonb_typeof(candidate_data) = 'object'),
  target_type varchar(80),
  target_id uuid,
  approved_entity_type varchar(80),
  approved_entity_id uuid,
  submitted_by uuid not null references auth.users(id),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  rejection_reason text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider varchar(80) not null,
  action_type varchar(120) not null,
  status public.external_action_status not null default 'PROPOSED',
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  target_fingerprint varchar(128) not null,
  external_id varchar(240),
  approved_at timestamptz,
  executed_at timestamptz,
  result_code varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.action_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_action_id uuid not null references public.external_actions(id) on delete cascade,
  decided_by uuid not null references auth.users(id),
  decision public.approval_decision not null,
  action_snapshot_hash varchar(128) not null,
  decided_at timestamptz not null default now()
);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope varchar(120) not null,
  key_hash varchar(128) not null,
  request_hash varchar(128) not null,
  status public.idempotency_status not null,
  resource_type varchar(80),
  resource_id uuid,
  response_code integer,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (owner_id, scope, key_hash)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action varchar(120) not null,
  target_type varchar(80) not null,
  target_id uuid,
  outcome varchar(40) not null,
  approval_id uuid,
  trace_id uuid not null default gen_random_uuid(),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_status_idx on public.projects(owner_id, status);
create index if not exists tasks_owner_status_idx on public.tasks(owner_id, status);
create index if not exists tasks_owner_due_idx on public.tasks(owner_id, due_at);
create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists task_dependencies_owner_idx on public.task_dependencies(owner_id);
create index if not exists task_sources_owner_task_idx on public.task_sources(owner_id, task_id);
create index if not exists review_items_owner_status_idx on public.review_items(owner_id, status, created_at desc);
create index if not exists external_actions_owner_status_idx on public.external_actions(owner_id, status, created_at desc);
create index if not exists action_approvals_owner_action_idx on public.action_approvals(owner_id, external_action_id);
create index if not exists idempotency_keys_expires_idx on public.idempotency_keys(expires_at);
create index if not exists audit_logs_owner_created_idx on public.audit_logs(owner_id, created_at desc);

create or replace function public.oz_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.oz_set_updated_at();
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.oz_set_updated_at();
drop trigger if exists review_items_set_updated_at on public.review_items;
create trigger review_items_set_updated_at before update on public.review_items for each row execute function public.oz_set_updated_at();
drop trigger if exists external_actions_set_updated_at on public.external_actions;
create trigger external_actions_set_updated_at before update on public.external_actions for each row execute function public.oz_set_updated_at();

create or replace function public.oz_task_transition_allowed(p_from public.task_status, p_to public.task_status)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'UNSTARTED' then p_to in ('IN_PROGRESS','WAITING','ON_HOLD','COMPLETED')
    when 'IN_PROGRESS' then p_to in ('WAITING','ON_HOLD','COMPLETED')
    when 'WAITING' then p_to in ('IN_PROGRESS','ON_HOLD','COMPLETED')
    when 'ON_HOLD' then p_to in ('UNSTARTED','IN_PROGRESS','WAITING','COMPLETED')
    when 'COMPLETED' then p_to = 'IN_PROGRESS'
  end;
$$;

create or replace function public.oz_enforce_task_transition() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status and not public.oz_task_transition_allowed(old.status, new.status) then
    raise exception 'TASK_TRANSITION_NOT_ALLOWED' using errcode = '22023';
  end if;
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then new.completed_at = now(); end if;
  if old.status = 'COMPLETED' and new.status is distinct from 'COMPLETED' then new.completed_at = null; end if;
  return new;
end;
$$;

drop trigger if exists tasks_enforce_transition on public.tasks;
create trigger tasks_enforce_transition before update of status on public.tasks for each row execute function public.oz_enforce_task_transition();

create or replace function public.oz_block_audit_mutation() returns trigger language plpgsql as $$
begin raise exception 'AUDIT_LOGS_ARE_APPEND_ONLY' using errcode = '42501'; end;
$$;
drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.oz_block_audit_mutation();

create or replace function public.oz_create_review(
  p_owner_id uuid,
  p_kind public.review_kind,
  p_source_type public.review_source_type,
  p_candidate jsonb,
  p_target_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_owner uuid := p_owner_id; v_review_id uuid; v_key_hash text; v_request_hash text; v_existing public.idempotency_keys%rowtype;
begin
  if auth.role() <> 'service_role' or v_owner is null then raise exception 'SERVICE_BOUNDARY_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id=v_owner) then raise exception 'OWNER_NOT_FOUND' using errcode='P0002'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 200 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_typeof(p_candidate) <> 'object' then raise exception 'CANDIDATE_MUST_BE_OBJECT' using errcode = '22023'; end if;
  if p_kind = 'TASK_CREATE' and (length(btrim(coalesce(p_candidate->>'title',''))) < 1 or length(p_candidate->>'title') > 180) then
    raise exception 'TASK_TITLE_INVALID' using errcode = '22023';
  end if;
  if p_kind = 'TASK_STATUS_CHANGE' and p_target_id is null then raise exception 'TARGET_REQUIRED' using errcode = '22023'; end if;

  v_key_hash := encode(digest(p_idempotency_key, 'sha256'), 'hex');
  v_request_hash := encode(digest(concat_ws('|', p_kind::text, p_source_type::text, coalesce(p_target_id::text,''), p_candidate::text), 'sha256'), 'hex');
  select * into v_existing from public.idempotency_keys where owner_id=v_owner and scope='review.create' and key_hash=v_key_hash;
  if found then
    if v_existing.request_hash <> v_request_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    if v_existing.status = 'SUCCEEDED' then return jsonb_build_object('reviewId',v_existing.resource_id,'status','PENDING','replayed',true); end if;
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = '55000';
  end if;

  insert into public.idempotency_keys(owner_id,scope,key_hash,request_hash,status,expires_at)
  values(v_owner,'review.create',v_key_hash,v_request_hash,'PROCESSING',now()+interval '24 hours');
  insert into public.review_items(owner_id,kind,source_type,candidate_data,target_type,target_id,submitted_by)
  values(v_owner,p_kind,p_source_type,p_candidate,case when p_target_id is null then null else 'task' end,p_target_id,v_owner)
  returning id into v_review_id;
  insert into public.audit_logs(owner_id,actor_id,action,target_type,target_id,outcome,before_state,after_state)
  values(v_owner,v_owner,'REVIEW_CREATED','review_item',v_review_id,'SUCCEEDED','{}',jsonb_build_object('status','PENDING','kind',p_kind));
  update public.idempotency_keys set status='SUCCEEDED',resource_type='review_item',resource_id=v_review_id,response_code=201,completed_at=now()
  where owner_id=v_owner and scope='review.create' and key_hash=v_key_hash;
  return jsonb_build_object('reviewId',v_review_id,'status','PENDING','replayed',false);
end;
$$;

create or replace function public.oz_resolve_review(
  p_owner_id uuid,
  p_review_id uuid,
  p_decision public.review_status,
  p_edits jsonb,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_owner uuid := p_owner_id; v_review public.review_items%rowtype; v_candidate jsonb; v_task_id uuid;
  v_key_hash text; v_request_hash text; v_existing public.idempotency_keys%rowtype; v_old_status public.task_status; v_new_status public.task_status;
begin
  if auth.role() <> 'service_role' or v_owner is null then raise exception 'SERVICE_BOUNDARY_REQUIRED' using errcode = '42501'; end if;
  if p_decision not in ('APPROVED','REJECTED','NEEDS_EDIT') then raise exception 'REVIEW_DECISION_INVALID' using errcode = '22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 200 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  select * into v_review from public.review_items where id=p_review_id and owner_id=v_owner for update;
  if not found then raise exception 'REVIEW_NOT_FOUND' using errcode='P0002'; end if;
  if p_edits is not null and jsonb_typeof(p_edits) <> 'object' then raise exception 'EDITS_MUST_BE_OBJECT' using errcode='22023'; end if;
  v_candidate := v_review.candidate_data || coalesce(p_edits,'{}'::jsonb);
  v_key_hash := encode(digest(p_idempotency_key,'sha256'),'hex');
  v_request_hash := encode(digest(concat_ws('|',p_review_id::text,p_decision::text,v_candidate::text,coalesce(p_reason,'')),'sha256'),'hex');
  select * into v_existing from public.idempotency_keys where owner_id=v_owner and scope='review.resolve' and key_hash=v_key_hash;
  if found then
    if v_existing.request_hash <> v_request_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    if v_existing.status='SUCCEEDED' then return jsonb_build_object('reviewId',p_review_id,'resourceId',v_existing.resource_id,'status',p_decision,'replayed',true); end if;
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode='55000';
  end if;
  if v_review.status not in ('PENDING','NEEDS_EDIT') then raise exception 'REVIEW_ALREADY_RESOLVED' using errcode='55000'; end if;
  insert into public.idempotency_keys(owner_id,scope,key_hash,request_hash,status,expires_at)
  values(v_owner,'review.resolve',v_key_hash,v_request_hash,'PROCESSING',now()+interval '24 hours');

  if p_decision = 'NEEDS_EDIT' then
    update public.review_items set status='NEEDS_EDIT',candidate_data=v_candidate,version=version+1 where id=p_review_id;
  elsif p_decision = 'REJECTED' then
    update public.review_items set status='REJECTED',candidate_data=v_candidate,resolved_by=v_owner,resolved_at=now(),rejection_reason=left(p_reason,500) where id=p_review_id;
  elsif v_review.kind = 'TASK_CREATE' then
    if length(btrim(coalesce(v_candidate->>'title',''))) < 1 or length(v_candidate->>'title') > 180 then raise exception 'TASK_TITLE_INVALID' using errcode='22023'; end if;
    if nullif(v_candidate->>'projectId','') is not null and not exists (
      select 1 from public.projects where id=(v_candidate->>'projectId')::uuid and owner_id=v_owner
    ) then raise exception 'PROJECT_NOT_OWNED' using errcode='42501'; end if;
    insert into public.tasks(owner_id,project_id,title,description,status,time_lane,importance,estimated_minutes,execution_environment,due_at,created_by)
    values(v_owner,nullif(v_candidate->>'projectId','')::uuid,btrim(v_candidate->>'title'),nullif(v_candidate->>'description',''),'UNSTARTED',
      coalesce(nullif(v_candidate->>'timeLane','')::public.time_lane,'SOMEDAY'),
      coalesce((v_candidate->>'importance')::integer,3),nullif(v_candidate->>'estimatedMinutes','')::integer,
      coalesce(nullif(v_candidate->>'executionEnvironment','')::public.execution_environment,'ANY'),nullif(v_candidate->>'dueAt','')::timestamptz,v_owner)
    returning id into v_task_id;
    insert into public.task_sources(owner_id,task_id,source_type,evidence_excerpt)
    select v_owner,v_task_id,v_review.source_type,left(value,500) from jsonb_array_elements_text(coalesce(v_candidate->'sourceEvidence','[]'::jsonb));
    update public.review_items set status='APPROVED',candidate_data=v_candidate,approved_entity_type='task',approved_entity_id=v_task_id,resolved_by=v_owner,resolved_at=now() where id=p_review_id;
  elsif v_review.kind = 'TASK_STATUS_CHANGE' then
    v_task_id := coalesce(v_review.target_id,nullif(v_candidate->>'taskId','')::uuid);
    v_new_status := (v_candidate->>'status')::public.task_status;
    select status into v_old_status from public.tasks where id=v_task_id and owner_id=v_owner for update;
    if not found then raise exception 'TASK_NOT_FOUND' using errcode='P0002'; end if;
    if not public.oz_task_transition_allowed(v_old_status,v_new_status) then raise exception 'TASK_TRANSITION_NOT_ALLOWED' using errcode='22023'; end if;
    update public.tasks set status=v_new_status where id=v_task_id and owner_id=v_owner;
    update public.review_items set status='APPROVED',candidate_data=v_candidate,approved_entity_type='task',approved_entity_id=v_task_id,resolved_by=v_owner,resolved_at=now() where id=p_review_id;
  else
    raise exception 'REVIEW_KIND_NOT_IMPLEMENTED_IN_PHASE_1A' using errcode='0A000';
  end if;

  insert into public.audit_logs(owner_id,actor_id,action,target_type,target_id,outcome,approval_id,before_state,after_state)
  values(v_owner,v_owner,'REVIEW_RESOLVED','review_item',p_review_id,'SUCCEEDED',p_review_id,
    jsonb_build_object('status',v_review.status),jsonb_build_object('status',p_decision,'resourceId',v_task_id));
  update public.idempotency_keys set status='SUCCEEDED',resource_type=case when v_task_id is null then 'review_item' else 'task' end,
    resource_id=coalesce(v_task_id,p_review_id),response_code=200,completed_at=now()
  where owner_id=v_owner and scope='review.resolve' and key_hash=v_key_hash;
  return jsonb_build_object('reviewId',p_review_id,'resourceId',v_task_id,'status',p_decision,'replayed',false);
end;
$$;

create or replace function public.oz_propose_external_action(
  p_owner_id uuid, p_provider text, p_action_type text, p_request_payload jsonb, p_target_fingerprint text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_owner uuid := p_owner_id; v_action_id uuid; v_key_hash text; v_request_hash text; v_existing public.idempotency_keys%rowtype;
begin
  if auth.role() <> 'service_role' or v_owner is null then raise exception 'SERVICE_BOUNDARY_REQUIRED' using errcode='42501'; end if;
  if length(btrim(coalesce(p_provider,''))) < 1 or length(p_provider) > 80 then raise exception 'PROVIDER_INVALID' using errcode='22023'; end if;
  if length(btrim(coalesce(p_action_type,''))) < 1 or length(p_action_type) > 120 then raise exception 'ACTION_TYPE_INVALID' using errcode='22023'; end if;
  if jsonb_typeof(p_request_payload) <> 'object' then raise exception 'ACTION_PAYLOAD_INVALID' using errcode='22023'; end if;
  if length(btrim(coalesce(p_target_fingerprint,''))) < 16 or length(p_target_fingerprint) > 128 then raise exception 'TARGET_FINGERPRINT_INVALID' using errcode='22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<16 or length(p_idempotency_key)>200 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  v_key_hash := encode(digest(p_idempotency_key,'sha256'),'hex');
  v_request_hash := encode(digest(concat_ws('|',p_provider,p_action_type,p_target_fingerprint,p_request_payload::text),'sha256'),'hex');
  select * into v_existing from public.idempotency_keys where owner_id=v_owner and scope='external_action.propose' and key_hash=v_key_hash;
  if found then
    if v_existing.request_hash<>v_request_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    if v_existing.status='SUCCEEDED' then return jsonb_build_object('actionId',v_existing.resource_id,'status','PROPOSED','replayed',true); end if;
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode='55000';
  end if;
  insert into public.idempotency_keys(owner_id,scope,key_hash,request_hash,status,expires_at)
  values(v_owner,'external_action.propose',v_key_hash,v_request_hash,'PROCESSING',now()+interval '24 hours');
  insert into public.external_actions(owner_id,provider,action_type,status,request_payload,target_fingerprint)
  values(v_owner,btrim(p_provider),btrim(p_action_type),'PROPOSED',p_request_payload,btrim(p_target_fingerprint)) returning id into v_action_id;
  insert into public.audit_logs(owner_id,actor_id,action,target_type,target_id,outcome,before_state,after_state)
  values(v_owner,v_owner,'EXTERNAL_ACTION_PROPOSED','external_action',v_action_id,'SUCCEEDED','{}',jsonb_build_object('status','PROPOSED'));
  update public.idempotency_keys set status='SUCCEEDED',resource_type='external_action',resource_id=v_action_id,response_code=201,completed_at=now()
  where owner_id=v_owner and scope='external_action.propose' and key_hash=v_key_hash;
  return jsonb_build_object('actionId',v_action_id,'status','PROPOSED','replayed',false);
end;
$$;

create or replace function public.oz_decide_external_action(
  p_owner_id uuid, p_action_id uuid, p_decision public.approval_decision, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_owner uuid := p_owner_id; v_action public.external_actions%rowtype; v_approval_id uuid;
  v_key_hash text; v_request_hash text; v_existing public.idempotency_keys%rowtype; v_snapshot_hash text;
begin
  if auth.role() <> 'service_role' or v_owner is null then raise exception 'SERVICE_BOUNDARY_REQUIRED' using errcode='42501'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<16 or length(p_idempotency_key)>200 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  select * into v_action from public.external_actions where id=p_action_id and owner_id=v_owner for update;
  if not found then raise exception 'ACTION_NOT_FOUND' using errcode='P0002'; end if;
  v_key_hash := encode(digest(p_idempotency_key,'sha256'),'hex');
  v_request_hash := encode(digest(concat_ws('|',p_action_id::text,p_decision::text),'sha256'),'hex');
  select * into v_existing from public.idempotency_keys where owner_id=v_owner and scope='external_action.decide' and key_hash=v_key_hash;
  if found then
    if v_existing.request_hash<>v_request_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    if v_existing.status='SUCCEEDED' then return jsonb_build_object('actionId',p_action_id,'approvalId',v_existing.resource_id,'decision',p_decision,'replayed',true); end if;
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode='55000';
  end if;
  if v_action.status <> 'PROPOSED' then raise exception 'ACTION_NOT_PROPOSED' using errcode='55000'; end if;
  insert into public.idempotency_keys(owner_id,scope,key_hash,request_hash,status,expires_at)
  values(v_owner,'external_action.decide',v_key_hash,v_request_hash,'PROCESSING',now()+interval '24 hours');
  v_snapshot_hash := encode(digest(concat_ws('|',v_action.provider,v_action.action_type,v_action.target_fingerprint,v_action.request_payload::text),'sha256'),'hex');
  insert into public.action_approvals(owner_id,external_action_id,decided_by,decision,action_snapshot_hash)
  values(v_owner,p_action_id,v_owner,p_decision,v_snapshot_hash) returning id into v_approval_id;
  update public.external_actions set status=case when p_decision='APPROVED' then 'APPROVED'::public.external_action_status else 'CANCELLED'::public.external_action_status end,
    approved_at=case when p_decision='APPROVED' then now() else null end where id=p_action_id;
  insert into public.audit_logs(owner_id,actor_id,action,target_type,target_id,outcome,approval_id,before_state,after_state)
  values(v_owner,v_owner,'EXTERNAL_ACTION_DECIDED','external_action',p_action_id,'SUCCEEDED',v_approval_id,
    jsonb_build_object('status','PROPOSED'),jsonb_build_object('status',case when p_decision='APPROVED' then 'APPROVED' else 'CANCELLED' end));
  update public.idempotency_keys set status='SUCCEEDED',resource_type='action_approval',resource_id=v_approval_id,response_code=200,completed_at=now()
  where owner_id=v_owner and scope='external_action.decide' and key_hash=v_key_hash;
  return jsonb_build_object('actionId',p_action_id,'approvalId',v_approval_id,'decision',p_decision,'replayed',false,'executed',false);
end;
$$;

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_sources enable row level security;
alter table public.review_items enable row level security;
alter table public.external_actions enable row level security;
alter table public.action_approvals enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_logs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects','tasks','task_dependencies','task_sources','review_items','external_actions','action_approvals','idempotency_keys','audit_logs'] loop
    execute format('drop policy if exists owner_select on public.%I',t);
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',t);
    execute format('revoke all on table public.%I from anon',t);
    execute format('revoke all on table public.%I from authenticated',t);
  end loop;
end $$;

revoke all on function public.oz_create_review(uuid,public.review_kind,public.review_source_type,jsonb,uuid,text) from public, anon, authenticated;
revoke all on function public.oz_resolve_review(uuid,uuid,public.review_status,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.oz_propose_external_action(uuid,text,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.oz_decide_external_action(uuid,uuid,public.approval_decision,text) from public, anon, authenticated;
grant execute on function public.oz_create_review(uuid,public.review_kind,public.review_source_type,jsonb,uuid,text) to service_role;
grant execute on function public.oz_resolve_review(uuid,uuid,public.review_status,jsonb,text,text) to service_role;
grant execute on function public.oz_propose_external_action(uuid,text,text,jsonb,text,text) to service_role;
grant execute on function public.oz_decide_external_action(uuid,uuid,public.approval_decision,text) to service_role;

-- Create a durable queue boundary. Phase 1A does not schedule or execute production jobs.
select pgmq.create('oz_jobs');

create schema if not exists pgmq_public;
create or replace function pgmq_public.send(queue_name text, message jsonb, sleep_seconds integer default 0)
returns setof bigint language sql security definer set search_path = pgmq, public as $$
  select * from pgmq.send(queue_name, message, sleep_seconds);
$$;
revoke all on function pgmq_public.send(text,jsonb,integer) from public, anon, authenticated;
grant usage on schema pgmq_public to service_role;
grant execute on function pgmq_public.send(text,jsonb,integer) to service_role;
