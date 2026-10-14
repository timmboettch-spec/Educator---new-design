# ADR-0012: Shared AI Gateway on the OpenAI SDK

## Status

Proposed. Amends [ADR-0011](0011-outbound-http-time-bounded-and-request-scoped.md) for AI retries.

## Context

About ten call sites in `StudentBackend` (conversation, reports, communication, sequencing,
actions-interventions) each hand-built `POST /v1/chat/completions`: reading the key and model, a
missing-key check, Bearer headers, `choices[0]` extraction, JSON parsing and their own error handling.
The behaviour drifted between copies.

## Decision

All AI completions in both Nest apps go through one gateway in `src/common/providers/ai/`, injected
via the `AiGateway` abstract class (itself the DI token, so no `@Inject`), resolved at startup by `AiGatewayFactory` from `AI_PROVIDER` (default `openai`; unknown values fail startup) (`AiGateway` abstract class in `src/common/interfaces/`, `OpenAiGateway` and the local-only `StaticAiGateway` implementations).

- Built on the official `openai` SDK (CJS build, Node ≥22), not raw HTTP.
- Intent-level API: `complete()` returns text, `completeJson<T>()` returns parsed JSON. Every call
  carries a caller label. Callers never see OpenAI wire shapes.
- Model defaults to `ai.model`, falling back to `AiConstants.DEFAULT_MODEL`. `model`, `temperature`,
  `maxTokens` and `responseFormat` can be overridden per call.
- ADR-0011 is applied inside the gateway: SDK `timeout` = `OutboundHttpConstants.TIMEOUT_MS[Ai]`,
  and a per-call `AbortSignal.any([timeout, clsSignal])`. A timeout maps to the 504 with the i18n
  key and the metric, and is never retried.
- **Retry exception:** AI completions have no upstream side effects, so the SDK retries 429/5xx
  (`maxRetries: 2`). Timeouts are still not retried.
- Typed errors: `AiNotConfiguredException` (thrown at call time, so startup doesn't need a key),
  `AiUpstreamException`, `AiInvalidResponseException`. Callers keep their own fallbacks by catching
  these.
- Logs model, caller label, latency and token usage. Never logs prompt or completion content.

## Considered Options

- **Keep raw HTTP via `OutboundHttpClient`, wrap only the duplication.** Rejected: hand-rolled wire
  types and no path to the Azure OpenAI client.
- **Inject a custom `fetch` into the SDK backed by `OutboundHttpClient`.** Rejected: fragile coupling
  to SDK internals. The SDK's own `timeout` and `signal` options cover it.
- **Concrete `OpenAiClient` without an abstraction.** Rejected: `CONVERSATION_PROVIDER` already
  implies swappable providers, and the token costs little.

## Consequences

One place owns the AI key, the model, timeouts, retries and error mapping. Adding a provider is a new
`AiGateway` implementation. The speech engine (Whisper) is out of scope until it makes real OpenAI calls.
