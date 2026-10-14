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
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { AuthService } from '../../../src/auth/auth.service';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';

import { LmsAssignmentService } from '../../../src/lms/services/lms-assignment.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { LtiController } from '../../../src/lti/lti.controller';
import { LtiKeyService } from '../../../src/lti/lti-key.service';
import { LtiJwtService } from '../../../src/lti/lti-jwt.service';
import { LtiSessionService } from '../../../src/lti/lti-session.service';
import { LtiDeepLinkingService } from '../../../src/lti/services/lti-deep-linking.service';
import { LtiSubmissionReviewService } from '../../../src/lti/services/lti-submission-review.service';
import {
  EducatorLtiSessionPayload,
  LtiLaunchContext,
  StudentLtiSessionPayload,
} from '../../../src/lti/lti-session.types';
import { LtiStateRecord, LtiStateService } from '../../../src/lti/lti-state.service';
import { LtiService } from '../../../src/lti/lti.service';

import { StudentsService } from '../../../src/students/students.service';
import { LoggerService, TokenService } from '../../../src/common/services';
import { MappedSimulation } from '../../../src/common/types';
import { LtiTokenFactory, decodeFakeJwt } from './helpers/lti-token.factory';
import { signCanvasReviewToken } from '../../../src/lti/utils/canvas-review-token.util';
import { Class, LmsAssignmentMapping, LmsSchoolConfig, Schools } from 'src/database/entities';

const FRONTEND_URL = 'http://localhost:3001';
const STUDENT_FRONTEND_URL = 'http://localhost:5174';
const ISSUER = 'https://moodle.test.edu';
const CLIENT_ID = 'test-client-id';
const SCHOOL_ID = 'test-school-123';
const EDUCATOR_ID = 'educator-test-id';
const STUDENT_CODE = 'STU123';

/** Default OIDC state record after validateAndConsume (no SpeedGrader token). */
const DEFAULT_LTI_STATE: LtiStateRecord = {
  nonce: 'test-nonce',
  toolType: 'educator',
};

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

/**
 * Successful educator handoff returns HTML (not an HTTP 303).
 * Default: auto top-frame redirect (Moodle + Canvas course-nav / Setup).
 * openInNewTab: Canvas SpeedGrader / report deep-link only.
 */
