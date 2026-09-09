-- OZ COMMAND CENTER Phase 1B
-- Extend review-backed formal mutations and server-only context reads.
-- No project, task, fixture, or legacy D1 data is seeded here.

revoke all on table public.task_dependencies from service_role;
revoke all on table public.task_sources from service_role;
revoke all on table public.audit_logs from service_role;
revoke all on table public.external_actions from service_role;
revoke all on table public.action_approvals from service_role;

grant select on table public.task_dependencies to service_role;
grant select on table public.task_sources to service_role;
grant select on table public.audit_logs to service_role;
grant select on table public.external_actions to service_role;
grant select on table public.action_approvals to service_role;

revoke all on table public.task_dependencies from anon, authenticated;
revoke all on table public.task_sources from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.external_actions from anon, authenticated;
revoke all on table public.action_approvals from anon, authenticated;

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
  v_owner uuid := p_owner_id;
  v_review public.review_items%rowtype;
  v_task public.tasks%rowtype;
  v_candidate jsonb;
  v_task_id uuid;
  v_project_id uuid;
  v_resource_id uuid;
  v_resource_type text := 'review_item';
  v_key_hash text;
  v_request_hash text;
  v_existing public.idempotency_keys%rowtype;
  v_old_status public.task_status;
  v_new_status public.task_status;
  v_changed_fields text[];
