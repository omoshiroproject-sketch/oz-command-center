# Current state and specification gap analysis

Date: 2026-08-23  
Baseline source revision: `5819f20af3e660a6d9d8783a92362d3b521f7bf4`

## Executive finding

The current Site is a coherent UI and Realtime voice prototype with a small
persistent D1-backed project/task/memory layer. It is not yet the Core Release
defined by v2.0. The highest-risk gaps are architectural: formal tasks can be
created or completed directly without a review record, persistent approval,
audit log, or idempotency key; the database and status model conflict with the
confirmed PostgreSQL task-source-of-truth requirement; and API authorization is
not enforced inside every application route.

No visual redesign is required. The existing presentation can be retained while
the data and application boundaries behind it are replaced in the specified
order.

## Phase 1A remediation update — 2026-08-23

- Quick Add and voice task creation now persist `PENDING` review candidates and
  do not insert formal tasks directly.
- The authenticated owner context reads `projects`, `tasks`, and `review_items`
  through a server-only service role with explicit SELECT-only grants. Browser
  roles retain no table privilege, and RLS remains enabled.
- OZ Network now lists actionable review candidates and resolves APPROVE,
  REJECT, and NEEDS_EDIT through the existing authenticated, idempotent, audited
  review API/RPC boundary. APPROVE alone creates one formal task.
- Direct field editing for NEEDS_EDIT remains a later UI capability; Phase 1A
  records and redisplays the status without bypassing approval.

## Phase 1B Realtime interaction stabilization — 2026-08-23

- LIVE OZ exposes an explicit `MIC DISCONNECT` control while connecting or
  connected. Escape closes the Realtime peer/data channel, stops every local
  microphone track, cancels reconnect timers, and leaves formal task data
  unchanged.
- Right-panel REVIEWS, APPROVALS, and ACTIVITY remain usable while LIVE OZ is
  listening. Returning to the OZ tab restores the live transcript without
  forcing a page reload or disconnect.
- Equivalent function calls within one user voice turn share one application
  execution. The original Realtime call ID remains the idempotency key source,
  while duplicate call items receive the cached result without a second
  mutation or second generated success response.
- Audio transcript completion and `response.done` events are correlated by
  Realtime response ID so one assistant completion is rendered once.

## Status legend

- `IMPLEMENTED`: satisfies the relevant requirement at prototype scope.
- `PARTIAL`: useful implementation exists, but required behavior is incomplete.
- `MISSING`: no material implementation was found.
- `CONFLICT`: current behavior contradicts a confirmed v2.0 rule and must be
  migrated rather than extended.

## Capability matrix

