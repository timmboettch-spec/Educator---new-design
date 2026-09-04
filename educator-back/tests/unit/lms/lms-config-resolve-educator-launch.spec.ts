import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsSchoolConfig } from '../../../src/lms/entity/lms-school-config.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { DataSource } from 'typeorm';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';

describe('LmsConfigService.resolveEducatorLaunchConfig', () => {
  let service: LmsConfigService;
  let findMock: jest.Mock;

  const ISSUER = 'https://moodle.example.com';
  const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
  const SCHOOL_B = '22222222-2222-2222-2222-222222222222';

  const config = (
    schoolId: string,
    clientId: string,
    issuer = ISSUER,
  ): LmsSchoolConfig =>
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
          provide: getRepositoryToken(LmsSchoolConfig),
          useValue: { find: findMock, findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Schools),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { manager: { findOne: jest.fn() } },
        },
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
    findMock.mockResolvedValueOnce([
      config(SCHOOL_A, 'client-a'),
      config(SCHOOL_B, 'client-b'),
    ]);

    const result = await service.resolveEducatorLaunchConfig(ISSUER, null, [SCHOOL_B]);

    expect(result?.schoolId).toBe(SCHOOL_B);
    expect(findMock).toHaveBeenCalledTimes(1);
  });
});
