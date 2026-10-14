import { LtiAgsAdapter } from '../../../src/lms/adapters/lti-ags.adapter';
import { LmsSchoolConfig } from '../../../src/database/entities';
import { LoggerService } from '../../../src/common/services';
import { OutboundIntegration } from '../../../src/common/constants';
import { createOutboundHttpStub } from '../helpers/outbound-http.stub';

describe('LtiAgsAdapter', () => {
  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  } as unknown as LoggerService;
  const outbound = createOutboundHttpStub();
  const adapter = new LtiAgsAdapter(mockLogger, outbound.client);
  const config = { schoolId: 'school-1' } as LmsSchoolConfig;
  const lineItemUrl = 'https://lms.example.com/mod/lti/services.php/2/lineitems/42?type_id=1';
  const userId = 'user-123';
  const accessToken = 'ags-token';

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs AGS score to lineitem/scores with IMS headers', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '',
    });

    await adapter.sendGrade(config, lineItemUrl, userId, 87.5, accessToken, 100);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outbound.integrations).toContain(OutboundIntegration.Lms);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://lms.example.com/mod/lti/services.php/2/lineitems/42/scores?type_id=1',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer ags-token',
      'Content-Type': 'application/vnd.ims.lis.v1.score+json',
    });

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      scoreGiven: 87.5,
      scoreMaximum: 100,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
      userId: 'user-123',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('forwards scoreMaximum to the AGS payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '',
    });

    await adapter.sendGrade(config, lineItemUrl, userId, 40, accessToken, 50);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.scoreGiven).toBe(40);
    expect(body.scoreMaximum).toBe(50);
  });

  it('throws when AGS POST fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    });

    await expect(adapter.sendGrade(config, lineItemUrl, userId, 50, accessToken)).rejects.toThrow(
      'LTI AGS score POST failed (403): forbidden',
    );
  });

  it('includes Canvas basic_lti_launch submission extension when launch URL provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '',
    });

    await adapter.sendGrade(config, lineItemUrl, userId, 90, accessToken, 100, {
      canvasSubmissionLaunchUrl: 'https://api.example.com/api/lti/launch',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body['https://canvas.instructure.com/lti/submission']).toEqual({
      new_submission: true,
      submission_type: 'basic_lti_launch',
      submission_data: 'https://api.example.com/api/lti/launch',
    });
  });
});
