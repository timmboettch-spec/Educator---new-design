import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { LmsController } from '../../../src/lms/lms.controller';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsConnectService } from '../../../src/lms/services/lms-connect.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

const SCHOOL_A = '94a55c2b-1c3a-4d71-9024-d6189047e7a8';
const SCHOOL_B = '3e601b91-349b-4be0-9a2a-1eda43af14b1';
const CLASS_ID = '550e8400-e29b-41d4-a716-446655440401';
const NRPS_URL = 'https://moodle.example/mod/lti/services.php/2/contextmemberships';

const makeEducatorForSchool = (schoolId: string, extraSchoolIds: string[] = []): Educator =>
  ({
    id: TEST_USERS.educator.sub,
    school: { id: schoolId },
    schoolAssignments: extraSchoolIds.map((id) => ({ school: { id } })),
  }) as Educator;

describe('LMS school access (RWAI-3014)', () => {
  let app: INestApplication;
  let signToken: (user?: Partial<typeof TEST_USERS.educator>) => string;
  let findEducator: jest.Mock;

  const configService = {
    getBySchoolId: jest.fn().mockResolvedValue({ id: 'cfg-1', schoolId: SCHOOL_A }),
    sanitize: jest.fn((config: unknown) => config),
    getOptionalBySchoolId: jest.fn(),
  };

  const provisionService = {
    provisionFromLiveClasses: jest.fn().mockResolvedValue(undefined),
  };

  const connectService = {
    previewRoster: jest.fn().mockResolvedValue({ members: [] }),
    connectClass: jest.fn().mockResolvedValue({ classId: CLASS_ID }),
  };

  beforeAll(async () => {
    findEducator = jest.fn();

    const { app: testApp, signToken: tokenSigner } = await buildTestApp({
      controllers: [LmsController],
      providers: [
        { provide: LmsConfigService, useValue: configService },
        { provide: LmsConnectService, useValue: connectService },
        { provide: LmsLookupService, useValue: {} },
        { provide: LmsProvisionService, useValue: provisionService },
        { provide: LmsRosterService, useValue: {} },
        { provide: LmsAdapterFactory, useValue: { getAdapter: jest.fn() } },
        {
          provide: DataSource,
          useValue: {
            manager: {
              findOne: findEducator,
            },
          },
        },
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
    findEducator.mockResolvedValue(makeEducatorForSchool(SCHOOL_A));
    configService.getBySchoolId.mockResolvedValue({ id: 'cfg-1', schoolId: SCHOOL_A });
  });

  const educatorAuth = (): { Authorization: string } => ({
    Authorization: `Bearer ${signToken(TEST_USERS.educator)}`,
  });

  const districtAdminAuth = (): { Authorization: string } => ({
    Authorization: `Bearer ${signToken(TEST_USERS.districtAdmin)}`,
  });

  describe('educator tampered schoolId', () => {
    it('returns 403 for GET /lms/schools/:schoolId/config when school is not assigned', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/lms/schools/${SCHOOL_B}/config`)
        .set(educatorAuth());

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Educator is not assigned to the requested school');
      expect(configService.getBySchoolId).not.toHaveBeenCalled();
    });

    it('returns 200 for GET /lms/schools/:schoolId/config for assigned primary school', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/lms/schools/${SCHOOL_A}/config`)
        .set(educatorAuth());

      expect(res.status).toBe(200);
      expect(configService.getBySchoolId).toHaveBeenCalledWith(SCHOOL_A, expect.any(String));
    });

    it('returns 403 for POST /lms/provision/sync with tampered schoolId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/lms/provision/sync')
        .set(educatorAuth())
        .send({ lmsCourseId: '42', schoolId: SCHOOL_B });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Educator is not assigned to the requested school');
      expect(provisionService.provisionFromLiveClasses).not.toHaveBeenCalled();
    });

    it('returns 200 for POST /lms/provision/sync with assigned schoolId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/lms/provision/sync')
        .set(educatorAuth())
        .send({ lmsCourseId: '42', schoolId: SCHOOL_A });

      expect(res.status).toBe(201);
      expect(provisionService.provisionFromLiveClasses).toHaveBeenCalledWith(
        TEST_USERS.educator.sub,
        '42',
        SCHOOL_A,
        undefined,
      );
    });

    it('returns 403 for GET /lms/roster/preview with tampered schoolId', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/lms/roster/preview')
        .query({ schoolId: SCHOOL_B, nrpsUrl: NRPS_URL })
        .set(educatorAuth());

      expect(res.status).toBe(403);
      expect(connectService.previewRoster).not.toHaveBeenCalled();
    });

    it('returns 403 for POST /lms/classes/connect with tampered schoolId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/lms/classes/connect')
        .set(educatorAuth())
        .send({ schoolId: SCHOOL_B, classId: CLASS_ID, lmsCourseId: '42', nrpsUrl: NRPS_URL });

      expect(res.status).toBe(403);
      expect(connectService.connectClass).not.toHaveBeenCalled();
    });

    it('allows co-educator secondary school via schoolAssignments', async () => {
      findEducator.mockResolvedValue(makeEducatorForSchool(SCHOOL_A, [SCHOOL_B]));

      const res = await request(app.getHttpServer())
        .get(`/api/lms/schools/${SCHOOL_B}/config`)
        .set(educatorAuth());

      expect(res.status).toBe(200);
      expect(configService.getBySchoolId).toHaveBeenCalledWith(SCHOOL_B, expect.any(String));
    });
  });

  describe('district admin bypass', () => {
    it('allows GET /lms/schools/:schoolId/config for any school without educator lookup', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/lms/schools/${SCHOOL_B}/config`)
        .set(districtAdminAuth());

      expect(res.status).toBe(200);
      expect(findEducator).not.toHaveBeenCalled();
      expect(configService.getBySchoolId).toHaveBeenCalledWith(SCHOOL_B, expect.any(String));
    });
  });
});
