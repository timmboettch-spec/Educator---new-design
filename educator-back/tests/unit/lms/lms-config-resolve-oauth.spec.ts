import { NotFoundException } from '@nestjs/common';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsConfigStatus, LmsToolType } from 'src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/database/entities';

describe('LmsConfigService.resolveOAuthConfigForClient', () => {
  let service: LmsConfigService;
  let configRepo: {
    findOne: jest.Mock;
  };

  const activeStudentConfig = {
    id: 'cfg-student',
    schoolId: 'school-1',
    toolType: LmsToolType.STUDENT,
    clientId: 'student-client',
    status: LmsConfigStatus.ACTIVE,
  } as LmsSchoolConfig;

  beforeEach(() => {
    configRepo = {
      findOne: jest.fn(),
    };
    service = new LmsConfigService(
      configRepo as never,
      {} as never,
      { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
      { getAccessToken: jest.fn() } as never,
      { fetch: jest.fn() } as never,
    );
  });

  it('returns active config when clientId matches exactly', async () => {
    configRepo.findOne.mockResolvedValue(activeStudentConfig);

    const result = await service.resolveOAuthConfigForClient(
      'school-1',
      'student-client',
      LmsToolType.STUDENT,
    );

    expect(result).toBe(activeStudentConfig);
    expect(configRepo.findOne).toHaveBeenCalledWith({
      where: {
        schoolId: 'school-1',
        clientId: 'student-client',
        status: LmsConfigStatus.ACTIVE,
      },
    });
  });

  it('falls back to educator config and overrides clientId for Moodle shared tools', async () => {
    const educatorConfig = {
      id: 'cfg-educator',
      schoolId: 'school-1',
      toolType: LmsToolType.EDUCATOR,
      clientId: 'educator-client',
      status: LmsConfigStatus.ACTIVE,
    } as LmsSchoolConfig;

    configRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(educatorConfig);

    const result = await service.resolveOAuthConfigForClient(
      'school-1',
      'student-launch-client',
      LmsToolType.STUDENT,
    );

    expect(result.clientId).toBe('student-launch-client');
    expect(result.toolType).toBe(LmsToolType.EDUCATOR);
    expect(result.platformPrivateKeyPem).toBe(educatorConfig.platformPrivateKeyPem);
  });

  it('throws when stored clientId has no config and no fallback exists', async () => {
    configRepo.findOne.mockResolvedValue(null);

    await expect(
      service.resolveOAuthConfigForClient('school-1', 'unknown-client', LmsToolType.STUDENT),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('falls back to active student then educator config when clientId is omitted', async () => {
    configRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...activeStudentConfig,
      toolType: LmsToolType.EDUCATOR,
      clientId: 'educator-client',
    });

    const result = await service.resolveOAuthConfigForClient('school-1');

    expect(result.clientId).toBe('educator-client');
    expect(configRepo.findOne).toHaveBeenNthCalledWith(1, {
      where: {
        schoolId: 'school-1',
        toolType: LmsToolType.STUDENT,
        status: LmsConfigStatus.ACTIVE,
      },
    });
  });
});

describe('LmsConfigService.getActiveBySchoolId', () => {
  it('only matches ACTIVE rows, so PENDING/INACTIVE configs are not found', async () => {
    const configRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new LmsConfigService(
      configRepo as never,
      {} as never,
      { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
      { getAccessToken: jest.fn() } as never,
      { fetch: jest.fn() } as never,
    );

    await expect(service.getActiveBySchoolId('school-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(configRepo.findOne).toHaveBeenCalledWith({
      where: {
        schoolId: 'school-1',
        toolType: LmsToolType.EDUCATOR,
        status: LmsConfigStatus.ACTIVE,
      },
    });
  });
});
