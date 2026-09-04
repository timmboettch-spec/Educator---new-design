import {
  All,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { aesGcmEncrypt, deriveAesKey } from 'src/common/utils/aes-gcm.util';
import type { Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthThrottleConstants } from 'src/common/constants/throttle.constants';
import { AuthConstants } from 'src/auth/auth.constants';
import { Messages } from 'src/common/utils/messages';
import { AuthService } from 'src/auth/auth.service';
import { LmsProvisionService } from 'src/lms/services/lms-provision.service';
import { LmsLookupService } from 'src/lms/services/lms-lookup.service';
import { LmsAdapterFactory } from 'src/lms/factories/lms-adapter.factory';
import { LmsAdapter } from 'src/lms/interfaces/lms.interfaces';
import { StudentsService } from 'src/students/students.service';
import { StudentConstants } from 'src/students/students.constants';
import { LtiConstants } from './lti.constants';
import { LtiKeyService } from './lti-key.service';
import { LtiJwtService } from './lti-jwt.service';
import { LtiStateService } from './lti-state.service';
import { LtiSessionService, LtiSessionError } from './lti-session.service';
import type { LtiSessionAudience } from './lti-session.types';
import { Educator } from 'src/educators/entity/educator.entity';
import { LmsToolType } from 'src/common/enums/lms.enum';
import { LtiService } from './lti.service';
import { LmsConfigService } from 'src/lms/services/lms-config.service';
import { parseLmsType, resolveDefaultLtiEndpoints } from 'src/lms/utils/lms-endpoints.util';
import { buildAutoSubmitPostHandoffHtml } from './lti-handoff.util';
import {
  extractLaunchCourseContext,
  extractStudentLaunchCourseIds,
} from './lti-launch-context.util';

@ApiTags(LtiConstants.SWAGGER.TAG)
@Public()
@Controller(LtiConstants.ROUTES.BASE)
export class LtiController {
  private readonly logger = new Logger(LtiController.name);

  /** Map educator LTI login failures to safe URL reason slugs (no PII). */
  private mapEducatorLoginFailureToReason(message: string | undefined): string {
    switch (message) {
      case AuthConstants.LTI.SCHOOL_NOT_CONFIGURED:
        return 'school_not_configured';
      case AuthConstants.LTI.SCHOOL_MISMATCH:
        return 'school_mismatch';
      case AuthConstants.LTI.SCHOOL_RECORD_MISSING:
        return 'school_not_configured';
      case Messages.USER_NOT_FOUND:
        return 'educator_not_registered';
      default:
        return 'user_not_found';
    }
  }

  private mapStudentLoginFailureToReason(message: string | undefined): string {
    switch (message) {
      case StudentConstants.VALIDATION.STUDENT_ID_NOT_FOUND:
        return 'student_not_found';
      case StudentConstants.VALIDATION.CLASS_INACTIVE:
        return 'class_inactive';
      case StudentConstants.VALIDATION.CLASS_DRAFT:
        return 'class_draft';
      case StudentConstants.VALIDATION.CLASS_ARCHIVED:
        return 'class_archived';
      default:
        return 'login_failed';
    }
  }

  /** Map unexpected student-launch exceptions to safe URL reason slugs (no PII). */
  private mapStudentLaunchExceptionToReason(err: unknown): string {
    let message = '';
    if (err instanceof UnauthorizedException) {
      const response = err.getResponse();
      message =
        typeof response === 'string'
          ? response
          : typeof response === 'object' &&
              response !== null &&
              'message' in response &&
              typeof (response as { message?: unknown }).message === 'string'
            ? (response as { message: string }).message
            : err.message;
    } else if (err instanceof Error) {
      message = err.message;
    } else {
      message = String(err);
    }

    const normalized = message.toLowerCase();

    if (normalized.includes('timed out') || normalized.includes('timeout')) {
      return 'token_verification_timeout';
    }
    if (normalized.includes('nonce mismatch') || normalized.includes('replay attack')) {
      return 'launch_replay_detected';
    }
    if (
      normalized.includes('invalid or expired state') ||
      normalized.includes('state parameter expired') ||
      normalized.includes('missing state') ||
      normalized.includes('missing nonce')
    ) {
      return 'launch_session_expired';
    }
    if (normalized.includes('deployment id mismatch')) {
      return 'deployment_mismatch';
    }
    if (normalized.includes('unknown lti platform issuer')) {
      return 'school_not_found';
    }
    if (
      normalized.includes('malformed jwt') ||
      normalized.includes('invalid id_token') ||
      normalized.includes('id_token expired') ||
      normalized.includes('id_token must') ||
      normalized.includes('jwt signature') ||
      normalized.includes('jwt expired')
    ) {
      return 'invalid_token';
    }

    return 'launch_failed';
  }

  private firstNonEmpty(values: Array<unknown>): string | null {
    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  private normalizeEmailLike(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim().toLowerCase();
    return trimmed.includes('@') ? trimmed : null;
  }

  private extractLaunchEmail(payload: Record<string, unknown>): string | null {
    const lisClaim = payload['https://purl.imsglobal.org/spec/lti/claim/lis'] as
      Record<string, unknown> | undefined;
    const extClaim = payload['https://purl.imsglobal.org/spec/lti/claim/ext'] as
      Record<string, unknown> | undefined;
    const customClaim = payload['https://purl.imsglobal.org/spec/lti/claim/custom'] as
      Record<string, unknown> | undefined;

    const candidates: Array<{ key: string; value: unknown }> = [
      { key: 'email', value: payload.email },
      { key: 'emailaddress', value: payload.emailaddress },
      { key: 'lis.person_contact_email_primary', value: lisClaim?.person_contact_email_primary },
      {
        key: 'lis.person_contact_email_primary_address',
        value: lisClaim?.person_contact_email_primary_address,
      },
      { key: 'lis.person_sourcedid', value: lisClaim?.person_sourcedid },
      { key: 'lis_person_contact_email_primary', value: payload.lis_person_contact_email_primary },
      { key: 'lis_person_sourcedid', value: payload.lis_person_sourcedid },
      { key: 'ext.user_username', value: extClaim?.user_username },
      { key: 'custom.email', value: customClaim?.email },
      { key: 'custom.user_email', value: customClaim?.user_email },
      { key: 'custom.username', value: customClaim?.username },
      { key: 'sub', value: payload.sub },
    ];

    const candidate = this.firstNonEmpty(candidates.map((c) => c.value));
    const result = this.normalizeEmailLike(candidate);

    return result;
  }

  private enforceHttpsInProduction(req: Request): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv !== 'production') {
      return;
    }
    const forwarded = req.headers['x-forwarded-proto'];
    const proto = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.protocol;
    if (proto !== 'https') {
      throw new ForbiddenException('HTTPS required');
    }
  }

  private parseSessionAudience(value: unknown): LtiSessionAudience | null {
    if (value === 'educator' || value === 'student') {
      return value;
    }
    return null;
  }

  private encryptStudentCode(studentCode: string): string {
    const secret =
      this.configService.get<string>('LTI_STUDENT_CODE_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'lti-student-code-default-secret';

    return aesGcmEncrypt(deriveAesKey(secret), studentCode);
  }

  constructor(
    private readonly keyService: LtiKeyService,
    private readonly ltiService: LtiService,
    private readonly ltiJwtService: LtiJwtService,
    private readonly stateService: LtiStateService,
    private readonly sessionService: LtiSessionService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly provisionService: LmsProvisionService,
    private readonly lmsLookupService: LmsLookupService,
    private readonly studentsService: StudentsService,
    private readonly lmsAdapterFactory: LmsAdapterFactory,
    private readonly lmsConfigService: LmsConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get(LtiConstants.ROUTES.JWKS)
  @ApiOperation({ summary: 'LTI tool JWKS (for LMS registration)' })
  async getJwks(): Promise<unknown> {
    return this.keyService.getJwks();
  }

  @Get(LtiConstants.ROUTES.STUDENTJWKS)
  @ApiOperation({ summary: 'LTI tool JWKS (for LMS registration)' })
  async getStudentJwks(): Promise<unknown> {
    return this.keyService.getStudentJwks();
  }

  @Post(LtiConstants.ROUTES.SESSION_EXCHANGE)
  @Throttle({
    default: {
      limit: AuthThrottleConstants.LTI_SESSION_EXCHANGE.LIMIT,
      ttl: AuthThrottleConstants.LTI_SESSION_EXCHANGE.TTL,
    },
  })
  @ApiOperation({ summary: 'Exchange one-time code for LTI session data' })
  exchangeSessionCode(
    @Body() body: { code?: string; audience?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    try {
      this.enforceHttpsInProduction(req);

      const audience = this.parseSessionAudience(body.audience);
      const code = body.code;

      if (!audience || !code || typeof code !== 'string') {
        res.status(400).json({ error: 'Invalid or expired session code' });
        return;
      }

      const sessionData = this.sessionService.consumeSession(code, audience);

      if (sessionData.audience === 'educator') {
        res.status(200).json({
          audience: 'educator',
          accessToken: sessionData.accessToken,
          csrfToken: sessionData.csrfToken,
          user: sessionData.user,
          schoolId: sessionData.schoolId,
          nrpsUrl: sessionData.nrpsUrl,
          lmsCourseId: sessionData.lmsCourseId,
          lmsCourseName: sessionData.lmsCourseName,
          provisioningStatus: sessionData.provisioningStatus,
          courseSource: sessionData.courseSource,
          lmsAccessToken: sessionData.lmsAccessToken,
        });
        return;
      }

      res.status(200).json({
        audience: 'student',
        studentCode: sessionData.studentCode,
        classId: sessionData.classId,
        className: sessionData.className,
        accessToken: sessionData.accessToken,
        studentData: sessionData.studentData,
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof LtiSessionError) {
        this.logger.warn(`Session exchange rejected: ${err.message}`);
      } else {
        this.logger.warn(
          `Session exchange failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
      res.status(400).json({ error: 'Invalid or expired session code' });
    }
  }

  @Get(LtiConstants.ROUTES.METADATA)
  @ApiOperation({ summary: 'LTI tool URLs for LMS manual registration' })
  getMetadata(): unknown {
    return this.ltiService.getToolMetadata();
  }

  @All(LtiConstants.ROUTES.LOGIN)
  async initiateLogin(@Req() req: Request, @Res() res: Response): Promise<void> {
    const params = this.ltiService.mergeRequestParams(req);
    const redirectUrl = await this.ltiService.buildLoginRedirect(params);
    return res.redirect(redirectUrl);
  }

  @All(LtiConstants.ROUTES.STUDENTLOGIN)
  async initiateStudentLogin(@Req() req: Request, @Res() res: Response): Promise<void> {
    const params = this.ltiService.mergeRequestParams(req);
    const redirectUrl = await this.ltiService.buildStudentLoginRedirect(params);
    return res.redirect(redirectUrl);
  }

  @Post(LtiConstants.ROUTES.CALLBACK)
  callback(@Body() body: Record<string, string>, @Res() res: Response): void {
    const idToken = body.id_token;
    if (!idToken) {
      res.status(400).json({ error: 'Missing id_token' });
      return;
    }

    const actionUrl = `${this.keyService.getBaseUrl()}/lti/launch`;
    const html = buildAutoSubmitPostHandoffHtml(actionUrl, {
      id_token: idToken,
      state: body.state ?? '',
    });
    res.type('html').status(200).send(html);
  }

  @Post(LtiConstants.ROUTES.STUDENTCALLBACK)
  studentCallback(@Body() body: Record<string, string>, @Res() res: Response): void {
    const idToken = body.id_token;
    if (!idToken) {
      res.status(400).json({ error: 'Missing id_token' });
      return;
    }

    const actionUrl = `${this.keyService.getBaseUrl()}/lti/studentlaunch`;
    const html = buildAutoSubmitPostHandoffHtml(actionUrl, {
      id_token: idToken,
      state: body.state ?? '',
    });
    res.type('html').status(200).send(html);
  }

  @All(LtiConstants.ROUTES.LAUNCH)
  async launch(@Req() req: Request, @Res() res: Response): Promise<void> {
    const params = this.ltiService.mergeRequestParams(req);
    const idToken = params.id_token;
    const state = params.state;
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    ).replace(/\/$/, '');

    if (!idToken) {
      return res.redirect(`${frontendUrl}/login?lti_launch=missing_token`);
    }

    try {
      // Quick decode to extract iss/aud before full verification
      const unverifiedPayload = this.ltiJwtService['quickDecode'](idToken);
      const launchIssuer = this.firstNonEmpty([params.iss, unverifiedPayload.iss]) ?? '';
      const launchClientId = this.firstNonEmpty([
        typeof unverifiedPayload.aud === 'string' ? unverifiedPayload.aud : null,
        Array.isArray(unverifiedPayload.aud)
          ? unverifiedPayload.aud.find((v) => typeof v === 'string')
          : null,
        typeof unverifiedPayload.azp === 'string' ? unverifiedPayload.azp : null,
      ]);

      // Resolve LMS config once for aud/deployment validation and school binding
      const lmsConfig = await this.lmsConfigService.resolveEducatorLaunchConfig(
        launchIssuer,
        launchClientId,
      );
      const expectedClientId = lmsConfig?.clientId?.trim() || undefined;
      const expectedDeploymentId = lmsConfig?.deploymentId?.trim() || undefined;

      // Verify JWT signature and claims (including aud and deployment_id binding)
      const payload = await this.ltiJwtService.verifyIdToken(
        idToken,
        undefined,
        expectedClientId,
        expectedDeploymentId,
      );

      // Validate state and nonce to prevent CSRF and replay attacks
      const nonceFromToken = typeof payload.nonce === 'string' ? payload.nonce : undefined;
      this.stateService.validateAndConsume(state, nonceFromToken, 'educator');

      const courseContext = extractLaunchCourseContext(payload);
      const lmsCourseId = courseContext.courseId;
      const lmsCourseName = courseContext.courseTitle
        ? encodeURIComponent(courseContext.courseTitle)
        : '';
      const courseSource = courseContext.source;
      const nrpsClaim = payload[
        'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'
      ] as Record<string, unknown> | undefined;

      const nrpsUrl =
        typeof nrpsClaim?.['context_memberships_url'] === 'string'
          ? nrpsClaim['context_memberships_url']
          : '';

      const launchUserId = typeof payload.sub === 'string' ? payload.sub : '';
      let email = this.extractLaunchEmail(payload);

      let wsLookupError: string | null = null;
      if (!email && payload.sub && typeof payload.sub === 'string' && lmsConfig) {
        let adapter: LmsAdapter | null = null;
        try {
          adapter = this.lmsAdapterFactory.getAdapter(lmsConfig.lmsType);
        } catch (err) {
          wsLookupError = `No adapter for lmsType=${lmsConfig.lmsType}: ${(err as Error).message}`;
          this.logger.warn(wsLookupError);
        }

        if (adapter?.getUserEmail) {
          try {
            const wsResult = await adapter.getUserEmail(lmsConfig, payload.sub);
            email = wsResult.email;
            wsLookupError = wsResult.error;
          } catch (err) {
            wsLookupError = `Adapter getUserEmail failed: ${(err as Error).message}`;
            this.logger.warn(wsLookupError);
          }
        } else if (adapter) {
          wsLookupError = `getUserEmail not implemented for ${lmsConfig.lmsType}`;
        }
      }

      if (!email) {
        // Log full payload for debugging but don't expose in URL
        this.logger.warn(
          `Email required from LMS. Launch context: issuer=${launchIssuer}, sub=${launchUserId}`,
        );
        if (wsLookupError) {
          this.logger.warn(`LMS email lookup error: ${wsLookupError}`);
        }
        return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=email_required_from_lms`);
      }

      const launchEducator = await this.authService.findEducatorByEmail(email);
      const educatorSchoolIds = launchEducator
        ? this.authService.getEducatorSchoolIds(launchEducator)
        : null;
      const resolvedForEducator = await this.lmsConfigService.resolveEducatorLaunchConfig(
        launchIssuer,
        launchClientId,
        educatorSchoolIds,
      );
      if (launchEducator) {
        if (!educatorSchoolIds?.length || !resolvedForEducator?.schoolId) {
          this.logger.warn(
            `[educatorLaunch] No LMS config matches educator schools for email=${email} (memberships=${educatorSchoolIds?.length ?? 0})`,
          );
          return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=school_mismatch`);
        }
      }
      const activeLmsConfig = resolvedForEducator ?? lmsConfig;

      // Extract and validate roles - block learners/students from educator portal
      const rolesClaim = payload['https://purl.imsglobal.org/spec/lti/claim/roles'];
      const normalizedRoles = Array.isArray(rolesClaim)
        ? rolesClaim.map((r) => String(r).toLowerCase())
        : typeof rolesClaim === 'string'
          ? [String(rolesClaim).toLowerCase()]
          : [];

      this.logger.debug(`[educatorLaunch] User roles: ${JSON.stringify(normalizedRoles)}`);

      // Check if user has learner/student role (should use student tool instead)
      const isLearnerOnly = normalizedRoles.some(
        (role) =>
          role.includes('learner') ||
          role.includes('student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student'),
      );

      const isInstructor = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('administrator') ||
          role.includes('admin') ||
          role.includes('manager') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor'),
      );

      // Learners and missing roles must not access educator portal (fail closed)
      if (normalizedRoles.length === 0 || (isLearnerOnly && !isInstructor)) {
        this.logger.warn(
          `[educatorLaunch] Educator role required. Roles: ${normalizedRoles.length ? normalizedRoles.join(', ') : '(none)'}`,
        );
        return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=educator_role_required`);
      }

      if (!activeLmsConfig?.schoolId) {
        this.logger.warn(
          `[educatorLaunch] No LMS config for issuer=${launchIssuer}, clientId=${launchClientId ?? '(none)'}`,
        );
        return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=school_not_configured`);
      }

      // Course-instructor verification: require NRPS to verify course membership (fail-closed)
      if (!nrpsUrl?.trim()) {
        this.logger.warn(
          `[educatorLaunch] NRPS URL missing; cannot verify course instructor for course=${lmsCourseId}`,
        );
        return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=nrps_required`);
      }

      if (!launchUserId?.trim()) {
        this.logger.warn(
          `[educatorLaunch] Missing launch user id (sub); cannot verify course instructor`,
        );
        return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=not_course_instructor`);
      }

      const instructorCheck = await this.provisionService.isUserInstructorInRoster({
        nrpsUrl,
        lmsUserId: launchUserId,
        schoolId: activeLmsConfig.schoolId,
        lmsCourseId,
      });

      if (!instructorCheck.isInstructor) {
        this.logger.warn(
          `[educatorLaunch] User ${email} (sub=${launchUserId}) has instructor role claim but is not course instructor in roster for course=${lmsCourseId}. Error: ${instructorCheck.error || 'not in roster'}`,
        );
        return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=not_course_instructor`);
      }

      const loginResult = await this.authService.ltiLogin(
        email,
        activeLmsConfig.schoolId,
        launchEducator,
      );

      if (!loginResult.success || !loginResult.data) {
        const reason = this.mapEducatorLoginFailureToReason(loginResult.message);
        this.logger.warn(
          `LTI login failed for email=${email}, issuer=${launchIssuer}, schoolId=${activeLmsConfig.schoolId}, reason=${reason}`,
        );
        return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=${reason}`);
      }

      const accessToken = (
        loginResult.data as {
          tokens: { accessToken: string; csrfToken: string };
          user: Record<string, unknown>;
        }
      ).tokens.accessToken;
      const csrfToken = (
        loginResult.data as {
          tokens: { accessToken: string; csrfToken: string };
          user: Record<string, unknown>;
        }
      ).tokens.csrfToken;
      const user = (
        loginResult.data as {
          tokens: { accessToken: string; csrfToken: string };
          user: Record<string, unknown>;
        }
      ).user;

      const enableLtiAutoProvision =
        String(
          this.configService.get<string>('LMS_ENABLE_LTI_AUTO_PROVISION', 'false'),
        ).toLowerCase() === 'true';
      const educatorId = typeof user['id'] === 'string' ? user['id'] : null;
      if (enableLtiAutoProvision && educatorId) {
        void this.provisionService.provisionFromLtiLogin(
          educatorId,
          lmsCourseId,
          activeLmsConfig.schoolId,
          nrpsUrl,
          launchIssuer,
          launchUserId,
        );
      }

      const provisioningStatus = !enableLtiAutoProvision
        ? 'disabled'
        : lmsCourseId
          ? 'queued'
          : 'skipped_missing_course_context';

      // Create one-time session code instead of passing tokens in URL
      const sessionCode = this.sessionService.createSession({
        audience: 'educator',
        userId: educatorId,
        schoolId: activeLmsConfig.schoolId,
        ltiContext: {
          issuer: launchIssuer,
          lmsUserId: launchUserId,
          lmsCourseId,
          clientId: launchClientId,
        },
        accessToken,
        csrfToken,
        user,
        nrpsUrl,
        lmsCourseId,
        lmsCourseName: lmsCourseName ? decodeURIComponent(lmsCourseName) : '',
        provisioningStatus,
        courseSource,
      });

      const target = `${frontendUrl}/login?lti_launch=success&code=${sessionCode}`;
      return res.redirect(303, target);
    } catch (err) {
      // JWT verification failures already logged by LtiJwtService
      const reason =
        err instanceof Error && err.message.includes('id_token')
          ? 'invalid_token'
          : 'decode_failed';
      return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=${reason}`);
    }
  }

  @All(LtiConstants.ROUTES.DEBUG_LAUNCH)
  debugLaunch(@Req() req: Request, @Res() res: Response): Response {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    const params = this.ltiService.mergeRequestParams(req);
    const idToken = params.id_token;
    if (!idToken) {
      return res
        .status(400)
        .json({ error: 'Missing id_token — POST the LTI id_token here to debug' });
    }
    try {
      const payloadBase64 = idToken.split('.')[1];
      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      return res.status(200).json({ decoded_payload: payload });
    } catch (err) {
      return res
        .status(400)
        .json({ error: `Failed to decode id_token: ${(err as Error).message}` });
    }
  }

  @All(LtiConstants.ROUTES.STUDENTLAUNCH)
  async studentLaunch(@Req() req: Request, @Res() res: Response): Promise<void> {
    const studentUrl = (
      this.configService.get<string>('STUDENT_FRONTEND_URL') || 'http://localhost:5174'
    ).replace(/\/$/, '');
    const params = this.ltiService.mergeRequestParams(req);
    const idToken = params.id_token;
    const state = params.state;

    if (!idToken) {
      this.logger.warn('[studentLaunch] Missing id_token in request');
      res.status(400).json({ error: 'Missing id_token' });
      return;
    }

    try {
      // Quick decode to extract iss/aud before full verification
      const unverifiedPayload = this.ltiJwtService['quickDecode'](idToken);
      const launchIssuer = this.firstNonEmpty([params.iss, unverifiedPayload.iss]) ?? '';
      const launchClientId =
        this.firstNonEmpty([
          typeof unverifiedPayload.aud === 'string' ? unverifiedPayload.aud : null,
          Array.isArray(unverifiedPayload.aud)
            ? unverifiedPayload.aud.find((v) => typeof v === 'string')
            : null,
          typeof unverifiedPayload.azp === 'string' ? unverifiedPayload.azp : null,
        ]) ?? '';

      // Resolve all LMS configs for this launch (shared tools may map to multiple schools)
      const candidateConfigs = await this.lmsConfigService.listStudentLaunchConfigs(
        launchIssuer,
        launchClientId,
      );

      // Student launch intentionally skips aud validation: there is no per-student-tool
      // LMS config in admin UI, so no stored clientId to compare the token aud against.
      // Signature, issuer, state, and nonce are still enforced; deployment_id is checked
      // per candidate school config after verification (shared tools may differ by school).
      // Trade-off: if one issuer registers multiple tools sharing the same JWKS, a token
      // minted for a different tool could pass here. Accepted for RWAI-2910 scope
      const payload = await this.ltiJwtService.verifyIdToken(
        idToken,
        undefined,
        undefined, // expectedClientId omitted — see comment above
        undefined,
      );

      const tokenDeploymentId =
        typeof payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] === 'string'
          ? payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
          : null;
      const deploymentMatchedConfigs = this.lmsConfigService.filterConfigsByLaunchDeployment(
        candidateConfigs,
        tokenDeploymentId,
      );

      if (candidateConfigs.length > 0 && deploymentMatchedConfigs.length === 0) {
        this.logger.warn(
          `[studentLaunch] Deployment ID mismatch for all candidate schools (token deployment: ${tokenDeploymentId ?? '(none)'})`,
        );
        return res.redirect(`${studentUrl}/login?lti_launch=error&reason=deployment_mismatch`);
      }

      // Validate state and nonce to prevent CSRF and replay attacks
      const nonceFromToken = typeof payload.nonce === 'string' ? payload.nonce : undefined;
      this.stateService.validateAndConsume(state, nonceFromToken, 'student');

      const lmsUserId = String(payload.sub);
      const lmsIssuer = String(payload.iss);

      this.logger.log(
        `[studentLaunch] Processing student launch for user: ${lmsUserId}, issuer: ${lmsIssuer}`,
      );

      const rolesClaim = payload['https://purl.imsglobal.org/spec/lti/claim/roles'];

      const normalizedRoles = Array.isArray(rolesClaim)
        ? rolesClaim.map((r) => String(r).toLowerCase())
        : [];

      this.logger.debug(`[studentLaunch] User roles: ${JSON.stringify(normalizedRoles)}`);

      const isEducatorLike = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('faculty') ||
          role.includes('admin') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor') ||
          role.endsWith('#teacher') ||
          role.endsWith('/teacher') ||
          role.endsWith('#faculty') ||
          role.endsWith('/faculty') ||
          role.endsWith('#administrator') ||
          role.endsWith('/administrator'),
      );

      // If educator role detected, redirect to educator app

      if (isEducatorLike) {
        this.logger.warn(
          `[studentLaunch] Educator/instructor (role: ${normalizedRoles.join(', ')}) attempted to launch student tool. Redirecting to educator app.`,
        );

        const frontendUrl = (
          this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173'
        ).replace(
          /\/$/,

          '',
        );

        return res.redirect(
          `${frontendUrl}/login?lti_launch=error&reason=educator_using_student_tool`,
        );
      }

      const isStudentLike = normalizedRoles.some(
        (role) =>
          role.includes('student') ||
          role.includes('learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner'),
      );

      // Learners only; fail closed when roles missing (symmetric with educator launch)
      if (normalizedRoles.length === 0 || !isStudentLike) {
        this.logger.warn(
          `[studentLaunch] Student role required. Roles: ${normalizedRoles.length ? normalizedRoles.join(', ') : '(none)'}`,
        );

        return res.redirect(`${studentUrl}/login?lti_launch=error&reason=student_role_required`);
      }

      let studentCode: string | null = null;
      let resolvedSchoolId: string | null = null;
      const launchCourseIds = extractStudentLaunchCourseIds(payload);
      let courseScopedClassFound = false;

      if (lmsUserId) {
        if (deploymentMatchedConfigs.length === 0) {
          this.logger.error(
            `[studentLaunch] No LMS config for issuer: ${lmsIssuer} or clientId: ${launchClientId}`,
          );
          return res.redirect(`${studentUrl}/login?lti_launch=error&reason=school_not_found`);
        }

        const candidateSchoolIds = deploymentMatchedConfigs
          .map((config) => config.schoolId)
          .filter((id): id is string => Boolean(id?.trim()));

        this.logger.debug(
          `[studentLaunch] Candidate schools for shared tool: ${candidateSchoolIds.join(', ') || '(none)'}`,
        );

        const resolution = await this.lmsLookupService.resolveStudentCodeForLaunch({
          lmsUserId,
          launchCourseIds,
          schoolIds: candidateSchoolIds,
        });

        studentCode = resolution.studentCode;
        resolvedSchoolId = resolution.schoolId;
        courseScopedClassFound = resolution.courseScopedClassFound;

        if (studentCode) {
          this.logger.log(
            `[studentLaunch] Found student code: ${studentCode} (school=${resolvedSchoolId})`,
          );
        }
      }

      if (!studentCode) {
        if (launchCourseIds.length > 0 && courseScopedClassFound) {
          this.logger.warn(
            `[studentLaunch] Course-scoped launch failed (student_not_enrolled) for lmsUserId: ${lmsUserId}, courseIds: ${launchCourseIds.join(', ')}`,
          );
          return res.redirect(`${studentUrl}/login?lti_launch=error&reason=student_not_enrolled`);
        }

        if (launchCourseIds.length > 0) {
          this.logger.warn(
            `[studentLaunch] Course-scoped launch failed (class_not_provisioned) for lmsUserId: ${lmsUserId}, courseIds: ${launchCourseIds.join(', ')}`,
          );
          return res.redirect(`${studentUrl}/login?lti_launch=error&reason=class_not_provisioned`);
        }

        this.logger.error(
          `[studentLaunch] Failed to resolve student code for lmsUserId: ${lmsUserId}`,
        );

        return res.redirect(`${studentUrl}/login?lti_launch=error&reason=student_not_found`);
      }

      this.logger.log(`[studentLaunch] Attempting student login with code: ${studentCode}`);

      const loginResult = await this.studentsService.studentLogin(studentCode);

      if (!loginResult.success || !loginResult.data) {
        const reason = loginResult.message || 'login_failed';
        const safeReason = this.mapStudentLoginFailureToReason(loginResult.message);

        this.logger.error(
          `[studentLaunch] Student login failed for code ${studentCode}: ${reason}`,
        );

        return res.redirect(`${studentUrl}/login?lti_launch=error&reason=${safeReason}`);
      }

      this.logger.log(`[studentLaunch] Student login successful for code: ${studentCode}`);

      const studentData = loginResult.data;

      const sessionCode = this.sessionService.createSession({
        audience: 'student',
        userId: typeof studentData.id === 'string' ? studentData.id : null,
        schoolId: resolvedSchoolId,
        ltiContext: {
          issuer: lmsIssuer,
          lmsUserId,
          lmsCourseId: launchCourseIds[0] ?? null,
          clientId: launchClientId || null,
        },
        studentCode,
        classId: typeof studentData.class_id === 'string' ? studentData.class_id : null,
        className: typeof studentData.class_name === 'string' ? studentData.class_name : null,
        accessToken: typeof studentData.access_token === 'string' ? studentData.access_token : null,
        studentData: studentData as unknown as Record<string, unknown>,
      });

      this.logger.log(
        `[studentLaunch] Redirecting to student dashboard with one-time session code`,
      );

      const target = `${studentUrl}/student-dashboard?lti_launch=success&code=${sessionCode}`;
      return res.redirect(303, target);
    } catch (err) {
      const logMessage = err instanceof Error ? err.message : String(err);
      const safeReason = this.mapStudentLaunchExceptionToReason(err);

      this.logger.error(
        `[studentLaunch] Launch failed (${safeReason}): ${logMessage}`,
        err instanceof Error ? err.stack : undefined,
      );

      return res.redirect(`${studentUrl}/login?lti_launch=error&reason=${safeReason}`);
    }
  }

  @Post('bootstrap-config')
  @ApiOperation({
    summary: '[Non-production] Seed LMS school config from id_token + educator email',
  })
  async bootstrapConfig(
    @Body() body: Record<string, string>,

    @Res() res: Response,
  ): Promise<Response> {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';

    if (nodeEnv === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }

    const {
      id_token: idToken,
      educator_email: educatorEmail,
      share_pii: sharePiiRaw,
      sharePii: sharePiiCamel,
      tool_type: toolTypeRaw,
      toolType: toolTypeCamel,
      lms_type: lmsTypeRaw,
      lmsType: lmsTypeCamel,
      auth_endpoint: authEndpointRaw,
      authEndpoint: authEndpointCamel,
      token_endpoint: tokenEndpointRaw,
      tokenEndpoint: tokenEndpointCamel,
      jwks_url: jwksUrlRaw,
      jwksUrl: jwksUrlCamel,
    } = body;

    if (!idToken || !educatorEmail) {
      return res.status(400).json({ error: 'Both id_token and educator_email are required' });
    }

    // Parse sharePii from request body (supports both snake_case and camelCase)
    const sharePii = ((): boolean => {
      const raw = sharePiiCamel ?? sharePiiRaw;
      if (raw === undefined || raw === null || raw === '') {
        return true; // Default to true if not provided
      }
      if (typeof raw === 'boolean') {
        return raw;
      }
      return String(raw).toLowerCase() === 'true';
    })();

    // Parse toolType from request body (supports both snake_case and camelCase)
    const toolType = ((): LmsToolType => {
      const raw = String(toolTypeCamel ?? toolTypeRaw ?? LmsToolType.EDUCATOR)
        .trim()
        .toLowerCase();
      return raw === 'student' ? LmsToolType.STUDENT : LmsToolType.EDUCATOR;
    })();

    const lmsType = parseLmsType(lmsTypeCamel ?? lmsTypeRaw);

    try {
      const payloadBase64 = idToken.split('.')[1];

      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;

      const issuer = typeof payload.iss === 'string' ? payload.iss.trim().replace(/\/+$/, '') : '';

      const clientId = typeof payload.aud === 'string' ? payload.aud.trim() : '';

      const deploymentId =
        typeof payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] === 'string'
          ? payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
          : null;

      if (!issuer || !clientId) {
        return res.status(400).json({ error: 'Token missing iss or aud fields' });
      }

      const educator = await this.dataSource.manager.findOne(Educator, {
        where: { email: educatorEmail.trim().toLowerCase() },

        relations: ['school'],
      });

      if (!educator) {
        return res.status(404).json({ error: `No educator found with email: ${educatorEmail}` });
      }

      const schoolId = educator.school?.id;

      if (!schoolId) {
        return res.status(400).json({ error: `Educator ${educatorEmail} has no school linked` });
      }

      const defaultEndpoints = resolveDefaultLtiEndpoints(lmsType, issuer);
      const authEndpoint = String(
        authEndpointCamel ?? authEndpointRaw ?? defaultEndpoints.authEndpoint,
      ).trim();
      const tokenEndpoint = String(
        tokenEndpointCamel ?? tokenEndpointRaw ?? defaultEndpoints.tokenEndpoint,
      ).trim();
      const jwksUrl = String(jwksUrlCamel ?? jwksUrlRaw ?? defaultEndpoints.jwksUrl).trim();

      const config = await this.lmsConfigService.upsertConfig({
        schoolId,

        toolType,

        lmsType,

        issuer,

        clientId,

        deploymentId: deploymentId ?? undefined,

        authEndpoint,

        tokenEndpoint,

        jwksUrl,

        lmsBaseUrl: defaultEndpoints.lmsBaseUrl,
        moodleUrl: defaultEndpoints.moodleUrl,

        sharePii, // Now uses parsed value from request body
      });

      return res.status(200).json({
        success: true,

        message: 'LMS config saved — school lookup will now work for this issuer',

        config: {
          id: config.id,

          schoolId: config.schoolId,

          lmsType: config.lmsType,

          issuer: config.issuer,

          lmsBaseUrl: config.lmsBaseUrl,
          moodleUrl: config.lmsBaseUrl,

          clientId: config.clientId,

          deploymentId: config.deploymentId,

          status: config.status,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}
