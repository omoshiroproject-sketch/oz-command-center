# ADR 0001: Specification authority and UI preservation

- Status: Accepted
- Date: 2026-08-23

## Decision

The supplied v2.0 specification is the highest-level requirement source. The
current OZ screen is the visual foundation and must be preserved while demo data
and legacy behavior are replaced behind it. Desktop remains a three-column
command center; mobile reuses the same system in the specified four-tab PWA.

## Consequences

- A full redesign is out of scope unless a later approved specification changes
  this decision.
- Visual changes require baseline evidence and an explicit reason.
- Product behavior shown by demo scripts is not authoritative data behavior.
- Fixed data may remain only as isolated development/test fixtures after Phase 2.

