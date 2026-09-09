-- Phase 1A remediation: permit only the server-side repository to read the
-- three tables used by GET /api/oz/context. Browser roles remain API-only.
revoke all on table public.projects from service_role;
revoke all on table public.tasks from service_role;
revoke all on table public.review_items from service_role;

grant select on table public.projects to service_role;
grant select on table public.tasks to service_role;
grant select on table public.review_items to service_role;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.review_items from anon, authenticated;
