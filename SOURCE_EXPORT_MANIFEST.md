# OZ COMMAND CENTER local source export

## Purpose

This repository is the complete local/Codex source export of the current OZ
COMMAND CENTER Site plus the accepted v2.0 specification and Phase 0 migration
documents. It is intended to be unpacked, installed with the lockfile, tested,
and continued in Codex without depending on the interactive Sites editor.

## Included

- Current screen implementation and visual styles
- DEMO and LIVE OZ browser runtimes
- OpenAI Realtime server boundary and system instructions
- OZ Network APIs, projects, tasks, and memories implementation
- `package.json` and `package-lock.json`
- App, Worker, database, public assets, scripts, and tests
- D1 schema, migrations, snapshots, and current seed migration
- `.env.example` with placeholders only
- `.openai/hosting.json` for the existing OZ Sites project
- OZ COMMAND CENTER development specification v2.0
- Phase 0 gap analysis, migration plan, ADRs, and Codex instructions
- Local install, run, build, test, and Sites reconnection instructions

## Architecture note

There is no separate `src/` directory in the current Next App Router layout.
Application source is in `app/` and `worker/`. There is no separate `assets/`
directory; runtime assets are in `public/`. These directories are complete for
the current implementation.

## Security exclusions

The source archive must not contain:

- API keys, OAuth tokens, credentials, or populated environment files
- Sites Secrets or short-lived control-plane credentials
- Local/hosted D1 database files or production records
- Dependency, build, runtime-cache, or Git-internal directories

The project ID and logical D1 binding in `.openai/hosting.json` are connection
metadata, not secret values. They remain in the export so Codex can attach to
the existing Site after the user explicitly requests it.

## Validation gate

Before delivery, the export revision must pass:

```text
npm run verify:phase0
ZIP integrity test
tracked-file inclusion comparison
secret-pattern scan
```

No Sites checkpoint or production deployment is required to create this local
source export.
