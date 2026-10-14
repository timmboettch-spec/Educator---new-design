/**
 * Canvas live smoke: educator launch → class mapped.
 *
 * Quick sanity check that LTI provision creates/finds the RW class mapping.
 * Roster and grade passback are covered by mocked integration tests.
 *
 * Run: npm run test:integration:lms-live
 */

import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { LmsProvisionService } from '../../../../src/lms/services/lms-provision.service';
import { LmsRosterService } from '../../../../src/lms/services/lms-roster.service';
import { LmsAuthService } from '../../../../src/lms/services/lms-auth.service';
import { LmsAdapterFactory } from '../../../../src/lms/factories/lms-adapter.factory';
import { MoodleAdapter } from '../../../../src/lms/adapters/moodle.adapter';
import { CanvasAdapter } from '../../../../src/lms/adapters/canvas.adapter';
import { LtiAgsAdapter } from '../../../../src/lms/adapters/lti-ags.adapter';
import { LoggerService } from '../../../../src/common/services';
import { OutboundHttpClient } from '../../../../src/common/services/outbound-http.client';
import { databseConfig } from '../../../../src/database/data-source';
import {
  LmsSchoolConfig,
  LmsClassMapping,
  Class,
  Schools,
  Educator,
} from '../../../../src/database/entities';
import { LmsType, LmsToolType, LmsConfigStatus } from '../../../../src/common/enums/lms.enum';
import { CommonStatus } from '../../../../src/common/enums/status.enum';
import { findOrCreateSmokeEducator } from './live-smoke-educator.util';

loadDotenv({ path: resolve(__dirname, '../../../../.env') });

const CANVAS_BASE_URL = process.env.CANVAS_DEV_BASE_URL || '';
const CANVAS_COURSE_ID = process.env.CANVAS_DEV_TEST_COURSE_ID || '123';
const CANVAS_NRPS_URL =
  process.env.CANVAS_DEV_NRPS_URL ||
  `${CANVAS_BASE_URL}/api/lti/courses/${CANVAS_COURSE_ID}/names_and_roles`;
const CANVAS_COURSE_NAME = process.env.CANVAS_DEV_TEST_COURSE_NAME || 'RW Auto Test Course';

const TEST_SCHOOL_NAME = 'LMS Live Test School (Canvas)';
const TEST_EDUCATOR_FULL_NAME = 'LMS Live Smoke Educator (Canvas)';

const testLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

describe('Canvas Live Smoke Tests', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let provisionService: LmsProvisionService;
  let testSchool: Schools;
  let testEducator: Educator;

  beforeAll(async () => {
    if (!CANVAS_BASE_URL) {
      return;
    }

    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        TypeOrmModule.forRoot({ ...databseConfig }),
      ],
      providers: [
        LmsProvisionService,
        LmsRosterService,
        LmsAuthService,
        LmsAdapterFactory,
        MoodleAdapter,
        CanvasAdapter,
        LtiAgsAdapter,
        OutboundHttpClient,
        { provide: LoggerService, useValue: testLogger },
      ],
    }).compile();

    dataSource = app.get<DataSource>(DataSource);
    provisionService = app.get<LmsProvisionService>(LmsProvisionService);
    await seedTestData();
  }, 60000);

  afterAll(async () => {
    if (app) {
      await dataSource.destroy();
      await app.close();
    }
  });

  async function seedTestData(): Promise<void> {
    const schoolRepo = dataSource.getRepository(Schools);
    const configRepo = dataSource.getRepository(LmsSchoolConfig);

    testSchool =
      (await schoolRepo.findOne({ where: { school_name: TEST_SCHOOL_NAME } })) ??
      (await schoolRepo.save(
        schoolRepo.create({
          school_name: TEST_SCHOOL_NAME,
          status: CommonStatus.ACTIVE,
          lms_enabled: true,
        }),
      ));

    testEducator = await findOrCreateSmokeEducator(dataSource, testSchool, {
      fullName: TEST_EDUCATOR_FULL_NAME,
      legacyFullNames: ['LMS Test Educator Canvas'],
      lmsCourseId: CANVAS_COURSE_ID,
    });

    let schoolConfig = await configRepo.findOne({
      where: { schoolId: testSchool.id, toolType: LmsToolType.EDUCATOR },
    });
    if (!schoolConfig) {
      schoolConfig = configRepo.create({
        schoolId: testSchool.id,
        toolType: LmsToolType.EDUCATOR,
        lmsType: LmsType.CANVAS,
        issuer: CANVAS_BASE_URL,
        clientId: 'live-smoke-placeholder',
        deploymentId: '1',
        authEndpoint: `${CANVAS_BASE_URL}/api/lti/authorize_redirect`,
        tokenEndpoint: `${CANVAS_BASE_URL}/login/oauth2/token`,
        jwksUrl: `${CANVAS_BASE_URL}/api/lti/security/jwks`,
        platformPrivateKeyPem: 'fake-pem',
        platformKeyId: 'live-smoke-placeholder',
        lmsBaseUrl: CANVAS_BASE_URL,
        status: LmsConfigStatus.ACTIVE,
        sharePii: true,
      });
      await configRepo.save(schoolConfig);
    } else {
      schoolConfig.issuer = CANVAS_BASE_URL;
      schoolConfig.lmsBaseUrl = CANVAS_BASE_URL;
      await configRepo.save(schoolConfig);
    }
  }

  describe('[LIVE] Educator LTI launch → class mapped', () => {
    it('should create or find a mapped class for Canvas course', async () => {
      if (!CANVAS_BASE_URL) {
        console.log('[SKIP] CANVAS_DEV_BASE_URL not set');
        return;
      }

      await provisionService.provisionFromLiveClasses(
        testEducator.id,
        CANVAS_COURSE_ID,
        testSchool.id,
        CANVAS_NRPS_URL,
        CANVAS_BASE_URL,
        undefined,
        CANVAS_COURSE_NAME,
      );

      const mapping = await dataSource.getRepository(LmsClassMapping).findOne({
        where: {
          schoolId: testSchool.id,
          lmsCourseId: CANVAS_COURSE_ID,
        },
      });

      expect(mapping).toBeDefined();
      expect(mapping?.lmsCourseId).toBe(CANVAS_COURSE_ID);
      expect(mapping?.schoolId).toBe(testSchool.id);
      expect(mapping?.nrpsUrl).toBeTruthy();

      const classData = await dataSource.getRepository(Class).findOne({
        where: { id: mapping!.classId },
      });

      expect(classData).toBeDefined();
      expect(classData?.educator_id).toBe(testEducator.id);

      console.log(
        `[LIVE SMOKE PASS] Canvas course ${CANVAS_COURSE_ID} → class ${mapping!.classId}`,
      );
    }, 30000);
  });
});
