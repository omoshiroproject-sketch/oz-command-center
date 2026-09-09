# Manual setup before live connection

No action in this file is required for formal task and local database use.

## LIVE OZ

When live voice is ready for manual testing, add the following values to the
ignored local environment file yourself:

- `OPENAI_API_KEY`: server-only standard API key.
- `OZ_SAFETY_IDENTIFIER_SALT`: a private random value of at least 16
  characters.
- Optional `OZ_REALTIME_MODEL`; the current default is `gpt-realtime-2.1`.
- Optional `OZ_VOICE`; the default remains `cedar`.

Do not add a standard API key to a `NEXT_PUBLIC_` variable. The browser asks
the authenticated OZ server for a short-lived Realtime client secret.

## Supabase key transition

The preferred names are `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY`. Existing
local CLI anon and service-role names remain supported during transition. An
opaque Supabase secret key is sent in `apikey`, never as a Bearer credential.

## External connectors

Do not add scopes or tokens yet. Each connector needs a separate scope review,
provider setup, token storage decision, retention policy, and mock-to-live
acceptance test. ChatGPT connector sessions cannot be copied into OZ.

## Production MCP

Do not expose `/mcp` publicly. Production connection is blocked until an OAuth
2.1/MCP Authorization provider and resource-bound token validation are chosen
and implemented as documented in `LOCAL_MCP_AND_PRODUCTION_AUTH.md`.
