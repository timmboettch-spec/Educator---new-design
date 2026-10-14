/**
 * Moodle live smoke: educator launch → class mapped.
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

const MOODLE_BASE_URL = process.env.MOODLE_DEV_BASE_URL || '';
const MOODLE_COURSE_ID = process.env.MOODLE_DEV_TEST_COURSE_ID || '42';
const MOODLE_NRPS_URL =
  process.env.MOODLE_DEV_NRPS_URL ||
  `${MOODLE_BASE_URL}/mod/lti/services.php/CourseSection/${MOODLE_COURSE_ID}/bindings/1/memberships`;
const MOODLE_COURSE_NAME = process.env.MOODLE_DEV_TEST_COURSE_NAME || 'RW Auto Test Course';

const TEST_SCHOOL_NAME = 'LMS Live Test School (Moodle)';
const TEST_EDUCATOR_FULL_NAME = 'LMS Live Smoke Educator (Moodle)';

const testLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

describe('Moodle Live Smoke Tests', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let provisionService: LmsProvisionService;
  let testSchool: Schools;
  let testEducator: Educator;

  beforeAll(async () => {
    if (!MOODLE_BASE_URL) {
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
      legacyFullNames: ['LMS Test Educator'],
      lmsCourseId: MOODLE_COURSE_ID,
    });

    let schoolConfig = await configRepo.findOne({
      where: { schoolId: testSchool.id, toolType: LmsToolType.EDUCATOR },
    });
    if (!schoolConfig) {
      schoolConfig = configRepo.create({
        schoolId: testSchool.id,
        toolType: LmsToolType.EDUCATOR,
        lmsType: LmsType.MOODLE,
        issuer: MOODLE_BASE_URL,
        clientId: 'live-smoke-placeholder',
        deploymentId: '1',
        authEndpoint: `${MOODLE_BASE_URL}/mod/lti/auth.php`,
        tokenEndpoint: `${MOODLE_BASE_URL}/mod/lti/token.php`,
        jwksUrl: `${MOODLE_BASE_URL}/mod/lti/certs.php`,
        platformPrivateKeyPem: 'fake-pem',
        platformKeyId: 'live-smoke-placeholder',
        lmsBaseUrl: MOODLE_BASE_URL,
        status: LmsConfigStatus.ACTIVE,
        sharePii: true,
      });
      await configRepo.save(schoolConfig);
    } else {
      schoolConfig.issuer = MOODLE_BASE_URL;
      schoolConfig.lmsBaseUrl = MOODLE_BASE_URL;
      await configRepo.save(schoolConfig);
    }
  }

  describe('[LIVE] Educator LTI launch → class mapped', () => {
    it('should create or find a mapped class for Moodle course', async () => {
      if (!MOODLE_BASE_URL) {
        console.log('[SKIP] MOODLE_DEV_BASE_URL not set');
        return;
      }

      await provisionService.provisionFromLiveClasses(
        testEducator.id,
        MOODLE_COURSE_ID,
        testSchool.id,
        MOODLE_NRPS_URL,
        MOODLE_BASE_URL,
        undefined,
        MOODLE_COURSE_NAME,
      );

      const mapping = await dataSource.getRepository(LmsClassMapping).findOne({
        where: {
          schoolId: testSchool.id,
          lmsCourseId: MOODLE_COURSE_ID,
        },
      });

      expect(mapping).toBeDefined();
      expect(mapping?.lmsCourseId).toBe(MOODLE_COURSE_ID);
      expect(mapping?.schoolId).toBe(testSchool.id);
      expect(mapping?.nrpsUrl).toBeTruthy();

      const classData = await dataSource.getRepository(Class).findOne({
        where: { id: mapping!.classId },
      });

      expect(classData).toBeDefined();
      expect(classData?.educator_id).toBe(testEducator.id);

      console.log(
        `[LIVE SMOKE PASS] Moodle course ${MOODLE_COURSE_ID} → class ${mapping!.classId}`,
      );
    }, 30000);
  });
});
