# Phase 1B Realtime and MCP decisions

Checked against official OpenAI documentation on 2026-08-23.

## Realtime

- Browser transport: WebRTC.
- Model default: `gpt-realtime-2.1`, configurable with `OZ_REALTIME_MODEL`.
- Voice default: `cedar`, configurable with `OZ_VOICE`.
- Credential flow: an authenticated owner requests a short-lived client secret
  from the OZ server. The server uses `OPENAI_API_KEY` only when calling
  `/v1/realtime/client_secrets`; the browser then uses the returned ephemeral
  value for `/v1/realtime/calls`.
- Safety identifier: SHA-256 of a server-held salt and the owner UUID. The UUID
  itself is not sent to OpenAI.
- Current local tool adapter: Realtime function tools backed by the shared OZ
  tool service.

Official references:

- https://developers.openai.com/api/docs/guides/realtime-webrtc
- https://developers.openai.com/api/docs/guides/realtime-mcp
- https://developers.openai.com/api/docs/models

## MCP

The local endpoint supports stateless Streamable HTTP and is tested without a
public tunnel. Owner data is unavailable anonymously.

Production connection is intentionally incomplete. Before ChatGPT or another
remote MCP client can connect, OZ needs an established OAuth 2.1 authorization
provider that supplies protected-resource metadata, authorization-server or
OIDC discovery, PKCE S256, resource/audience binding, and full token validation.
OZ must not implement a quick custom OAuth server or reuse the Google login
token as a plugin token.

Official references:

- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
