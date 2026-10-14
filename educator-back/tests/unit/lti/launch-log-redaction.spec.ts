import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { LtiController } from 'src/lti/lti.controller';
import { AuthService } from 'src/auth/auth.service';
import { Messages } from 'src/common/utils/messages';
import { StudentConstants } from 'src/students/students.constants';
import { CommonStatus } from 'src/common/enums/status.enum';

const EDUCATOR_EMAIL = 'jane.doe@school.edu';
const MASKED_EMAIL = 'j***@school.edu';
const STUDENT_CODE = 'REP-PH9N';

const UNMASKED_EMAIL = /[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function stub<T>(value: object = {}): T {
  return value as T;
}

let logs: string[];

function capture(message: unknown): void {
  logs.push(typeof message === 'string' ? message : JSON.stringify(message));
}

const mockLoggerService = {
  log: (message: unknown): void => capture(message),
  warn: (message: unknown): void => capture(message),
  error: (message: unknown): void => capture(message),
  debug: (message: unknown): void => capture(message),
  verbose: (message: unknown): void => capture(message),
  fatal: (message: unknown): void => capture(message),
};

beforeEach(() => {
  logs = [];
  jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(capture);
  jest.spyOn(Logger.prototype, 'verbose').mockImplementation(capture);
});

afterEach(() => jest.restoreAllMocks());

function assertNoPii(): void {
  const output = logs.join('\n');
  expect(logs.length).toBeGreaterThan(0);
  expect(output).not.toContain(EDUCATOR_EMAIL);
  expect(output).not.toContain(STUDENT_CODE);
  expect(output).not.toMatch(UNMASKED_EMAIL);
}

const ISSUER = 'https://moodle.example.edu';
const CLIENT_ID = 'client-123';
const LMS_USER_ID = 'lms-user-77';

function payloadFor(roles: string[], email?: string): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: LMS_USER_ID,
    nonce: 'nonce-1',
    ...(email ? { email } : {}),
    'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deploy-1',
    'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'course-1', title: 'Nursing 101' },
    'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': {
      context_memberships_url: `${ISSUER}/nrps`,
    },
  };
}

interface LaunchConfig {
  schoolId: string;
  clientId: string;
  deploymentId: string;
  lmsType?: string;
}

interface ControllerOverrides {
  payload: Record<string, unknown>;
  authService?: Partial<AuthService>;
  provisionService?: Record<string, unknown>;
  lmsLookupService?: Record<string, unknown>;
  studentsService?: Record<string, unknown>;
  lmsConfigService?: Record<string, unknown>;
}

