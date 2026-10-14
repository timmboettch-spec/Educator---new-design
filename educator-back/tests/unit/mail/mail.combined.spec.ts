import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../../src/mail/mail.service';
import { MailRateLimiterService } from '../../../src/mail/mail-rate-limiter.service';
import { MailRetryService } from '../../../src/mail/mail-retry.service';
import { LoggerService } from '../../../src/common/services';

interface AcsPayload {
  senderAddress: string;
  content: { subject?: string; html?: string; plainText?: string };
  recipients: { to: { address: string }[] };
  attachments?: { name: string; contentType: string; contentInBase64: string }[];
}

const mockFns = {
  beginSend: jest.fn(),
  pollUntilDone: jest.fn().mockResolvedValue(undefined),
};

mockFns.beginSend.mockImplementation(() =>
  Promise.resolve({ pollUntilDone: mockFns.pollUntilDone }),
);

const mockGetToken = jest
  .fn()
  .mockResolvedValue({ token: 'fake-token', expiresOnTimestamp: Date.now() + 3600_000 });

jest.mock('@azure/identity', () => ({
  ManagedIdentityCredential: jest.fn().mockImplementation(() => ({ getToken: mockGetToken })),
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({ getToken: mockGetToken })),
}));

jest.mock('@azure/communication-email', () => ({
  EmailClient: jest.fn().mockImplementation(() => ({
    beginSend: (...args: unknown[]): unknown => mockFns.beginSend(...args),
  })),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('<p>{{message}}</p>'),
}));

const mockConfig = {
  getOrThrow: jest.fn((key: string): string => {
    const map: Record<string, string> = {
      'mail.from': 'noreply@test.com',
      'mail.acsEndpoint': 'https://acs-test.unitedstates.communication.azure.com',
    };
    return map[key];
  }),
  get: jest.fn((key: string): string | undefined => {
    const map: Record<string, string> = {
      'mail.azureClientId': 'client-id',
    };
    return map[key];
  }),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

// Always-allow by default so existing send-path tests below aren't affected
// by rate limiting — dedicated rate-limit behavior is covered separately.
const mockRateLimiter = { tryAcquire: jest.fn().mockResolvedValue({ allowed: true }) };
const mockMailRetryService = { enqueue: jest.fn().mockResolvedValue(undefined) };

const buildService = async (): Promise<MailService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MailService,
      { provide: ConfigService, useValue: mockConfig },
      { provide: LoggerService, useValue: mockLogger },
      { provide: MailRateLimiterService, useValue: mockRateLimiter },
      { provide: MailRetryService, useValue: mockMailRetryService },
    ],
  })
    .setLogger({
      log: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      verbose: () => undefined,
    })
    .compile();
  const service = module.get(MailService);
  service.onModuleInit();
  return service;
};

const lastPayload = (): AcsPayload => {
  const call = mockFns.beginSend.mock.calls[0] as unknown as [AcsPayload];
  return call[0];
};

describe('MailService (unit)', () => {
  let service: MailService;

  beforeEach(async () => {
    service = await buildService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockFns.beginSend.mockImplementation(() =>
      Promise.resolve({ pollUntilDone: mockFns.pollUntilDone }),
    );
    mockFns.pollUntilDone.mockResolvedValue(undefined);
  });

  it('sends mail with plain text', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'Hello' });
    expect(mockFns.beginSend).toHaveBeenCalledTimes(1);
    expect(lastPayload().content.plainText).toBe('Hello');
    expect(lastPayload().content.html).toBeUndefined();
  });

  it('sends mail with html', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', html: '<b>Hi</b>' });
    expect(lastPayload().content.html).toBe('<b>Hi</b>');
  });

  it('sends mail with template', async () => {
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      template: 'invite',
      context: { message: 'Welcome' },
    });
    expect(lastPayload().content.html).toBeDefined();
  });

  it('sends to multiple recipients from array', async () => {
    await service.sendMail({ to: ['a@test.com', 'b@test.com'], subject: 'Hi', text: 'x' });
    expect(lastPayload().recipients.to).toHaveLength(2);
  });

  it('sends to multiple recipients from comma-separated string', async () => {
    await service.sendMail({ to: 'a@test.com,b@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().recipients.to).toHaveLength(2);
  });

  it('uses custom from address when provided', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x', from: 'custom@test.com' });
    expect(lastPayload().senderAddress).toBe('custom@test.com');
  });

  it('uses defaultFrom when from is omitted', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().senderAddress).toBe('noreply@test.com');
  });

  it('includes Buffer attachment as base64', async () => {
    const buf = Buffer.from('pdf-content');
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      text: 'x',
      attachments: [{ filename: 'file.pdf', content: buf, contentType: 'application/pdf' }],
    });
    expect(lastPayload().attachments?.[0].contentInBase64).toBe(buf.toString('base64'));
  });

  it('includes string attachment as base64', async () => {
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      text: 'x',
      attachments: [{ filename: 'note.txt', content: 'hello' }],
    });
    expect(lastPayload().attachments?.[0].contentInBase64).toBe(
      Buffer.from('hello').toString('base64'),
    );
  });

  it('omits attachments key when no attachments', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().attachments).toBeUndefined();
  });

  it('throws when no recipients provided', async () => {
    await expect(service.sendMail({ to: '', subject: 'Hi', text: 'x' })).rejects.toThrow(
      'MailService.sendMail called with no recipients',
    );
  });

  it('throws when no content provided', async () => {
    await expect(service.sendMail({ to: 'a@test.com', subject: 'Hi' })).rejects.toThrow(
      'MailService.sendMail requires one of: template, html, or text',
    );
  });

  it('rethrows ACS Email errors', async () => {
    mockFns.beginSend.mockImplementationOnce(() => Promise.reject(new Error('ACS 401')));
    await expect(service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' })).rejects.toThrow(
      'ACS 401',
    );
  });
});