function expectEducatorTopLevelSuccess(
  response: { status: number; text: string; headers: Record<string, unknown> },
  opts: { sessionCode?: string; frontendUrl?: string; openInNewTab?: boolean } = {},
): void {
  expect(response.status).toBe(200);
  expect(String(response.headers['content-type'] ?? '')).toMatch(/html/);
  if (opts.openInNewTab) {
    expect(response.text).toContain('target="_blank"');
    expect(response.text).toContain('Open in RealityWorks');
    expect(response.text).not.toContain('window.top.location.href');
  } else {
    expect(response.text).toContain('window.top.location.href');
  }
  expect(response.text).toContain('lti_launch=success');
  if (opts.frontendUrl) {
    expect(response.text).toContain(opts.frontendUrl);
  }
  if (opts.sessionCode) {
    expect(response.text).toContain(`code=${opts.sessionCode}`);
  }
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
  return {
    audience: 'educator',
    userId: EDUCATOR_ID,
    schoolId: SCHOOL_ID,
    ltiContext: defaultLtiContext(),
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
  return {
    audience: 'student',
    userId: null,
    schoolId: SCHOOL_ID,
    ltiContext: defaultLtiContext(),
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
  let getSessionMock: jest.MockedFunction<LtiSessionService['getSession']>;
  let deleteSessionMock: jest.MockedFunction<LtiSessionService['deleteSession']>;
  let resolveEducatorLaunchConfigMock: jest.MockedFunction<
    LmsConfigService['resolveEducatorLaunchConfig']
  >;
  let listEducatorLaunchConfigsMock: jest.MockedFunction<
    LmsConfigService['listEducatorLaunchConfigs']
  >;
  let resolveStudentLaunchConfigMock: jest.MockedFunction<
    LmsConfigService['resolveStudentLaunchConfig']
  >;
  let listStudentLaunchConfigsMock: jest.MockedFunction<
    LmsConfigService['listStudentLaunchConfigs']
  >;
  let filterConfigsByLaunchDeploymentMock: jest.MockedFunction<
    LmsConfigService['filterConfigsByLaunchDeployment']
  >;
  let findSchoolbyIssuerMock: jest.MockedFunction<LmsConfigService['findSchoolbyIssuer']>;
  let findSchoolByClientIdMock: jest.MockedFunction<LmsConfigService['findSchoolByClientId']>;
  let findByIssuerMock: jest.MockedFunction<LmsConfigService['findByIssuer']>;
  let findOrFetchSchoolMock: jest.Mock;
  let resolveStudentCodeMock: jest.MockedFunction<
    LmsLookupService['resolveStudentCodeForLaunch']
  >;
  let upsertMappingMock: jest.MockedFunction<LmsAssignmentService['upsertMapping']>;
  let resolveLaunchSimulationMock: jest.MockedFunction<
    LmsAssignmentService['resolveLaunchSimulation']
  >;
  // Legacy stub kept so tests can assert auto-create is not invoked.
  let ltiLoginOrCreateMock: jest.Mock;
  let ltiLoginMock: jest.MockedFunction<AuthService['ltiLogin']>;
  let findEducatorByEmailMock: jest.MockedFunction<AuthService['findEducatorByEmail']>;
  let getEducatorSchoolIdsMock: jest.MockedFunction<AuthService['getEducatorSchoolIds']>;
  let provisionFromLtiLoginMock: jest.MockedFunction<LmsProvisionService['provisionFromLtiLogin']>;
  let findStudentCodeByLmsClassAndUserIdMock: jest.MockedFunction<
    LmsLookupService['findStudentCodeByLmsClassAndUserId']
  >;
  let findStudentCodeByLmsUserIdInSchoolMock: jest.MockedFunction<
    LmsLookupService['findStudentCodeByLmsUserIdInSchool']
  >;
  let findStudentCodeByLmsUserIdGloballyMock: jest.MockedFunction<
    LmsLookupService['findStudentCodeByLmsUserIdGlobally']
  >;
  let ensureMappedStudentAccountMock: jest.MockedFunction<
    LmsLookupService['ensureMappedStudentAccount']
  >;
  let resolveStudentCodeForLaunchMock: jest.MockedFunction<
    LmsLookupService['resolveStudentCodeForLaunch']
  >;
  let resolveClassForDeepLinkingMock: jest.MockedFunction<
    LmsLookupService['resolveClassForDeepLinking']
  >;
  let findByClassMock: jest.MockedFunction<ClassSimulationService['findByClass']>;
  let findActiveClassByLmsCourseIdMock: jest.MockedFunction<
    LmsLookupService['findActiveClassByLmsCourseId']
  >;
  let studentLoginMock: jest.MockedFunction<StudentsService['studentLogin']>;
  let setAuthCookiesMock: jest.MockedFunction<TokenService['setAuthCookies']>;
  let blacklistAddMock: jest.Mock;
  let extractClientIdFromRawTokenMock: jest.MockedFunction<
    LtiJwtService['extractClientIdFromRawToken']
  >;

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
    getSessionMock = jest.fn();
    deleteSessionMock = jest.fn();
    resolveEducatorLaunchConfigMock = jest.fn();
    listEducatorLaunchConfigsMock = jest.fn();
    resolveStudentLaunchConfigMock = jest.fn();
    listStudentLaunchConfigsMock = jest.fn();
    filterConfigsByLaunchDeploymentMock = jest.fn(
      (configs: LmsSchoolConfig[], _tokenDeploymentId: string | null | undefined) => configs,
    );
    findSchoolbyIssuerMock = jest.fn();
    findSchoolByClientIdMock = jest.fn();
    findByIssuerMock = jest.fn();
    findOrFetchSchoolMock = jest.fn();
    resolveStudentCodeMock = jest.fn();
    upsertMappingMock = jest.fn();
    resolveLaunchSimulationMock = jest.fn().mockResolvedValue(null);
    ltiLoginOrCreateMock = jest.fn();
    ltiLoginMock = jest.fn();
    findEducatorByEmailMock = jest.fn();
    getEducatorSchoolIdsMock = jest.fn();
    provisionFromLtiLoginMock = jest.fn();
    ensureMappedStudentAccountMock = jest.fn();
    resolveStudentCodeForLaunchMock = jest.fn();
    resolveClassForDeepLinkingMock = jest.fn();
    findByClassMock = jest.fn();
    findStudentCodeByLmsClassAndUserIdMock = jest.fn();
    findStudentCodeByLmsUserIdInSchoolMock = jest.fn();
    findStudentCodeByLmsUserIdGloballyMock = jest.fn();
    findActiveClassByLmsCourseIdMock = jest.fn();
    studentLoginMock = jest.fn();
    setAuthCookiesMock = jest.fn();
    blacklistAddMock = jest.fn().mockResolvedValue(undefined);
    extractClientIdFromRawTokenMock = jest.fn().mockReturnValue(CLIENT_ID);

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
            extractClientIdFromRawToken: extractClientIdFromRawTokenMock,
            extractDeepLinkingSettings: jest.fn((payload: Record<string, unknown>) => {
              const dlClaim = payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'];
              if (!dlClaim || typeof dlClaim !== 'object') return null;
              const settings = dlClaim as Record<string, unknown>;
              return {
                deep_link_return_url: settings.deep_link_return_url as string,
                accept_types: settings.accept_types as string[],
                accept_multiple: settings.accept_multiple as boolean | undefined,
                data: settings.data as string | undefined,
              };
            }),
          },
        },
        { provide: LtiStateService, useValue: { validateAndConsume: validateAndConsumeMock } },
        {
          provide: LtiSessionService,
          useValue: {
            createSession: createSessionMock,
            consumeSession: consumeSessionMock,
            getSession: getSessionMock,
            deleteSession: deleteSessionMock,
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
          provide: LtiDeepLinkingService,
          useValue: {
            signDeepLinkingResponse: jest.fn().mockResolvedValue('fake.jwt.token'),
            generateReturnForm: jest.fn((url: string, jwt: string) => {
              // Return realistic HTML form that matches actual implementation
              return `<!DOCTYPE html>
<html>
  <head>
    <title>Returning to LMS</title>
    <meta charset="utf-8">
  </head>
  <body>
    <p>Processing your selection...</p>
    <form id="dlForm" method="POST" action="${url}">
      <input type="hidden" name="JWT" value="${jwt}" />
    </form>
    <script>
      document.getElementById('dlForm').submit();
    </script>
  </body>
</html>`;
            }),
          },
        },
        {
          provide: LtiSubmissionReviewService,
          useValue: {
            resolveReviewLaunch: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'FRONTEND_URL' || key === 'app.frontendUrl') return FRONTEND_URL;
              if (key === 'API_BASE_URL' || key === 'app.apiBaseUrl')
                return 'http://localhost:3000/api';
              if (key === 'STUDENT_FRONTEND_URL' || key === 'app.studentFrontendUrl')
                return STUDENT_FRONTEND_URL;
              if (key === 'NODE_ENV' || key === 'app.nodeEnv') return 'test';
              if (key === 'JWT_SECRET' || key === 'jwt.accessSecret') return 'test-secret';
              if (key === 'JWT_EXPIRES_IN' || key === 'jwt.accessExpiresIn') return 3600;
              if (key === 'lti.studentCodeSecret') return null;
              if (key === 'lms.enableLtiAutoProvision' || key === 'LMS_ENABLE_LTI_AUTO_PROVISION')
                return false;
              return null;
            }),
          },
        },
        {
          provide: LmsConfigService,
          useValue: {
            resolveEducatorLaunchConfig: resolveEducatorLaunchConfigMock,
            listEducatorLaunchConfigs: listEducatorLaunchConfigsMock,
            resolveStudentLaunchConfig: resolveStudentLaunchConfigMock,
            listStudentLaunchConfigs: listStudentLaunchConfigsMock,
            filterConfigsByLaunchDeployment: filterConfigsByLaunchDeploymentMock,
            findSchoolConfig: jest.fn(),
            findByIssuer: findByIssuerMock,
            findSchoolbyIssuer: findSchoolbyIssuerMock,
            findSchoolByClientId: findSchoolByClientIdMock,
            findByClientId: jest.fn(),
            resolveOAuthConfigForClient: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: AuthService,
          useValue: {
            loginOrCreateEducatorForLtiLaunch: jest.fn(),
            loginOrCreateStudentForLtiLaunch: jest.fn(),
            ltiLoginOrCreate: ltiLoginOrCreateMock,
            ltiLogin: ltiLoginMock,
            findEducatorByEmail: findEducatorByEmailMock,
            getEducatorSchoolIds: getEducatorSchoolIdsMock,
          },
        },
        {
          provide: LmsProvisionService,
          useValue: {
            provisionFromLtiLogin: provisionFromLtiLoginMock,
            provisionClassForLtiLaunch: jest.fn(),
            isUserInstructorInRoster: jest.fn(),
            syncRosterForMappedCourse: jest.fn().mockResolvedValue(false),
            findOrFetchSchool: findOrFetchSchoolMock,
          },
        },
        {
          provide: LmsLookupService,
          useValue: {
            findEducatorByLmsUserId: jest.fn(),
            findActiveClassByLmsCourseId: findActiveClassByLmsCourseIdMock,
            ensureMappedStudentAccount: ensureMappedStudentAccountMock,
            findStudentByConstructedCode: jest.fn(),
            findStudentCodeByLmsClassAndUserId: findStudentCodeByLmsClassAndUserIdMock,
            findStudentCodeByLmsUserIdInSchool: findStudentCodeByLmsUserIdInSchoolMock,
            findStudentCodeByLmsUserIdGlobally: findStudentCodeByLmsUserIdGloballyMock,
            resolveStudentCodeForLaunch: resolveStudentCodeForLaunchMock,
            resolveClassForDeepLinking: resolveClassForDeepLinkingMock,
          },
        },
        {
          provide: ClassSimulationService,
          useValue: {
            findByClass: findByClassMock,
          },
        },
        {
          provide: LmsAssignmentService,
          useValue: {
            resolveLaunchSimulation: resolveLaunchSimulationMock,
            upsertMapping: upsertMappingMock,
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
        {
          provide: StudentsService,
          useValue: { findOne: jest.fn(), studentLogin: studentLoginMock },
        },
        {
          provide: TokenService,
          useValue: {
            setAuthCookies: setAuthCookiesMock,
            blackListToken: blacklistAddMock,
            isBlackListed: jest.fn().mockResolvedValue(false),
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
    extractClientIdFromRawTokenMock.mockReturnValue(CLIENT_ID);
    findEducatorByEmailMock.mockResolvedValue(null);
    getEducatorSchoolIdsMock.mockReturnValue([]);
    listEducatorLaunchConfigsMock.mockResolvedValue([buildSchoolConfig()]);
    listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig({ schoolId: SCHOOL_ID })]);
    resolveStudentCodeForLaunchMock.mockResolvedValue({
      schoolId: null,
      studentCode: null,
      courseScopedClassFound: false,
    });
    resolveStudentLaunchConfigMock.mockResolvedValue(
      buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
    );
    findStudentCodeByLmsClassAndUserIdMock.mockResolvedValue({
      studentCode: null,
      classFound: false,
    });
    findStudentCodeByLmsUserIdInSchoolMock.mockResolvedValue(null);
    findStudentCodeByLmsUserIdGloballyMock.mockResolvedValue(null);
    ensureMappedStudentAccountMock.mockResolvedValue(null);
    findActiveClassByLmsCourseIdMock.mockResolvedValue(null);
    resolveClassForDeepLinkingMock.mockResolvedValue(null);
    findByClassMock.mockResolvedValue({ success: true, data: [] });
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'educator@test.com', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response, {
        frontendUrl: FRONTEND_URL,
        sessionCode,
      });
      expect(quickDecodeMock).toHaveBeenCalledWith(idToken);
      expect(extractClientIdFromRawTokenMock).toHaveBeenCalledWith(idToken);
      expect(resolveEducatorLaunchConfigMock).toHaveBeenCalled();
      expect(verifyIdTokenMock).toHaveBeenCalled();
      expect(validateAndConsumeMock).toHaveBeenCalled();
      expect(ltiLoginMock).toHaveBeenCalledWith(
        'educator@test.com',
        SCHOOL_ID,
        null,
        expect.anything(),
      );
      expect(ltiLoginOrCreateMock).not.toHaveBeenCalled();
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_ID }),
      );
    });

    it('INTEGRATION: should store LMS launch school in educator session (not user.school)', async () => {
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
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
      createSessionMock.mockResolvedValue(sessionCode);

      await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(200);

      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_ID }),
      );
      expect(createSessionMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: otherSchoolId }),
      );
    });

    it('INTEGRATION: should complete educator launch when NRPS URL is missing', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
        nrpsUrl: '',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'session-code-no-nrps';

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'educator@test.com', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response);
      expect(ltiLoginMock).toHaveBeenCalled();
      expect(ltiLoginOrCreateMock).not.toHaveBeenCalled();
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
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
        null,
        expect.anything(),
      );
      expect(ltiLoginOrCreateMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: rejects unregistered educator without auto-create', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'new-teacher@test.com',
        courseId: '42',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      findEducatorByEmailMock.mockResolvedValue(null);
      ltiLoginMock.mockResolvedValue({
        success: false,
        message: 'User not found',
        type: 'UNAUTHORIZED',
      });

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=educator_not_registered');
      expect(ltiLoginMock).toHaveBeenCalledWith(
        'new-teacher@test.com',
        SCHOOL_ID,
        null,
        expect.anything(),
      );
      expect(ltiLoginOrCreateMock).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: logs in existing educator via ltiLogin (no create)', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        email: 'educator@test.com',
        courseId: '42',
        nonce: 'test-nonce',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'educator-session-no-create';
      const existingEducator = {
        id: EDUCATOR_ID,
        email: 'educator@test.com',
        school: { id: SCHOOL_ID },
        schoolAssignments: [],
      };

      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      findEducatorByEmailMock.mockResolvedValue(existingEducator as never);
      getEducatorSchoolIdsMock.mockReturnValue([SCHOOL_ID]);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'educator@test.com', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response, { sessionCode });
      expect(ltiLoginMock).toHaveBeenCalled();
      expect(ltiLoginOrCreateMock).not.toHaveBeenCalled();
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

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(null);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=school_not_configured');
      expect(resolveEducatorLaunchConfigMock).toHaveBeenCalled();
      expect(ltiLoginOrCreateMock).not.toHaveBeenCalled();
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

      consumeSessionMock.mockResolvedValue(buildEducatorSession({ accessToken, user: educator }));

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
      expect(setAuthCookiesMock).toHaveBeenCalledWith(expect.anything(), {
        access_token: accessToken,
        expires_in: 3600,
      });
      expect(blacklistAddMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: blacklists prior portal JWT on LTI session exchange', async () => {
      const sessionCode = 'session-code-revoke-prior';
      const accessToken = 'new-lti-jwt-token';
      const priorToken = 'prior-admin-jwt-token';
      const educator = { id: EDUCATOR_ID, email: 'educator@test.com' };

      consumeSessionMock.mockResolvedValue(buildEducatorSession({ accessToken, user: educator }));

      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .set('Authorization', `Bearer ${priorToken}`)
        .send({ code: sessionCode, audience: 'educator' })
        .expect(200);

      expect(response.body.accessToken).toBe(accessToken);
      expect(blacklistAddMock).toHaveBeenCalledWith(priorToken);
    });

    it('INTEGRATION: does not blacklist when prior Authorization token equals new LTI access token', async () => {
      const sessionCode = 'session-code-same-token';
      const accessToken = 'same-jwt-token';
      const educator = { id: EDUCATOR_ID, email: 'educator@test.com' };

      consumeSessionMock.mockResolvedValue(buildEducatorSession({ accessToken, user: educator }));

      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: sessionCode, audience: 'educator' })
        .expect(200);

      expect(response.body.accessToken).toBe(accessToken);
      expect(blacklistAddMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: should return 400 if code is missing', async () => {
      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ audience: 'educator' })
        .expect(400);

      expect(response.body).toMatchObject({ error: expect.any(String) as string });
    });

    it('INTEGRATION: should return 400 if session code is invalid', async () => {
      consumeSessionMock.mockRejectedValue(new Error('Invalid session code'));

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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig({ schoolId: SCHOOL_ID })]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: SCHOOL_ID,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: true,
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
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=success');
      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(response.headers.location).toContain('student-dashboard');
      expect(quickDecodeMock).toHaveBeenCalled();
      expect(extractClientIdFromRawTokenMock).toHaveBeenCalledWith(idToken);
      expect(verifyIdTokenMock).toHaveBeenCalled();
      expect(resolveStudentLaunchConfigMock).toHaveBeenCalled();
      expect(listStudentLaunchConfigsMock).toHaveBeenCalledWith(ISSUER, CLIENT_ID);
      expect(resolveStudentCodeForLaunchMock).toHaveBeenCalledWith({
        lmsUserId,
        launchCourseIds: ['42'],
        schoolIds: [SCHOOL_ID],
      });
      expect(studentLoginMock).toHaveBeenCalledWith(
        STUDENT_CODE,
        expect.anything(),
        expect.objectContaining({
          simulationId: undefined,
          resourceLinkId: undefined,
          classId: undefined,
        }),
      );
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([]);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=school_not_found');
    });

    it('INTEGRATION: should resolve student from multiple schools via course context', async () => {
      const CLIENT_SCHOOL = 'school-from-client';
      const ISSUER_SCHOOL = 'school-from-issuer';
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT, schoolId: CLIENT_SCHOOL }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([
        buildSchoolConfig({ schoolId: CLIENT_SCHOOL }),
        buildSchoolConfig({ schoolId: ISSUER_SCHOOL }),
      ]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: CLIENT_SCHOOL,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: true,
      });
      studentLoginMock.mockResolvedValue({
        success: true,
        data: {
          id: 'student-id-shared',
          student_id: STUDENT_CODE,
          status: undefined,
          class_id: 'class-shared',
          class_name: 'Shared Class',
          access_token: 'student-access-token',
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(listStudentLaunchConfigsMock).toHaveBeenCalledWith(ISSUER, CLIENT_ID);
      expect(resolveStudentCodeForLaunchMock).toHaveBeenCalledWith({
        lmsUserId,
        launchCourseIds: ['42'],
        schoolIds: [CLIENT_SCHOOL, ISSUER_SCHOOL],
      });
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: CLIENT_SCHOOL, studentCode: STUDENT_CODE }),
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig({ schoolId: SCHOOL_ID })]);
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig({ schoolId: SCHOOL_ID })]);
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([buildSchoolConfig({ schoolId: SCHOOL_ID })]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: SCHOOL_ID,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: true,
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

    it('INTEGRATION: should hand off instructor on student tool to educator app', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'educator-456',
        email: 'educator@test.com',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'educator-from-student-tool';

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'educator@test.com', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response, {
        frontendUrl: FRONTEND_URL,
        sessionCode,
      });
      expect(ltiLoginMock).toHaveBeenCalled();
      expect(ltiLoginOrCreateMock).not.toHaveBeenCalled();
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
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );

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

      consumeSessionMock.mockResolvedValue(
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
      expect(setAuthCookiesMock).toHaveBeenCalledWith(expect.anything(), {
        access_token: accessToken,
        expires_in: 3600,
      });
    });
  });

  describe('POST /api/lti/launch - Deep Linking Request', () => {
    it('INTEGRATION: should handle Deep Linking request and redirect to picker UI', async () => {
      const idToken = LtiTokenFactory.buildDeepLinkingRequestToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'educator-dl-123',
        email: 'educator@test.com',
        courseId: 'course-456',
        courseTitle: 'Biology 101',
        deepLinkReturnUrl: 'https://moodle.test.edu/mod/lti/contentitem/return.php',
        acceptTypes: ['ltiResourceLink'],
        acceptMultiple: true,
        dataToken: 'opaque-token-xyz',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'dl-session-abc123';

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());
      findOrFetchSchoolMock.mockResolvedValue(buildSchool());
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302); // res.redirect() without explicit status uses 302

      expect(response.headers.location).toContain('http://localhost:3000/api/lti/deep-linking/picker');
      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: 'deep_linking',
          issuer: ISSUER,
          schoolId: SCHOOL_ID,
          deepLinkingSettings: expect.objectContaining({
            deep_link_return_url: 'https://moodle.test.edu/mod/lti/contentitem/return.php',
            accept_types: ['ltiResourceLink'],
            accept_multiple: true,
            data: 'opaque-token-xyz',
          }),
        }),
      );
    });

    it('INTEGRATION: should reject Deep Linking request with missing deep_link_return_url', async () => {
      const idToken = LtiTokenFactory.buildEducatorLaunchToken({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'educator-dl-456',
      });

      const payload = decodeFakeJwt(idToken) as Record<string, unknown>;
      payload['https://purl.imsglobal.org/spec/lti/claim/message_type'] = 'LtiDeepLinkingRequest';
      // Completely missing deep_linking_settings claim

      quickDecodeMock.mockReturnValue(payload);
      verifyIdTokenMock.mockResolvedValue(payload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(302);

      expect(response.headers.location).toContain(FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=invalid_deep_linking'); // Corrected reason
    });

    describe('school and role guard', () => {
      const SCHOOL_A = 'school-a';
      const SCHOOL_B = 'school-b';

      const launchDeepLinking = async (roles?: string[]) => {
        const idToken = LtiTokenFactory.buildDeepLinkingRequestToken({
          issuer: ISSUER,
          clientId: CLIENT_ID,
          email: 'educator@test.com',
          roles,
        });
        const payload = decodeFakeJwt(idToken) as JWTPayload;
        quickDecodeMock.mockReturnValue(payload);
        verifyIdTokenMock.mockResolvedValue(payload);
        validateAndConsumeMock.mockResolvedValue(undefined);
        createSessionMock.mockResolvedValue('dl-session-guard');

        return request(httpServer())
          .post('/api/lti/launch')
          .send({ id_token: idToken, state: 'test-state' })
          .expect(302);
      };

      const shareToolBetweenSchools = () => {
        const configs = [
          buildSchoolConfig({ id: 'cfg-a', schoolId: SCHOOL_A }),
          buildSchoolConfig({ id: 'cfg-b', schoolId: SCHOOL_B }),
        ];
        listEducatorLaunchConfigsMock.mockResolvedValue(configs);
        resolveEducatorLaunchConfigMock.mockImplementation(async (_issuer, _clientId, schoolIds) =>
          schoolIds?.length
            ? (configs.find((c) => schoolIds.includes(c.schoolId)) ?? null)
            : configs[0],
        );
      };

      it('INTEGRATION: rejects a learner without creating a picker session', async () => {
        resolveEducatorLaunchConfigMock.mockResolvedValue(buildSchoolConfig());

        const response = await launchDeepLinking([
          'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
        ]);

        expect(response.headers.location).toContain(FRONTEND_URL);
        expect(response.headers.location).toContain('reason=educator_role_required');
        expect(createSessionMock).not.toHaveBeenCalled();
      });

      it('INTEGRATION: binds a shared-tool session to the educator school', async () => {
        shareToolBetweenSchools();
        findEducatorByEmailMock.mockResolvedValue({ id: 'educator-b' } as never);
        getEducatorSchoolIdsMock.mockReturnValue([SCHOOL_B]);

        const response = await launchDeepLinking();

        expect(response.headers.location).toContain('code=dl-session-guard');
        expect(createSessionMock).toHaveBeenCalledWith(
          expect.objectContaining({ audience: 'deep_linking', schoolId: SCHOOL_B }),
        );
      });

      it('INTEGRATION: fails closed when the educator belongs to none of the shared-tool schools', async () => {
        shareToolBetweenSchools();
        findEducatorByEmailMock.mockResolvedValue({ id: 'educator-c' } as never);
        getEducatorSchoolIdsMock.mockReturnValue(['school-c']);

        const response = await launchDeepLinking();

        expect(response.headers.location).toContain('reason=school_mismatch');
        expect(createSessionMock).not.toHaveBeenCalled();
      });

      it('INTEGRATION: fails closed for an unknown educator on a shared tool', async () => {
        shareToolBetweenSchools();

        const response = await launchDeepLinking();

        expect(response.headers.location).toContain('reason=school_mismatch');
        expect(createSessionMock).not.toHaveBeenCalled();
      });
    });
  });

  describe('POST /api/lti/deep-linking/exchange', () => {
    it('INTEGRATION: should exchange Deep Linking session code for context', async () => {
      const sessionCode = 'dl-session-xyz789';
      const deepLinkingSession = {
        audience: 'deep_linking' as const,
        issuer: ISSUER,
        schoolId: SCHOOL_ID,
        classId: 'class-123',
        courseTitle: 'Biology 101',
        deepLinkingSettings: {
          deep_link_return_url: 'https://moodle.test.edu/mod/lti/contentitem/return.php',
          accept_types: ['ltiResourceLink'],
          accept_multiple: true,
        },
        deploymentId: 'deploy-1',
        clientId: CLIENT_ID,
        payload: {},
      };

      getSessionMock.mockResolvedValue(deepLinkingSession);

      const response = await request(httpServer())
        .post('/api/lti/deep-linking/exchange')
        .send({ code: sessionCode })
        .expect(200);

      expect(response.body).toMatchObject({
        schoolId: SCHOOL_ID,
        // classId is null in the session
        courseTitle: 'Biology 101',
        deepLinkingSettings: {
          deep_link_return_url: 'https://moodle.test.edu/mod/lti/contentitem/return.php',
          accept_types: ['ltiResourceLink'],
          accept_multiple: true,
        },
      });
      expect(getSessionMock).toHaveBeenCalledWith(sessionCode);
    });

    it('INTEGRATION: should reject invalid session code', async () => {
      getSessionMock.mockResolvedValue(null);

      const response = await request(httpServer())
        .post('/api/lti/deep-linking/exchange')
        .send({ code: 'invalid-code' })
        .expect(400);

      expect(response.body.error).toContain('Invalid or expired');
    });
  });

  describe('POST /api/lti/deep-linking/submit', () => {
    it('INTEGRATION: should submit Deep Linking response and return HTML form', async () => {
      const sessionCode = 'dl-session-submit-123';
      const deepLinkingSession = {
        audience: 'deep_linking' as const,
        issuer: ISSUER,
        schoolId: SCHOOL_ID,
        classId: 'class-123',
        courseTitle: 'Biology 101',
        deepLinkingSettings: {
          deep_link_return_url: 'https://moodle.test.edu/mod/lti/contentitem/return.php',
          accept_types: ['ltiResourceLink'],
          accept_multiple: true,
          data: 'opaque-token-xyz',
        },
        deploymentId: 'deploy-1',
        clientId: CLIENT_ID,
        payload: {
          'https://purl.imsglobal.org/spec/lti/claim/context': {
            id: 'course-456',
            title: 'Biology 101',
          },
        },
      };

      const mockResolveOAuthConfig = jest.fn().mockResolvedValue(
        buildSchoolConfig({ platformKeyId: 'test-kid', platformPrivateKeyPem: 'fake-pem' }),
      );

      consumeSessionMock.mockResolvedValue(deepLinkingSession);
      resolveClassForDeepLinkingMock.mockResolvedValue({
        rwClass: { id: 'class-123' } as Class,
        schoolId: SCHOOL_ID,
      });
      findByClassMock.mockResolvedValue({
        success: true,
        data: [
          { simulation_id: 'sim-123' } as MappedSimulation,
          { simulation_id: 'sim-456' } as MappedSimulation,
        ],
      });

      // Mock resolveOAuthConfigForClient on the test module
      const lmsConfigService = app.get(LmsConfigService);
      jest.spyOn(lmsConfigService, 'resolveOAuthConfigForClient').mockImplementation(mockResolveOAuthConfig);

      const response = await request(httpServer())
        .post('/api/lti/deep-linking/submit')
        .send({
          code: sessionCode,
          selections: [
            { simulationId: 'sim-123', title: 'Simulation A', scoreMaximum: 100 },
            { simulationId: 'sim-456', title: 'Simulation B', scoreMaximum: 100 },
          ],
        })
        .expect(201); // Deep Linking submit returns 201 Created

      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('action="https://moodle.test.edu/mod/lti/contentitem/return.php"');
      expect(response.text).toContain('<input type="hidden" name="JWT"');
      expect(response.text).toContain('document.getElementById(\'dlForm\').submit()');

      expect(consumeSessionMock).toHaveBeenCalledWith(sessionCode, 'deep_linking');
      expect(resolveClassForDeepLinkingMock).toHaveBeenCalledWith({
        lmsCourseIds: ['course-456'],
        issuer: ISSUER,
        preferredSchoolId: SCHOOL_ID,
      });
      expect(findByClassMock).toHaveBeenCalledWith('class-123');
      expect(mockResolveOAuthConfig).toHaveBeenCalledWith(SCHOOL_ID, CLIENT_ID, LmsToolType.EDUCATOR);
    });

    it('INTEGRATION: should reject empty selections array', async () => {
      const sessionCode = 'dl-session-empty-selections';
      const deepLinkingSession = {
        audience: 'deep_linking' as const,
        issuer: ISSUER,
        schoolId: SCHOOL_ID,
        classId: null,
        courseTitle: null,
        deepLinkingSettings: {
          deep_link_return_url: 'https://moodle.test.edu/mod/lti/contentitem/return.php',
          accept_types: ['ltiResourceLink'],
          accept_multiple: false,
        },
        deploymentId: 'deploy-1',
        clientId: CLIENT_ID,
        payload: {},
      };

      getSessionMock.mockResolvedValue(deepLinkingSession);

      const response = await request(httpServer())
        .post('/api/lti/deep-linking/submit')
        .send({ code: sessionCode, selections: [] })
        .expect(400);

      expect(response.body.error).toContain('No simulations selected'); // Match actual error message
    });
  });

  describe('POST /api/lti/studentlaunch - With Custom Simulation ID', () => {
    it('INTEGRATION: should capture custom_simulation_id in ltiLaunchContext', async () => {
      const simulationId = 'sim-deep-linking-123';
      const idToken = LtiTokenFactory.buildStudentLaunchWithSimulation({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'student-789',
        simulationId,
        resourceLinkId: 'resource-link-abc',
        courseId: 'course-456',
      });

      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'student-sim-session-abc';

      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        studentCode: STUDENT_CODE,
        schoolId: SCHOOL_ID,
        courseScopedClassFound: true,
        classId: 'class-456',
      });
      studentLoginMock.mockResolvedValue({
        success: true,
        data: {
          id: 'student-id-123',
          student_id: STUDENT_CODE,
          status: CommonStatus.ACTIVE,
          class_id: 'class-456',
          class_name: 'Test Class',
          access_token: 'student-access-token',
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=success');
      expect(response.headers.location).toContain(`code=${sessionCode}`);

      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: 'student',
          studentCode: STUDENT_CODE,
          ltiLaunchContext: {
            resourceLinkId: 'resource-link-abc',
            simulationId,
          },
        }),
      );
    });

    it('INTEGRATION: should prioritize custom_simulation_id in AGS mapping', async () => {
      const simulationId = 'sim-custom-priority-456';
      const idToken = LtiTokenFactory.buildStudentLaunchWithSimulation({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        sub: 'student-ags-test',
        simulationId,
      });

      const payload = decodeFakeJwt(idToken) as Record<string, unknown>;
      payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'] = {
        scope: [
          'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
          'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
          'https://purl.imsglobal.org/spec/lti-ags/scope/score',
        ],
        lineitems: 'https://moodle.test.edu/mod/lti/services.php/course/42/line_items',
        lineitem: 'https://moodle.test.edu/mod/lti/services.php/line_item/123',
      };

      quickDecodeMock.mockReturnValue(payload);
      verifyIdTokenMock.mockResolvedValue(payload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildSchoolConfig({ toolType: LmsToolType.STUDENT }),
      );
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        studentCode: STUDENT_CODE,
        schoolId: SCHOOL_ID,
        courseScopedClassFound: true,
        classId: 'class-789',
      });
      studentLoginMock.mockResolvedValue({
        success: true,
        data: {
          id: 'student-id-123',
          student_id: STUDENT_CODE,
          status: CommonStatus.ACTIVE,
          class_id: 'class-789',
          class_name: 'Test Class',
          access_token: 'student-access-token',
        },
      });
      upsertMappingMock.mockResolvedValue({} as LmsAssignmentMapping);
      resolveLaunchSimulationMock.mockResolvedValueOnce({
        simulationId,
        classSimulationId: 'class-sim-789',
      });
      createSessionMock.mockResolvedValue('student-ags-session');

      await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'test-state' })
        .expect(303);

      expect(resolveLaunchSimulationMock).toHaveBeenCalledWith('class-789', simulationId);
      expect(upsertMappingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          simulationId,
          classSimulationId: 'class-sim-789',
          classId: 'class-789',
        }),
      );
    });
  });

  describe('POST /api/lti/session/exchange - With ltiLaunchContext', () => {
    it('INTEGRATION: should return ltiLaunchContext for student sessions', async () => {
      const sessionCode = 'student-context-session-123';
      const simulationId = 'sim-locked-xyz';

      consumeSessionMock.mockResolvedValue(
        buildStudentSession({
          studentCode: STUDENT_CODE,
          accessToken: 'student-access-token',
          ltiLaunchContext: {
            resourceLinkId: 'resource-link-123',
            simulationId,
          },
        }),
      );

      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: sessionCode, audience: 'student' })
        .expect(200);

      expect(response.body).toMatchObject({
        audience: 'student',
        ltiLaunchContext: {
          resourceLinkId: 'resource-link-123',
          simulationId,
        },
      });
    });
  });

  describe('Canvas-shaped LTI launch security', () => {
    const CANVAS_ISSUER = 'https://canvas.test.instructure.com';
    const CANVAS_CLIENT_ID = '10000000000001';
    const CANVAS_DEPLOYMENT_ID = '7:d8f3a2b1c0e9';
    const CANVAS_COURSE_ID = '123';
    const SHARED_CLIENT_ID = '30420000000000003';
    const SCHOOL_A = 'school-canvas-a';
    const SCHOOL_B = 'school-canvas-b';

    function buildCanvasConfig(overrides: Partial<LmsSchoolConfig> = {}): LmsSchoolConfig {
      return buildSchoolConfig({
        lmsType: LmsType.CANVAS,
        issuer: CANVAS_ISSUER,
        clientId: CANVAS_CLIENT_ID,
        deploymentId: CANVAS_DEPLOYMENT_ID,
        authEndpoint: `${CANVAS_ISSUER}/api/lti/authorize_redirect`,
        tokenEndpoint: `${CANVAS_ISSUER}/login/oauth2/token`,
        jwksUrl: `${CANVAS_ISSUER}/api/lti/security/jwks`,
        lmsBaseUrl: 'https://school.instructure.com',
        ...overrides,
      });
    }

    it('INTEGRATION: Canvas educator launch succeeds with aud array + azp', async () => {
      const idToken = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        audAsArray: true,
        email: 'ada@school.edu',
        courseId: CANVAS_COURSE_ID,
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'canvas-educator-session';

      extractClientIdFromRawTokenMock.mockReturnValue(CANVAS_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildCanvasConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      findEducatorByEmailMock.mockResolvedValue(null);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'ada@school.edu', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'canvas-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response, { sessionCode });
      expect(extractClientIdFromRawTokenMock).toHaveBeenCalledWith(idToken);
      expect(resolveEducatorLaunchConfigMock).toHaveBeenCalledWith(
        CANVAS_ISSUER,
        CANVAS_CLIENT_ID,
      );
      expect(verifyIdTokenMock).toHaveBeenCalledWith(
        idToken,
        undefined,
        CANVAS_CLIENT_ID,
        CANVAS_DEPLOYMENT_ID,
      );
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          audience: 'educator',
        }),
      );
    });

    it('INTEGRATION: Canvas SpeedGrader rw_review handoff uses new-tab button + report redirect', async () => {
      const idToken = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        audAsArray: true,
        email: 'ada@school.edu',
        courseId: CANVAS_COURSE_ID,
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'canvas-speedgrader-session';
      const reviewClaims = {
        classId: 'class-rw-1',
        studentCode: 'STU999',
        simulationId: 'sim-1',
        reportId: 'report-1',
      };
      const canvasReviewToken = await signCanvasReviewToken(reviewClaims, 'test-secret');

      extractClientIdFromRawTokenMock.mockReturnValue(CANVAS_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildCanvasConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue({
        ...DEFAULT_LTI_STATE,
        canvasReviewToken,
      });
      findEducatorByEmailMock.mockResolvedValue(null);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'ada@school.edu', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'canvas-speedgrader-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response, { sessionCode, openInNewTab: true });
      expect(response.text).toContain('redirect=');
      expect(response.text).toContain('report-detail');
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: 'educator',
          redirectPath: expect.stringContaining('/report-detail?'),
        }),
      );
    });

    it('INTEGRATION: Canvas student launch succeeds with aud array + azp', async () => {
      const idToken = LtiTokenFactory.buildCanvasStudentLaunchToken({
        audAsArray: true,
        courseId: CANVAS_COURSE_ID,
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'canvas-student-session';

      extractClientIdFromRawTokenMock.mockReturnValue(CANVAS_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildCanvasConfig({ toolType: LmsToolType.STUDENT }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([
        buildCanvasConfig({ toolType: LmsToolType.STUDENT, schoolId: SCHOOL_ID }),
      ]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: SCHOOL_ID,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: true,
      });
      studentLoginMock.mockResolvedValue({
        success: true,
        data: {
          id: 'student-id-123',
          student_id: STUDENT_CODE,
          status: undefined,
          class_id: 'class-123',
          class_name: 'Intro Biology',
          access_token: 'student-access-token',
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'canvas-student-state' })
        .expect(303);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=success');
      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(verifyIdTokenMock).toHaveBeenCalledWith(
        idToken,
        undefined,
        CANVAS_CLIENT_ID,
        CANVAS_DEPLOYMENT_ID,
      );
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: 'student',
          schoolId: SCHOOL_ID,
          studentCode: STUDENT_CODE,
        }),
      );
    });

    it('INTEGRATION: Canvas deployment_id mismatch fails closed', async () => {
      const idToken = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        audAsArray: true,
        deploymentId: 'wrong-deployment',
        email: 'ada@school.edu',
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      extractClientIdFromRawTokenMock.mockReturnValue(CANVAS_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildCanvasConfig());
      verifyIdTokenMock.mockRejectedValue(new Error('Deployment ID mismatch'));

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'canvas-state' })
        .expect(302);

      expect(response.headers.location).toContain('lti_launch=error');
      expect(response.headers.location).toContain('reason=deployment_mismatch');
      expect(verifyIdTokenMock).toHaveBeenCalledWith(
        idToken,
        undefined,
        CANVAS_CLIENT_ID,
        CANVAS_DEPLOYMENT_ID,
      );
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: Canvas missing deployment_id fails closed when config requires one', async () => {
      const idToken = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        audAsArray: true,
        deploymentId: null,
        email: 'ada@school.edu',
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;

      extractClientIdFromRawTokenMock.mockReturnValue(CANVAS_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildCanvasConfig());
      verifyIdTokenMock.mockRejectedValue(new Error('Deployment ID mismatch'));

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'canvas-state' })
        .expect(302);

      expect(response.headers.location).toContain('reason=deployment_mismatch');
      expect(verifyIdTokenMock).toHaveBeenCalledWith(
        idToken,
        undefined,
        CANVAS_CLIENT_ID,
        CANVAS_DEPLOYMENT_ID,
      );
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('INTEGRATION: learner on educator tool hands off to student app', async () => {
      const idToken = LtiTokenFactory.buildCanvasStudentLaunchToken({
        audAsArray: true,
        email: 'bob@school.edu',
        courseId: CANVAS_COURSE_ID,
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'learner-on-educator-tool';

      extractClientIdFromRawTokenMock.mockReturnValue(CANVAS_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildCanvasConfig());
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildCanvasConfig({ toolType: LmsToolType.STUDENT }),
      );
      listStudentLaunchConfigsMock.mockResolvedValue([
        buildCanvasConfig({ toolType: LmsToolType.STUDENT, schoolId: SCHOOL_ID }),
      ]);
      resolveStudentCodeForLaunchMock.mockResolvedValue({
        schoolId: SCHOOL_ID,
        studentCode: STUDENT_CODE,
        courseScopedClassFound: true,
      });
      studentLoginMock.mockResolvedValue({
        success: true,
        data: {
          id: 'student-id-123',
          student_id: STUDENT_CODE,
          status: undefined,
          class_id: 'class-123',
          class_name: 'Intro Biology',
          access_token: 'student-access-token',
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'canvas-state' })
        .expect(303);

      expect(response.headers.location).toContain(STUDENT_FRONTEND_URL);
      expect(response.headers.location).toContain('lti_launch=success');
      expect(response.headers.location).toContain(`code=${sessionCode}`);
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ audience: 'student', schoolId: SCHOOL_ID }),
      );
    });

    it('INTEGRATION: instructor on student tool hands off to educator app (Canvas)', async () => {
      const idToken = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        audAsArray: true,
        email: 'ada@school.edu',
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'instructor-on-student-tool-canvas';

      extractClientIdFromRawTokenMock.mockReturnValue(CANVAS_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      resolveStudentLaunchConfigMock.mockResolvedValue(
        buildCanvasConfig({ toolType: LmsToolType.STUDENT }),
      );
      resolveEducatorLaunchConfigMock.mockResolvedValue(buildCanvasConfig());
      findEducatorByEmailMock.mockResolvedValue(null);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: { id: EDUCATOR_ID, email: 'ada@school.edu', school: { id: SCHOOL_ID } },
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/studentlaunch')
        .send({ id_token: idToken, state: 'canvas-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response, {
        frontendUrl: FRONTEND_URL,
        sessionCode,
      });
      expect(ltiLoginMock).toHaveBeenCalled();
    });

    it('INTEGRATION: shared client_id resolves educator session to membership school', async () => {
      const idToken = LtiTokenFactory.buildCanvasEducatorLaunchToken({
        audAsArray: true,
        clientId: SHARED_CLIENT_ID,
        email: 'shared@school.edu',
      });
      const decodedPayload = decodeFakeJwt(idToken) as JWTPayload;
      const sessionCode = 'shared-client-session';
      const educator = {
        id: EDUCATOR_ID,
        email: 'shared@school.edu',
        school: { id: SCHOOL_B },
      };

      extractClientIdFromRawTokenMock.mockReturnValue(SHARED_CLIENT_ID);
      quickDecodeMock.mockReturnValue(decodedPayload);
      // Pre-verify resolves may omit school filter; post-lookup must bind membership school B.
      resolveEducatorLaunchConfigMock.mockImplementation(
        (
          _issuer: string,
          _clientId?: string | null,
          schoolIds?: string[] | null,
        ): Promise<LmsSchoolConfig | null> => {
          if (schoolIds?.includes(SCHOOL_B)) {
            return Promise.resolve(
              buildCanvasConfig({
                schoolId: SCHOOL_B,
                clientId: SHARED_CLIENT_ID,
              }),
            );
          }
          return Promise.resolve(
            buildCanvasConfig({
              schoolId: SCHOOL_A,
              clientId: SHARED_CLIENT_ID,
            }),
          );
        },
      );
      verifyIdTokenMock.mockResolvedValue(decodedPayload);
      validateAndConsumeMock.mockResolvedValue(DEFAULT_LTI_STATE);
      findEducatorByEmailMock.mockResolvedValue(educator as never);
      getEducatorSchoolIdsMock.mockReturnValue([SCHOOL_B]);
      ltiLoginMock.mockResolvedValue({
        success: true,
        data: {
          tokens: { accessToken: 'mock-jwt-token', csrfToken: 'mock-csrf-token' },
          user: educator,
        },
      });
      createSessionMock.mockResolvedValue(sessionCode);

      const response = await request(httpServer())
        .post('/api/lti/launch')
        .send({ id_token: idToken, state: 'canvas-state' })
        .expect(200);

      expectEducatorTopLevelSuccess(response);
      expect(resolveEducatorLaunchConfigMock).toHaveBeenCalledWith(
        CANVAS_ISSUER,
        SHARED_CLIENT_ID,
        [SCHOOL_B],
      );
      expect(ltiLoginMock).toHaveBeenCalledWith(
        'shared@school.edu',
        SCHOOL_B,
        educator,
        expect.anything(),
      );
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_B }),
      );
      expect(createSessionMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ schoolId: SCHOOL_A }),
      );
    });

    it('INTEGRATION: session code replay fails closed', async () => {
      const sessionCode = 'one-time-canvas-code';
      consumeSessionMock
        .mockResolvedValueOnce(buildEducatorSession({ accessToken: 'first-token' }))
        .mockRejectedValueOnce(new Error('Invalid or expired session code'));

      await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: sessionCode, audience: 'educator' })
        .expect(200);

      const replay = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: sessionCode, audience: 'educator' })
        .expect(400);

      expect(replay.body).toMatchObject({ error: expect.any(String) as string });
      expect(consumeSessionMock).toHaveBeenCalledTimes(2);
      expect(consumeSessionMock).toHaveBeenNthCalledWith(1, sessionCode, 'educator');
      expect(consumeSessionMock).toHaveBeenNthCalledWith(2, sessionCode, 'educator');
    });

    it('INTEGRATION: wrong audience on session exchange fails closed', async () => {
      consumeSessionMock.mockRejectedValue(new Error('Session audience mismatch'));

      const response = await request(httpServer())
        .post('/api/lti/session/exchange')
        .send({ code: 'educator-only-code', audience: 'student' })
        .expect(400);

      expect(response.body).toMatchObject({ error: expect.any(String) as string });
      expect(consumeSessionMock).toHaveBeenCalledWith('educator-only-code', 'student');
      expect(setAuthCookiesMock).not.toHaveBeenCalled();
    });
  });

  describe('Removed legacy LTI dev helpers', () => {
    it('INTEGRATION: POST /api/lti/bootstrap-config is not registered (404)', async () => {
      await request(httpServer())
        .post('/api/lti/bootstrap-config')
        .send({
          // Non-JWT placeholder — route is unregistered; body is irrelevant (avoid gitleaks JWT rules).
          id_token: 'unsigned-fake-token',
          educator_email: 'attacker@example.com',
        })
        .expect(404);
    });

    it('INTEGRATION: /api/lti/debug-launch is not registered (404)', async () => {
      await request(httpServer())
        .post('/api/lti/debug-launch')
        .send({ id_token: 'unsigned-fake-token' })
        .expect(404);

      await request(httpServer()).get('/api/lti/debug-launch').expect(404);
    });
  });
});
