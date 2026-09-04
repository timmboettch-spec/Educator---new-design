import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../../src/mail/mail.service';

interface GraphPayload {
  message: {
    subject?: string;
    body: { contentType: string; content: string };
    toRecipients: { emailAddress: { address: string } }[];
    attachments?: { name: string; contentType: string; contentBytes: string }[];
  };
  saveToSentItems: boolean;
}

const mockFns = {
  post: jest.fn().mockResolvedValue(undefined),
  api: jest.fn(),
};

mockFns.api.mockReturnValue({ post: mockFns.post });

jest.mock('@azure/identity', () => ({
  ClientSecretCredential: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    initWithMiddleware: jest.fn().mockReturnValue({
      api: (...args: unknown[]): unknown => mockFns.api(...args),
    }),
  },
}));

jest.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
  TokenCredentialAuthenticationProvider: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('<p>{{message}}</p>'),
}));

const mockConfig = {
  getOrThrow: jest.fn((key: string): string => {
    const map: Record<string, string> = {
      GRAPH_TENANT_ID: 'tenant-id',
      GRAPH_CLIENT_ID: 'client-id',
      GRAPH_CLIENT_SECRET: 'client-secret',
      MAIL_FROM: 'noreply@test.com',
    };
    return map[key];
  }),
};

const buildService = async (): Promise<MailService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [MailService, { provide: ConfigService, useValue: mockConfig }],
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

const lastPayload = (): GraphPayload => {
  const call = mockFns.post.mock.calls[0] as unknown as [GraphPayload];
  return call[0];
};

describe('MailService (unit)', () => {
  let service: MailService;

  beforeEach(async () => {
    service = await buildService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockFns.post.mockResolvedValue(undefined);
  });

  it('sends mail with plain text', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'Hello' });
    expect(mockFns.post).toHaveBeenCalledTimes(1);
    expect(lastPayload().message.body).toEqual({ contentType: 'Text', content: 'Hello' });
  });

  it('sends mail with html', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', html: '<b>Hi</b>' });
    expect(lastPayload().message.body).toEqual({ contentType: 'HTML', content: '<b>Hi</b>' });
  });

  it('sends mail with template', async () => {
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      template: 'invite',
      context: { message: 'Welcome' },
    });
    expect(lastPayload().message.body.contentType).toBe('HTML');
  });

  it('sends to multiple recipients from array', async () => {
    await service.sendMail({ to: ['a@test.com', 'b@test.com'], subject: 'Hi', text: 'x' });
    expect(lastPayload().message.toRecipients).toHaveLength(2);
  });

  it('sends to multiple recipients from comma-separated string', async () => {
    await service.sendMail({ to: 'a@test.com,b@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().message.toRecipients).toHaveLength(2);
  });

  it('uses custom from address when provided', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x', from: 'custom@test.com' });
    expect(mockFns.api).toHaveBeenCalledWith(
      `/users/${encodeURIComponent('custom@test.com')}/sendMail`,
    );
  });

  it('uses defaultFrom when from is omitted', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });
    expect(mockFns.api).toHaveBeenCalledWith(
      `/users/${encodeURIComponent('noreply@test.com')}/sendMail`,
    );
  });

  it('includes Buffer attachment as base64', async () => {
    const buf = Buffer.from('pdf-content');
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      text: 'x',
      attachments: [{ filename: 'file.pdf', content: buf, contentType: 'application/pdf' }],
    });
    expect(lastPayload().message.attachments?.[0].contentBytes).toBe(buf.toString('base64'));
  });

  it('includes string attachment as base64', async () => {
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      text: 'x',
      attachments: [{ filename: 'note.txt', content: 'hello' }],
    });
    expect(lastPayload().message.attachments?.[0].contentBytes).toBe(
      Buffer.from('hello').toString('base64'),
    );
  });

  it('omits attachments key when no attachments', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().message.attachments).toBeUndefined();
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

  it('rethrows Graph API errors', async () => {
    mockFns.post.mockRejectedValueOnce(new Error('Graph 401'));
    await expect(service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' })).rejects.toThrow(
      'Graph 401',
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
    mockFns.post.mockResolvedValue(undefined);
  });

  it('filters out blank entries from comma-separated to string', async () => {
    await service.sendMail({ to: 'a@test.com, , b@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().message.toRecipients).toHaveLength(2);
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

  it('saveToSentItems is always false', async () => {
    await service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' });
    expect(lastPayload().saveToSentItems).toBe(false);
  });

  it('attachment defaults contentType to application/octet-stream', async () => {
    await service.sendMail({
      to: 'a@test.com',
      subject: 'Hi',
      text: 'x',
      attachments: [{ filename: 'f.bin', content: 'data' }],
    });
    expect(lastPayload().message.attachments?.[0].contentType).toBe('application/octet-stream');
  });

  it('empty array recipients throws no-recipients error', async () => {
    await expect(service.sendMail({ to: [], subject: 'Hi', text: 'x' })).rejects.toThrow(
      'MailService.sendMail called with no recipients',
    );
  });

  it('Graph error is re-thrown as the exact same object reference', async () => {
    const graphErr = new Error('Unauthorized');
    mockFns.post.mockRejectedValueOnce(graphErr);
    await expect(service.sendMail({ to: 'a@test.com', subject: 'Hi', text: 'x' })).rejects.toBe(
      graphErr,
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
    mockFns.post.mockResolvedValue(undefined);
  });

  it('module compiles and service is resolvable', () => {
    expect(service).toBeDefined();
  });

  it('full send flow: template → Graph API called with correct shape', async () => {
    await service.sendMail({
      to: 'user@test.com',
      subject: 'Welcome',
      template: 'invite',
      context: { message: 'Hello' },
    });

    expect(mockFns.api).toHaveBeenCalledWith(
      `/users/${encodeURIComponent('noreply@test.com')}/sendMail`,
    );

    const payload = lastPayload();
    expect(payload.message.subject).toBe('Welcome');
    expect(payload.message.body.contentType).toBe('HTML');
    const recipient = payload.message.toRecipients[0];
    expect(recipient.emailAddress.address).toBe('user@test.com');
    expect(payload.saveToSentItems).toBe(false);
  });

  it('full send flow: text → Graph API called with Text contentType', async () => {
    await service.sendMail({ to: 'user@test.com', subject: 'Ping', text: 'pong' });
    expect(lastPayload().message.body).toEqual({ contentType: 'Text', content: 'pong' });
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
    const attachments = lastPayload().message.attachments ?? [];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe('report.pdf');
    expect(attachments[0].contentType).toBe('application/pdf');
  });
});
