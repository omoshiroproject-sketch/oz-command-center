# Local MCP verification and production authorization boundary

## Local only

`POST /mcp` implements stateless Streamable HTTP. Local verification accepts
either the authenticated owner session or a short-lived Inspector-only header.
The Inspector header works only when the request URL and, when present, the
Origin host are loopback (`localhost`, `127.0.0.1`, or `::1`). Its token and
owner identifier belong in process-local environment variables and must not be
committed or copied into reports.

The Inspector boundary is not a production authentication design. It is for
local contract validation only. Public tunnels are outside Phase 1B.

## Production is deliberately unavailable

Non-loopback MCP requests return `MCP_AUTH_REQUIRED` or
`MCP_PRODUCTION_AUTH_NOT_IMPLEMENTED`. Supplying an endpoint URL does not turn
the local server into a production authorization server.

Before production connection, select and configure an authorization provider
that implements the MCP Authorization profile. The viable choices are:

1. An established OAuth/OIDC provider that can issue MCP resource-bound access
   tokens, with OZ validating issuer, audience/resource, signature, expiry,
   scopes, and the owner mapping.
2. A dedicated standards-compliant authorization gateway in front of OZ with
   the same validation and owner mapping guarantees.

Supabase Google sign-in tokens are not silently reused as ChatGPT plugin
tokens. The current Google OAuth scopes remain `openid`, email, and profile.

Required production work includes protected-resource metadata, authorization
server or OIDC discovery, Authorization Code with PKCE S256, `resource`
parameter handling, HTTPS issuer/resource URLs, exact redirect URI controls,
state and CSRF protection, access-token audience and scope validation, token
expiry/revocation behavior, and owner-only authorization tests.

Official references checked on 2026-08-23:

- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
