/** Selects the `AiGateway` implementation via `AI_PROVIDER`. */
export enum AiProvider {
  OpenAi = 'openai',
  /** Canned replies, no network or API key. Local development only. */
  Static = 'static',
}

export const AiConstants = {
  /** Model used when `ai.model` is not configured. */
  DEFAULT_MODEL: 'gpt-4o-mini',
  /** SDK retries for 429/5xx only; the overall timeout is never retried (ADR-0012). */
  MAX_RETRIES: 2,
  /** Provider used when `AI_PROVIDER` is not set. */
  DEFAULT_PROVIDER: AiProvider.OpenAi,
};

export enum AiMessageRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
}
