import { ConfigService } from '@nestjs/config';
import { OutboundIntegration } from '../../../src/common/constants';
import { LoggerService } from '../../../src/common/services';
import { LtiAgsAdapter } from '../../../src/lms/adapters/lti-ags.adapter';
import { MoodleAdapter } from '../../../src/lms/adapters/moodle.adapter';
import { createOutboundHttpStub } from '../helpers/outbound-http.stub';

describe('MoodleAdapter outbound calls', () => {
  const originalFetch = global.fetch;
  let outbound: ReturnType<typeof createOutboundHttpStub>;
  let adapter: MoodleAdapter;

  beforeEach(() => {
    outbound = createOutboundHttpStub();
    adapter = new MoodleAdapter(
      { get: jest.fn().mockReturnValue('') } as unknown as ConfigService,
      {} as unknown as LtiAgsAdapter,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as LoggerService,
      outbound.client,
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: 7, fullname: 'Course 7', shortname: 'C7' }]),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches Moodle courses through the outbound client as the Moodle integration', async () => {
    await adapter.getMoodleCourses('https://moodle.example.com', 'ws-token');

    expect(outbound.integrations).toEqual([OutboundIntegration.Moodle]);
  });

  it('fetches NRPS rosters as the LMS integration', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: 'ctx', members: [] })),
      headers: new Headers(),
    });

    await adapter.fetchRoster('https://moodle.example.com/nrps', 'token');

    expect(outbound.integrations).toEqual([OutboundIntegration.Lms]);
  });
});