| Area | Status | Current evidence | Required migration |
|---|---|---|---|
| Existing desktop design | IMPLEMENTED | `app/page.tsx`, `app/globals.css` implement the three-column command center, orb, drawers, and 16:9 layout. | Preserve appearance while componentizing and binding real data in Phase 2. |
| Realtime Japanese voice | PARTIAL | `worker/index.ts` creates a server-side Realtime WebRTC session; `public/live-oz.js` maps speech/audio events to LISTENING, THINKING, and SPEAKING and streams text to LIVE CHAT. | Persist conversations/transcripts, allow correction, add structured candidate extraction, and verify current official API details. |
| Wake invocation | PARTIAL | Browser SpeechRecognition listens for OZ/オズ in `public/live-oz.js`. | Treat as progressive enhancement; add explicit mobile voice control and documented unsupported-browser behavior. |
| Secret handling | IMPLEMENTED | `OPENAI_API_KEY` is read in the Worker and is not returned by `/health`. | Add validation for all target secrets and encrypted OAuth-token storage. |
| Task source of truth | CONFLICT | `oz_tasks` is D1/SQLite with only `open`/`done`; request-time DDL also exists in `worker/oz-data.ts`. | Introduce PostgreSQL, the five-state model, migrations, repository boundary, backup/restore, and verified D1 import. |
| Candidate and review flow | CONFLICT | Quick add and `oz_create_task` insert directly into `oz_tasks`; `oz_complete_task` updates it directly. | Route AI/voice/external candidates into `review_items`; create or mutate a formal task only after approval. |
| Persistent approval boundary | PARTIAL | A transient MCP approval card exists in `app/page.tsx`/`public/live-oz.js`; Google tools are read-only. | Add `external_actions` and `action_approvals`, authenticated approval endpoints, preview payloads, and connector-enforced `approvalId`. |
| Audit and idempotency | MISSING | No audit or idempotency tables/services were found. | Implement append-only audit records, before/after values, trace IDs, idempotency keys, retry-safe execution, and tests before any write connector. |
| Authentication/ownership | CONFLICT | Sites access is owner-only and request headers are hashed, but `app/chatgpt-auth.ts` is unused and APIs fall back to a shared owner ID when headers are absent. | Add one-account Google OAuth allowlist and require authenticated ownership on every API. Remove production fallbacks. |
| Real data in primary UI | PARTIAL | OZ Network reads D1 data, but left projects and demo scenes/KPIs come from `public/scenarios.js`; the drawer explicitly says DEMO DATA. | Keep DEMO only as an isolated development fixture; replace production panels with API data. |
| Project progress | CONFLICT | Business cards calculate current KPI divided by target; demo projects use hard-coded percentages. | Calculate completed in-scope tasks divided by all in-scope tasks and show both percentage and count. |
| Task domain richness | MISSING | No subtasks, dependencies, source evidence, estimated minutes, importance, urgency, assignee, execution environment, history, or manual priority fields. | Implement confirmed enums and task-related tables before prioritization. |
| Mobile PWA | MISSING | CSS only compresses the desktop grid; no manifest, service worker, install flow, or four-tab navigation exists. | Add Today / Projects / Review / OZ tabs, offline state, installability, and mobile acceptance tests. |
| Text conversation | MISSING | LIVE CHAT is display-only; the visible composer is a fake voice-ready strip. | Add authenticated text conversation, persistence, the same candidate/review pipeline, and one-question-at-a-time behavior. |
| Today planning and Calendar | MISSING | A read-only Calendar connector may be exposed to Realtime when a token exists, but there is no `/api/today`, sync store, free-time engine, top-three reasoning, work block, or travel block. | Implement after Phase 1 task contracts, with approval-required Calendar writes. |
| Notifications and jobs | MISSING | No Web Push, 7:30 summary, quiet hours, jobs table, scheduler, retry UI, or deduplication exists. | Add Postgres-backed job and notification infrastructure in Phase 5. |
| Google connectors | PARTIAL | Realtime can expose read-only Calendar, Gmail, and Drive connector tools using one environment token. No app-owned OAuth, integration record, sync cursor, intake, or write pipeline exists. | Verify scopes and APIs; build app-owned auth, adapter capabilities, persisted cursors/events, and approved actions. |
| Slack and Chatwork | PARTIAL | Configuration status and project links exist; no history sync, extraction, send preview, or send execution is implemented. | Build after the common intake and approval executor; never infer a recipient silently. |
| ChatGPT shared access | PARTIAL | An optional remote MCP URL can be attached and D1 is described as shared, but no OZ MCP server contract or ChatGPT-side installation is part of this source. | Expose the PostgreSQL application services through an authenticated MCP boundary after Phase 1. |
| Ideas and decisions | CONFLICT | `oz_save_memory` writes ideas and decisions into a generic memory row immediately. | Use `ideas`, `decisions`, and `decision_impacts`; ideas require promotion approval and decisions retain sources/history. |
| Meetings, proposals, files, delegation | MISSING | No corresponding domain tables or services exist. | Implement only after the common source, review, connector, approval, and versioning foundations. |
| OZ first person | PARTIAL | No source string containing `俺` was found, but the system prompt does not explicitly require `私`. | Add the rule to AI prompts, templates, lint/governance checks, and acceptance tests. |
| Security and operations | PARTIAL | Secrets are server-side and external content is described as untrusted in the prompt. There is no encrypted OAuth store, app-level auth enforcement, structured trace/audit log, deletion/export, monitoring, environment separation, or restore procedure. | Complete Phase 0/1 operational controls before write integrations. |
| Automated verification | PARTIAL | Three tests cover rendered metadata, health output, and missing Realtime secret. No CI file, domain tests, migration tests, connector contract tests, or acceptance suite existed at baseline. | Add Phase 0 governance/CI now; expand by phase. |

## Current runtime flow

```text
Browser UI
  ├─ public/scenarios.js + public/app.js ──> fixed demo presentation
  ├─ public/live-oz.js ──> POST /session ──> OpenAI Realtime WebRTC
  └─ public/oz-network.js ──> /api/oz/* ──> worker/oz-data.ts ──> D1

OpenAI function call ──> browser OZ_NETWORK.executeTool
  ──> POST /api/oz/tools ──> direct D1 mutation
```

The browser-mediated function-call path is functional, but it is not the target
trusted application boundary. In the target flow, the server persists a review
candidate, the owner approves it through an authenticated endpoint, and only an
idempotent application service mutates PostgreSQL or invokes a connector.

## Immediate migration priorities

1. Freeze specification, UI baseline, enums, tables, approval boundary, and
   source/deployment workflow as ADRs.
2. Make local Git source the canonical development input; use Sites only for
   owner-only review deployments when explicitly requested.
3. Design and migrate to PostgreSQL before adding more mutations or connectors.
4. Enforce one-account authentication and remove unauthenticated owner fallback.
5. Implement review, audit, and idempotency before reconnecting task writes.
6. Only then bind the existing UI to formal project/task/review APIs.
