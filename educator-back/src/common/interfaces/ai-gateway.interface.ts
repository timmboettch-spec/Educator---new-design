import { type AiMessageRole } from '../constants/ai.constants';

/** `json_object` asks the provider for a JSON object reply. */
export type AiResponseFormat = 'text' | 'json_object';

/** Cancellation wiring for one AI call: the signal to pass to the SDK plus the pieces needed to classify an abort. */
export interface AiAbortScope {
  signal?: AbortSignal;
  timeoutSignal: AbortSignal;
  inboundSignal?: AbortSignal;
  dispose: () => void;
}

/** Structural view of the OpenAI SDK's `APIError` (its generics narrow to `any` under `instanceof`). */
export type OpenAiApiError = Error & { status?: number; requestID?: string | null };

export interface AiChatMessage {
  role: AiMessageRole;
  content: string;
}

export interface AiCompletionRequest {
  /** Stable label for logs, e.g. `reports.extraction`. */
  caller: string;
  /** A bare prompt is sent as a single user message. */
  messages: string | AiChatMessage[];
  /** Defaults to `ai.model`, then `AiConstants.DEFAULT_MODEL`. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Single entry point for AI completions (ADR-0012). Abstract class, so it doubles as the DI token: inject with
 * `private readonly aiGateway: AiGateway` (no `@Inject`). The implementation is picked by `AI_PROVIDER`.
 *
 * Throws `AiNotConfiguredException`, `AiUpstreamException`, `AiInvalidResponseException`, or a
 * `GatewayTimeoutException` when the AI timeout elapses (ADR-0011).
 */
export abstract class AiGateway {
  /** Returns the trimmed text of the first choice. */
  abstract complete(request: AiCompletionRequest): Promise<string>;

  /** Requests a JSON object and returns it parsed. The shape of `T` is not validated. */
  abstract completeJson<T>(request: AiCompletionRequest): Promise<T>;

  /** Whether a usable API key is configured. */
  abstract isConfigured(): boolean;
}
