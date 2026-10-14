import { AiConstants } from 'src/common/constants';
import { AiUpstreamException } from 'src/common/exceptions/ai.exception';
import { OpenAiGateway } from 'src/common/providers/ai/openai.gateway';
import { AbortSignalUtil } from 'src/common/utils/abort-signal.util';

// Uses the real OpenAI SDK against a stubbed `fetch` to pin its retry behaviour (ADR-0012).
describe('OpenAiGateway retries', () => {
  let fetchMock: jest.SpyInstance;

  const jsonResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      // Zero back-off keeps the test fast.
      headers: { 'content-type': 'application/json', 'retry-after-ms': '0' },
    });

  const okBody = {
    choices: [{ message: { role: 'assistant', content: 'hello' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  };

  const createGateway = (): OpenAiGateway =>
    new OpenAiGateway(
      { get: jest.fn((key: string) => (key === 'ai.openaiApiKey' ? 'k' : undefined)) } as never,
      {} as never,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
    );

  beforeEach(() => {
    jest.spyOn(AbortSignalUtil, 'getAbortSignal').mockReturnValue(undefined);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([429, 500, 503])('retries a %s and succeeds on a later attempt', async (status) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(status, { error: { message: 'busy' } }))
      .mockResolvedValueOnce(jsonResponse(status, { error: { message: 'busy' } }))
      .mockResolvedValueOnce(jsonResponse(200, okBody));

    await expect(createGateway().complete({ caller: 'test', messages: 'hi' })).resolves.toBe(
      'hello',
    );
    expect(fetchMock).toHaveBeenCalledTimes(AiConstants.MAX_RETRIES + 1);
  });

  it('gives up after the configured retries and raises AiUpstreamException', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(503, { error: { message: 'down' } })),
    );

    await expect(
      createGateway().complete({ caller: 'test', messages: 'hi' }),
    ).rejects.toBeInstanceOf(AiUpstreamException);
    expect(fetchMock).toHaveBeenCalledTimes(AiConstants.MAX_RETRIES + 1);
  });

  it('does not retry a 400', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: 'bad' } }));

    await expect(
      createGateway().complete({ caller: 'test', messages: 'hi' }),
    ).rejects.toBeInstanceOf(AiUpstreamException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
