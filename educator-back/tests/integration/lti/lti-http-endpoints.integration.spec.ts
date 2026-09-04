/**
 * LTI HTTP Endpoint Integration Tests
 *
 * Tests the full HTTP flow for LTI 1.3 educator launch endpoints.
 * Uses a dedicated test module setup to avoid deep dependency issues.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type { JWTPayload } from 'jose';
import request from 'supertest';
import { LmsConfigStatus, LmsToolType, LmsType } from '../../../src/common/enums/lms.enum';
import { AuthService } from '../../../src/auth/auth.service';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { LmsSchoolConfig } from '../../../src/lms/entity/lms-school-config.entity';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LtiController } from '../../../src/lti/lti.controller';
import { LtiKeyService } from '../../../src/lti/lti-key.service';
import { LtiJwtService } from '../../../src/lti/lti-jwt.service';
import { LtiSessionService } from '../../../src/lti/lti-session.service';
import {
  EducatorLtiSessionPayload,
  LtiLaunchContext,
  StudentLtiSessionPayload,
} from '../../../src/lti/lti-session.types';
import { LtiStateService } from '../../../src/lti/lti-state.service';
import { LtiService } from '../../../src/lti/lti.service';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { StudentsService } from '../../../src/students/students.service';
import { DataSource } from 'typeorm';
import { LtiTokenFactory, decodeFakeJwt } from './helpers/lti-token.factory';

const FRONTEND_URL = 'http://localhost:3001';
const STUDENT_FRONTEND_URL = 'http://localhost:5174';
const ISSUER = 'https://moodle.test.edu';
const CLIENT_ID = 'test-client-id';
const SCHOOL_ID = 'test-school-123';
const EDUCATOR_ID = 'educator-test-id';
const STUDENT_CODE = 'STU123';

type MergeRequestParams = LtiService['mergeRequestParams'];

function mergeRequestParamsForTest(req: Request): Record<string, string> {
  const query = req.query as Record<string, string | string[] | undefined>;
  const body = (req.body ?? {}) as Record<string, string | string[] | undefined>;
  const merged: Record<string, string> = {};

  for (const source of [query, body]) {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'string') {
        merged[key] = value;
      } else if (Array.isArray(value) && typeof value[0] === 'string') {
        merged[key] = value[0];
      }
    }
  }

  return merged;
}

function buildSchoolConfig(overrides: Partial<LmsSchoolConfig> = {}): LmsSchoolConfig {
  return {
    id: 'config-1',
    schoolId: SCHOOL_ID,
    toolType: LmsToolType.EDUCATOR,
    lmsType: LmsType.MOODLE,
    issuer: ISSUER,
    clientId: CLIENT_ID,
    deploymentId: null,
    authEndpoint: `${ISSUER}/mod/lti/auth.php`,
    tokenEndpoint: `${ISSUER}/mod/lti/token.php`,
    jwksUrl: `${ISSUER}/jwks`,
    platformPrivateKeyPem: 'fake-pem',
    platformKeyId: 'test-kid',
    status: LmsConfigStatus.ACTIVE,
    sharePii: true,
    lmsBaseUrl: ISSUER,
    lmsApiToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildSchool(overrides: Partial<Schools> = {}): Schools {
  return { id: SCHOOL_ID, school_name: 'Test School', ...overrides } as Schools;
}

function defaultLtiContext(): LtiLaunchContext {
  return {
    issuer: ISSUER,
    lmsUserId: 'moodle-user-123',
    lmsCourseId: '42',
    clientId: CLIENT_ID,
  };
}

function buildEducatorSession(
  overrides: Partial<EducatorLtiSessionPayload> = {},
): EducatorLtiSessionPayload {
  const now = Date.now();
  return {
    audience: 'educator',
    userId: EDUCATOR_ID,
    schoolId: SCHOOL_ID,
    ltiContext: defaultLtiContext(),
    createdAt: now,
    expiresAt: now + 60_000,
    accessToken: 'mock-jwt-token',
    csrfToken: 'mock-csrf',
    user: { id: EDUCATOR_ID, email: 'educator@test.com' },
    nrpsUrl: 'https://moodle.example.com/nrps',
    lmsCourseId: '42',
    lmsCourseName: 'Test Course',
    provisioningStatus: 'complete',
    courseSource: 'lti',
    ...overrides,
  };
}

function buildStudentSession(
  overrides: Partial<StudentLtiSessionPayload> = {},
): StudentLtiSessionPayload {
  const now = Date.now();
  return {
    audience: 'student',
    userId: null,
    schoolId: SCHOOL_ID,
    ltiContext: defaultLtiContext(),
    createdAt: now,
    expiresAt: now + 60_000,
    studentCode: STUDENT_CODE,
    classId: 'class-123',
    className: 'Test Class',
    accessToken: 'student-access-token',
    studentData: {
      id: 'student-id-123',
      student_code: STUDENT_CODE,
      class_id: 'class-123',
    },
    ...overrides,
  };
}

describe('LTI HTTP Endpoints (Integration)', () => {
  let app: INestApplication;

  let quickDecodeMock: jest.MockedFunction<(token: string) => Record<string, unknown>>;
  let verifyIdTokenMock: jest.MockedFunction<LtiJwtService['verifyIdToken']>;
  let validateAndConsumeMock: jest.MockedFunction<LtiStateService['validateAndConsume']>;
  let createSessionMock: jest.MockedFunction<LtiSessionService['createSession']>;
  let consumeSessionMock: jest.MockedFunction<LtiSessionService['consumeSession']>;
  let resolveEducatorLaunchConfigMock: jest.MockedFunction<
    LmsConfigService['resolveEducatorLaunchConfig']
  >;
  let listStudentLaunchConfigsMock: jest.MockedFunction<
    LmsConfigService['listStudentLaunchConfigs']
  >;
  let filterConfigsByLaunchDeploymentMock: jest.MockedFunction<
    LmsConfigService['filterConfigsByLaunchDeployment']
  >;
  let findSchoolbyIssuerMock: jest.MockedFunction<LmsConfigService['findSchoolbyIssuer']>;
  let findSchoolByClientIdMock: jest.MockedFunction<LmsConfigService['findSchoolByClientId']>;
  let ltiLoginMock: jest.MockedFunction<AuthService['ltiLogin']>;
  let findEducatorByEmailMock: jest.MockedFunction<AuthService['findEducatorByEmail']>;
  let getEducatorSchoolIdsMock: jest.MockedFunction<AuthService['getEducatorSchoolIds']>;
  let isUserInstructorInRosterMock: jest.MockedFunction<
    LmsProvisionService['isUserInstructorInRoster']
  >;
  let ensureMappedStudentAccountMock: jest.MockedFunction<
    LmsLookupService['ensureMappedStudentAccount']
  >;
  let findStudentByConstructedCodeMock: jest.MockedFunction<
    LmsLookupService['findStudentByConstructedCode']
  >;
  let findStudentCodeByLmsClassAndUserIdMock: jest.MockedFunction<
    LmsLookupService['findStudentCodeByLmsClassAndUserId']
  >;
  let findStudentCodeByLmsUserIdInSchoolMock: jest.MockedFunction<
    LmsLookupService['findStudentCodeByLmsUserIdInSchool']
  >;
  let findStudentCodeByLmsUserIdGloballyMock: jest.MockedFunction<
    LmsLookupService['findStudentCodeByLmsUserIdGlobally']
  >;
  let resolveStudentCodeForLaunchMock: jest.MockedFunction<
    LmsLookupService['resolveStudentCodeForLaunch']
  >;
  let findActiveClassByLmsCourseIdMock: jest.MockedFunction<
    LmsLookupService['findActiveClassByLmsCourseId']
  >;
  let studentLoginMock: jest.MockedFunction<StudentsService['studentLogin']>;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  beforeAll(async () => {
    quickDecodeMock = jest.fn((token: string) => decodeFakeJwt(token));
    verifyIdTokenMock = jest.fn();
    validateAndConsumeMock = jest.fn();
    createSessionMock = jest.fn();
    consumeSessionMock = jest.fn();
    resolveEducatorLaunchConfigMock = jest.fn();
    listStudentLaunchConfigsMock = jest.fn();
    filterConfigsByLaunchDeploymentMock = jest.fn((configs) => configs);
    findSchoolbyIssuerMock = jest.fn();
    findSchoolByClientIdMock = jest.fn();
    ltiLoginMock = jest.fn();
    findEducatorByEmailMock = jest.fn().mockResolvedValue({
      id: EDUCATOR_ID,
      email: 'educator@test.com',
      school: { id: SCHOOL_ID },
      schoolAssignments: [],
    });
    getEducatorSchoolIdsMock = jest.fn().mockReturnValue([SCHOOL_ID]);
    isUserInstructorInRosterMock = jest.fn().mockResolvedValue({ isInstructor: true });
    ensureMappedStudentAccountMock = jest.fn();
    findStudentByConstructedCodeMock = jest.fn();
    findStudentCodeByLmsClassAndUserIdMock = jest.fn();
    findStudentCodeByLmsUserIdInSchoolMock = jest.fn();
    findStudentCodeByLmsUserIdGloballyMock = jest.fn();
    resolveStudentCodeForLaunchMock = jest.fn();
    findActiveClassByLmsCourseIdMock = jest.fn();
    studentLoginMock = jest.fn();

    const mergeRequestParamsMock = jest.fn<
      ReturnType<MergeRequestParams>,
      Parameters<MergeRequestParams>
    >(mergeRequestParamsForTest);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [LtiController],
      providers: [
        {
          provide: LtiJwtService,
          useValue: {
            verifyIdToken: verifyIdTokenMock,
            quickDecode: quickDecodeMock,
          },
        },
        { provide: LtiStateService, useValue: { validateAndConsume: validateAndConsumeMock } },
        {
          provide: LtiSessionService,
          useValue: {
            createSession: createSessionMock,
            consumeSession: consumeSessionMock,
          },
        },
        {
          provide: LtiKeyService,
          useValue: {
            getJwks: jest.fn(),
            getStudentJwks: jest.fn(),
            getBaseUrl: jest.fn().mockReturnValue('http://localhost:3000/api'),
          },
        },
        {
          provide: LtiService,
          useValue: {
            mergeRequestParams: mergeRequestParamsMock,
            getToolMetadata: jest.fn(),
            buildLoginRedirect: jest.fn(),
            buildStudentLoginRedirect: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'FRONTEND_URL') return FRONTEND_URL;
              if (key === 'API_BASE_URL') return 'http://localhost:3000/api';
              if (key === 'STUDENT_FRONTEND_URL') return STUDENT_FRONTEND_URL;
              if (key === 'NODE_ENV') return 'test';
              if (key === 'JWT_SECRET') return 'test-secret';
              if (key === 'JWT_EXPIRES_IN') return '1h';
              return null;
            }),
          },
        },
        {
          provide: LmsConfigService,
          useValue: {
            resolveEducatorLaunchConfig: resolveEducatorLaunchConfigMock,
            listStudentLaunchConfigs: listStudentLaunchConfigsMock,
            filterConfigsByLaunchDeployment: filterConfigsByLaunchDeploymentMock,
            findSchoolConfig: jest.fn(),
            findByIssuer: jest.fn(),
            findSchoolbyIssuer: findSchoolbyIssuerMock,
            findSchoolByClientId: findSchoolByClientIdMock,
            findByClientId: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            loginOrCreateEducatorForLtiLaunch: jest.fn(),
            loginOrCreateStudentForLtiLaunch: jest.fn(),
            ltiLogin: ltiLoginMock,
            findEducatorByEmail: findEducatorByEmailMock,
            getEducatorSchoolIds: getEducatorSchoolIdsMock,
          },
        },
        {
          provide: LmsProvisionService,
          useValue: {
            provisionClassForLtiLaunch: jest.fn(),
            isUserInstructorInRoster: isUserInstructorInRosterMock,
          },
        },
        {
          provide: LmsLookupService,
          useValue: {
            findEducatorByLmsUserId: jest.fn(),
            findActiveClassByLmsCourseId: findActiveClassByLmsCourseIdMock,
            ensureMappedStudentAccount: ensureMappedStudentAccountMock,
            findStudentByConstructedCode: findStudentByConstructedCodeMock,
            findStudentCodeByLmsClassAndUserId: findStudentCodeByLmsClassAndUserIdMock,
            findStudentCodeByLmsUserIdInSchool: findStudentCodeByLmsUserIdInSchoolMock,
            findStudentCodeByLmsUserIdGlobally: findStudentCodeByLmsUserIdGloballyMock,
            resolveStudentCodeForLaunch: resolveStudentCodeForLaunchMock,
          },
        },
        {
          provide: LmsAdapterFactory,
          useValue: {
            getAdapter: jest.fn().mockReturnValue({
              getUserEmail: jest.fn().mockResolvedValue({ email: null, error: null }),
            }),
          },
        },
        { provide: StudentsService, useValue: { findOne: jest.fn(), studentLogin: studentLoginMock } },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn(),
            manager: { findOne: jest.fn(), save: jest.fn() },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    quickDecodeMock.mockImplementation((token: string) => decodeFakeJwt(token));
    isUserInstructorInRosterMock.mockResolvedValue({ isInstructor: true, error: null });
    findEducatorByEmailMock.mockResolvedValue({
      id: EDUCATOR_ID,
      email: 'educator@test.com',
      school: { id: SCHOOL_ID },
      schoolAssignments: [],
    });
    getEducatorSchoolIdsMock.mockReturnValue([SCHOOL_ID]);
    findStudentCodeByLmsClassAndUserIdMock.mockResolvedValue({
      studentCode: null,
      classFound: false,
    });
    findActiveClassByLmsCourseIdMock.mockResolvedValue(null);
  });

  describe('POST /api/lti/callback', () => {
    it('INTEGRATION: should return HTML auto-submit form with id_token', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
      });

      const response = await request(httpServer())
        .post('/api/lti/callback')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(200);

      expect(response.headers['content-type']).toContain('html');
      expect(response.text).toContain('<form');
      expect(response.text).toContain('id_token');
      expect(response.text).toContain('/lti/launch');
      expect(response.text).toContain('submit()');
    });

    it('INTEGRATION: should return 400 if id_token is missing', async () => {
      const response = await request(httpServer())
        .post('/api/lti/callback')
        .send({ state: 'test-state' })
        .expect(400);

      expect(response.body).toMatchObject({ error: 'Missing id_token' });
    });
  });

  describe('POST /api/lti/launch', () => {
    it('INTEGRATION: should complete educator launch and redirect with session code', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        courseTitle: 'Test Course',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'session-code-abc123';

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'educator@test.com', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockReturnValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=success');
      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(quickDecodeMock).toHaveBeenCalledWith(idToken);
      expect(resolveEducatorLaunchConfigMock).toHaveBeenCalled();
      expect(verifyIdTokenMock).toHaveBeenCalled();
      expect(validateAndConsumeMock).toHaveBeenCalled();
      expect(isUserInstructorInRosterMock).toHaveBeenCalled();
      expect(ltiLoginMock).toHaveBeenCalledWith(
        'educator@test.com',
        SCHOOL_ID,
        expect.objectContaining({ id: EDUCATOR_ID }),
      );
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_ID }),
      );
    });

    it('INTEGRATION: should store LMS launch school in session even when educator primary school differs', async () => {
      const otherSchoolId = 'other-school-456';
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'session-code-multi-school';

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: {
            id: EDUCATOR_ID,
            email: 'educator@test.com',
            school: { id: otherSchoolId },
          },
        },
      });
      createSessionMock.mockReturnValue(sessionCode);

      await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_ID }),
      );
      expect(createSessionMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: otherSchoolId }),
      );
    });

    it('INTEGRATION: should redirect with nrps_required when NRPS URL is missing', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
        nrpsUrl: '',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain('reason=nrps_required');
      expect(isUserInstructorInRosterMock).not.toHaveBeenCalled();
      expect(ltiLoginMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: should redirect with not_course_instructor when user not in roster', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      isUserInstructorInRosterMock.mockResolvedValue({
        isInstructor: false,
        error: 'User not found in course roster',
      });

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain('reason=not_course_instructor');
      expect(isUserInstructorInRosterMock).toHaveBeenCalled();
      expect(ltiLoginMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: should redirect with school_mismatch when educator has zero school memberships', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      findEducatorByEmailMock.mockResolvedValue({
        id: EDUCATOR_ID,
        email: 'educator@test.com',
        school: null,
        schoolAssignments: [],
      } as never);
      getEducatorSchoolIdsMock.mockReturnValue([]);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain('reason=school_mismatch');
      expect(isUserInstructorInRosterMock).not.toHaveBeenCalled();
      expect(ltiLoginMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: should redirect with school_mismatch when launch config does not match educator schools', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      getEducatorSchoolIdsMock.mockReturnValue(['other-school-id']);
      resolveEducatorLaunchConfigMock.mockResolvedValue(null);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=school_mismatch');
      expect(isUserInstructorInRosterMock).not.toHaveBeenCalled();
      expect(ltiLoginMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: should redirect with school_mismatch when ltiLogin rejects launch school', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      ltiLoginMock.mockResolvedValue({
        success: false,
        message: 'LTI_SCHOOL_MISMATCH',
        type: 'UNAUTHORIZED',
      });

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=school_mismatch');
      expect(ltiLoginMock).toHaveBeenCalledWith(
        'educator@test.com',
        SCHOOL_ID,
        expect.objectContaining({ id: EDUCATOR_ID }),
      );
    });

    it('INTEGRATION: should redirect with error if id_token is missing', async () => {
      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=missing_token');
    });

    it('INTEGRATION: should redirect with error if school config not found', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
      });

      resolveEducatorLaunchConfigMock.mockResolvedValue(null);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(resolveEducatorLaunchConfigMock).toHaveBeenCalled();
    });

    it('INTEGRATION: should redirect with error if JWT verification fails', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        nonce: 'test-nonce',
      });

      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockRejectedValue(new Error('Invalid signature'));

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(verifyIdTokenMock).toHaveBeenCalled();
    });
  });

  describe('POST /api/lti/session/exchange', () => {
    it('INTEGRATION: should exchange session code for JWT', async () => {
      const sessionCode = 'session-code-abc123';
      const accessToken = 'mock-jwt-token';
      const educator = { id: EDUCATOR_ID, email: 'educator@test.com' };

      consumeSessionMock.mockReturnValue(
        buildEducatorSession({ accessToken, user: educator }),
      );

      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: sessionCode, audience: 'educator' })
        .expect(200);

      expect(response.body).toMatchObject({
        audience: 'educator',
        accessToken,
        schoolId: SCHOOL_ID,
        user: educator,
      });
      expect(consumeSessionMock).toHaveBeenCalledWith(sessionCode, 'educator');
    });

    it('INTEGRATION: should return 400 if code is missing', async () => {
      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ audience: 'educator' })
        .expect(400);

      expect(response.body).toMatchObject({ error: expect.any(String) as string });
    });

    it('INTEGRATION: should return 400 if session code is invalid', async () => {
      consumeSessionMock.mockImplementation(() => {
        throw new Error('Invalid session code');
      });

      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: 'invalid-code', audience: 'educator' })
        .expect(400);

      expect(response.body).toMatchObject({ error: expect.any(String) as string });
    });

    it('INTEGRATION: should return 400 if audience is missing', async () => {
      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: 'some-code' })
        .expect(400);

      expect(response.body).toMatchObject({ error: expect.any(String) as string });
    });
  });

  describe('POST /api/lti/studentcallback', () => {
    it('INTEGRATION: should return HTML auto-submit form for student launch', async () => {
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'student@test.com',
      });

      const response = await request(httpServer())
        .post('/api/lti/studentcallback')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(200);

      expect(response.headers['content-type']).toContain('html');
      expect(response.text).toContain('<form');
      expect(response.text).toContain('id_token');
      expect(response.text).toContain('/lti/studentlaunch');
      expect(response.text).toContain('submit()');
    });

    it('INTEGRATION: should return 400 if id_token is missing', async () => {
      const response = await request(httpServer())
        .post('/api/lti/studentcallback')
        .send({ state: 'test-state' })
        .expect(400);

      expect(response.body).toMatchObject({ error: 'Missing id_token' });
    });
  });

  describe('POST /api/lti/studentlaunch', () => {
    it('INTEGRATION: should complete student launch and redirect with session code', async () => {
      const lmsUserId = 'moodle-student-456';
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: lmsUserId,
        email: 'student@test.com',
        courseId: '42',
        courseTitle: 'Test Course',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'student-session-abc123';

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig()]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: SCHOOL_ID,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: false,
      });
      studentLoginMock.mockResolvedValue({
        success: true,
        data: {
          id: 'student-id-123',
          student_id: STUDENT_CODE,
          status: undefined,
          class_id: 'class-123',
          class_name: 'Test Class',
          access_token: 'student-access-token',
        },
      });
      createSessionMock.mockReturnValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=success');
      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(response.headers.location).toContain('student-dashboard');
      expect(quickDecodeMock).toHaveBeenCalled();
      expect(verifyIdTokenMock).toHaveBeenCalled();
      expect(listStudentLaunchConfigsMock).toHaveBeenCalled();
      expect(resolveStudentCodeForLaunchMock).toHaveBeenCalledWith({
        lmsUserId,
        launchCourseIds: expect.any(Array) as string[],
        schoolIds: [SCHOOL_ID],
      });
      expect(studentLoginMock).toHaveBeenCalledWith(STUDENT_CODE);
      expect(createSessionMock).toHaveBeenCalled();
    });

    it('INTEGRATION: should return 400 if id_token is missing', async () => {
      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ state: 'test-state' })
        .expect(400);

      expect(response.body).toMatchObject({ error: expect.any(String) as string });
    });

    it('INTEGRATION: should redirect with error if school not found', async () => {
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'student-123',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      listStudentLaunchConfigsMock.mockResolvedValue([]);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=school_not_found');
    });

    it('INTEGRATION: should resolve student from matching school when tool is shared across schools', async () => {
      const SCHOOL_A = 'school-a-shared';
      const SCHOOL_B = 'school-b-shared';
      const lmsUserId = 'moodle-student-shared';
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: lmsUserId,
        courseId: '42',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'student-session-shared';

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      listStudentLaunchConfigsMock.mockResolvedValue([
        buildSchoolConfig({ schoolId: SCHOOL_A, id: 'config-a' }),
        buildSchoolConfig({ schoolId: SCHOOL_B, id: 'config-b' }),
      ]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: SCHOOL_B,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: true,
      });
      studentLoginMock.mockResolvedValue({
        success: true,
        data: {
          id: 'student-id-shared',
          student_id: STUDENT_CODE,
          class_id: 'class-shared',
          class_name: 'Shared Class',
          access_token: 'student-access-token',
        },
      });
      createSessionMock.mockReturnValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(resolveStudentCodeForLaunchMock).toHaveBeenCalledWith({
        lmsUserId,
        launchCourseIds: expect.any(Array) as string[],
        schoolIds: [SCHOOL_A, SCHOOL_B],
      });
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_B, studentCode: STUDENT_CODE }),
      );
    });

    it('INTEGRATION: should redirect with error if student not found (no course context)', async () => {
      const lmsUserId = 'unknown-student-789';
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: lmsUserId,
        courseId: '',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig()]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: null,
        studentCode: null,
        courseScopedClassFound: false,
      });

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=student_not_found');
    });

    it('INTEGRATION: should redirect with class_not_provisioned when course context exists but class is missing', async () => {
      const lmsUserId = 'unknown-student-789';
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: lmsUserId,
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig()]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: null,
        studentCode: null,
        courseScopedClassFound: false,
      });

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=class_not_provisioned');
    });

    it('INTEGRATION: should redirect with error if student login fails', async () => {
      const lmsUserId = 'moodle-student-456';
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: lmsUserId,
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig()]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: SCHOOL_ID,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: false,
      });
      studentLoginMock.mockResolvedValue({
        success: false,
        message: 'STUDENT_ID_NOT_FOUND',
      });

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=login_failed');
    });

    it('INTEGRATION: should redirect educator to educator app when using student tool', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'educator-456',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=educator_using_student_tool');
    });

    it('INTEGRATION: should require student/learner role', async () => {
      const idToken = LtiTokenFactory.buildStudentLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'user-123',
        roles: [],
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockReturnValue(undefined);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=student_role_required');
    });
  });

  describe('POST /api/lti/session/exchange - Student', () => {
    it('INTEGRATION: should exchange student session code for access token', async () => {
      const sessionCode = 'student-session-abc123';
      const accessToken = 'student-access-token';

      consumeSessionMock.mockReturnValue(
        buildStudentSession({ studentCode: STUDENT_CODE, accessToken }),
      );

      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: sessionCode, audience: 'student' })
        .expect(200);

      expect(response.body).toMatchObject({
        audience: 'student',
        accessToken,
        studentCode: STUDENT_CODE,
      });
      expect(consumeSessionMock).toHaveBeenCalledWith(sessionCode, 'student');
    });
  });
});
