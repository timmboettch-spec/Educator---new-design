import { GatewayTimeoutException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import OpenAI, { APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai';
import { AiConstants, AiMessageRole } from '../../constants/ai.constants';
import {
  OutboundHttpConstants,
  OutboundIntegration,
} from '../../constants/outbound-http.constants';
import {
  AiInvalidResponseException,
  AiNotConfiguredException,
  AiUpstreamException,
} from '../../exceptions/ai.exception';
import {
  type AiAbortScope,
  type AiChatMessage,
  type AiCompletionRequest,
  type AiGateway,
  type OpenAiApiError,
  type AiResponseFormat,
} from '../../interfaces/ai-gateway.interface';
import { ERROR_MSG } from '../../messages/error.message';
import { outboundHttpTimeoutCounter } from '../../metrics/app.metrics';
import { LoggerService } from '../../services/logger.service';
import { AbortSignalUtil } from '../../utils/abort-signal.util';

/** OpenAI implementation of `AiGateway`. Never logs prompt or completion content. */
@Injectable()
export class OpenAiGateway implements AiGateway {
  private readonly client?: OpenAI;
  private readonly defaultModel: string;
  private readonly timeoutMs = OutboundHttpConstants.TIMEOUT_MS[OutboundIntegration.Ai];

  constructor(
    configService: ConfigService,
    private readonly cls: ClsService,
    private readonly logger: LoggerService,
  ) {
    const apiKey = this.resolveApiKey(configService);
    this.defaultModel = configService.get<string>('ai.model') || AiConstants.DEFAULT_MODEL;
    if (apiKey) {
      // The SDK timeout is per attempt; `createAbortScope` separately bounds the total across retries.
      this.client = new OpenAI({
        apiKey,
        timeout: this.timeoutMs,
        maxRetries: AiConstants.MAX_RETRIES,
      });
    }
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  complete(request: AiCompletionRequest): Promise<string> {
    return this.createCompletion(request, 'text');
  }

  async completeJson<T>(request: AiCompletionRequest): Promise<T> {
    const content = await this.createCompletion(request, 'json_object');
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new AiInvalidResponseException(request.caller, 'content is not valid JSON', {
        cause: error,
      });
    }
  }

  /** Treats blank values and the literal strings "undefined"/"null" (env mishaps) as not configured. */
  private resolveApiKey(configService: ConfigService): string | undefined {
    const apiKey = configService.get<string>('ai.openaiApiKey')?.trim();
    return apiKey && apiKey !== 'undefined' && apiKey !== 'null' ? apiKey : undefined;
  }

  private async createCompletion(
    request: AiCompletionRequest,
    responseFormat: AiResponseFormat,
  ): Promise<string> {
    if (!this.client) {
      throw new AiNotConfiguredException();
    }
    const { caller } = request;
    const model = request.model || this.defaultModel;
    const scope = this.createAbortScope(caller);
    const startedAt = performance.now();

    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create(
        this.buildParams(request, model, responseFormat),
        { signal: scope.signal },
      );
    } catch (error) {
      throw this.toDomainError(error, caller, model, scope);
    } finally {
      scope.dispose();
    }

    this.logUsage(caller, model, startedAt, completion);
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new AiInvalidResponseException(caller, 'empty content');
    }
    return content;
  }

  private buildParams(
    request: AiCompletionRequest,
    model: string,
    responseFormat: AiResponseFormat,
  ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
    return {
      model,
      messages: this.toMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      response_format: responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
    };
  }

  /** One timer bounds the whole call including SDK retries; an abort is never retried. */
  private createAbortScope(caller: string): AiAbortScope {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timeoutController.abort(new Error(`AI call "${caller}" timed out`));
    }, this.timeoutMs);
    timer.unref();

    const inboundSignal = AbortSignalUtil.getAbortSignal(this.cls);
    return {
      signal: AbortSignalUtil.combineAbortSignals(timeoutController.signal, inboundSignal),
      timeoutSignal: timeoutController.signal,
      inboundSignal,
      dispose: () => clearTimeout(timer),
    };
  }

  private logUsage(
    caller: string,
    model: string,
    startedAt: number,
    completion: OpenAI.Chat.ChatCompletion,
  ): void {
    const latencyMs = Math.round(performance.now() - startedAt);
    const promptTokens = completion.usage?.prompt_tokens ?? '?';
    const completionTokens = completion.usage?.completion_tokens ?? '?';
    this.logger.log(
      `AI call "${caller}" model=${model} latencyMs=${latencyMs} ` +
        `promptTokens=${promptTokens} completionTokens=${completionTokens}`,
    );
  }

  /** Returns (does not throw) the error the caller should see. */
  private toDomainError(
    error: unknown,
    caller: string,
    model: string,
    scope: AiAbortScope,
  ): unknown {
    // The SDK's per-attempt timeout equals the overall bound, so either may fire first.
    const timedOut =
      !scope.inboundSignal?.aborted &&
      (scope.timeoutSignal.aborted || error instanceof APIConnectionTimeoutError);
    if (timedOut) {
      return this.toTimeoutException(error, caller, model);
    }
    // Inbound request cancelled: propagate as a plain abort (ADR-0011).
    if (error instanceof APIUserAbortError || scope.timeoutSignal.aborted) {
      return error;
    }
    if (error instanceof APIError) {
      return this.toUpstreamException(error, caller, model);
    }
    return error;
  }

  private toTimeoutException(
    error: unknown,
    caller: string,
    model: string,
  ): GatewayTimeoutException {
    this.logger.warn(`AI call "${caller}" model=${model} timed out after ${this.timeoutMs}ms`);
    outboundHttpTimeoutCounter.inc({ integration: OutboundIntegration.Ai });
    return new GatewayTimeoutException(ERROR_MSG.COMMON.UPSTREAM_TIMEOUT(OutboundIntegration.Ai), {
      cause: error,
    });
  }

  private toUpstreamException(
    error: OpenAiApiError,
    caller: string,
    model: string,
  ): AiUpstreamException {
    const status = typeof error.status === 'number' ? error.status : undefined;
    const requestId = error.requestID ?? undefined;
    this.logger.error(
      `AI call "${caller}" model=${model} failed: status=${status ?? '?'} ` +
        `requestId=${requestId ?? '?'} ${error.message}`,
    );
    return new AiUpstreamException(caller, status, requestId, { cause: error });
  }

  private toMessages(messages: string | AiChatMessage[]): AiChatMessage[] {
    return typeof messages === 'string'
      ? [{ role: AiMessageRole.User, content: messages }]
      : messages;
  }
}
