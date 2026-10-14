import { createOutboundHttpStub } from '../helpers/outbound-http.stub';
import { ConfigService } from '@nestjs/config';
import { CanvasAdapter } from '../../../src/lms/adapters/canvas.adapter';
import { LtiAgsAdapter } from '../../../src/lms/adapters/lti-ags.adapter';
import { MoodleAdapter } from '../../../src/lms/adapters/moodle.adapter';
import { LoggerService } from '../../../src/common/services';

const NRPS_URL = 'https://canvas.instructure.com/api/lti/courses/123/names_and_roles';
const NRPS_PAGE_TWO = `${NRPS_URL}?page=2`;
const NRPS_PAGE_THREE = `${NRPS_URL}?page=3`;

const learner = (id: string): Record<string, unknown> => ({
  status: 'Active',
  name: `Student ${id}`,
  email: `student${id}@school.edu`,
  user_id: id,
  roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
});

const page = (
  members: Array<Record<string, unknown>>,
  nextUrl?: string,
): { ok: true; text: () => Promise<string>; headers: Headers } => ({
  ok: true,
  text: async () =>
    JSON.stringify({ context: { id: '123', label: 'BIO101', title: 'Bio' }, members }),
  headers: new Headers(nextUrl ? { link: `<${nextUrl}>; rel="next"` } : {}),
});

const loggerStub = (): LoggerService =>
  ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }) as unknown as LoggerService;

describe('NRPS roster pagination', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  describe('CanvasAdapter', () => {
    let adapter: CanvasAdapter;

    beforeEach(() => {
      adapter = new CanvasAdapter(createOutboundHttpStub().client);
      global.fetch = jest.fn();
    });

    it('UNIT: follows rel="next" and returns members from every page', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(page([learner('1'), learner('2')], NRPS_PAGE_TWO))
        .mockResolvedValueOnce(page([learner('3'), learner('4')], NRPS_PAGE_THREE))
        .mockResolvedValueOnce(page([learner('5')]));

      const roster = await adapter.fetchRoster(NRPS_URL, 'token');

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(roster.members.map((m) => m.userId)).toEqual(['1', '2', '3', '4', '5']);
      expect(roster.context.id).toBe('123');
    });

    it('UNIT: makes one request when there is no next page', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(page([learner('1')]));

      const roster = await adapter.fetchRoster(NRPS_URL, 'token');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(roster.members).toHaveLength(1);
    });

    it('UNIT: resolves a relative next link against the current page URL', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(page([learner('1')], '/api/lti/courses/123/names_and_roles?page=2'))
        .mockResolvedValueOnce(page([learner('2')]));

      const roster = await adapter.fetchRoster(NRPS_URL, 'token');

      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(NRPS_PAGE_TWO);
      expect(roster.members.map((m) => m.userId)).toEqual(['1', '2']);
    });

    it('UNIT: stops instead of looping when the next link repeats a visited page', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(page([learner('1')], NRPS_PAGE_TWO))
        .mockResolvedValueOnce(page([learner('2')], NRPS_URL));

      const roster = await adapter.fetchRoster(NRPS_URL, 'token');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(roster.members.map((m) => m.userId)).toEqual(['1', '2']);
    });

    it('UNIT: propagates a non-OK status from a later page', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(page([learner('1')], NRPS_PAGE_TWO))
        .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'forbidden' });

      await expect(adapter.fetchRoster(NRPS_URL, 'token')).rejects.toThrow(
        'Canvas NRPS failed: 403 forbidden',
      );
    });

    it('UNIT: tolerates a response with no headers object', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ context: { id: '123' }, members: [learner('1')] }),
      });

      const roster = await adapter.fetchRoster(NRPS_URL, 'token');

      expect(roster.members).toHaveLength(1);
    });
  });

  describe('MoodleAdapter', () => {
    let adapter: MoodleAdapter;

    beforeEach(() => {
      adapter = new MoodleAdapter(
        { get: jest.fn().mockReturnValue('') } as unknown as ConfigService,
        {} as unknown as LtiAgsAdapter,
        loggerStub(),
        createOutboundHttpStub().client,
      );
      global.fetch = jest.fn();
    });

    it('UNIT: follows rel="next" and returns members from every page', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(page([learner('10'), learner('11')], NRPS_PAGE_TWO))
        .mockResolvedValueOnce(page([learner('12')]));

      const roster = await adapter.fetchRoster(NRPS_URL, 'token');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(roster.members.map((m) => m.userId)).toEqual(['10', '11', '12']);
    });
  });
});
