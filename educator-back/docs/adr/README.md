# Architecture Decision Records

Records of significant architectural decisions for this repo — what was decided, why, what it costs, and what's still outstanding to actually land it.

## Index

| ADR                                                                 | Title                                                                                           | Status                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [0001](0001-mail-service-managed-identity.md)                       | Mail Service Auth — Azure Communication Services Email + Managed Identity                       | Dev/qa infra live, prod provisioning-only |
| [0002](0002-mail-retry-queue.md)                                    | Redis-Backed Retry Queue for Report-Delivery Mail                                               | Implemented                               |
| [0005](0005-single-global-default-deny-auth-guard.md)               | Single Global Default-Deny Auth Guard                                                           | Accepted, implemented                     |
| [0006](0006-selected-role-rbac.md)                                  | Selected-Role RBAC Across All Endpoints                                                         | Accepted                                  |
| [0007](0007-service-key-auth-for-machine-callers.md)                | Service-Key Auth for Machine Callers                                                            | Accepted, implemented                     |
| [0008](0008-cross-replica-socketio-redis-pubsub-rooms.md)           | Cross-replica Socket.IO via Redis pub/sub, per-recipient rooms, WebSocket-only transport        | Accepted                                  |
| [0009](0009-attempts-in-simulation-reports-blob-retired.md)         | Every Attempt Lives in `simulation_reports`; the Blob Store Is Retired                          | Proposed                                  |
| [0010](0010-simulation-progress-owns-attempt-limits-and-forfeit.md) | Simulation Progress Owns Attempt Limits and Forfeit; `simulation_reports` Stays the Attempt Log | Proposed                                  |
| [0011](0011-outbound-http-time-bounded-and-request-scoped.md)       | Outbound HTTP Calls Are Time-Bounded and Request-Scoped                                         | Proposed                                  |
| [0012](0012-shared-ai-gateway-on-openai-sdk.md)                     | Shared AI Gateway on the OpenAI SDK                                                             | Proposed                                  |

> This originally had a separate "ACS Email" ADR at 0002, superseding 0001 within days — since both covered the same evolving mail-auth decision rather than two distinct ones, they were merged back into 0001. The retry queue ADR (originally 0003) was then renumbered down to 0002 to close the gap.

## Adding a new one

Copy the format of an existing ADR (status, context, decision, consequences), number it sequentially, and add a row to the index above.
