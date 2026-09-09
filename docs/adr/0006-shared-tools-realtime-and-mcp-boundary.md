# ADR 0006: Shared OZ tools, Realtime, and MCP boundary

- Status: Accepted
- Date: 2026-08-23

## Decision

HTTP API routes, browser Realtime function calls, and the Streamable HTTP MCP
endpoint use one application-level OZ tool service and one versioned tool
contract. Read tools may return owner data after authentication. Candidate
tools may only create `review_items`. Review resolution remains an explicit
owner action, and external-action tools may only persist `PROPOSED` records.

Browser voice uses WebRTC and an owner-authenticated, short-lived Realtime
client secret. The standard OpenAI API key remains server-only. The server adds
a privacy-preserving hash of the authenticated owner ID as the OpenAI safety
identifier. Raw audio is not persisted.

The local MCP endpoint is stateless Streamable HTTP. Production MCP access is
never anonymous and will require an OAuth 2.1 authorization server that meets
the MCP Authorization specification. Phase 1B does not implement a custom
authorization server or expose the local endpoint publicly.

## Consequences

- Realtime uses application-owned function tools while the local MCP endpoint
  is not safely reachable from OpenAI. A future remote MCP adapter can reuse the
  same names, schemas, outputs, and approval rules.
- Tool arguments never supply or override the owner identity.
- Tool annotations must describe actual behavior; they are not authorization.
- Local Inspector credentials are development-only and are mapped to a
  server-side owner identity. They are never accepted on a non-loopback host.
- `mcp_approval_request` is a UI state. A response is sent only after a user
  presses approve or reject.
