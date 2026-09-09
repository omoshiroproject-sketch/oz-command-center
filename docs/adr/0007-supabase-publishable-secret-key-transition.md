# ADR 0007: Supabase publishable and secret key transition

- Status: Accepted
- Date: 2026-08-23

## Decision

Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the browser,
`SUPABASE_PUBLISHABLE_KEY` for server-side Auth user verification, and
`SUPABASE_SECRET_KEY` for the service repository. During the local CLI
transition, the legacy anon and service-role variable names remain supported as
fallbacks.

The browser never receives a secret key. Owner requests use a publishable key
in `apikey` plus the owner's access token in `Authorization`. The repository
uses its service credential in `apikey`; legacy JWT service-role keys may also
be sent as Bearer credentials, but opaque `sb_secret_` keys must never be put in
an Authorization Bearer header.

## Consequences

- New variable names take precedence when both generations are configured.
- Existing local Supabase CLI credentials continue to work without changing
  the ignored `.env` during Phase 1B.
- Edge Function JWT verification is treated as a separately tested deployment
  contract; the browser cannot infer it from the key format.
- No remote project keys are fetched or changed by this migration.
