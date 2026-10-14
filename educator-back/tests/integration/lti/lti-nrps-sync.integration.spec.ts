/**
 * LTI NRPS Roster Sync Integration Tests
 *
 * Tests roster synchronization and student provisioning from NRPS.
 * Mocks external HTTP calls but uses real service logic.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import { MoodleAdapter } from '../../../src/lms/adapters/moodle.adapter';

import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { LmsAdapter, LmsRosterResponse } from '../../../src/lms/interfaces/lms.interfaces';
import { LmsAuthService } from '../../../src/lms/services/lms-auth.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { LoggerService } from '../../../src/common/services';

const MOODLE_URL = 'https://moodle.test.edu';
const NRPS_URL =
  'https://moodle.test.edu/mod/lti/services.php/CourseSection/100/bindings/1/memberships';
const ACCESS_TOKEN = 'mock-access-token';

import { extractCourseIdFromNrpsUrl } from '../../../src/lms/utils/nrps.util';
import { LmsSchoolConfig } from 'src/database/entities';

function buildSchoolConfig(overrides: Partial<LmsSchoolConfig> = {}): LmsSchoolConfig {
  return {
    id: 'config-123',
    schoolId: 'school-123',
    toolType: LmsToolType.EDUCATOR,
    lmsType: LmsType.MOODLE,
    issuer: MOODLE_URL,
    clientId: 'test-client',
    deploymentId: null,
    authEndpoint: 'https://moodle.test.edu/mod/lti/auth.php',
    tokenEndpoint: 'https://moodle.test.edu/mod/lti/token.php',
    jwksUrl: 'https://moodle.test.edu/jwks',
    platformPrivateKeyPem: 'fake-pem',
    platformKeyId: 'test-kid',
    status: LmsConfigStatus.ACTIVE,
    sharePii: true,
    lmsBaseUrl: MOODLE_URL,
    lmsApiToken: 'test-ws-token',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('NRPS Roster Sync (Integration)', () => {
  let rosterService: LmsRosterService;
  let getAccessTokenMock: jest.MockedFunction<LmsAuthService['getAccessToken']>;
  let fetchRosterMock: jest.MockedFunction<LmsAdapter['fetchRoster']>;

  const schoolConfig = buildSchoolConfig();

  beforeAll(async () => {
    getAccessTokenMock = jest.fn().mockResolvedValue(ACCESS_TOKEN);
    fetchRosterMock = jest.fn();

    const mockLmsAdapter = { fetchRoster: fetchRosterMock };
    const mockLmsAdapterFactory = {
      getAdapter: jest.fn().mockReturnValue(mockLmsAdapter),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LmsRosterService,
        { provide: LmsAuthService, useValue: { getAccessToken: getAccessTokenMock } },
        { provide: LmsAdapterFactory, useValue: mockLmsAdapterFactory },
        { provide: MoodleAdapter, useValue: mockLmsAdapter },
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
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MOODLE_URL') return MOODLE_URL;
              if (key === 'MOODLE_WS_TOKEN') return 'test-ws-token';
              return null;
            }),
          },
        },
      ],
    }).compile();

    rosterService = moduleRef.get<LmsRosterService>(LmsRosterService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  });

  describe('fetchRoster', () => {
    it('INTEGRATION: should fetch roster with valid NRPS response', async () => {
      const mockRoster: LmsRosterResponse = {
        members: [
          {
            userId: 'moodle-user-1',
            email: 'student1@test.com',
            name: 'Student One',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
          {
            userId: 'moodle-user-2',
            email: 'student2@test.com',
            name: 'Student Two',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
        ],
        context: {
          id: '42',
          label: 'test',
          title: 'Test Course',
        },
      };

      fetchRosterMock.mockResolvedValue(mockRoster);

      const result = await rosterService.fetchRoster(schoolConfig, NRPS_URL);

      expect(result.members).toHaveLength(2);
      expect(result.members[0].userId).toBe('moodle-user-1');
      expect(result.members[1].userId).toBe('moodle-user-2');
      expect(getAccessTokenMock).toHaveBeenCalledWith(schoolConfig);
      expect(fetchRosterMock).toHaveBeenCalledWith(NRPS_URL, ACCESS_TOKEN);
    });

    it('INTEGRATION: should handle empty roster', async () => {
      const emptyRoster: LmsRosterResponse = {
        members: [],
        context: {
          id: '42',
          label: 'test',
          title: 'Test Course',
        },
      };

      fetchRosterMock.mockResolvedValue(emptyRoster);

      const result = await rosterService.fetchRoster(schoolConfig, NRPS_URL);

      expect(result.members).toHaveLength(0);
    });

    it('INTEGRATION: should handle large roster', async () => {
      const largeRoster: LmsRosterResponse = {
        members: Array.from({ length: 100 }, (_, i) => ({
          userId: `moodle-user-${i}`,
          email: `student${i}@test.com`,
          name: `Student ${i}`,
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
        })),
        context: {
          id: '42',
          label: 'test',
          title: 'Test Course',
        },
      };

      fetchRosterMock.mockResolvedValue(largeRoster);

      const result = await rosterService.fetchRoster(schoolConfig, NRPS_URL);

      expect(result.members).toHaveLength(100);
      expect(result.members[0].userId).toBe('moodle-user-0');
      expect(result.members[99].userId).toBe('moodle-user-99');
    });

    it('INTEGRATION: should include multiple roles per student', async () => {
      const rosterWithMultipleRoles: LmsRosterResponse = {
        members: [
          {
            userId: 'moodle-user-1',
            email: 'student1@test.com',
            name: 'Student One',
            roles: [
              'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
              'http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor',
            ],
          },
        ],
        context: {
          id: '42',
          label: 'test',
          title: 'Test Course',
        },
      };

      fetchRosterMock.mockResolvedValue(rosterWithMultipleRoles);

      const result = await rosterService.fetchRoster(schoolConfig, NRPS_URL);

      expect(result.members[0].roles).toHaveLength(2);
      expect(result.members[0].roles).toContain(
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      );
    });

    it('INTEGRATION: should handle roster with missing email', async () => {
      const rosterWithMissingData: LmsRosterResponse = {
        members: [
          {
            userId: 'moodle-user-1',
            email: null,
            name: 'Student One',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
        ],
        context: {
          id: '42',
          label: 'test',
          title: 'Test Course',
        },
      };

      fetchRosterMock.mockResolvedValue(rosterWithMissingData);

      const result = await rosterService.fetchRoster(schoolConfig, NRPS_URL);

      expect(result.members[0].email).toBeNull();
      expect(result.members[0].userId).toBe('moodle-user-1');
    });

    it('INTEGRATION: should reject roster fetch on auth failure', async () => {
      getAccessTokenMock.mockRejectedValue(new Error('Failed to get access token'));

      await expect(rosterService.fetchRoster(schoolConfig, NRPS_URL)).rejects.toThrow(
        'Failed to get access token',
      );
    });

    it('INTEGRATION: should reject roster fetch on NRPS API failure', async () => {
      fetchRosterMock.mockRejectedValue(new Error('NRPS endpoint returned 403'));

      await expect(rosterService.fetchRoster(schoolConfig, NRPS_URL)).rejects.toThrow(
        'NRPS endpoint returned 403',
      );
    });
  });

  describe('Roster edge cases', () => {
    it('INTEGRATION: should handle duplicate students in roster', async () => {
      const rosterWithDuplicates: LmsRosterResponse = {
        members: [
          {
            userId: 'moodle-user-1',
            email: 'student1@test.com',
            name: 'Student One',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
          {
            userId: 'moodle-user-1',
            email: 'student1@test.com',
            name: 'Student One',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
          {
            userId: 'moodle-user-2',
            email: 'student2@test.com',
            name: 'Student Two',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
        ],
        context: {
          id: '42',
          label: 'test',
          title: 'Test Course',
        },
      };

      fetchRosterMock.mockResolvedValue(rosterWithDuplicates);

      const result = await rosterService.fetchRoster(schoolConfig, NRPS_URL);

      expect(result.members).toHaveLength(3);
      const userIds = result.members.map((member) => member.userId);
      expect(userIds.filter((id) => id === 'moodle-user-1')).toHaveLength(2);
    });

    it('INTEGRATION: should handle roster with instructors mixed in', async () => {
      const rosterWithInstructors: LmsRosterResponse = {
        members: [
          {
            userId: 'moodle-user-1',
            email: 'instructor@test.com',
            name: 'Instructor One',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
          },
          {
            userId: 'moodle-user-2',
            email: 'student1@test.com',
            name: 'Student One',
            roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          },
        ],
        context: {
          id: '42',
          label: 'test',
          title: 'Test Course',
        },
      };

      fetchRosterMock.mockResolvedValue(rosterWithInstructors);

      const result = await rosterService.fetchRoster(schoolConfig, NRPS_URL);

      expect(result.members).toHaveLength(2);
      expect(
        result.members.some((member) => member.roles.some((role) => role.includes('Instructor'))),
      ).toBe(true);
      expect(
        result.members.some((member) => member.roles.some((role) => role.includes('Learner'))),
      ).toBe(true);
    });

    it('INTEGRATION: should handle malformed NRPS URL gracefully', async () => {
      const malformedUrl = 'not-a-valid-url';

      // SSRF gate rejects before any outbound NRPS fetch.
      await expect(rosterService.fetchRoster(schoolConfig, malformedUrl)).rejects.toThrow(
        'NRPS URL is invalid',
      );
      expect(fetchRosterMock).not.toHaveBeenCalled();
    });
  });

  describe('extractCourseIdFromNrpsUrl', () => {
    it('INTEGRATION: should extract course ID from NRPS URL', () => {
      const url =
        'https://moodle.test.edu/mod/lti/services.php/CourseSection/42/bindings/1/memberships';
      expect(extractCourseIdFromNrpsUrl(url)).toBe(42);
    });

    it('INTEGRATION: should handle NRPS URL without course ID', () => {
      const url = 'https://moodle.test.edu/mod/lti/services.php/memberships';
      expect(extractCourseIdFromNrpsUrl(url)).toBe(null);
    });
  });
});
