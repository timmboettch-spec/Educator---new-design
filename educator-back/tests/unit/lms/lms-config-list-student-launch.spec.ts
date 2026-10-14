import { OutboundHttpClient } from 'src/common/services';
import { Test } from '@nestjs/testing';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsAuthService } from '../../../src/lms/services/lms-auth.service';
import { LmsSchoolConfig } from '../../../src/database/entities';
import { LMS_SCHOOL_CONFIG_REPOSITORY, SCHOOLS_REPOSITORY } from '../../../src/database/tokens';
import { LmsSchoolConfigRepository } from '../../../src/database/repositories';
import { LmsConfigStatus, LmsToolType } from '../../../src/common/enums/lms.enum';
import { LoggerService } from '../../../src/common/services';

describe('LmsConfigService.listStudentLaunchConfigs', () => {
  let service: LmsConfigService;
  let configRepo: jest.Mocked<Pick<LmsSchoolConfigRepository, 'find' | 'findOne' | 'create'>>;

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
          provide: LMS_SCHOOL_CONFIG_REPOSITORY,
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: SCHOOLS_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
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

    service = module.get<LmsConfigService>(LmsConfigService);
    configRepo = module.get(LMS_SCHOOL_CONFIG_REPOSITORY);
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

    it('falls back to issuer-only lookup when student tool clientId differs from stored configs', async () => {
      const educatorConfigs = [
        buildConfig({
          id: 'cfg-a',
          toolType: LmsToolType.EDUCATOR,
          clientId: 'educator-client',
          schoolId: 'school-a',
        }),
        buildConfig({
          id: 'cfg-b',
          toolType: LmsToolType.EDUCATOR,
          clientId: 'educator-client',
          schoolId: 'school-b',
        }),
      ];

      configRepo.find
        .mockResolvedValueOnce([]) // STUDENT clientId lookup
        .mockResolvedValueOnce([]) // STUDENT issuer fallback
        .mockResolvedValueOnce([]) // EDUCATOR clientId lookup
        .mockResolvedValueOnce(educatorConfigs); // EDUCATOR issuer fallback

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'student-tool-client',
      );

      expect(result).toEqual(educatorConfigs);
    });

    it('returns empty array when clientId and issuer both miss', async () => {
      configRepo.find.mockResolvedValue([]);

      const result = await service.listStudentLaunchConfigs(
        'https://moodle.test.edu',
        'client-123',
      );

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
