# Connector implementation status

Phase 1B performs no external OAuth, scope addition, live read, or write.

| Connector | Registry | Typed read boundary | Mock | Realtime builder | Live connection |
| --- | --- | --- | --- | --- | --- |
| Google Calendar | Yes | Yes | Yes | Environment-supplied official ID only | Not connected |
| Gmail | Yes | Yes | Yes | Environment-supplied official ID only | Not connected |
| Google Drive | Yes | Yes | Yes | Environment-supplied official ID only | Not connected |
| Slack | Yes | Yes | Yes | Server tool boundary | Not connected |
| Chatwork | Yes | Yes | Yes | Server tool boundary | Not connected |
| SNS Analytics | Yes | Yes | Yes | Server tool boundary | Not connected |
| Sales Data | Yes | Yes | Yes | Server tool boundary | Not connected |
| Zoom | Yes | Yes | Yes | Future boundary | Not connected |
| LINE | Yes | Yes | Yes | Future boundary | Not connected |
| SMS | Yes | Yes | Yes | Future boundary | Not connected |
| Google Tasks | Yes | Yes | Yes | Future boundary | Not connected |

Every capability is read-only. Returned items carry an `untrusted` marker and
an instruction-isolation envelope. Timeouts, bounded retries, redaction, safe
errors, and unavailable-source fallback are shared. No connector ID is
fabricated; the Realtime builder emits a connector only when both its reviewed
ID and authorization are supplied server-side.
