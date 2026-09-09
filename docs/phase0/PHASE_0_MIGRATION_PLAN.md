# Phase 0 migration plan

## Objective

Create a safe bridge from the current private Sites prototype to a canonical,
Codex-developable local source project without changing the completed visual
design or publishing an unreviewed build. Phase 0 defines and validates the
boundaries needed for Phase 1; it does not replace the UI or activate new
external writes.

## Non-goals for Phase 0

- No public or production deployment.
- No redesign of the current command center.
- No automatic migration cutover from D1 to PostgreSQL.
- No Gmail, Calendar, Drive, Slack, Chatwork, Zoom, or PLAUD write actions.
- No claim that Core Release acceptance criteria are already met.

## Workstreams

### P0-01 — Freeze existing assets and authority

Actions:

- Store the supplied v2.0 specification byte-for-byte in the repository.
- Record its checksum and precedence.
- Record source hashes for the current page, styles, and browser runtimes.
- Capture desktop 16:9 and iPhone-equivalent screenshots during Phase 0
  execution, before any component extraction.

Exit evidence: specification checksum matches; UI fingerprint is reproducible;
baseline screenshots are stored outside production data.

### P0-02 — Establish canonical local-source workflow

Actions:

- Treat Git source as the development source of truth.
- Develop and test locally with Node 22 and checked-in lockfile/migrations.
- Keep Sites as an owner-only review/deployment adapter, never as the only copy
  of business logic.
- Produce a source archive or Git remote handoff for every approved milestone.
- Require explicit user authorization before a Sites checkpoint deployment.

Exit evidence: a fresh checkout installs, builds, tests, and documents all
required environment variables without real secret values.

### P0-03 — Freeze domain and approval contracts

Actions:

- Adopt the confirmed project, task, review, external-action, proposal,
  calendar-block, execution-environment, and job enums.
- Adopt the required table inventory as the target logical model.
- Define the connector capability interface and force write execution to accept
  an approved action/approval identifier.
- Define the application mutation pipeline:
  authenticate → validate → authorize → load approval/idempotency → execute →
  persist result → audit.

Exit evidence: contracts and ADRs are reviewed; governance tests reject enum
drift, unauthorized UI drift during planning, and OZ first-person violations.

### P0-04 — Design PostgreSQL and D1 migration

Actions:

- Use PostgreSQL with Drizzle ORM for the target. Drizzle retains type safety
  while reducing migration cost from the current schema tooling.
- Generate versioned PostgreSQL migrations; prohibit request-time DDL.
- Add a repository/application layer so UI, Realtime tools, MCP, and jobs share
  one domain service rather than writing tables independently.
- Select and document managed PostgreSQL, backup retention, point-in-time
  recovery, development/test databases, and secret rotation before cutover.

Exit evidence: empty development and test databases migrate automatically;
schema verification and rollback/restore rehearsal are documented.

### P0-05 — Preserve and map current data

Actions:

1. Put the existing D1 database into migration freeze for schema expansion.
2. Export `oz_projects`, `oz_tasks`, and `oz_memories` with counts and hashes.
3. Import into a PostgreSQL staging database while preserving legacy IDs and
   source metadata.
4. Validate counts, required fields, dates, URLs, owner mapping, and the SNS
   business records.
5. Run read-side comparison against representative project/task queries.
6. Switch the task source of truth only in Phase 1 after owner acceptance.
7. Retain a recoverable D1 export; do not delete the original during cutover.

Initial mapping:

| Current | Target | Rule |
|---|---|---|
| `oz_projects` | `projects` | Preserve `id` as `legacy_id`; map `active` to `ACTIVE`; recompute progress from task scope, not KPI. |
| `oz_tasks.status=open` | `tasks.status=UNSTARTED` | Preserve source/due date; enrich missing fields through review rather than guessing. |
| `oz_tasks.status=done` | `tasks.status=COMPLETED` | Preserve completion as imported history and record migration audit. |
| `oz_memories.kind=idea` | `ideas` | Import as an idea record; do not auto-promote to project. |
| `oz_memories.kind=decision` | `decisions` | Mark source as legacy import and retain original content/time. |
| Other `oz_memories` | `intake_items` or project notes | Classify in a review queue; never discard or silently coerce. |

### P0-06 — Authentication and environment isolation

Actions:

- Confirm the single allowed Google account and implement an application-owned
  allowlist.
- Require owner authentication in every API/service and remove production
  identity fallback.
- Separate development, test, and production OAuth clients, databases, URLs,
  encryption keys, push keys, and connector credentials.
- Validate environment configuration at startup without exposing secret values.

Exit evidence: an unauthenticated API request is rejected; the wrong Google
account is rejected; test credentials cannot affect production.

### P0-07 — External API verification register

Actions:

- Verify every date-sensitive API item against official documentation and the
  actual connection plan on the implementation date.
- Record minimum scopes, plan/review requirements, rate limits, webhooks or
  polling, retention, idempotency support, and fallback paths.
- Do not treat an environment variable or UI badge as proof of connection.

Exit evidence: every item in `EXTERNAL_API_VERIFICATION_REGISTER.md` is either
verified with date/evidence or explicitly blocked with a fallback.

### P0-08 — CI, observability, and operational readiness

Actions:

- Run lockfile install, lint, production build, tests, governance checks, and
  migration checks in CI.
- Choose error monitoring and define structured logs, trace IDs, redaction, and
  user-facing failure messages.
- Document backup/restore, connector disablement, OAuth revocation, data export,
  and deletion procedures.

Exit evidence: CI passes from a clean checkout; a synthetic failure can be
traced without logging a secret or normal message/document body.

## Target execution order

```text
Freeze specification and UI
  → canonical local source and CI
  → domain/database/approval ADRs
  → PostgreSQL migrations and repository boundary
  → authentication and environment isolation
  → D1 staging import and comparison
  → external API verification
  → Phase 0 acceptance review
  → Phase 1 implementation
```

Do not begin Phase 2 UI data replacement before Phase 1 has a trusted task,
review, approval, audit, and ownership boundary.

## Phase 0 completion checklist

- [x] v2.0 specification is stored and marked authoritative.
- [x] Current source and capability gaps are documented.
- [x] UI source fingerprint is recorded without UI changes.
- [x] Core enums, table inventory, and approval boundary are accepted as ADRs.
- [x] Local-source/Sites review workflow is documented.
- [x] Initial CI and governance scaffolding exists.
- [ ] Desktop and mobile baseline screenshots are captured.
- [ ] PostgreSQL provider, backup policy, and error-monitoring provider are selected.
- [ ] Development and test PostgreSQL migrations run automatically.
- [ ] Single allowed Google account is confirmed and auth test cases pass.
- [ ] D1 export/import rehearsal passes count and checksum comparison.
- [ ] External API register is verified against official sources and test accounts.
- [ ] Restore, revoke, export, and delete runbooks are exercised.

The checked items are completed by this planning review. The unchecked items are
the executable Phase 0 backlog and are intentionally not represented as finished.

## Decisions required before Phase 0 exit

- Managed PostgreSQL host and backup/restore targets.
- The exact allowed Google account for application authentication.
- Error-monitoring/trace provider and data residency/retention settings.
- Which iPhone/device receives the initial PWA push subscription.
- Whether the existing private Sites project remains the long-term review host
  or is replaced after the local repository is connected to CI.

