# Target local source project

## Repository shape

Keep the Next application at repository root so both ordinary local development
and the Sites/Vinext adapter can build it. Move product logic into packages that
do not depend on Sites or browser globals.

```text
app/                         Next App Router routes and server actions
packages/
  contracts/                 enums, schemas, API and connector contracts
  domain/                    entities and invariant rules
  application/               use cases, approval pipeline, prioritization
  db/                        PostgreSQL schema, migrations, repositories
  ai/                        structured extraction and prompt contracts
  connectors/                Google, Slack, Chatwork, Zoom, PLAUD adapters
  jobs/                      scheduler handlers and retry policies
  ui/                        preserved OZ components/design tokens
worker/                      thin Sites/Cloudflare runtime adapter
tests/                       unit, integration, contract, migration, E2E
docs/                        specification, ADRs, operations, evidence
```

## Dependency direction

```text
UI / Realtime / MCP / jobs
          ↓
application services
          ↓
domain + contracts
          ↑
PostgreSQL / connector adapters
```

Domain and application packages must not import Next, Cloudflare, OpenAI,
Google, Slack, Chatwork, or database-driver modules. Adapters implement ports
defined in contracts/application packages.

## Local commands

The current project remains runnable with:

```text
npm ci
npm run dev
npm run verify:phase0
```

Phase 1 must add deterministic commands for PostgreSQL migration, reset of the
test database, D1 import rehearsal, and restore testing. Real credentials belong
only in ignored local environment files or managed secret stores.

## Review and deployment flow

1. Codex works from the canonical Git checkout.
2. CI validates source, migrations, contracts, and tests.
3. A review archive or branch is created without deployment.
4. Only after explicit approval is the same revision sent to an owner-only Sites
   checkpoint.
5. Production access is never widened implicitly.

