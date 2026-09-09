# ADR 0005: Supabase development and single-owner authentication

- Status: Accepted
- Date: 2026-08-23

## Decision

Use Supabase as the first target backend. PostgreSQL is the formal source of truth, with the production region planned as Tokyo (`ap-northeast-1`). Supabase Auth supplies Google OAuth, PostgreSQL supplies migrations and RLS, Cron and Queues provide scheduled/durable job boundaries, and short-lived Edge Functions dispatch bounded work. Long-running work is represented by queue references and can be consumed by a separate worker later.

Phase 1A prepares development only. Development, test, and production must use separate Supabase projects, Google OAuth clients, Sentry environments, redirect URLs, and Secret sets.

The browser signs in through Supabase Google OAuth. Every OZ API validates the Supabase bearer token, requires a verified Google identity, and compares its normalized email to the server-only `OZ_ALLOWED_EMAIL` value. There is no shared owner fallback. After that check, the server uses its server-only Supabase service credential and an explicit authenticated owner UUID for data access. Target tables and mutation RPCs are not granted directly to `anon` or `authenticated`; this prevents a valid but non-allowlisted Supabase account from bypassing the OZ API boundary. RLS remains enabled as defense in depth and for a possible future user-JWT repository.

The current Sites D1 stays read-only as a legacy comparison source. Its rows are neither seeded nor automatically imported into PostgreSQL.

## Consequences

- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix.
- Only Supabase URL and publishable/anon key may be supplied to the browser auth client.
- All important writes use service-owned RPCs that verify `service_role`, explicit owner UUID, approval state, transition rules, idempotency, and audit append.
- Remote project creation, linking, migration application, OAuth configuration, Secret registration, Edge deployment, Cron schedules, and production data writes require explicit later operator action.
- Existing Sites project metadata is retained, but no version is saved or deployed by Phase 1A.
