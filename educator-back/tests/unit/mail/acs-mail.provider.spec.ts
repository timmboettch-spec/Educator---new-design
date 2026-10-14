import { LoggerService } from '../../../src/common/services';

const mockFns = {
  beginSend: jest.fn(),
};

jest.mock('@azure/identity', () => ({
  ManagedIdentityCredential: jest.fn().mockImplementation(() => ({ getToken: jest.fn() })),
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({ getToken: jest.fn() })),
}));

jest.mock('@azure/communication-email', () => ({
  EmailClient: jest.fn().mockImplementation(() => ({
    beginSend: (...args: unknown[]): unknown => mockFns.beginSend(...args),
  })),
}));

import { AcsMailProvider } from '../../../src/mail/providers/acs-mail.provider';

function makeLogger(): jest.Mocked<LoggerService> {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as jest.Mocked<LoggerService>;
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const params = {
  from: 'no-reply@dev.rwai.curionn.com',
  content: { subject: 'Test', html: '<p>hi</p>' },
  recipients: [{ address: 'someone@example.com' }],
};

describe('AcsMailProvider.send — poll timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFns.beginSend.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves normally when ACS finishes before the poll timeout', async () => {
    const logger = makeLogger();
    const provider = new AcsMailProvider('https://acs.example.com', undefined, logger, 20_000);
    mockFns.beginSend.mockResolvedValue({ pollUntilDone: () => Promise.resolve(undefined) });

    await expect(provider.send(params)).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('propagates a fast ACS failure instead of swallowing it', async () => {
    const logger = makeLogger();
    const provider = new AcsMailProvider('https://acs.example.com', undefined, logger, 20_000);
    mockFns.beginSend.mockResolvedValue({
      pollUntilDone: () => Promise.reject(new Error('EmailDroppedAllRecipientsSuppressed')),
    });

    await expect(provider.send(params)).rejects.toThrow('EmailDroppedAllRecipientsSuppressed');
    expect(logger.error).toHaveBeenCalled();
  });

  it('stops blocking once sendPollTimeoutMs elapses, instead of hanging until the caller times out', async () => {
    const logger = makeLogger();
    const provider = new AcsMailProvider('https://acs.example.com', undefined, logger, 20_000);
    const stuckPoll = deferred<void>();
    mockFns.beginSend.mockResolvedValue({ pollUntilDone: () => stuckPoll.promise });

    const sendPromise = provider.send(params);

    await jest.advanceTimersByTimeAsync(20_000);
    await expect(sendPromise).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('still processing after 20000ms'));

    // Backgrounded poll eventually failing must not crash the process (unhandled rejection).
    stuckPoll.reject(new Error('EmailDroppedAllRecipientsSuppressed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('backgrounded poll'));
  });
});
