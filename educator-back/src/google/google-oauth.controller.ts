import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { LoggerService } from 'src/common/services';
import { AuthService } from 'src/auth/auth.service';
import {
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
  SCHOOLS_REPOSITORY,
} from 'src/database/tokens';
import {
  GoogleCourseMappingRepository,
  GoogleSchoolConnectionRepository,
  SchoolsRepository,
} from 'src/database/repositories';
import { educatorBelongsToSchool } from 'src/educators/utils/educator-school.util';
import { CommonStatus } from 'src/common/enums/status.enum';
import {
  resolveEducatorEmail,
  resolveEducatorStatus,
} from 'src/common/utils/educator-identity.util';
import { GoogleConnectionStatus, GoogleConstants } from './google.constants';
import { GoogleConnectionService } from './google-connection.service';
import { GoogleOAuthService, redactSensitiveGoogleText } from './google-oauth.service';
import {
  GoogleOAuthStateService,
  type GoogleOAuthStateRecord,
} from './google-oauth-state.service';
import { GoogleStudentLoginService } from './google-student-login.service';
import { GoogleStudentHandoffService } from './google-student-handoff.service';
import { Public } from 'src/common/decorators/public.decorator';
import type { Educator } from 'src/database/entities';

@ApiTags(GoogleConstants.SWAGGER.TAG)
@Public()
@Controller(GoogleConstants.ROUTES.OAUTH_BASE)
export class GoogleOAuthController {
  constructor(
    private readonly oauthStateService: GoogleOAuthStateService,
    private readonly connectionService: GoogleConnectionService,
    private readonly oauthService: GoogleOAuthService,
    private readonly studentLoginService: GoogleStudentLoginService,
    private readonly studentHandoffService: GoogleStudentHandoffService,
    private readonly authService: AuthService,
    @Inject(GOOGLE_COURSE_MAPPING_REPOSITORY)
    private readonly courseMappingRepo: GoogleCourseMappingRepository,
    @Inject(GOOGLE_SCHOOL_CONNECTION_REPOSITORY)
    private readonly connectionRepo: GoogleSchoolConnectionRepository,
    @Inject(SCHOOLS_REPOSITORY)
    private readonly schoolsRepo: SchoolsRepository,
    private readonly logger: LoggerService,
  ) { }

  /**
   * HS Online Classroom bounce entry: browser navigates here from the student app,
   * then to Google, then back to {@link handleCallback}.
   * CourseWork material links use {@link startClassroomLaunch} instead.
   */
  @Get(GoogleConstants.ROUTES.STUDENT_START)
  @ApiOperation({
    summary:
      'Start Google OAuth for student Classroom auto-login (openid/email → roster map → HS Online)',
  })
  async startStudentLogin(
    @Query('simulationId') simulationId: string | undefined,
    @Query('googleCourseId') googleCourseId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    return this.startClassroomOAuth(res, simulationId, googleCourseId, 'student');
  }

  /**
   * Posted as the CourseWork material link. Teachers and students hit the same URL;
   * after Google sign-in we route educators to the educator portal and learners to HS Online.
   */
  @Get(GoogleConstants.ROUTES.CLASSROOM_LAUNCH)
  @ApiOperation({
    summary:
      'Start Google OAuth for Classroom assignment launch (teacher → educator portal, student → HS Online)',
  })
  async startClassroomLaunch(
    @Query('simulationId') simulationId: string | undefined,
    @Query('googleCourseId') googleCourseId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    return this.startClassroomOAuth(res, simulationId, googleCourseId, 'launch');
  }

  private async startClassroomOAuth(
    res: Response,
    simulationId: string | undefined,
    googleCourseId: string | undefined,
    mode: 'student' | 'launch',
  ): Promise<void> {
    try {
      const flag = await this.resolveGoogleClassroomEnabledForCourse(googleCourseId);
      if (!flag.ok) {
        this.logger.warn(
          `[Google Classroom OAuth] ${mode} start blocked: ${flag.reason} course=${googleCourseId?.trim() || 'none'}`,
        );
        res.redirect(
          this.oauthService.buildStudentAppRedirect({
            path: '/login',
            query: {
              lti_launch: 'error',
              reason: flag.reason,
              source: 'google_classroom',
            },
          }),
        );
        return;
      }

      const state = await this.oauthStateService.createStudentLoginState({
        simulationId,
        googleCourseId,
      });
      const authorizationUrl = this.oauthService.buildStudentAuthorizationUrl(state);
      res.redirect(authorizationUrl);
    } catch (err) {
      this.logger.warn(
        `[Google Classroom OAuth] ${mode} start failed: ${err instanceof Error ? err.message : 'unknown_error'
        }`,
      );
      res.redirect(
        this.oauthService.buildStudentAppRedirect({
          path: '/login',
          query: {
            lti_launch: 'error',
            reason: 'launch_failed',
            source: 'google_classroom',
          },
        }),
      );
    }
  }