describe('MailService (regression)', () => {
  let service: MailService;

  beforeEach(async () => {
    service = await buildService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockFns.beginSend.mockImplementation(() =>
      Promise.resolve({ pollUntilDone: mockFns.pollUntilDone }),
    );
    mockFns.pollUntilDone.mockResolvedValue(undefined);
  });

  it('filters out blank entries from comma-separated to string', async () => {
    await service.sendMail({ to: 'a@test.com, , b@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().recipients.to).toHaveLength(2);
  });

  it('template is cached — readFile called only once for same template', async () => {
    const { readFile } = jest.requireMock<{ readFile: jest.Mock }>('fs/promises');
    await service.sendMail({
      to: 'a@test.com',
      subject: 'S',
      template: 'invite',
      context: { message: 'x' },
    });
    await service.sendMail({
      to: 'b@test.com',
      subject: 'S',
      template: 'invite',
      context: { message: 'y' },
    });
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('polls the send operation until done', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });
    expect(mockFns.pollUntilDone).toHaveBeenCalledTimes(1);
  });

  it('attachment defaults contentType to application/octet-stream', async () => {
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      text: 'x',
      attachments: [{ filename: 'f.bin', content: 'data' }],
    });
    expect(lastPayload().attachments?.[0].contentType).toBe('application/octet-stream');
  });

  it('empty array recipients throws no-recipients error', async () => {
    await expect(service.sendMail({ to: [], subject: 'Hi', text: 'x' })).rejects.toThrow(
      'MailService.sendMail called with no recipients',
    );
  });

  it('ACS error is re-thrown as the exact same object reference', async () => {
    const acsErr = new Error('Unauthorized');
    mockFns.beginSend.mockImplementationOnce(() => Promise.reject(acsErr));
    await expect(service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' })).rejects.toBe(
      acsErr,
    );
  });
});

describe('MailService (integration)', () => {
  let service: MailService;

  beforeEach(async () => {
    service = await buildService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockFns.beginSend.mockImplementation(() =>
      Promise.resolve({ pollUntilDone: mockFns.pollUntilDone }),
    );
    mockFns.pollUntilDone.mockResolvedValue(undefined);
  });

  it('module compiles and service is resolvable', () => {
    expect(service).toBeDefined();
  });

  it('full send flow: template → ACS Email API called with correct shape', async () => {
    await service.sendMail({
      to: 'user@test.com',
      subject: 'Welcome',
      template: 'invite',
      context: { message: 'Hello' },
    });

    const payload = lastPayload();
    expect(payload.senderAddress).toBe('noreply@test.com');
    expect(payload.content.subject).toBe('Welcome');
    expect(payload.content.html).toBeDefined();
    expect(payload.recipients.to[0].address).toBe('user@test.com');
    expect(mockFns.pollUntilDone).toHaveBeenCalledTimes(1);
  });

  it('full send flow: text → ACS Email API called with plainText content', async () => {
    await service.sendMail({ to: 'user@test.com', subject: 'Ping', text: 'pong' });
    expect(lastPayload().content.plainText).toBe('pong');
  });

  it('full send flow: with attachment — message includes attachments array', async () => {
    await service.sendMail({
      to: 'user@test.com',
      subject: 'Report',
      html: '<p>See attached</p>',
      attachments: [
        { filename: 'report.pdf', content: Buffer.from('data'), contentType: 'application/pdf' },
      ],
    });
    const attachments = lastPayload().attachments ?? [];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe('report.pdf');
    expect(attachments[0].contentType).toBe('application/pdf');
  });
});

