import { GatewayTimeoutException } from '@nestjs/common';
import { APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai';
import { AiConstants, OutboundHttpConstants, OutboundIntegration } from 'src/common/constants';
import {
  AiInvalidResponseException,
  AiNotConfiguredException,
  AiUpstreamException,
} from 'src/common/exceptions/ai.exception';
import { outboundHttpTimeoutCounter } from 'src/common/metrics/app.metrics';
import { OpenAiGateway } from 'src/common/providers/ai/openai.gateway';
import { AbortSignalUtil } from 'src/common/utils/abort-signal.util';

const createMock = jest.fn();

jest.mock('openai', () => {
  const actual = jest.requireActual<typeof import('openai')>('openai');
  return {
    ...actual,
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: createMock } },
    })),
  };
});

const completion = (content: string | null) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 1, completion_tokens: 2 },
});

const timeoutCount = async (): Promise<number> => {
  const { values } = await outboundHttpTimeoutCounter.get();
  return values.find((v) => v.labels.integration === OutboundIntegration.Ai)?.value ?? 0;
};

describe('OpenAiGateway', () => {
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let inbound: AbortController | undefined;

  const createGateway = (config: Record<string, string | undefined>): OpenAiGateway =>
    new OpenAiGateway(
      { get: jest.fn((key: string) => config[key]) } as never,
      {} as never,
      logger as never,
    );

  const neverResolving = (_body: unknown, opts: { signal?: AbortSignal }): Promise<never> =>
    new Promise((_resolve, reject) => {
      opts.signal?.addEventListener('abort', () => reject(new APIUserAbortError()));
    });

  beforeEach(() => {
    createMock.mockReset();
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    inbound = undefined;
    jest.spyOn(AbortSignalUtil, 'getAbortSignal').mockImplementation(() => inbound?.signal);
    outboundHttpTimeoutCounter.reset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('configuration', () => {
    it.each([undefined, '', '  ', 'undefined', 'null'])(
      'is not configured and throws AiNotConfiguredException for key %p',
      async (key) => {
        const gateway = createGateway({ 'ai.openaiApiKey': key });
        expect(gateway.isConfigured()).toBe(false);
        await expect(gateway.complete({ caller: 'test', messages: 'hi' })).rejects.toBeInstanceOf(
          AiNotConfiguredException,
        );
        expect(createMock).not.toHaveBeenCalled();
      },
    );

    it('falls back to the default model when ai.model is unset', async () => {
      createMock.mockResolvedValue(completion('ok'));
      await createGateway({ 'ai.openaiApiKey': 'k' }).complete({ caller: 'test', messages: 'hi' });
      expect(createMock.mock.calls[0][0]).toMatchObject({ model: AiConstants.DEFAULT_MODEL });
    });
  });

  describe('complete', () => {
    it('sends a bare prompt as one user message with per-call overrides', async () => {
      createMock.mockResolvedValue(completion('  hello  '));
      const gateway = createGateway({ 'ai.openaiApiKey': 'k', 'ai.model': 'cfg-model' });

      const result = await gateway.complete({
        caller: 'test',
        messages: 'hi',
        model: 'override',
        temperature: 0.3,
        maxTokens: 10,
      });

      expect(result).toBe('hello');
      const [body, opts] = createMock.mock.calls[0] as [Record<string, unknown>, unknown];
      expect(body).toEqual({
        model: 'override',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.3,
        max_tokens: 10,
      });
      expect(opts).toHaveProperty('signal');
    });

    it('throws AiInvalidResponseException on empty content', async () => {
      createMock.mockResolvedValue(completion(null));
      await expect(
        createGateway({ 'ai.openaiApiKey': 'k' }).complete({ caller: 'test', messages: 'hi' }),
      ).rejects.toBeInstanceOf(AiInvalidResponseException);
    });

    it('maps APIError to AiUpstreamException with status and request id', async () => {
      createMock.mockRejectedValue(
        APIError.generate(
          429,
          { error: 'rate' },
          'rate limited',
          new Headers({ 'x-request-id': 'req_1' }),
        ),
      );
      const error = await createGateway({ 'ai.openaiApiKey': 'k' })
        .complete({ caller: 'test', messages: 'hi' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiUpstreamException);
      expect(error).toMatchObject({ status: 429, requestId: 'req_1', caller: 'test' });
    });
  });

  describe('completeJson', () => {
    it('requests json_object and returns parsed content', async () => {
      createMock.mockResolvedValue(completion('{"a":1}'));
      const result = await createGateway({ 'ai.openaiApiKey': 'k' }).completeJson<{ a: number }>({
        caller: 'test',
        messages: 'hi',
      });
      expect(result).toEqual({ a: 1 });
      expect(createMock.mock.calls[0][0]).toMatchObject({
        response_format: { type: 'json_object' },
      });
    });

    it('throws AiInvalidResponseException on unparseable content', async () => {
      createMock.mockResolvedValue(completion('not json'));
      await expect(
        createGateway({ 'ai.openaiApiKey': 'k' }).completeJson({ caller: 'test', messages: 'hi' }),
      ).rejects.toBeInstanceOf(AiInvalidResponseException);
    });
  });

  describe('timeouts and cancellation (ADR-0011)', () => {
    it('maps its own timeout to a 504 and counts it', async () => {
      jest.useFakeTimers();
      createMock.mockImplementation(neverResolving);
      const pending = createGateway({ 'ai.openaiApiKey': 'k' })
        .complete({ caller: 'test', messages: 'hi' })
        .catch((e: unknown) => e);

      await jest.advanceTimersByTimeAsync(OutboundHttpConstants.TIMEOUT_MS[OutboundIntegration.Ai]);

      expect(await pending).toBeInstanceOf(GatewayTimeoutException);
      expect(await timeoutCount()).toBe(1);
    });

    it('maps the SDK per-attempt timeout to a 504 rather than an upstream error', async () => {
      createMock.mockRejectedValue(new APIConnectionTimeoutError());

      const error = await createGateway({ 'ai.openaiApiKey': 'k' })
        .complete({ caller: 'test', messages: 'hi' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GatewayTimeoutException);
      expect(await timeoutCount()).toBe(1);
    });

    it('propagates an inbound cancellation as a plain abort without counting a timeout', async () => {
      inbound = new AbortController();
      createMock.mockImplementation(neverResolving);
      const pending = createGateway({ 'ai.openaiApiKey': 'k' })
        .complete({ caller: 'test', messages: 'hi' })
        .catch((e: unknown) => e);

      inbound.abort();

      expect(await pending).toBeInstanceOf(APIUserAbortError);
      expect(await timeoutCount()).toBe(0);
    });
  });
});
