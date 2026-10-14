# ADR-0011: Outbound HTTP Calls Are Time-Bounded and Request-Scoped

## Status

Proposed.

## Decision

Every outbound HTTP call (LMS/LTI, Moodle, Google, AI grading/conversation) goes through a shared
`OutboundHttpClient` (fetch) or a timeout-configured `HttpModule` (axios). Each call is bounded by a
per-integration timeout from `OutboundHttpConstants.TIMEOUT_MS` (fixed in code, not environment-configurable), combined via `AbortSignal.any` with the inbound
request's CLS abort signal set by `RequestTimeoutInterceptor`. Per-integration timeouts stay below
`API_TIMEOUT_MS`. Timeouts apply per HTTP call, not per paginated operation; the inbound signal bounds the
whole operation. An outbound timeout surfaces as a 504 with an i18n key, a log line and an
`outbound_http_timeouts_total{integration}` metric; an inbound cancellation propagates as a plain abort and
is not counted as an upstream failure. Timed-out calls are **not retried**.
Exception: AI completions (no upstream side effects) retry 429/5xx via the SDK — see [ADR-0012](0012-shared-ai-gateway-on-openai-sdk.md).

## Considered Options

- **Inline `AbortSignal.timeout` per call site** (the previous `lms-config` pattern). Rejected: easy to
  forget, values scattered, no link to inbound cancellation.
- **undici global dispatcher timeouts.** Rejected: invisible at the call site and does not cover axios.
- **Per-environment env-var overrides.** Rejected: fixed constants keep one source of truth; changing a
  timeout is a code change.
- **Retry on timeout.** Rejected for now: AGS score POSTs and Moodle writes may have already taken effect
  upstream, so blind retries risk duplicate side effects.

## Consequences

Outbound work stops when the client is gone or the inbound budget is exhausted, so a 408 no longer leaves
orphaned upstream calls running. Calls made outside a request context (no CLS signal) are bounded only by
their own timeout.
