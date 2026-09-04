import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsSchoolConfig } from '../../../src/lms/entity/lms-school-config.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { LmsConfigStatus, LmsToolType } from '../../../src/common/enums/lms.enum';

describe('LmsConfigService.listStudentLaunchConfigs', () => {
  let service: LmsConfigService;
  let configRepo: jest.Mocked<Repository<LmsSchoolConfig>>;

  const buildConfig = (overrides?: Partial<LmsSchoolConfig>): LmsSchoolConfig =>
    ({
      id: 'cfg-1',
      schoolId: 'school-a',
      toolType: LmsToolType.STUDENT,
      issuer: 'https://moodle.test.edu',
      clientId: 'client-123',
      deploymentId: null,
      status: LmsConfigStatus.ACTIVE,
      lmsBaseUrl: 'https://moodle.test.edu',
      ...overrides,
    }) as LmsSchoolConfig;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LmsConfigService,
        {
          provide: getRepositoryToken(LmsSchoolConfig),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Schools),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            manager: {
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<LmsConfigService>(LmsConfigService);
    configRepo = module.get(getRepositoryToken(LmsSchoolConfig)) as jest.Mocked<
      Repository<LmsSchoolConfig>
    >;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when client ID is provided', () => {
    it('should return student-tool configs matching clientId and issuer', async () => {
      const studentConfig = buildConfig({ toolType: LmsToolType.STUDENT, schoolId: 'school-a' });
      configRepo.find.mockResolvedValue([studentConfig]);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'client-123',
      );

      expect(configRepo.find).toHaveBeenCalledWith({
        where: {
          clientId: 'client-123',
          toolType: LmsToolType.STUDENT,
          status: LmsConfigStatus.ACTIVE,
        },
      });
      expect(result).toEqual([studentConfig]);
    });

    it('should return multiple student-tool configs when tool is shared across schools', async () => {
      const configs = [
        buildConfig({ id: 'cfg-a', schoolId: 'school-a' }),
        buildConfig({ id: 'cfg-b', schoolId: 'school-b' }),
      ];
      configRepo.find.mockResolvedValue(configs);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'client-123',
      );

      expect(result).toEqual(configs);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when clientId has no issuer matches (no issuer-only fallback)', async () => {
      configRepo.find.mockResolvedValue([]);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'client-123',
      );

      expect(configRepo.find).toHaveBeenCalledTimes(2);
      expect(configRepo.find).toHaveBeenNthCalledWith(1, {
        where: {
          clientId: 'client-123',
          toolType: LmsToolType.STUDENT,
          status: LmsConfigStatus.ACTIVE,
        },
      });
      expect(configRepo.find).toHaveBeenNthCalledWith(2, {
        where: {
          clientId: 'client-123',
          toolType: LmsToolType.EDUCATOR,
          status: LmsConfigStatus.ACTIVE,
        },
      });
      expect(result).toEqual([]);
    });

    it('should not filter issuer when all configs match on clientId', async () => {
      const config1 = buildConfig({
        issuer: 'https://moodle.test.edu',
        clientId: 'client-123',
      });
      const config2 = buildConfig({
        id: 'cfg-2',
        issuer: 'https://moodle.test.edu',
        clientId: 'client-123',
        schoolId: 'school-b',
      });
      configRepo.find.mockResolvedValue([config1, config2]);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'client-123',
      );

      expect(result).toHaveLength(2);
      expect(result).toEqual([config1, config2]);
    });

    it('should normalize issuer trailing slash when matching', async () => {
      const config = buildConfig({ issuer: 'https://moodle.test.edu/' });
      configRepo.find.mockResolvedValue([config]);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'client-123',
      );

      expect(result).toEqual([config]);
    });

    it('should match against lmsBaseUrl when issuer does not match', async () => {
      const config = buildConfig({
        issuer: 'https://issuer.test.edu',
        lmsBaseUrl: 'https://moodle.test.edu',
      });
      configRepo.find.mockResolvedValue([config]);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'client-123',
      );

      expect(result).toEqual([config]);
    });
  });

  describe('when client ID is not provided', () => {
    it('should return configs matching issuer only', async () => {
      const config = buildConfig();
      configRepo.find.mockResolvedValue([config]);

      const result = await service.listStudentLaunchConfigs('https://moodle.test.edu');

      expect(configRepo.find).toHaveBeenCalledWith({
        where: [
          {
            issuer: 'https://moodle.test.edu',
            toolType: LmsToolType.STUDENT,
            status: LmsConfigStatus.ACTIVE,
          },
          {
            issuer: 'https://moodle.test.edu/',
            toolType: LmsToolType.STUDENT,
            status: LmsConfigStatus.ACTIVE,
          },
        ],
      });
      expect(result).toEqual([config]);
    });

    it('should fallback to educator configs when no student configs found by issuer', async () => {
      const educatorConfig = buildConfig({ toolType: LmsToolType.EDUCATOR });
      configRepo.find
        .mockResolvedValueOnce([]) // STUDENT toolType
        .mockResolvedValueOnce([educatorConfig]); // EDUCATOR toolType

      const result = await service.listStudentLaunchConfigs('https://moodle.test.edu');

      expect(configRepo.find).toHaveBeenCalledTimes(2);
      expect(result).toEqual([educatorConfig]);
    });

    it('should return empty array when issuer is empty string', async () => {
      const result = await service.listStudentLaunchConfigs('');

      expect(configRepo.find).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return empty array when issuer is whitespace only', async () => {
      const result = await service.listStudentLaunchConfigs('   ');

      expect(configRepo.find).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('deployment filtering', () => {
    it('accepts any token deployment when school config has none', () => {
      const config = buildConfig({ deploymentId: null });
      expect(service.configMatchesLaunchDeployment(config, 'D1')).toBe(true);
      expect(service.configMatchesLaunchDeployment(config, null)).toBe(true);
    });

    it('requires token deployment to match configured deployment', () => {
      const config = buildConfig({ deploymentId: 'D1' });
      expect(service.configMatchesLaunchDeployment(config, 'D1')).toBe(true);
      expect(service.configMatchesLaunchDeployment(config, 'D2')).toBe(false);
      expect(service.configMatchesLaunchDeployment(config, null)).toBe(false);
    });

    it('filters mixed multi-school configs independently', () => {
      const configs = [
        buildConfig({ schoolId: 'school-a', deploymentId: 'D1' }),
        buildConfig({ id: 'cfg-b', schoolId: 'school-b', deploymentId: null }),
      ];
      expect(service.filterConfigsByLaunchDeployment(configs, 'D1')).toEqual([
        configs[0],
        configs[1],
      ]);
      expect(service.filterConfigsByLaunchDeployment(configs, 'D2')).toEqual([configs[1]]);
    });
  });

  describe('edge cases', () => {
    it('should return empty array when no configs exist for student or educator toolType', async () => {
      configRepo.find.mockResolvedValue([]);

      const result = await service.listStudentLaunchConfigs(
        'https://unknown.lms.edu',
        'client-999',
      );

      expect(result).toEqual([]);
    });

    it('should handle null clientId', async () => {
      const config = buildConfig();
      configRepo.find.mockResolvedValue([config]);

      const result = await service.listStudentLaunchConfigs('https://moodle.test.edu', null);

      expect(result).toEqual([config]);
    });

    it('should handle undefined clientId', async () => {
      const config = buildConfig();
      configRepo.find.mockResolvedValue([config]);

      const result = await service.listStudentLaunchConfigs('https://moodle.test.edu', undefined);

      expect(result).toEqual([config]);
    });

    it('should trim whitespace from clientId', async () => {
      const config = buildConfig();
      configRepo.find.mockResolvedValue([config]);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        '  client-123  ',
      );

      expect(configRepo.find).toHaveBeenCalledWith({
        where: {
          clientId: 'client-123',
          toolType: LmsToolType.STUDENT,
          status: LmsConfigStatus.ACTIVE,
        },
      });
      expect(result).toEqual([config]);
    });
  });
});
