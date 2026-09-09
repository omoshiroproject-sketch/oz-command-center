# ADR 0004: Canonical local source and Sites review flow

- Status: Accepted
- Date: 2026-08-23

## Decision

Canonical development happens in a local Git source project that builds without
depending on an interactive Sites editing session. Sites remains a thin runtime
and owner-only review/deployment destination. A source review version may be
built and archived without deployment; Sites deployment requires explicit user
authorization.

## Consequences

- Source, migrations, tests, environment examples, ADRs, and operational docs
  travel together.
- Business/domain logic must not live only in connector configuration or Sites
  control-plane state.
- The current private production URL remains unchanged during Phase 0 planning.
- A future hosting change does not require rewriting the domain/application
  packages.

