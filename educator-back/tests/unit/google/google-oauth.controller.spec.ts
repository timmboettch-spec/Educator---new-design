import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GoogleOAuthController } from '../../../src/google/google-oauth.controller';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import { GoogleOAuthService } from '../../../src/google/google-oauth.service';
import { GoogleOAuthStateService } from '../../../src/google/google-oauth-state.service';
import { GoogleStudentLoginService } from '../../../src/google/google-student-login.service';
import { GoogleStudentHandoffService } from '../../../src/google/google-student-handoff.service';
import { AuthService } from '../../../src/auth/auth.service';
import {
  GoogleCourseMappingRepository,
  GoogleSchoolConnectionRepository,
} from '../../../src/database/repositories';
import { LoggerService } from '../../../src/common/services';
import { GoogleConnectionStatus, GoogleConstants } from '../../../src/google/google.constants';

describe('GoogleOAuthController', () => {
  const validateAndConsume = jest.fn();
  const createStudentLoginState = jest.fn();
  const completeConnect = jest.fn();
  const buildFrontendRedirect = jest.fn((params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return `http://localhost:5173/google-classroom?${query}`;
  });
  const buildEducatorLoginRedirect = jest.fn((query: Record<string, string>) => {
    const q = new URLSearchParams(query).toString();
    return `http://localhost:5173/login?${q}`;
  });
  const buildStudentAuthorizationUrl = jest.fn(
    (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  );
  const buildStudentAppRedirect = jest.fn(
    (params: { path: string; query: Record<string, string> }) => {
      const query = new URLSearchParams(params.query).toString();
      return `http://localhost:5174${params.path}?${query}`;
    },
  );
  const exchangeCodeForTokens = jest.fn();
  const fetchUserInfo = jest.fn();
  const loginWithGoogleUserProfile = jest.fn();
  const createStudentSessionCode = jest.fn();
  const createEducatorSessionCode = jest.fn();
  const findEducatorByEmail = jest.fn();
  const findEducatorById = jest.fn();
  const ltiLogin = jest.fn();
  const findByGoogleCourseId = jest.fn();
  const findSchoolOne = jest.fn();
  const findConnectionBySchoolAndGoogleAccountId = jest.fn();
  const findConnectionBySchoolAndGoogleEmail = jest.fn();
  const redirect = jest.fn();

  const oauthStateService = {
    validateAndConsume,
    createStudentLoginState,
  } as unknown as GoogleOAuthStateService;

  const connectionService = {
    completeConnect,
  } as unknown as GoogleConnectionService;

  const oauthService = {
    buildFrontendRedirect,
    buildEducatorLoginRedirect,
    buildStudentAuthorizationUrl,
    buildStudentAppRedirect,
    exchangeCodeForTokens,
    fetchUserInfo,
  } as unknown as GoogleOAuthService;

  const studentLoginService = {
    loginWithGoogleUserProfile,
  } as unknown as GoogleStudentLoginService;

  const studentHandoffService = {
    createStudentSessionCode,
    createEducatorSessionCode,
  } as unknown as GoogleStudentHandoffService;

  const authService = {
    findEducatorByEmail,
    findEducatorById,
    ltiLogin,
  } as unknown as AuthService;

  const courseMappingRepo = {
    findByGoogleCourseId,
  } as unknown as GoogleCourseMappingRepository;

  const connectionRepo = {
    findBySchoolAndGoogleAccountId: findConnectionBySchoolAndGoogleAccountId,
    findBySchoolAndGoogleEmail: findConnectionBySchoolAndGoogleEmail,
  } as unknown as GoogleSchoolConnectionRepository;

  const schoolsRepo = {
    findOne: findSchoolOne,
  } as unknown as import('../../../src/database/repositories').SchoolsRepository;

  const logger = {
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  const res = { redirect };

  let controller: GoogleOAuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    findEducatorByEmail.mockResolvedValue(null);
    findEducatorById.mockResolvedValue(null);
    findConnectionBySchoolAndGoogleAccountId.mockResolvedValue(null);
    findConnectionBySchoolAndGoogleEmail.mockResolvedValue(null);
    findByGoogleCourseId.mockResolvedValue({
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'course-1',
    });
    findSchoolOne.mockResolvedValue({ id: 'school-1', google_classroom_enabled: true });
    controller = new GoogleOAuthController(
      oauthStateService,
      connectionService,
      oauthService,
      studentLoginService,
      studentHandoffService,
      authService,
      courseMappingRepo,
      connectionRepo,
      schoolsRepo,
      logger,
    );
  });

  it('completes connect and redirects on success', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'educator_connect',
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });
    completeConnect.mockResolvedValue({});

    await controller.handleCallback('code-1', 'state-1', undefined, undefined, res as never);

    expect(completeConnect.mock.calls).toEqual([
      [{ schoolId: 'school-1', educatorId: 'educator-1', code: 'code-1' }],
    ]);
    expect(redirect.mock.calls).toEqual([
      ['http://localhost:5173/google-classroom?googleClassroom=connected&schoolId=school-1'],
    ]);
  });

  it('redirects with error when state is invalid', async () => {
    validateAndConsume.mockRejectedValue(
      new UnauthorizedException('Invalid or expired state parameter'),
    );

    await controller.handleCallback('code-1', 'bad-state', undefined, undefined, res as never);

    expect(completeConnect.mock.calls).toHaveLength(0);
    expect(JSON.stringify(redirect.mock.calls)).toContain('googleClassroom=error');
    expect(JSON.stringify(redirect.mock.calls)).toContain('invalid_or_expired_state');
  });

  it('redirects when Google returns an error query param', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'educator_connect',
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });

    await controller.handleCallback(
      undefined,
      'state-1',
      'access_denied',
      'User denied',
      res as never,
    );

    expect(validateAndConsume.mock.calls).toHaveLength(1);
    expect(JSON.stringify(redirect.mock.calls)).toContain('googleClassroom=error');
    expect(JSON.stringify(redirect.mock.calls)).toContain('provider_denied');
  });

  it('warns and redirects when authorization code is missing after valid state', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'educator_connect',
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });

    await controller.handleCallback(undefined, 'state-1', undefined, undefined, res as never);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing authorization code'),
    );
    expect(completeConnect.mock.calls).toHaveLength(0);
    expect(JSON.stringify(redirect.mock.calls)).toContain('missing_code');
  });

  it('does not log access or refresh tokens when callback fails', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'educator_connect',
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });
    completeConnect.mockRejectedValue(
      new Error('exchange failed access_token=ya29.secret refresh_token=1//secret'),
    );

    await controller.handleCallback('code-1', 'state-1', undefined, undefined, res as never);

    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(logged).not.toContain('ya29.secret');
    expect(logged).not.toContain('1//secret');
    expect(logged).toContain('[redacted]');
  });

  it('redirects with google_email_mismatch when connect rejects email mismatch', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'educator_connect',
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });
    completeConnect.mockRejectedValue(
      new BadRequestException(
        'Google account email must match your RealityWorks educator login email',
      ),
    );

    await controller.handleCallback('code-1', 'state-1', undefined, undefined, res as never);

    expect(JSON.stringify(redirect.mock.calls)).toContain('googleClassroom=error');
    expect(JSON.stringify(redirect.mock.calls)).toContain('google_email_mismatch');
  });

  it('starts student OAuth by redirecting to Google', async () => {
    createStudentLoginState.mockResolvedValue('student-state');
    await controller.startStudentLogin('sim-1', 'course-1', res as never);
    expect(findByGoogleCourseId).toHaveBeenCalledWith('course-1');
    expect(createStudentLoginState).toHaveBeenCalledWith({
      simulationId: 'sim-1',
      googleCourseId: 'course-1',
    });
    expect(redirect.mock.calls[0][0]).toContain('state=student-state');
  });

  it('starts classroom launch OAuth by redirecting to Google', async () => {
    createStudentLoginState.mockResolvedValue('launch-state');
    await controller.startClassroomLaunch('sim-1', 'course-1', res as never);
    expect(createStudentLoginState).toHaveBeenCalledWith({
      simulationId: 'sim-1',
      googleCourseId: 'course-1',
    });
    expect(redirect.mock.calls[0][0]).toContain('state=launch-state');
  });

  it('blocks student start when google_classroom_enabled is false', async () => {
    findSchoolOne.mockResolvedValue({ id: 'school-1', google_classroom_enabled: false });

    await controller.startStudentLogin('sim-1', 'course-1', res as never);

    expect(createStudentLoginState).not.toHaveBeenCalled();
    expect(JSON.stringify(redirect.mock.calls)).toContain('feature_disabled');
    expect(JSON.stringify(redirect.mock.calls)).toContain('source=google_classroom');
  });

  it('blocks classroom launch when course mapping is missing', async () => {
    findByGoogleCourseId.mockResolvedValue(null);

    await controller.startClassroomLaunch('sim-1', 'course-1', res as never);

    expect(createStudentLoginState).not.toHaveBeenCalled();
    expect(JSON.stringify(redirect.mock.calls)).toContain('course_not_linked');
  });

  it('redirects with scopes_incomplete when connect rejects partial consent', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'educator_connect',
      schoolId: 'school-1',
      educatorId: 'educator-1',
    });
    completeConnect.mockRejectedValue(
      new BadRequestException(GoogleConstants.MESSAGES.SCOPES_INCOMPLETE),
    );

    await controller.handleCallback('code-1', 'state-1', undefined, undefined, res as never);

    expect(JSON.stringify(redirect.mock.calls)).toContain('googleClassroom=error');
    expect(JSON.stringify(redirect.mock.calls)).toContain('scopes_incomplete');
  });

  it('completes student OAuth and redirects to HS Online with session code', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'student_login',
      googleCourseId: 'course-1',
      simulationId: 'sim-1',
    });
    exchangeCodeForTokens.mockResolvedValue({ accessToken: 'google-at' });
    fetchUserInfo.mockResolvedValue({ sub: 'g-1', email: 'student@school.edu' });
    loginWithGoogleUserProfile.mockResolvedValue({
      id: 'st-1',
      student_id: 'GC-1',
      class_id: 'class-1',
      class_name: 'Bio',
      access_token: 'jwt',
      google_sub: 'g-1',
      google_course_id: 'course-1',
      google_email: 'student@school.edu',
    });
    createStudentSessionCode.mockResolvedValue('one-time-session-code-xxxxxxxxxxxxxxxxxxxx');

    await controller.handleCallback('code-1', 'state-1', undefined, undefined, res as never);

    expect(loginWithGoogleUserProfile).toHaveBeenCalled();
    expect(createStudentSessionCode).toHaveBeenCalled();
    expect(JSON.stringify(redirect.mock.calls)).toContain('lti_launch=success');
    expect(JSON.stringify(redirect.mock.calls)).toContain('localhost:5174/student-dashboard');
  });

  it('hands educators to the educator portal when Google email matches course school', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'student_login',
      googleCourseId: 'course-1',
      simulationId: 'sim-1',
    });
    exchangeCodeForTokens.mockResolvedValue({ accessToken: 'google-at' });
    fetchUserInfo.mockResolvedValue({ sub: 'g-teacher', email: 'teacher@school.edu' });
    findByGoogleCourseId.mockResolvedValue({
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'course-1',
    });
    findEducatorByEmail.mockResolvedValue({
      id: 'edu-1',
      is_active: true,
      userRole: { status: 'ACTIVE', user: { email: 'teacher@school.edu' } },
      school: { id: 'school-1', google_classroom_enabled: true },
      schoolAssignments: [{ school: { id: 'school-1', google_classroom_enabled: true } }],
    });
    ltiLogin.mockResolvedValue({
      success: true,
      data: {
        tokens: { accessToken: 'edu-jwt', csrfToken: 'csrf' },
        user: { id: 'edu-1', email: 'teacher@school.edu' },
      },
    });
    createEducatorSessionCode.mockResolvedValue('educator-session-code');

    await controller.handleCallback('code-1', 'state-1', undefined, undefined, res as never);

    expect(createEducatorSessionCode).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectPath: '/educator-dashboard',
      }),
    );
    expect(loginWithGoogleUserProfile).not.toHaveBeenCalled();
    expect(JSON.stringify(redirect.mock.calls)).toContain('localhost:5173/login');
    expect(JSON.stringify(redirect.mock.calls)).toContain('lti_launch=success');
  });

  it('hands educators to the educator portal when Google sub matches school connection', async () => {
    validateAndConsume.mockResolvedValue({
      purpose: 'student_login',
      googleCourseId: 'course-1',
      simulationId: 'sim-1',
    });
    exchangeCodeForTokens.mockResolvedValue({ accessToken: 'google-at' });
    // Email missing — sub alone must drive handoff.
    fetchUserInfo.mockResolvedValue({ sub: 'google-sub-teacher', email: null });
    findByGoogleCourseId.mockResolvedValue({
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'course-1',
    });
    findConnectionBySchoolAndGoogleAccountId.mockResolvedValue({
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      googleAccountId: 'google-sub-teacher',
      googleAccountEmail: 'gc-teacher2@curionn.com',
      connectedByEducatorId: 'edu-1',
    });
    findEducatorById.mockResolvedValue({
      id: 'edu-1',
      is_active: true,
      userRole: { status: 'ACTIVE', user: { email: 'gc-teacher2@curionn.com' } },
      school: { id: 'school-1', google_classroom_enabled: true },
      schoolAssignments: [{ school: { id: 'school-1', google_classroom_enabled: true } }],
    });
    ltiLogin.mockResolvedValue({
      success: true,
      data: {
        tokens: { accessToken: 'edu-jwt', csrfToken: 'csrf' },
        user: { id: 'edu-1', email: 'gc-teacher2@curionn.com' },
      },
    });
    createEducatorSessionCode.mockResolvedValue('educator-session-code');

    await controller.handleCallback('code-1', 'state-1', undefined, undefined, res as never);

    expect(findEducatorById).toHaveBeenCalledWith('edu-1');
    expect(findEducatorByEmail).not.toHaveBeenCalled();
    expect(ltiLogin).toHaveBeenCalledWith(
      'gc-teacher2@curionn.com',
      'school-1',
      expect.objectContaining({ id: 'edu-1' }),
      res,
    );
    expect(createEducatorSessionCode).toHaveBeenCalled();
    expect(loginWithGoogleUserProfile).not.toHaveBeenCalled();
    expect(JSON.stringify(redirect.mock.calls)).toContain('localhost:5173/login');
    expect(JSON.stringify(redirect.mock.calls)).toContain('lti_launch=success');
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('match=google_account_id'));
  });
});
