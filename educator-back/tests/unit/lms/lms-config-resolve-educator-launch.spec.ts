import { OutboundHttpClient } from 'src/common/services';
import { Test, TestingModule } from '@nestjs/testing';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsAuthService } from '../../../src/lms/services/lms-auth.service';
import { LmsSchoolConfig } from '../../../src/database/entities';
import { LMS_SCHOOL_CONFIG_REPOSITORY, SCHOOLS_REPOSITORY } from '../../../src/database/tokens';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import { LoggerService } from '../../../src/common/services';

describe('LmsConfigService.resolveEducatorLaunchConfig', () => {
  let service: LmsConfigService;
  let findMock: jest.Mock;

  const ISSUER = 'https://moodle.example.com';
  const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
  const SCHOOL_B = '22222222-2222-2222-2222-222222222222';

  const config = (schoolId: string, clientId: string, issuer = ISSUER): LmsSchoolConfig =>
    ({
      id: `cfg-${schoolId}`,
      schoolId,
      clientId,
      issuer,
      toolType: LmsToolType.EDUCATOR,
      lmsType: LmsType.MOODLE,
      status: LmsConfigStatus.ACTIVE,
    }) as LmsSchoolConfig;

  beforeEach(async () => {
    findMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LmsConfigService,
        {
          provide: LMS_SCHOOL_CONFIG_REPOSITORY,
          useValue: { find: findMock, findOne: jest.fn() },
        },
        {
          provide: SCHOOLS_REPOSITORY,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
        {
          provide: LmsAuthService,
          useValue: { getAccessToken: jest.fn() },
        },
        { provide: OutboundHttpClient, useValue: { fetch: jest.fn() } },
      ],
    }).compile();

    service = module.get(LmsConfigService);
  });

  it('returns matching school when clientId and educator schools align', async () => {
    findMock.mockResolvedValueOnce([config(SCHOOL_B, 'client-b')]);

    const result = await service.resolveEducatorLaunchConfig(ISSUER, 'client-b', [SCHOOL_B]);

    expect(result?.schoolId).toBe(SCHOOL_B);
    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when clientId matches but educator belongs to a different school', async () => {
    findMock.mockResolvedValueOnce([config(SCHOOL_A, 'client-a')]);

    const result = await service.resolveEducatorLaunchConfig(ISSUER, 'client-a', [SCHOOL_B]);

    expect(result).toBeNull();
    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to issuer-only lookup when clientId was provided', async () => {
    findMock.mockResolvedValueOnce([config(SCHOOL_A, 'client-a')]);

    const result = await service.resolveEducatorLaunchConfig(ISSUER, 'client-a', [SCHOOL_B]);

    expect(result).toBeNull();
    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it('uses issuer-only lookup when clientId is omitted', async () => {
    findMock.mockResolvedValueOnce([config(SCHOOL_A, 'client-a'), config(SCHOOL_B, 'client-b')]);

    const result = await service.resolveEducatorLaunchConfig(ISSUER, null, [SCHOOL_B]);

    expect(result?.schoolId).toBe(SCHOOL_B);
    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it('picks the educator school on a shared tool', async () => {
    findMock.mockResolvedValueOnce([config(SCHOOL_A, 'shared'), config(SCHOOL_B, 'shared')]);

    const result = await service.resolveEducatorLaunchConfig(ISSUER, 'shared', [SCHOOL_B]);

    expect(result?.schoolId).toBe(SCHOOL_B);
  });
});

describe('LmsConfigService.listEducatorLaunchConfigs', () => {
  it('returns every school sharing the tool registration', async () => {
    const findMock = jest.fn().mockResolvedValueOnce([
      { schoolId: 'school-a', clientId: 'shared', issuer: 'https://moodle.example.com' },
      { schoolId: 'school-b', clientId: 'shared', issuer: 'https://moodle.example.com' },
    ]);
    const service = new LmsConfigService({ find: findMock } as never, {} as never, {} as never);

    const result = await service.listEducatorLaunchConfigs('https://moodle.example.com', 'shared');

    expect(result.map((c) => c.schoolId)).toEqual(['school-a', 'school-b']);
    expect(findMock).toHaveBeenCalledWith({
      where: { clientId: 'shared', toolType: LmsToolType.EDUCATOR, status: LmsConfigStatus.ACTIVE },
    });
  });
});