function makeController(o: ControllerOverrides): { controller: LtiController; res: Response } {
  const lmsConfig: LaunchConfig = {
    schoolId: 'school-1',
    clientId: CLIENT_ID,
    deploymentId: 'deploy-1',
    lmsType: 'moodle',
  };

  const redirect = jest.fn();
  const defaultAuthService: Partial<AuthService> = {
    findEducatorByEmail: jest.fn().mockResolvedValue(null),
    getEducatorSchoolIds: jest.fn().mockReturnValue([]),
    ltiLogin: jest.fn().mockResolvedValue({
      success: true,
      data: {
        tokens: { accessToken: 'token', csrfToken: 'csrf' },
        user: { id: 'educator-1', email: EDUCATOR_EMAIL, school: { id: lmsConfig.schoolId } },
      },
    }),
  };

  const configServiceStub = stub<ConfigService>({
    get: (key: string, fallback?: string) => {
      if (key === 'app.frontendUrl' || key === 'FRONTEND_URL') return 'https://educator.test';
      if (key === 'app.studentFrontendUrl' || key === 'STUDENT_FRONTEND_URL')
        return 'https://student.test';
      if (key === 'app.apiBaseUrl' || key === 'API_BASE_URL') return 'https://api.test';
      return fallback ?? 'https://app.test';
    },
  });

  const controller = new LtiController(
    stub(),
    stub({ mergeRequestParams: () => ({ id_token: 'id.token.here', state: 'state-1' }) }),
    stub({
      quickDecode: () => o.payload,
      verifyIdToken: () => Promise.resolve(o.payload),
      extractClientIdFromRawToken: () => CLIENT_ID,
    }),
    stub({
      validateAndConsume: jest.fn().mockResolvedValue({
        nonce: 'nonce-1',
        toolType: 'educator',
      }),
    }),
    stub({ createSession: () => 'one-time-session-code' }),
    stub({ signDeepLinkingResponse: jest.fn(), generateReturnForm: jest.fn() }),
    stub({ resolveReviewLaunch: jest.fn() }),
    configServiceStub,
    stub<AuthService>({ ...defaultAuthService, ...(o.authService ?? {}) }),
    stub(o.provisionService ?? {}),
    stub(o.lmsLookupService ?? {}),
    stub({
      resolveLaunchSimulation: () => Promise.resolve(null),
      upsertMapping: () => Promise.resolve({}),
    }),
    stub(o.studentsService ?? {}),
    stub({ getAdapter: () => null }),
    stub(
      o.lmsConfigService ?? {
        resolveEducatorLaunchConfig: (): Promise<LaunchConfig> => Promise.resolve(lmsConfig),
        resolveStudentLaunchConfig: (): Promise<LaunchConfig> => Promise.resolve(lmsConfig),
        findSchoolbyIssuer: (): Promise<{ id: string } | null> =>
          Promise.resolve({ id: lmsConfig.schoolId }),
        findSchoolByClientId: (): Promise<{ id: string } | null> =>
          Promise.resolve({ id: lmsConfig.schoolId }),
        listStudentLaunchConfigs: (): Promise<LaunchConfig[]> => Promise.resolve([lmsConfig]),
        filterConfigsByLaunchDeployment: (): LaunchConfig[] => [lmsConfig],
        resolveOAuthConfigForClient: (): Promise<null> => Promise.resolve(null),
      },
    ),
    stub({ findByClass: jest.fn().mockResolvedValue([]) }),
    stub(), // tokenService
    stub(mockLoggerService), // logger
  );

  const res = stub<Response>({
    redirect,
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
    json: jest.fn(),
  });

  return { controller, res };
}

const req = stub<Request>();

describe('educatorLaunch logging', () => {
  const instructorRoles = ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'];

  it('does not log PII when LMS school config is missing', async () => {
    const { controller, res } = makeController({
      payload: payloadFor(instructorRoles, EDUCATOR_EMAIL),
      lmsConfigService: {
        resolveEducatorLaunchConfig: () => Promise.resolve(null),
        findSchoolbyIssuer: () => Promise.resolve(null),
        findSchoolByClientId: () => Promise.resolve(null),
      },
    });

    await controller.launch(req, res);

    assertNoPii();
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('reason=school_not_configured'),
    );
  });

  it('does not log PII when educator email is missing from the launch', async () => {
    const { controller, res } = makeController({
      payload: payloadFor(instructorRoles),
    });

    await controller.launch(req, res);

    assertNoPii();
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('reason=email_required_from_lms'),
    );
  });

  it('does not log PII when LTI login is rejected', async () => {
    const { controller, res } = makeController({
      payload: payloadFor(instructorRoles, EDUCATOR_EMAIL),
      authService: {
        findEducatorByEmail: () =>
          Promise.resolve({
            id: 'educator-1',
            email: EDUCATOR_EMAIL,
            school: { id: 'school-1' },
            schoolAssignments: [],
          } as never),
        getEducatorSchoolIds: () => ['school-1'],
        ltiLogin: () => Promise.resolve({ success: false, message: Messages.USER_NOT_FOUND }),
      },
    });

    await controller.launch(req, res);

    assertNoPii();
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('reason=educator_not_registered'),
    );
  });

  it('rejects missing educator without auto-create for any LMS', async () => {
    const ltiLogin = jest.fn().mockResolvedValue({
      success: false,
      message: Messages.USER_NOT_FOUND,
    });

    const { controller, res } = makeController({
      payload: payloadFor(instructorRoles, EDUCATOR_EMAIL),
      authService: {
        findEducatorByEmail: () => Promise.resolve(null),
        ltiLogin,
      },
    });

    await controller.launch(req, res);

    expect(ltiLogin).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('reason=educator_not_registered'),
    );
  });
});

