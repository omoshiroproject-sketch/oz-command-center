# ADR 0002: Domain enums and target data model

- Status: Accepted
- Date: 2026-08-23

## Decision

Adopt the v2.0 enums and required logical table inventory as stable contracts.
PostgreSQL is the target task source of truth. Drizzle ORM is selected for the
PostgreSQL implementation to retain type-safe schema/migrations while reducing
transition cost from the existing toolchain.

The confirmed enum values are recorded in `packages/contracts/src/index.ts`.
The required table inventory is the specification section 15.2 and includes
users/settings, projects/tasks and their relations/sources, reviews, calendar,
contacts/delegation, ideas/decisions, meetings/proposals, intake/integrations,
connector events, external actions/approvals, notifications/jobs/idempotency,
audit logs, and files/links.

## Consequences

- D1 `open`/`done` values are legacy inputs, not new domain values.
- Request-time schema creation is prohibited in the target implementation.
- UI, Realtime, MCP, jobs, and connectors must use one application/repository
  boundary; none may become a second task source of truth.
- Database provider selection remains an open Phase 0 operational decision, but
  it cannot change the PostgreSQL contract without a superseding ADR.