  /**
   * Student/launch OAuth must honor the same school product flag as educator GC APIs.
   * Resolve school via the existing course mapping for `googleCourseId`.
   */
  private async resolveGoogleClassroomEnabledForCourse(
    googleCourseId: string | undefined,
  ): Promise<{ ok: true } | { ok: false; reason: 'feature_disabled' | 'course_not_linked' }> {
    const courseId = googleCourseId?.trim() || '';
    if (!courseId) {
      return { ok: false, reason: 'course_not_linked' };
    }
    const mapping = await this.courseMappingRepo.findByGoogleCourseId(courseId);
    if (!mapping?.schoolId) {
      return { ok: false, reason: 'course_not_linked' };
    }
    const school = await this.schoolsRepo.findOne({ where: { id: mapping.schoolId } });
    if (!school || school.google_classroom_enabled !== true) {
      return { ok: false, reason: 'feature_disabled' };
    }
    return { ok: true };
  }

  @Get(GoogleConstants.ROUTES.CALLBACK)
  @ApiOperation({ summary: 'Google Classroom OAuth callback (authorization code exchange)' })
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    let stateRecord: GoogleOAuthStateRecord | null = null;

    try {
      if (error) {
        const detail = errorDescription || error;
        this.logger.warn(`[Google OAuth Callback] provider error: ${detail}`);
        // Consume state when present so we redirect the right app (educator vs student).
        if (state) {
          try {
            stateRecord = await this.oauthStateService.validateAndConsume(state);
          } catch {
            stateRecord = null;
          }
        }
        this.redirectOAuthFailure(res, stateRecord, 'provider_denied');
        return;
      }

      stateRecord = await this.oauthStateService.validateAndConsume(state);

      if (stateRecord.purpose === 'student_login') {
        await this.completeClassroomLoginCallback(res, code, stateRecord);
        return;
      }

      if (!code?.trim()) {
        this.logger.warn(
          `[Google OAuth Callback] missing authorization code after valid state (school ${stateRecord.schoolId})`,
        );
        res.redirect(
          this.oauthService.buildFrontendRedirect({
            googleClassroom: 'error',
            schoolId: stateRecord.schoolId,
            reason: 'missing_code',
          }),
        );
        return;
      }

      await this.connectionService.completeConnect({
        schoolId: stateRecord.schoolId,
        educatorId: stateRecord.educatorId,
        code,
      });

      res.redirect(
        this.oauthService.buildFrontendRedirect({
          googleClassroom: 'connected',
          schoolId: stateRecord.schoolId,
        }),
      );
    } catch (err) {
      const reason = this.toSafeCallbackReason(err);
      this.logger.warn(
        `[Google OAuth Callback] failed: ${redactSensitiveGoogleText(
          err instanceof Error ? err.message : 'unknown_error',
        )}`,
      );
      this.redirectOAuthFailure(res, stateRecord, reason);
    }
  }

  private async completeClassroomLoginCallback(
    res: Response,
    code: string | undefined,
    stateRecord: Extract<GoogleOAuthStateRecord, { purpose: 'student_login' }>,
  ): Promise<void> {
    if (!code?.trim()) {
      this.logger.warn('[Google Classroom OAuth] missing authorization code after valid state');
      res.redirect(
        this.oauthService.buildStudentAppRedirect({
          path: '/login',
          query: {
            lti_launch: 'error',
            reason: 'invalid_token',
            source: 'google_classroom',
          },
        }),
      );
      return;
    }

    const tokens = await this.oauthService.exchangeCodeForTokens(code);
    const profile = await this.oauthService.fetchUserInfo(tokens.accessToken);
    const googleUserId = profile.sub?.trim() || '';
    const email = profile.email?.trim().toLowerCase() || null;
    if (!googleUserId) {
      throw new UnauthorizedException(GoogleConstants.MESSAGES.STUDENT_OAUTH_PROFILE_FAILED);
    }

    // Defense in depth: start already checks the flag; re-check before login/handoff.
    const flag = await this.resolveGoogleClassroomEnabledForCourse(
      stateRecord.googleCourseId ?? undefined,
    );
    if (!flag.ok) {
      this.logger.warn(
        `[Google Classroom OAuth] callback blocked: ${flag.reason} course=${stateRecord.googleCourseId ?? 'none'}`,
      );
      res.redirect(
        this.oauthService.buildStudentAppRedirect({
          path: '/login',
          query: {
            lti_launch: 'error',
            reason: flag.reason,
            source: 'google_classroom',
          },
        }),
      );
      return;
    }

    const educatorHandled = await this.tryEducatorClassroomHandoff({
      res,
      email,
      googleUserId,
      googleCourseId: stateRecord.googleCourseId,
      simulationId: stateRecord.simulationId,
    });
    if (educatorHandled) {
      return;
    }

    const login = await this.studentLoginService.loginWithGoogleUserProfile({
      googleUserId,
      email,
      googleCourseId: stateRecord.googleCourseId,
      simulationId: stateRecord.simulationId,
      res,
    });

    const studentCode = login.student_id?.trim() || '';
    if (!studentCode) {
      throw new BadRequestException(GoogleConstants.MESSAGES.STUDENT_LOGIN_FAILED);
    }

    const sessionCode = await this.studentHandoffService.createStudentSessionCode({
      audience: 'student',
      userId: typeof login.id === 'string' ? login.id : null,
      schoolId: null,
      ltiContext: {
        issuer: 'google_classroom',
        lmsUserId: login.google_sub,
        lmsCourseId: login.google_course_id,
        clientId: null,
      },
      studentCode,
      classId: typeof login.class_id === 'string' ? login.class_id : null,
      className: typeof login.class_name === 'string' ? login.class_name : null,
      accessToken: typeof login.access_token === 'string' ? login.access_token : null,
      studentData: login as unknown as Record<string, unknown>,
      ltiLaunchContext: {
        simulationId: stateRecord.simulationId ?? undefined,
      },
    });

    // Cookies were already set by loginWithGoogleUserProfile(res). The FE then
    // redeems `code` via POST /api/lti/session/exchange (@Public + CSRF-exempt),
    // which sets cookies again for the student-app origin.
    this.logger.log(
      `[Google Classroom OAuth] Redirecting student to HS Online with session code`,
    );
    res.redirect(
      this.oauthService.buildStudentAppRedirect({
        path: '/student-dashboard',
        query: {
          lti_launch: 'success',
          code: sessionCode,
        },
      }),
    );
  }

  /**
   * If the Google account matches an ACTIVE educator for the linked Classroom course,
   * hand off to the educator portal dashboard.
   *
   * Match order: school connection googleAccountId (sub) → connection email → educator email.
   * Sub match is required when userinfo email is missing or differs from the RW login email
   * but the same Google account connected Classroom for the course's school.
   * ACTIVE status is read from `userRole.status` (post userRole identity model).
   */
  private async tryEducatorClassroomHandoff(params: {
    res: Response;
    email: string | null;
    googleUserId: string;
    googleCourseId: string | null;
    simulationId: string | null;
  }): Promise<boolean> {
    if (!params.googleCourseId) {
      this.logger.log('[Google Classroom OAuth] Educator handoff skipped: no googleCourseId');
      return false;
    }

    const mapping = await this.courseMappingRepo.findByGoogleCourseId(params.googleCourseId);
    if (!mapping) {
      this.logger.warn(
        `[Google Classroom OAuth] Educator handoff skipped: no course mapping for ${params.googleCourseId}`,
      );
      return false;
    }

    const normalizedEmail = params.email?.trim().toLowerCase() || null;

    const connectionBySub = params.googleUserId
      ? await this.connectionRepo.findBySchoolAndGoogleAccountId(
          mapping.schoolId,
          params.googleUserId,
        )
      : null;
    const connectionByEmail =
      !connectionBySub && normalizedEmail
        ? await this.connectionRepo.findBySchoolAndGoogleEmail(
            mapping.schoolId,
            normalizedEmail,
          )
        : null;
    const connection = connectionBySub ?? connectionByEmail;
    let educator: Educator | null = null;
    let matchReason: string | null = null;

    if (
      connection?.status === GoogleConnectionStatus.ACTIVE &&
      connection.googleAccountId &&
      connection.googleAccountId === params.googleUserId
    ) {
      educator = await this.authService.findEducatorById(connection.connectedByEducatorId);
      matchReason = 'google_account_id';
    }

    if (
      !educator &&
      connection?.status === GoogleConnectionStatus.ACTIVE &&
      normalizedEmail &&
      connection.googleAccountEmail?.trim().toLowerCase() === normalizedEmail
    ) {
      educator = await this.authService.findEducatorById(connection.connectedByEducatorId);
      matchReason = 'google_account_email';
    }

    if (!educator && normalizedEmail) {
      educator = await this.authService.findEducatorByEmail(normalizedEmail);
      if (educator) {
        matchReason = 'educator_email';
      }
    }

    if (!educator) {
      this.logger.warn(
        `[Google Classroom OAuth] Educator handoff skipped: no educator for sub=${params.googleUserId} email=${normalizedEmail ?? 'none'}`,
      );
      return false;
    }

    if (!educator.is_active || resolveEducatorStatus(educator) !== CommonStatus.ACTIVE) {
      this.logger.warn(
        `[Google Classroom OAuth] Educator handoff skipped: educator ${educator.id} not ACTIVE (status=${resolveEducatorStatus(educator)}, active=${educator.is_active})`,
      );
      return false;
    }

    if (!educatorBelongsToSchool(educator, mapping.schoolId)) {
      this.logger.warn(
        `[Google Classroom OAuth] Educator handoff skipped: educator ${educator.id} not on school ${mapping.schoolId}`,
      );
      return false;
    }

    const mappedSchool =
      educator.schoolAssignments?.find((sa) => sa.school?.id === mapping.schoolId)?.school ??
      (educator.school?.id === mapping.schoolId ? educator.school : null);
    if (!mappedSchool || mappedSchool.google_classroom_enabled !== true) {
      this.logger.warn(
        `[Google Classroom OAuth] Educator handoff skipped: GC disabled or school missing for ${mapping.schoolId}`,
      );
      return false;
    }

    const loginEmail = (
      resolveEducatorEmail(educator)?.trim().toLowerCase() ||
      params.email ||
      ''
    ).trim();
    if (!loginEmail) {
      this.logger.warn(
        `[Google Classroom OAuth] Educator handoff skipped: educator ${educator.id} has no email`,
      );
      return false;
    }

    const loginResult = await this.authService.ltiLogin(
      loginEmail,
      mapping.schoolId,
      educator,
      params.res,
    );
    if (!loginResult.success || !loginResult.data) {
      this.logger.warn(
        `[Google Classroom OAuth] Educator handoff skipped: ltiLogin failed for educator ${educator.id}`,
      );
      return false;
    }

    const loginData = loginResult.data as {
      tokens: { accessToken: string; csrfToken: string };
      user: Record<string, unknown>;
    };
    const sessionCode = await this.studentHandoffService.createEducatorSessionCode({
      audience: 'educator',
      userId: educator.id,
      schoolId: mapping.schoolId,
      ltiContext: {
        issuer: 'google_classroom',
        lmsUserId: params.googleUserId,
        lmsCourseId: params.googleCourseId,
        clientId: null,
      },
      accessToken: loginData.tokens.accessToken,
      csrfToken: loginData.tokens.csrfToken,
      user: loginData.user,
      nrpsUrl: '',
      lmsCourseId: params.googleCourseId,
      lmsCourseName: '',
      provisioningStatus: 'skipped_google_classroom',
      courseSource: 'google_classroom',
      redirectPath: '/educator-dashboard',
    });

    this.logger.log(
      `[Google Classroom OAuth] Redirecting educator ${educator.id} to educator dashboard (match=${matchReason})`,
    );
    params.res.redirect(
      this.oauthService.buildEducatorLoginRedirect({
        lti_launch: 'success',
        code: sessionCode,
      }),
    );
    return true;
  }

  private redirectOAuthFailure(
    res: Response,
    stateRecord: GoogleOAuthStateRecord | null,
    reason: string,
  ): void {
    if (stateRecord?.purpose === 'student_login') {
      res.redirect(
        this.oauthService.buildStudentAppRedirect({
          path: '/login',
          query: {
            lti_launch: 'error',
            reason,
            source: 'google_classroom',
          },
        }),
      );
      return;
    }

    const educatorParams: Record<string, string> = {
      googleClassroom: 'error',
      reason,
    };
    if (stateRecord?.purpose === 'educator_connect') {
      educatorParams.schoolId = stateRecord.schoolId;
    }
    res.redirect(this.oauthService.buildFrontendRedirect(educatorParams));
  }

  /** Stable, non-sensitive reason codes for the frontend redirect query string. */
  private toSafeCallbackReason(err: unknown): string {
    if (err instanceof UnauthorizedException) {
      return 'invalid_or_expired_state';
    }
    if (err instanceof NotFoundException) {
      return 'student_not_enrolled';
    }
    if (err instanceof BadRequestException) {
      const message = err.message || '';
      if (message.includes(GoogleConstants.MESSAGES.GOOGLE_EMAIL_MISMATCH)) {
        return 'google_email_mismatch';
      }
      if (message.includes(GoogleConstants.MESSAGES.SCOPES_INCOMPLETE)) {
        return 'scopes_incomplete';
      }
      if (message.includes(GoogleConstants.MESSAGES.FEATURE_DISABLED)) {
        return 'feature_disabled';
      }
      if (message.includes('more than one class')) {
        return 'student_not_enrolled';
      }
      if (message.includes('OAuth is not configured')) {
        return 'launch_failed';
      }
      return 'token_exchange_failed';
    }
    return 'callback_failed';
  }
}