begin
  if auth.role() <> 'service_role' or v_owner is null then
    raise exception 'SERVICE_BOUNDARY_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED','REJECTED','NEEDS_EDIT') then
    raise exception 'REVIEW_DECISION_INVALID' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 200 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_review from public.review_items
  where id = p_review_id and owner_id = v_owner for update;
  if not found then raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_edits is not null and jsonb_typeof(p_edits) <> 'object' then
    raise exception 'EDITS_MUST_BE_OBJECT' using errcode = '22023';
  end if;

  v_candidate := v_review.candidate_data || coalesce(p_edits, '{}'::jsonb);
  v_key_hash := encode(digest(p_idempotency_key, 'sha256'), 'hex');
  v_request_hash := encode(digest(concat_ws('|', p_review_id::text, p_decision::text, v_candidate::text, coalesce(p_reason, '')), 'sha256'), 'hex');
  select * into v_existing from public.idempotency_keys
  where owner_id = v_owner and scope = 'review.resolve' and key_hash = v_key_hash;
  if found then
    if v_existing.request_hash <> v_request_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    if v_existing.status = 'SUCCEEDED' then
      return jsonb_build_object('reviewId', p_review_id, 'resourceId', v_existing.resource_id, 'status', p_decision, 'replayed', true);
    end if;
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = '55000';
  end if;
  if v_review.status not in ('PENDING','NEEDS_EDIT') then
    raise exception 'REVIEW_ALREADY_RESOLVED' using errcode = '55000';
  end if;

  insert into public.idempotency_keys(owner_id, scope, key_hash, request_hash, status, expires_at)
  values(v_owner, 'review.resolve', v_key_hash, v_request_hash, 'PROCESSING', now() + interval '24 hours');

  if p_decision = 'NEEDS_EDIT' then
    update public.review_items
    set status = 'NEEDS_EDIT', candidate_data = v_candidate, version = version + 1
    where id = p_review_id;
  elsif p_decision = 'REJECTED' then
    update public.review_items
    set status = 'REJECTED', candidate_data = v_candidate, resolved_by = v_owner,
      resolved_at = now(), rejection_reason = left(p_reason, 500)
    where id = p_review_id;
  elsif v_review.kind = 'PROJECT_CREATE' then
    if length(btrim(coalesce(v_candidate->>'name', ''))) < 1 or length(v_candidate->>'name') > 180 then
      raise exception 'PROJECT_NAME_INVALID' using errcode = '22023';
    end if;
    if length(btrim(coalesce(v_candidate->>'slug', ''))) < 1 or length(v_candidate->>'slug') > 120 then
      raise exception 'PROJECT_SLUG_INVALID' using errcode = '22023';
    end if;
    if exists (select 1 from public.projects where owner_id = v_owner and slug = btrim(v_candidate->>'slug')) then
      raise exception 'PROJECT_ALREADY_EXISTS' using errcode = '23505';
    end if;
    insert into public.projects(owner_id, slug, name, description, status, importance)
    values(
      v_owner,
      btrim(v_candidate->>'slug'),
      btrim(v_candidate->>'name'),
      nullif(v_candidate->>'description', ''),
      coalesce(nullif(v_candidate->>'status', '')::public.project_status, 'PLANNED'),
      coalesce((v_candidate->>'importance')::integer, 3)
    ) returning id into v_project_id;
    v_resource_id := v_project_id;
    v_resource_type := 'project';
    update public.review_items
    set status = 'APPROVED', candidate_data = v_candidate,
      approved_entity_type = 'project', approved_entity_id = v_project_id,
      resolved_by = v_owner, resolved_at = now()
    where id = p_review_id;
  elsif v_review.kind = 'TASK_CREATE' then
    if length(btrim(coalesce(v_candidate->>'title', ''))) < 1 or length(v_candidate->>'title') > 180 then
      raise exception 'TASK_TITLE_INVALID' using errcode = '22023';
    end if;
    if nullif(v_candidate->>'projectId', '') is not null and not exists (
      select 1 from public.projects where id = (v_candidate->>'projectId')::uuid and owner_id = v_owner
    ) then raise exception 'PROJECT_NOT_OWNED' using errcode = '42501'; end if;
    insert into public.tasks(
      owner_id, project_id, title, description, status, time_lane, importance,
      estimated_minutes, actual_minutes, assignee_label, delegation_state, delegate_label,
      execution_environment, travel_allowed, block_reason, due_at, created_by
    ) values(
      v_owner,
      nullif(v_candidate->>'projectId', '')::uuid,
      btrim(v_candidate->>'title'),
      nullif(v_candidate->>'description', ''),
      'UNSTARTED',
      coalesce(nullif(v_candidate->>'timeLane', '')::public.time_lane, 'SOMEDAY'),
      coalesce((v_candidate->>'importance')::integer, 3),
      nullif(v_candidate->>'estimatedMinutes', '')::integer,
      nullif(v_candidate->>'actualMinutes', '')::integer,
      nullif(v_candidate->>'assigneeLabel', ''),
      coalesce(nullif(v_candidate->>'delegationState', '')::public.delegation_state, 'SELF'),
      nullif(v_candidate->>'delegateLabel', ''),
      coalesce(nullif(v_candidate->>'executionEnvironment', '')::public.execution_environment, 'ANY'),
      coalesce((v_candidate->>'travelAllowed')::boolean, false),
      nullif(v_candidate->>'blockReason', ''),
      nullif(v_candidate->>'dueAt', '')::timestamptz,
      v_owner
    ) returning id into v_task_id;
    insert into public.task_sources(owner_id, task_id, source_type, evidence_excerpt)
    select v_owner, v_task_id, v_review.source_type, left(value, 500)
    from jsonb_array_elements_text(coalesce(v_candidate->'sourceEvidence', '[]'::jsonb));
    v_resource_id := v_task_id;
    v_resource_type := 'task';
    update public.review_items
    set status = 'APPROVED', candidate_data = v_candidate,
      approved_entity_type = 'task', approved_entity_id = v_task_id,
      resolved_by = v_owner, resolved_at = now()
    where id = p_review_id;
  elsif v_review.kind = 'TASK_STATUS_CHANGE' then
    v_task_id := coalesce(v_review.target_id, nullif(v_candidate->>'taskId', '')::uuid);
    v_new_status := (v_candidate->>'status')::public.task_status;
    select status into v_old_status from public.tasks
    where id = v_task_id and owner_id = v_owner for update;
    if not found then raise exception 'TASK_NOT_FOUND' using errcode = 'P0002'; end if;
    if not public.oz_task_transition_allowed(v_old_status, v_new_status) then
      raise exception 'TASK_TRANSITION_NOT_ALLOWED' using errcode = '22023';
    end if;
    update public.tasks set status = v_new_status where id = v_task_id and owner_id = v_owner;
    v_resource_id := v_task_id;
    v_resource_type := 'task';
    update public.review_items
    set status = 'APPROVED', candidate_data = v_candidate,
      approved_entity_type = 'task', approved_entity_id = v_task_id,
      resolved_by = v_owner, resolved_at = now()
    where id = p_review_id;
  elsif v_review.kind = 'TASK_EDIT' then
    if v_candidate ? 'status' then raise exception 'TASK_STATUS_REQUIRES_STATUS_REVIEW' using errcode = '22023'; end if;
    v_task_id := coalesce(v_review.target_id, nullif(v_candidate->>'taskId', '')::uuid);
    select * into v_task from public.tasks where id = v_task_id and owner_id = v_owner for update;
    if not found then raise exception 'TASK_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_candidate ? 'title' and (length(btrim(coalesce(v_candidate->>'title', ''))) < 1 or length(v_candidate->>'title') > 180) then
      raise exception 'TASK_TITLE_INVALID' using errcode = '22023';
    end if;
    if v_candidate ? 'projectId' and nullif(v_candidate->>'projectId', '') is not null and not exists (
      select 1 from public.projects where id = (v_candidate->>'projectId')::uuid and owner_id = v_owner
    ) then raise exception 'PROJECT_NOT_OWNED' using errcode = '42501'; end if;
    select array_agg(key order by key) into v_changed_fields
    from jsonb_object_keys(v_candidate - 'taskId') as key;
    update public.tasks set
      title = case when v_candidate ? 'title' then btrim(v_candidate->>'title') else title end,
      description = case when v_candidate ? 'description' then nullif(v_candidate->>'description', '') else description end,
      project_id = case when v_candidate ? 'projectId' then nullif(v_candidate->>'projectId', '')::uuid else project_id end,
      time_lane = case when v_candidate ? 'timeLane' then (v_candidate->>'timeLane')::public.time_lane else time_lane end,
      importance = case when v_candidate ? 'importance' then (v_candidate->>'importance')::integer else importance end,
      due_at = case when v_candidate ? 'dueAt' then nullif(v_candidate->>'dueAt', '')::timestamptz else due_at end,
      estimated_minutes = case when v_candidate ? 'estimatedMinutes' then nullif(v_candidate->>'estimatedMinutes', '')::integer else estimated_minutes end,
      actual_minutes = case when v_candidate ? 'actualMinutes' then nullif(v_candidate->>'actualMinutes', '')::integer else actual_minutes end,
      assignee_label = case when v_candidate ? 'assigneeLabel' then nullif(v_candidate->>'assigneeLabel', '') else assignee_label end,
      delegation_state = case when v_candidate ? 'delegationState' then (v_candidate->>'delegationState')::public.delegation_state else delegation_state end,
      delegate_label = case when v_candidate ? 'delegateLabel' then nullif(v_candidate->>'delegateLabel', '') else delegate_label end,
      execution_environment = case when v_candidate ? 'executionEnvironment' then (v_candidate->>'executionEnvironment')::public.execution_environment else execution_environment end,
      block_reason = case when v_candidate ? 'blockReason' then nullif(v_candidate->>'blockReason', '') else block_reason end,
      travel_allowed = case when v_candidate ? 'travelAllowed' then (v_candidate->>'travelAllowed')::boolean else travel_allowed end
    where id = v_task_id and owner_id = v_owner;
    v_resource_id := v_task_id;
    v_resource_type := 'task';
    update public.review_items
    set status = 'APPROVED', candidate_data = v_candidate,
      approved_entity_type = 'task', approved_entity_id = v_task_id,
      resolved_by = v_owner, resolved_at = now()
    where id = p_review_id;
  else
    raise exception 'REVIEW_KIND_NOT_IMPLEMENTED' using errcode = '0A000';
  end if;

  insert into public.audit_logs(
    owner_id, actor_id, action, target_type, target_id, outcome, approval_id,
    before_state, after_state
  ) values(
    v_owner, v_owner, 'REVIEW_RESOLVED', 'review_item', p_review_id, 'SUCCEEDED', p_review_id,
    jsonb_build_object('status', v_review.status),
    jsonb_strip_nulls(jsonb_build_object(
      'status', p_decision,
      'resourceType', case when v_resource_id is null then null else v_resource_type end,
      'resourceId', v_resource_id,
      'changedFields', case when v_review.kind = 'TASK_EDIT' then to_jsonb(v_changed_fields) else null end
    ))
  );
  update public.idempotency_keys set
    status = 'SUCCEEDED', resource_type = v_resource_type,
    resource_id = coalesce(v_resource_id, p_review_id), response_code = 200, completed_at = now()
  where owner_id = v_owner and scope = 'review.resolve' and key_hash = v_key_hash;
  return jsonb_build_object(
    'reviewId', p_review_id,
    'resourceId', v_resource_id,
    'resourceType', case when v_resource_id is null then null else v_resource_type end,
    'status', p_decision,
    'replayed', false
  );
end;
$$;

revoke all on function public.oz_resolve_review(uuid,uuid,public.review_status,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.oz_resolve_review(uuid,uuid,public.review_status,jsonb,text,text) to service_role;
