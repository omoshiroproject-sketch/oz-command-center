# ADR 0003: Approval, audit, and idempotency boundary

- Status: Accepted
- Date: 2026-08-23

## Decision

AI, voice, email, chat, meeting notes, and connector sync create untrusted
candidates. Candidates enter `review_items`; they do not directly create formal
tasks or mutate external systems. External writes are represented by a proposed
`external_action` and can execute only with a valid, owner-authenticated
`action_approval` and idempotency key.

Every important mutation follows:

```text
authenticate → validate → authorize → verify review/approval
→ reserve idempotency key → execute transaction/action
→ persist result → append audit record → return traceable outcome
```

## Consequences

- Current direct `oz_create_task`, `oz_complete_task`, quick-add, and generic
  memory writes must be migrated before they represent v2.0-compliant behavior.
- A transient client-side approval card is presentation, not an approval record.
- Read operations may run without action approval when authenticated and allowed;
  writes may not.
- Retries must check external IDs/idempotency before repeating a side effect.

