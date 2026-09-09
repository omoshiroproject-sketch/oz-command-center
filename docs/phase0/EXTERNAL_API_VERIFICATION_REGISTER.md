# External API verification register

Status as of 2026-08-23: this is a verification backlog, not proof that an API,
scope, connector, or account plan is currently usable. Each row must be checked
against official documentation and the intended account on the implementation
date.

| Service/topic | Status | Verify | Fallback if unavailable | Target phase |
|---|---|---|---|---|
| OpenAI Realtime browser connection | UNVERIFIED | Current session endpoint, short-lived browser credential/SDP flow, event names, Japanese transcription, model and voice availability, cost/limits. | Server-mediated supported flow; manual text mode. | 0/3 |
| OpenAI structured outputs/tools | UNVERIFIED | Current Responses SDK, schema enforcement, tool-call lifecycle, safety identifier, retries. | Server-side schema validation plus explicit missing-field questions. | 0/3 |
| ChatGPT/MCP surface | UNVERIFIED | Authentication, tool permissions, read/write confirmation behavior, and supported distribution method. | Authenticated OZ web/API access; manual task export/import. | 0/1 |
| Google OAuth | UNVERIFIED | Minimum Calendar/Gmail/Drive scopes, separate read/write consent, verification/review, token refresh/revocation, single-account allowlist. | Read-only/manual import until write scopes are approved. | 0/1 |
| Google Calendar | UNVERIFIED | Events sync tokens, change notifications, recurrence, timezone, event IDs, conference data, idempotent create/update. | Polling with cursor; preview-only ICS/manual event creation. | 0/4 |
| Gmail | UNVERIFIED | Watch/history availability, mailbox scopes, message/thread IDs, send/draft APIs, attachment limits, quota. | Cursor polling; user-forwarded mail/manual paste; draft-only output. | 0/6 |
| Google Drive | UNVERIFIED | Search semantics, change feed, shared drives, export formats, folder moves, permissions, rate limits. | User-selected files/folders and manual upload/export. | 0/6/9 |
| Web Push/iOS PWA | UNVERIFIED | Supported iOS versions, install requirement, permission UX, VAPID, notification actions, background constraints. | In-app summary and optional email/calendar reminder. | 0/5 |
| Slack | UNVERIFIED | OAuth scopes, history access, Events API, posting, thread replies, app approval, workspace retention/rate limits. | Scoped polling or user paste; preview text with manual posting. | 0/7 |
| Chatwork | UNVERIFIED | API plan/access, room history, webhook availability, message posting, rate limits, room/member resolution. | Manual export/paste and approved copy-to-clipboard flow. | 0/7 |
| Zoom | UNVERIFIED | Meeting creation scopes/plan, existing meeting detection, recording/transcript access, webhooks, retention. | Existing URL/manual meeting creation; uploaded transcript. | 0/8 |
| PLAUD NOTE | UNVERIFIED | Official API/authentication, export formats, timestamps/speakers, sync scope, usage rights. | Export file, Drive handoff, or manual transcript import. | 0/8 |

For every verified row, record: official URL, checked date, account/workspace,
approved scopes, rate/retention constraints, webhook or polling decision, sample
request result, and the owner of re-verification.

