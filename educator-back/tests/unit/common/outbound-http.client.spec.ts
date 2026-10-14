import { GatewayTimeoutException } from '@nestjs/common';
import axios, { AxiosError, CanceledError } from 'axios';
import { OutboundIntegration } from 'src/common/constants';
import { OutboundHttpClient } from 'src/common/services';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { outboundHttpTimeoutCounter } from 'src/common/metrics/app.metrics';
import { AbortSignalUtil } from 'src/common/utils/abort-signal.util';

const TIMEOUTS: Record<string, number> = {
  'app.apiTimeoutMs': 60_000,
};

const timeoutCount = async (integration: string): Promise<number> => {
  const { values } = await outboundHttpTimeoutCounter.get();
  return values.find((v) => v.labels.integration === integration)?.value ?? 0;
};

describe('OutboundHttpClient', () => {
  let client: OutboundHttpClient;
  let logger: { warn: jest.Mock };
  let configGet: jest.Mock;
  let inbound: AbortController | undefined;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  const neverResolvingFetch = (_url: unknown, init?: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });

  beforeEach(() => {
    jest.useFakeTimers();
    logger = { warn: jest.fn() };
    configGet = jest.fn((key: string) => TIMEOUTS[key]);
    inbound = undefined;
    jest.spyOn(AbortSignalUtil, 'getAbortSignal').mockImplementation(() => inbound?.signal);
    client = new OutboundHttpClient({ get: configGet } as never, logger as never, {} as never);
    fetchMock = jest.fn(neverResolvingFetch);
    global.fetch = fetchMock as unknown as typeof fetch;
    outboundHttpTimeoutCounter.reset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('passes a successful response through unchanged', async () => {
    const response = { ok: true, status: 200 } as Response;
    fetchMock.mockResolvedValue(response);

    await expect(client.fetch(OutboundIntegration.Lms, 'https://lms.test/x')).resolves.toBe(
      response,
    );
  });

  it('throws a 504 with the UPSTREAM_TIMEOUT key, logs and counts when the own timeout fires', async () => {
    const promise = client.fetch(OutboundIntegration.Lms, 'https://lms.test/x');
    const assertion = expect(promise).rejects.toMatchObject({
      constructor: GatewayTimeoutException,
      message: ERROR_MSG.COMMON.UPSTREAM_TIMEOUT(OutboundIntegration.Lms),
    });

    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;

    expect(await timeoutCount('lms')).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('lms.test'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('15000ms'));
  });

  it('uses the constant timeout of the requested integration', async () => {
    const promise = client.fetch(OutboundIntegration.Moodle, 'https://moodle.test/x');
    const assertion = expect(promise).rejects.toBeInstanceOf(GatewayTimeoutException);

    await jest.advanceTimersByTimeAsync(14_999);
    expect(await timeoutCount('moodle')).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    await assertion;
    expect(await timeoutCount('moodle')).toBe(1);
  });

  it('rethrows a plain abort without counting when the inbound request is cancelled', async () => {
    inbound = new AbortController();
    const promise = client.fetch(OutboundIntegration.Lms, 'https://lms.test/x');
    const cancelled = new Error('Request timeout');
    inbound.abort(cancelled);

    await expect(promise).rejects.toBe(cancelled);
    expect(await timeoutCount('lms')).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rethrows a plain abort without counting when the caller signal is aborted', async () => {
    const caller = new AbortController();
    const promise = client.fetch(OutboundIntegration.Lms, 'https://lms.test/x', {
      signal: caller.signal,
    });
    const cancelled = new Error('caller cancelled');
    caller.abort(cancelled);

    await expect(promise).rejects.toBe(cancelled);
    expect(await timeoutCount('lms')).toBe(0);
  });

  it('still times out on its own when there is no request context', async () => {
    inbound = undefined;
    const promise = client.fetch(OutboundIntegration.Google, 'https://google.test/x');
    const assertion = expect(promise).rejects.toBeInstanceOf(GatewayTimeoutException);

    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(await timeoutCount('google')).toBe(1);
  });

  describe('onModuleInit', () => {
    it('warns for each outbound timeout not lower than the API timeout', () => {
      configGet.mockImplementation((key: string) =>
        key === 'app.apiTimeoutMs' ? 45_000 : TIMEOUTS[key],
      );

      client.onModuleInit();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"ai"'));
    });

    it('does not warn when all timeouts are below the API timeout', () => {
      client.onModuleInit();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('post', () => {
    let adapter: jest.Mock;
    const originalAdapter = axios.defaults.adapter;

    beforeEach(() => {
      adapter = jest.fn();
      axios.defaults.adapter = adapter;
    });

    afterEach(() => {
      axios.defaults.adapter = originalAdapter;
    });

    it('applies the integration timeout and the inbound signal to the request', async () => {
      inbound = new AbortController();
      adapter.mockImplementation((config) => Promise.resolve({ data: 'ok', status: 200, config }));

      const response = await client.post(OutboundIntegration.Ai, 'https://api.openai.com/v1', {});

      expect(response.data).toBe('ok');
      const config = adapter.mock.calls[0][0];
      expect(config.timeout).toBe(45_000);
      expect(config.signal).toBe(inbound.signal);
    });

    it.each(['inbound', 'caller'] as const)(
      'combines the caller and inbound signals, so the %s abort cancels the request',
      async (source) => {
        inbound = new AbortController();
        const caller = new AbortController();
        adapter.mockImplementation((config) =>
          Promise.resolve({ data: 'ok', status: 200, config }),
        );

        await client.post(
          OutboundIntegration.Ai,
          'https://api.openai.com/v1',
          {},
          {
            signal: caller.signal,
          },
        );

        const { signal } = adapter.mock.calls[0][0] as { signal: AbortSignal };
        expect(signal.aborted).toBe(false);
        (source === 'inbound' ? inbound : caller).abort();
        expect(signal.aborted).toBe(true);
      },
    );

    it('maps an axios timeout to a 504, logs and counts it for the integration', async () => {
      adapter.mockImplementation((config) =>
        Promise.reject(new AxiosError('timeout', AxiosError.ECONNABORTED, config)),
      );

      const error = await client
        .post(OutboundIntegration.Ai, 'https://api.openai.com/v1', {})
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GatewayTimeoutException);
      expect((error as GatewayTimeoutException).message).toBe(
        ERROR_MSG.COMMON.UPSTREAM_TIMEOUT(OutboundIntegration.Ai),
      );
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('api.openai.com'));
      expect(await timeoutCount(OutboundIntegration.Ai)).toBe(1);
    });

    it('does not count an inbound cancellation as an upstream timeout', async () => {
      adapter.mockImplementation(() => Promise.reject(new CanceledError('canceled')));

      await expect(
        client.post(OutboundIntegration.Ai, 'https://api.openai.com/v1', {}),
      ).rejects.toBeInstanceOf(CanceledError);

      expect(await timeoutCount(OutboundIntegration.Ai)).toBe(0);
    });
  });
});