describe('MailService (unit) — MAIL_PROVIDER=noop', () => {
  it('skips the real ACS call entirely and resolves', async () => {
    const noopConfig = {
      getOrThrow: mockConfig.getOrThrow,
      get: jest.fn((key: string): string | undefined => {
        if (key === 'mail.provider') return 'noop';
        return undefined;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: noopConfig },
        { provide: LoggerService, useValue: mockLogger },
        { provide: MailRateLimiterService, useValue: mockRateLimiter },
        { provide: MailRetryService, useValue: mockMailRetryService },
      ],
    }).compile();
    const service = module.get(MailService);
    service.onModuleInit();

    jest.clearAllMocks();
    await expect(
      service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' }),
    ).resolves.toBeUndefined();

    expect(mockFns.beginSend).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalled();
  });
});

describe('MailService (unit) — startup warm-up', () => {
  it('pre-fetches a token on init so the first real send is not the one paying for it', async () => {
    mockGetToken.mockClear();
    await buildService();
    // warmUp() is fire-and-forget from onModuleInit — flush microtasks.
    await new Promise(process.nextTick);
    expect(mockGetToken).toHaveBeenCalledWith('https://communication.azure.com//.default');
  });

  it('does not throw or block init when the warm-up token fetch fails', async () => {
    mockGetToken.mockRejectedValueOnce(new Error('IMDS unavailable'));
    await expect(buildService()).resolves.toBeDefined();
    await new Promise(process.nextTick);
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});

describe('MailService (unit) — rate limiting', () => {
  afterEach(() => {
    mockRateLimiter.tryAcquire.mockReset().mockResolvedValue({ allowed: true });
    mockMailRetryService.enqueue.mockClear();
    mockFns.beginSend.mockClear();
  });

  it('sendMail() defers to the retry queue instead of sending when rate-limited', async () => {
    mockRateLimiter.tryAcquire.mockResolvedValueOnce({ allowed: false, retryAfterMs: 5_000 });
    const service = await buildService();

    await expect(
      service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' }),
    ).resolves.toBeUndefined();

    expect(mockFns.beginSend).not.toHaveBeenCalled();
    expect(mockMailRetryService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com' }),
      'rate-limited',
      5_000,
    );
  });

  it('sendMail() sends normally when under the rate limit', async () => {
    const service = await buildService();

    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });

    expect(mockFns.beginSend).toHaveBeenCalledTimes(1);
    expect(mockMailRetryService.enqueue).not.toHaveBeenCalled();
  });

  it('sendMail() validates before consuming a rate-limit slot', async () => {
    const service = await buildService();

    await expect(service.sendMail({ to: [], subject: 'Hi', text: 'x' })).rejects.toThrow(
      'no recipients',
    );

    expect(mockRateLimiter.tryAcquire).not.toHaveBeenCalled();
  });

  it('trySendMail() reports still-rate-limited without enqueuing itself', async () => {
    mockRateLimiter.tryAcquire.mockResolvedValueOnce({ allowed: false, retryAfterMs: 2_000 });
    const service = await buildService();

    const result = await service.trySendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });

    expect(result).toEqual({ sent: false, retryAfterMs: 2_000 });
    expect(mockFns.beginSend).not.toHaveBeenCalled();
    expect(mockMailRetryService.enqueue).not.toHaveBeenCalled();
  });

  describe('synthetic API-test recipients', () => {
    it('still sends for real to a "+"-tagged sub-address of the test mailbox', async () => {
      const service = await buildService();

      await service.trySendMail({
        to: 'test+auth-ctrl-1788325434223@curionn.com',
        subject: 'Hi',
        text: 'x',
      });

      expect(mockFns.beginSend).toHaveBeenCalledTimes(1);
    });

    it('still sends for real to the bare test mailbox (no "+" tag)', async () => {
      const service = await buildService();

      await service.sendMail({ to: 'test@curionn.com', subject: 'Hi', text: 'x' });

      expect(mockFns.beginSend).toHaveBeenCalledTimes(1);
    });

    it('sends for real when recipients mix the bare test mailbox and a "+"-tagged address', async () => {
      const service = await buildService();

      await service.trySendMail({
        to: 'test@curionn.com,test+dup-123@curionn.com',
        subject: 'Hi',
        text: 'x',
      });

      expect(mockFns.beginSend).toHaveBeenCalledTimes(1);
    });

    it('skips entirely when recipients mix the bare test mailbox and a non-tagged synthetic literal', async () => {
      const service = await buildService();

      const result = await service.trySendMail({
        to: 'test@curionn.com,negative@curionn.com',
        subject: 'Hi',
        text: 'x',
      });

      expect(result).toEqual({ sent: true });
      expect(mockFns.beginSend).not.toHaveBeenCalled();
    });
  });
});
