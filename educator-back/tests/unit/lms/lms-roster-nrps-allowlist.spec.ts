import { BadRequestException } from '@nestjs/common';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import { LmsSchoolConfig } from '../../../src/database/entities';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { LmsAuthService } from '../../../src/lms/services/lms-auth.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { LoggerService } from '../../../src/common/services';

describe('LmsRosterService NRPS host allowlist', () => {
  const config = {
    id: 'cfg-1',
    schoolId: 'school-1',
    toolType: LmsToolType.EDUCATOR,
    lmsType: LmsType.MOODLE,
    issuer: 'https://moodle.example.edu',
    clientId: 'client-1',
    deploymentId: null,
    authEndpoint: 'https://moodle.example.edu/mod/lti/auth.php',
    tokenEndpoint: 'https://moodle.example.edu/mod/lti/token.php',
    jwksUrl: 'https://moodle.example.edu/mod/lti/certs.php',
    status: LmsConfigStatus.ACTIVE,
    sharePii: true,
    lmsBaseUrl: 'https://moodle.example.edu',
    lmsApiToken: null,
  } as LmsSchoolConfig;

  let getAccessToken: jest.Mock;
  let fetchRoster: jest.Mock;
  let service: LmsRosterService;

  beforeEach(() => {
    getAccessToken = jest.fn().mockResolvedValue('lms-access-token');
    fetchRoster = jest.fn().mockResolvedValue({
      context: { id: '1', label: null, title: null },
      members: [],
    });

    service = new LmsRosterService(
      { getAccessToken } as unknown as LmsAuthService,
      {
        getAdapter: () => ({ fetchRoster }),
        tryGetAdapter: () => ({ fetchRoster }),
        getDefaultAdapter: () => ({ fetchRoster }),
      } as unknown as LmsAdapterFactory,
      {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as unknown as LoggerService,
    );
  });

  it('fetches when NRPS URL host is allowlisted', async () => {
    const nrpsUrl = 'https://moodle.example.edu/mod/lti/services.php/1/memberships';
    await service.fetchRoster(config, nrpsUrl);
    expect(getAccessToken).toHaveBeenCalledWith(config);
    expect(fetchRoster).toHaveBeenCalledWith(nrpsUrl, 'lms-access-token');
  });

  it('rejects external NRPS URL before outbound fetch', async () => {
    await expect(service.fetchRoster(config, 'https://evil.example/steal')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchRoster).not.toHaveBeenCalled();
  });

  it('rejects private metadata URL on live endpoint without school config', async () => {
    await expect(
      service.fetchRosterForLiveEndpoint(null, 'https://169.254.169.254/latest', 'launch-token'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchRoster).not.toHaveBeenCalled();
  });

  it('does not fall back to platform WS when NRPS URL fail allowlist', async () => {
    const fetchRosterFromPlatformWs = jest.fn();
    service = new LmsRosterService(
      { getAccessToken } as unknown as LmsAuthService,
      {
        getAdapter: () => ({ fetchRoster }),
        tryGetAdapter: () => ({ fetchRoster, fetchRosterFromPlatformWs }),
        getDefaultAdapter: () => ({ fetchRoster }),
      } as unknown as LmsAdapterFactory,
      {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as unknown as LoggerService,
    );

    await expect(
      service.fetchRosterWithWsFallback(
        config,
        'https://evil.example/mod/lti/services.php/99/memberships',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchRoster).not.toHaveBeenCalled();
    expect(fetchRosterFromPlatformWs).not.toHaveBeenCalled();
  });
});
