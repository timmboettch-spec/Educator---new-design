import { BadRequestException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import { Educator, LmsSchoolConfig } from '../../../src/database/entities';
import { LMS_CLASS_MAPPING_REPOSITORY, LMS_STUDENT_MAPPING_REPOSITORY } from '../../../src/database/tokens';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { LmsController } from '../../../src/lms/lms.controller';
import { LmsAuthService } from '../../../src/lms/services/lms-auth.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsConnectService } from '../../../src/lms/services/lms-connect.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { LoggerService } from '../../../src/common/services';
import { buildTestApp, TEST_USERS, lmsGradePassbackProviders } from '../setup/test-app.factory';

const SCHOOL_A = '94a55c2b-1c3a-4d71-9024-d6189047e7a8';
const EVIL_NRPS_URL = 'https://attacker.example/exfiltrate';
const ALLOWED_NRPS_URL = 'https://canvas.example.edu/api/lti/courses/12/names_and_roles';

const schoolConfig = {
  id: 'cfg-1',
  schoolId: SCHOOL_A,
  toolType: LmsToolType.EDUCATOR,
  lmsType: LmsType.CANVAS,
  issuer: 'https://canvas.example.edu',
  clientId: 'client-1',
  deploymentId: 'deploy-1',
  authEndpoint: 'https://canvas.example.edu/api/lti/authorize_redirect',
  tokenEndpoint: 'https://canvas.example.edu/login/oauth2/token',
  jwksUrl: 'https://canvas.example.edu/api/lti/security/jwks',
  status: LmsConfigStatus.ACTIVE,
  sharePii: true,
  lmsBaseUrl: 'https://canvas.example.edu',
  lmsApiToken: null,
} as LmsSchoolConfig;

/**
 * INTEGRATION: NRPS SSRF gate — external hosts must fail closed with no outbound fetch.
 */
describe('LMS NRPS URL allowlist (Integration)', () => {
  describe('LmsRosterService choke point', () => {
    let fetchRoster: jest.Mock;
    let getAccessToken: jest.Mock;
    let service: LmsRosterService;

    beforeEach(() => {
      fetchRoster = jest.fn().mockResolvedValue({
        context: { id: 'course-1', label: null, title: null },
        members: [],
      });
      getAccessToken = jest.fn().mockResolvedValue('school-oauth-token');

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

    it('INTEGRATION: rejects external nrpsUrl with 400 and does not fetch', async () => {
      await expect(service.fetchRoster(schoolConfig, EVIL_NRPS_URL)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(getAccessToken).not.toHaveBeenCalled();
      expect(fetchRoster).not.toHaveBeenCalled();
    });

    it('INTEGRATION: allows mapped Canvas NRPS host from school config', async () => {
      await expect(service.fetchRoster(schoolConfig, ALLOWED_NRPS_URL)).resolves.toMatchObject({
        context: { id: 'course-1' },
      });
      expect(fetchRoster).toHaveBeenCalledWith(ALLOWED_NRPS_URL, 'school-oauth-token');
    });
  });

  describe('HTTP endpoints', () => {
    let app: INestApplication;
    let signToken: (user?: Partial<typeof TEST_USERS.educator>) => string;
    let fetchRoster: jest.Mock;
    let getAccessToken: jest.Mock;
    let getBySchoolId: jest.Mock;
    let getOptionalBySchoolId: jest.Mock;
    let getRawMany: jest.Mock;
    let findOne: jest.Mock;

    beforeAll(async () => {
      fetchRoster = jest.fn().mockResolvedValue({
        context: { id: 'course-1', label: null, title: null },
        members: [],
      });
      getAccessToken = jest.fn().mockResolvedValue('school-oauth-token');
      getBySchoolId = jest.fn().mockResolvedValue(schoolConfig);
      getOptionalBySchoolId = jest.fn().mockResolvedValue(schoolConfig);
      getRawMany = jest.fn().mockResolvedValue([]);
      findOne = jest.fn().mockResolvedValue({
        id: TEST_USERS.educator.educatorId,
        school: { id: SCHOOL_A },
        schoolAssignments: [],
      } as unknown as Educator);

      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany,
      };

      const { app: testApp, signToken: tokenSigner } = await buildTestApp({
        controllers: [LmsController],
        providers: [
          LmsConnectService,
          LmsRosterService,
          {
            provide: LmsConfigService,
            useValue: {
              getBySchoolId,
              getOptionalBySchoolId,
              // previewRoster / live-* resolve active educator config via these.
              getActiveBySchoolId: getBySchoolId,
              getActiveOptionalBySchoolId: getOptionalBySchoolId,
            },
          },
          { provide: LmsLookupService, useValue: {} },
          { provide: LmsProvisionService, useValue: {} },
          { provide: LmsAuthService, useValue: { getAccessToken } },
          {
            provide: LmsAdapterFactory,
            useValue: {
              getAdapter: () => ({ fetchRoster }),
              tryGetAdapter: () => ({ fetchRoster }),
              getDefaultAdapter: () => ({ fetchRoster }),
            },
          },
          { provide: LMS_CLASS_MAPPING_REPOSITORY, useValue: {} },
          { provide: LMS_STUDENT_MAPPING_REPOSITORY, useValue: {} },
          {
            provide: DataSource,
            useValue: {
              createQueryBuilder: jest.fn(() => queryBuilder),
              manager: { findOne },
            },
          },
          ...lmsGradePassbackProviders,
        ],
      });

      app = testApp;
      signToken = tokenSigner;
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
      getBySchoolId.mockResolvedValue(schoolConfig);
      getOptionalBySchoolId.mockResolvedValue(schoolConfig);
      findOne.mockResolvedValue({
        id: TEST_USERS.educator.educatorId,
        school: { id: SCHOOL_A },
        schoolAssignments: [],
      } as unknown as Educator);
      fetchRoster.mockResolvedValue({
        context: { id: 'course-1', label: null, title: null },
        members: [],
      });
      getAccessToken.mockResolvedValue('school-oauth-token');
      getRawMany.mockResolvedValue([]);
    });

    const educatorAuth = (): { Authorization: string } => ({
      Authorization: `Bearer ${signToken(TEST_USERS.educator)}`,
    });

    it('INTEGRATION: GET /lms/roster/preview returns 400 for external nrpsUrl and does not fetch', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/lms/roster/preview')
        .query({ schoolId: SCHOOL_A, nrpsUrl: EVIL_NRPS_URL })
        .set(educatorAuth());

      expect(res.status).toBe(400);
      expect(String(res.body.message ?? '')).toMatch(/NRPS URL host is not allowed/i);
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(fetchRoster).not.toHaveBeenCalled();
    });

    it('INTEGRATION: GET /lms/live-students returns 400 for external mapped nrpsUrl and does not fetch', async () => {
      // Mapped so the request reaches the host allowlist (not rejected only as unmapped).
      getRawMany.mockResolvedValue([{ nrpsUrl: EVIL_NRPS_URL, schoolId: SCHOOL_A }]);

      const res = await request(app.getHttpServer())
        .get('/api/lms/live-students')
        .query({ nrpsUrl: EVIL_NRPS_URL })
        .set(educatorAuth());

      expect(res.status).toBe(400);
      expect(String(res.body.message ?? '')).toMatch(/NRPS URL host is not allowed/i);
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(fetchRoster).not.toHaveBeenCalled();
    });
  });
});