describe('studentLaunch logging', () => {
  const learnerRoles = ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'];

  function studentController(loginSucceeds: boolean): {
    controller: LtiController;
    res: Response;
  } {
    return makeController({
      payload: payloadFor(learnerRoles),
      lmsLookupService: {
        resolveStudentCodeForLaunch: () =>
          Promise.resolve({
            schoolId: 'school-1',
            studentCode: STUDENT_CODE,
            courseScopedClassFound: true,
            classId: null,
          }),
      },
      studentsService: {
        studentLogin: () =>
          Promise.resolve(
            loginSucceeds
              ? { success: true, data: { id: 'student-uuid-1', class_id: 'class-1' } }
              : {
                success: false,
                message: StudentConstants.VALIDATION.CLASS_INACTIVE,
              },
          ),
      },
    });
  }

  it('does not log raw student codes on a successful launch', async () => {
    const { controller, res } = studentController(true);

    await controller.studentLaunch(req, res);

    assertNoPii();
    const output = logs.join('\n');
    expect(output).toContain(LMS_USER_ID);
    expect(output).toContain('[studentHandoff] Redirecting learner');
    expect(res.redirect).toHaveBeenCalled();
  });

  it('does not log raw student codes when student login fails', async () => {
    const { controller, res } = studentController(false);

    await controller.studentLaunch(req, res);

    assertNoPii();
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('reason=class_inactive'));
  });
});

// Matches `AuthService`'s real constructor parameter list/order (see `src/auth/auth.service.ts`):
// usersService, redemptionsService, configService, mailerService, salesOrderLinesService,
// csrfService, tokenService, educatorRepo, roleRepo, studentRepo, userRepo, userTokenRepo,
// userRoleRepo, districtAdminRepo, azureBlobService, logger.
function makeAuthService(overrides: { educator?: unknown }): AuthService {
  return new AuthService(
    stub(), // usersService
    stub(), // redemptionsService
    stub({ get: () => '1h' }), // configService
    stub(), // mailerService
    stub(), // salesOrderLinesService
    stub(), // csrfService
    stub(), // tokenService
    stub({ findOne: () => Promise.resolve(overrides.educator ?? null) }), // educatorRepo
    stub({ findOne: () => Promise.resolve(null) }), // roleRepo
    stub({ findOne: () => Promise.resolve(null) }), // studentRepo
    stub(), // userRepo
    stub(), // userTokenRepo
    stub(), // userRoleRepo
    stub(), // districtAdminRepo
    stub(), // azureBlobService
    stub(mockLoggerService), // logger
  );
}

describe('AuthService LTI logging', () => {
  it('masks the email when the educator is not assigned to the LMS school', async () => {
    const service = makeAuthService({
      educator: {
        id: 'educator-1',
        is_active: true,
        school: { id: 'school-other' },
        schoolAssignments: [],
        // `Educator.email`/`.password`/`.status` no longer exist — identity/credentials/status
        // resolve via the linked `userRole.user`/`userRole.status` chain.
        userRole: {
          status: CommonStatus.ACTIVE,
          user: { email: EDUCATOR_EMAIL, password: 'hash' },
        },
      },
    });

    const result = await service.ltiLogin(EDUCATOR_EMAIL, 'school-1', null, stub<Response>());

    expect(result.success).toBe(false);
    assertNoPii();
    const output = logs.join('\n');
    expect(output).toContain(MASKED_EMAIL);
    expect(output).toContain('educator-1');
    expect(output).toContain('school-1');
  });

  it('masks the email when the LMS config points at a school the educator is no longer assigned to (e.g. a deleted/reassigned school)', async () => {
    // The dedicated "school record missing" lookup/log from the pre-rewrite `ltiLoginOrCreate`
    // was consolidated into `ltiLogin`'s single `educatorBelongsToSchool` check — a schoolId that
    // no longer resolves to one of the educator's assigned schools (deleted, reassigned, or never
    // existed) can never satisfy that check, so it still gets rejected through the same masked-log
    // "not assigned to school" branch (see the previous test) rather than a separate code path.
    const service = makeAuthService({
      educator: {
        id: 'educator-1',
        is_active: true,
        school: { id: 'school-other' },
        schoolAssignments: [],
        userRole: {
          status: CommonStatus.ACTIVE,
          user: { email: EDUCATOR_EMAIL, password: 'hash' },
        },
      },
    });

    const result = await service.ltiLogin(EDUCATOR_EMAIL, 'school-gone', null, stub<Response>());

    expect(result.success).toBe(false);
    assertNoPii();
    expect(logs.join('\n')).toContain(MASKED_EMAIL);
  });
});
