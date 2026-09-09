# Current codebase map

## Runtime

- `app/page.tsx`: static JSX shell for the current visual design.
- `app/globals.css`: full visual system and limited desktop compression rules.
- `app/oz-scripts.tsx`: loads four legacy browser runtimes in order.
- `public/scenarios.js`: fixed demo projects, KPI values, and scripted scenes.
- `public/app.js`: demo playback, project drawer, state animation, and keyboard UI.
- `public/live-oz.js`: microphone, wake word, WebRTC, Realtime events, transcript
  display, transient MCP approval card, and function-call bridge.
- `public/oz-network.js`: D1 project/task/memory fetch, quick task creation, and
  task completion UI.
- `worker/index.ts`: Cloudflare/Vinext entry, Realtime session proxy, health and
  integration routes, and tool definitions.
- `worker/oz-data.ts`: D1 table bootstrapping, queries, and direct mutations.
- `worker/integrations.ts`: configuration/status registry, not full connectors.
- `worker/oz-system-prompt.ts`: Realtime behavior prompt.
- `db/schema.ts` and `drizzle/`: D1/SQLite schema and seed migrations.
- `tests/rendered-html.test.mjs`: current build/health/secret smoke tests.

## Important implementation facts

- `app/chatgpt-auth.ts` provides helpers but is not wired into the page or the
  Worker API boundary.
- `worker/oz-data.ts` creates tables during requests even though migration files
  also exist. The PostgreSQL target must use migrations only.
- Browser function calls post to a general `/api/oz/tools` route and can mutate
  formal rows directly.
- Google tools exposed to Realtime are currently read-only and require an
  environment token; there is no app-owned integration/sync model.
- Slack, Chatwork, ChatGPT bridge, analytics, and sales entries are capability
  placeholders/status indicators rather than end-to-end integrations.

## Extraction seam

The safest extraction seam is behind the existing UI:

```text
Current UI
  → typed application API
    → domain services
      → repository / approval / audit / job ports
        → PostgreSQL and connector adapters
```

This lets Phase 2 replace `public/*.js` incrementally with React components
without redesigning the screen or allowing UI code to own business rules.

