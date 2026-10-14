import {
  All,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Redirect,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthConstants } from 'src/auth/auth.constants';
import { AuthService } from 'src/auth/auth.service';
import { AuthThrottleConstants } from 'src/common/constants/throttle.constants';
import { Public } from 'src/common/decorators/public.decorator';
import { aesGcmEncrypt, deriveAesKey } from 'src/common/utils/aes-gcm.util';
import { Messages } from 'src/common/utils/messages';
import { redactCode, redactEmail } from 'src/common/utils/redact.util';
import { LmsAdapterFactory } from 'src/lms/factories/lms-adapter.factory';
import { LmsAssignmentService } from 'src/lms/services/lms-assignment.service';
import { LmsLookupService } from 'src/lms/services/lms-lookup.service';
import { LmsProvisionService } from 'src/lms/services/lms-provision.service';
import { StudentConstants } from 'src/students/students.constants';
import { StudentsService } from 'src/students/students.service';
import { LtiJwtService } from './lti-jwt.service';
import { LtiKeyService } from './lti-key.service';
import { LtiSessionError, LtiSessionService } from './lti-session.service';
import type { LtiSessionAudience } from './lti-session.types';
import { LtiStateService } from './lti-state.service';
import { LtiConstants } from './lti.constants';
import { LtiDeepLinkingService } from './services/lti-deep-linking.service';
import {
  LtiSubmissionReviewService,
  type SubmissionReviewFailureReason,
} from './services/lti-submission-review.service';
import {
  buildSubmissionReviewErrorHtml,
  isSubmissionReviewLaunch,
} from './utils/lti-submission-review.util';
import {
  buildReportDetailRedirectPath,
  verifyCanvasReviewToken,
} from './utils/canvas-review-token.util';
import { DeepLinkingExchangeDto, DeepLinkingSubmitDto } from './dto/deep-linking.dto';

import { LmsToolType, LmsType } from 'src/common/enums/lms.enum';
import { Educator, LmsSchoolConfig } from 'src/database/entities';
import { LmsConfigService } from 'src/lms/services/lms-config.service';
import {
  buildAutoSubmitPostHandoffHtml,
  buildOpenInNewTabHandoffHtml,
  buildTopLevelRedirectHtml,
} from './lti-handoff.util';
import { toIsoStartDateTime, toIsoEndDateTime } from './utils/lti-date-format.util';
import {
  extractLaunchCourseContext,
  extractStudentLaunchCourseIds,
  extractCustomSimulationId,
} from './lti-launch-context.util';
import { TokenService, LoggerService } from 'src/common/services';
import { extractAccessToken } from 'src/common/utils/token-extractor.util';
import {
  extractAgsEndpoint,
  extractResourceLinkId,
  extractResourceLinkTitle,
  getLineItemUrl,
  hasScoreScope,
} from 'src/lms/utils/lti-ags.util';
import { assertLineItemUrlAllowed } from 'src/lms/utils/lms-url.util';
import { StudentLoginData } from 'src/students/interfaces/student-profile.interface';
import { LtiService } from './lti.service';
import { generateDeepLinkingPickerHtml, generateNgrokSafeHtmlFetchPage } from './lti-deep-linking-picker.util';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';

@ApiTags(LtiConstants.SWAGGER.TAG)
@Public()
@Controller(LtiConstants.ROUTES.BASE)
export class LtiController {
  /** Map educator LTI login failures to safe URL reason slugs (no PII). */
  private mapEducatorLoginFailureToReason(message: string | undefined): string {
    switch (message) {
      case AuthConstants.LTI.SCHOOL_NOT_CONFIGURED:
        return 'school_not_configured';
      case AuthConstants.LTI.SCHOOL_MISMATCH:
        return 'school_mismatch';
      case AuthConstants.LTI.SCHOOL_RECORD_MISSING:
        return 'school_not_configured';
      case AuthConstants.LTI.EDUCATOR_NOT_REGISTERED:
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
    if (err instanceof ServiceUnavailableException) {
      return 'storage_unavailable';
    }

    let message: string;
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
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
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

  private extractSchoolIdFromUser(user: Record<string, unknown>): string | null {
    const direct = user['school_id'] ?? user['schoolId'];
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
    const nestedSchool = user['school'];
    if (nestedSchool && typeof nestedSchool === 'object') {
      const nestedId = (nestedSchool as Record<string, unknown>)['id'];
      if (typeof nestedId === 'string' && nestedId.trim()) {
        return nestedId.trim();
      }
    }
    const schools = user['schools'];
    if (Array.isArray(schools) && schools.length > 0) {
      const first = schools[0] as Record<string, unknown> | undefined;
      const id = first?.['id'] ?? first?.['school_id'];
      if (typeof id === 'string' && id.trim()) {
        return id.trim();
      }
    }
    return null;
  }

  private getEducatorFrontendUrl(): string {
    return (
      this.configService.get<string>('app.frontendUrl') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  /** Prefer backend-hosted picker when API_BASE_URL is public (ngrok/deployed) for LMS iframe embedding. */
  private getDeepLinkingPickerUrl(): string {
    const configuredPicker = this.configService.get<string>('DEEP_LINKING_PICKER_URL')?.trim();
    if (configuredPicker) {
      return configuredPicker.replace(/\/$/, '');
    }

    const apiBase = this.configService.get<string>('app.apiBaseUrl')?.trim();
    if (apiBase) {
      return `${apiBase.replace(/\/$/, '')}/lti/deep-linking/picker`;
    }

    return `${this.getEducatorFrontendUrl()}/lti/deep-linking`;
  }

  private isNgrokTunnel(req?: Request): boolean {
    const apiBase = this.configService.get<string>('app.apiBaseUrl') ?? '';
    if (/ngrok/i.test(apiBase)) {
      return true;
    }
    const host = req?.hostname ?? req?.headers?.host ?? '';
    return /ngrok/i.test(String(host));
  }

  private sendDeepLinkingPickerHandoff(res: Response, sessionCode: string, req: Request): void {
    const pickerUrl = `${this.getDeepLinkingPickerUrl()}?code=${encodeURIComponent(sessionCode)}`;
    if (this.isNgrokTunnel(req)) {
      this.logger.log('[Deep Linking] ngrok tunnel detected — using header bootstrap for picker load');
      res.type('html').send(generateNgrokSafeHtmlFetchPage(pickerUrl));
      return;
    }
    res.redirect(pickerUrl);
  }

  private getStudentFrontendUrl(): string {
    return (
      this.configService.get<string>('app.studentFrontendUrl') ||
      this.configService.get<string>('STUDENT_FRONTEND_URL') ||
      'http://localhost:5174'
    ).replace(/\/$/, '');
  }

  private normalizeLtiRoles(rolesClaim: unknown): string[] {
    if (Array.isArray(rolesClaim)) {
      return rolesClaim.map((r) => String(r).toLowerCase());
    }
    if (typeof rolesClaim === 'string' && rolesClaim.trim()) {
      return [rolesClaim.trim().toLowerCase()];
    }
    return [];
  }

  private isInstructorRole(normalizedRoles: string[]): boolean {
    return normalizedRoles.some(
      (role) =>
        role.includes('instructor') ||
        role.includes('teacher') ||
        role.includes('faculty') ||
        role.includes('administrator') ||
        role.includes('admin') ||
        role.includes('manager') ||
        role.endsWith('#instructor') ||
        role.endsWith('/instructor') ||
        role.endsWith('#teacher') ||
        role.endsWith('/teacher') ||
        role.endsWith('#faculty') ||
        role.endsWith('/faculty') ||
        role.endsWith('#administrator') ||
        role.endsWith('/administrator'),
    );
  }

  private isLearnerRole(normalizedRoles: string[]): boolean {
    return normalizedRoles.some(
      (role) =>
        role.includes('learner') ||
        role.includes('student') ||
        role.endsWith('#learner') ||
        role.endsWith('/learner') ||
        role.endsWith('#student') ||
        role.endsWith('/student'),
    );
  }

  private extractNrpsUrlFromPayload(payload: Record<string, unknown>): string | undefined {
    const nrpsClaim = payload['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'] as
      Record<string, unknown> | undefined;
    const nrpsUrl =
      typeof nrpsClaim?.['context_memberships_url'] === 'string'
        ? nrpsClaim['context_memberships_url'].trim()
        : '';
    return nrpsUrl || undefined;
  }

  private async resolveLaunchEmail(
    payload: Record<string, unknown>,
    lmsConfig: LmsSchoolConfig | null,
    logPrefix: string,
  ): Promise<string | null> {
    const email = this.extractLaunchEmail(payload);
    if (email || !lmsConfig || typeof payload.sub !== 'string' || !payload.sub) {
      return email;
    }
    try {
      const adapter = this.lmsAdapterFactory.getAdapter(lmsConfig.lmsType);
      if (adapter?.getUserEmail) {
        const wsResult = await adapter.getUserEmail(lmsConfig, payload.sub);
        return wsResult.email;
      }
    } catch (err) {
      this.logger.warn(
        `${logPrefix} Email lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }

  /**
   * Handle LTI Deep Linking request — creates a session for the educator to select content
   */
  private async handleDeepLinkingRequest(
    res: Response,
    payload: Record<string, unknown>,
    launchIssuer: string,
    launchClientId: string | null | undefined,
    initialLmsConfig: LmsSchoolConfig | null,
    req: Request,
  ): Promise<void> {
    const frontendUrl = this.getEducatorFrontendUrl();

    if (!initialLmsConfig?.schoolId) {
      this.logger.warn('[Deep Linking] No LMS config found for request');
      return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=school_not_found`);
    }

    const deepLinkingSettings = this.ltiJwtService.extractDeepLinkingSettings(payload);
    if (!deepLinkingSettings) {
      this.logger.warn('[Deep Linking] Missing or invalid deep_linking_settings claim');
      return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=invalid_deep_linking`);
    }

    const email = await this.resolveLaunchEmail(payload, initialLmsConfig, '[Deep Linking]');
    const launchEducator = email ? await this.authService.findEducatorByEmail(email) : null;
    const educatorSchoolIds = launchEducator
      ? this.authService.getEducatorSchoolIds(launchEducator)
      : [];

    let lmsConfig: LmsSchoolConfig | null;
    if (launchEducator) {
      lmsConfig = educatorSchoolIds.length
        ? await this.lmsConfigService.resolveEducatorLaunchConfig(
          launchIssuer,
          launchClientId,
          educatorSchoolIds,
        )
        : null;
    } else {
      const candidates = await this.lmsConfigService.listEducatorLaunchConfigs(
        launchIssuer,
        launchClientId,
      );
      lmsConfig = candidates.length === 1 ? candidates[0] : null;
    }

    if (!lmsConfig?.schoolId) {
      this.logger.warn(
        `[Deep Linking] No LMS config matches launching educator email=${email ? redactEmail(email) : '(none)'} (known=${!!launchEducator}, memberships=${educatorSchoolIds.length})`,
      );
      return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=school_mismatch`);
    }

    const courseContext = extractLaunchCourseContext(payload);
    const deploymentId = typeof payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] === 'string'
      ? payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
      : '';

    // Create a Deep Linking session with all necessary context
    const sessionCode = await this.sessionService.createSession({
      audience: 'deep_linking',
      issuer: launchIssuer,
      schoolId: lmsConfig.schoolId,
      classId: null, // Will be set when educator selects from a class
      courseTitle: courseContext.courseTitle,
      deepLinkingSettings,
      deploymentId,
      clientId: lmsConfig.clientId,
      payload,
    });

    this.logger.log(
      `[Deep Linking] Created session for schoolId=${lmsConfig.schoolId}, code=${sessionCode.substring(0, 8)}...`,
    );

    // Hand off to picker — HTML bootstrap on ngrok (skips free-tier interstitial in iframes)
    this.sendDeepLinkingPickerHandoff(res, sessionCode, req);
  }

  /**
   * Complete HS Online auto-login after a verified LTI token.
   * Used by both student-tool launches and learner handoffs from the educator tool.
   */
  private async completeStudentHandoff(
    res: Response,
    payload: Record<string, unknown>,
    launchClientId: string | null | undefined,
  ): Promise<void> {
    const studentUrl = this.getStudentFrontendUrl();
    const lmsUserId = typeof payload.sub === 'string' ? payload.sub : '';
    const lmsIssuer = typeof payload.iss === 'string' ? payload.iss : '';
    const launchCourseIds = extractStudentLaunchCourseIds(payload);
    let studentCode: string | null;
    let resolvedSchoolId: string | null;
    let courseScopedClassFound: boolean;

    if (!lmsUserId) {
      res.redirect(`${studentUrl}/login?lti_launch=error&reason=student_not_found`);
      return;
    }

    const candidateConfigs = await this.lmsConfigService.listStudentLaunchConfigs(
      lmsIssuer,
      launchClientId,
    );

    if (candidateConfigs.length === 0) {
      this.logger.error(
        `[studentHandoff] No active LMS config found for issuer=${lmsIssuer} clientId=${launchClientId ?? '(none)'}`,
      );
      res.redirect(`${studentUrl}/login?lti_launch=error&reason=school_not_found`);
      return;
    }

    const candidateSchoolIds = candidateConfigs.map((cfg) => cfg.schoolId).filter(Boolean);
    this.logger.debug(
      `[studentHandoff] Candidate schools for shared tool: ${candidateSchoolIds.join(', ') || '(none)'}`,
    );

    let resolution = await this.lmsLookupService.resolveStudentCodeForLaunch({
      lmsUserId,
      launchCourseIds,
      schoolIds: candidateSchoolIds,
    });

    studentCode = resolution.studentCode;
    resolvedSchoolId = resolution.schoolId;
    courseScopedClassFound = resolution.courseScopedClassFound;

    if (studentCode) {
      this.logger.log(
        `[studentHandoff] Resolved student code ${redactCode(studentCode)} (school=${resolvedSchoolId})`,
      );
    }

    // Class exists but learner missing → sync that course roster once, then retry lookup.
    if (!studentCode && courseScopedClassFound && launchCourseIds.length > 0) {
      const nrpsUrl = this.extractNrpsUrlFromPayload(payload);
      this.logger.log(
        `[studentHandoff] Student not in DB yet — JIT roster sync for course(s)=${launchCourseIds.join(',')}`,
      );
      for (const schoolId of candidateSchoolIds) {
        for (const courseId of launchCourseIds) {
          await this.provisionService.syncRosterForMappedCourse({
            schoolId,
            lmsCourseId: courseId,
            nrpsUrl,
          });
        }
      }
      resolution = await this.lmsLookupService.resolveStudentCodeForLaunch({
        lmsUserId,
        launchCourseIds,
        schoolIds: candidateSchoolIds,
      });
      studentCode = resolution.studentCode;
      resolvedSchoolId = resolution.schoolId;
      courseScopedClassFound = resolution.courseScopedClassFound;
    }

    if (!studentCode) {
      if (launchCourseIds.length > 0 && courseScopedClassFound) {
        this.logger.warn(
          `[studentHandoff] Course-scoped launch failed (student_not_enrolled) for lmsUserId: ${lmsUserId}, courseIds: ${launchCourseIds.join(', ')}`,
        );
        res.redirect(`${studentUrl}/login?lti_launch=error&reason=student_not_enrolled`);
        return;
      }
      if (launchCourseIds.length > 0) {
        this.logger.warn(
          `[studentHandoff] Course-scoped launch failed (class_not_provisioned) for lmsUserId: ${lmsUserId}, courseIds: ${launchCourseIds.join(', ')}`,
        );
        res.redirect(`${studentUrl}/login?lti_launch=error&reason=class_not_provisioned`);
        return;
      }
      this.logger.error(
        `[studentHandoff] Failed to resolve student code for lmsUserId: ${lmsUserId}`,
      );
      res.redirect(`${studentUrl}/login?lti_launch=error&reason=student_not_found`);
      return;
    }

    // Extract launch context BEFORE login so we can embed it in the JWT
    const resourceLinkId = extractResourceLinkId(payload);
    const customSimulationId = extractCustomSimulationId(payload);

    const loginResult = await this.studentsService.studentLogin(studentCode, res, {
      simulationId: customSimulationId ?? undefined,
      resourceLinkId: resourceLinkId ?? undefined,
      classId: resolution.classId ?? undefined,
    });
    if (!loginResult.success || !loginResult.data) {
      const safeReason = this.mapStudentLoginFailureToReason(loginResult.message);
      res.redirect(`${studentUrl}/login?lti_launch=error&reason=${safeReason}`);
      return;
    }

    const studentData = loginResult.data;

    this.captureAgsMapping(payload, studentData, resolvedSchoolId, launchClientId).catch((err) => {
      this.logger.warn(
        `[studentHandoff] AGS mapping capture failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    const sessionCode = await this.sessionService.createSession({
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
      ltiLaunchContext: {
        resourceLinkId: resourceLinkId ?? undefined,
        simulationId: customSimulationId ?? undefined,
      },
    });

    this.logger.log(
      `[studentHandoff] Redirecting learner ${lmsUserId} to HS Online with session code`,
    );
    res.redirect(303, `${studentUrl}/student-dashboard?lti_launch=success&code=${sessionCode}`);
  }

  /**
   * Moodle gradebook / Canvas SpeedGrader → verified educator → student report handoff.
   * Learners and unauthorized educators get a friendly HTML page (no report data).
   */
  private async handleSubmissionReviewLaunch(
    res: Response,
    payload: Record<string, unknown>,
    launchIssuer: string,
    launchClientId: string | null | undefined,
    initialLmsConfig: Awaited<ReturnType<LmsConfigService['resolveEducatorLaunchConfig']>>,
    isInstructor: boolean,
  ): Promise<void> {
    const sendReviewError = (reason: SubmissionReviewFailureReason): void => {
      const copy = this.submissionReviewErrorCopy(reason);
      this.logger.warn(`[SubmissionReview] outcome=${reason}`);
      res
        .status(200)
        .type('html')
        .send(buildSubmissionReviewErrorHtml({ title: copy.title, message: copy.message }));
    };

    if (!isInstructor) {
      sendReviewError('educators_only');
      return;
    }

    if (!initialLmsConfig) {
      sendReviewError('course_not_linked');
      return;
    }

    const email = this.extractLaunchEmail(payload);
    if (!email) {
      const frontendUrl = this.getEducatorFrontendUrl();
      res.redirect(`${frontendUrl}/login?lti_launch=error&reason=email_required_from_lms`);
      return;
    }

    const launchEducator = await this.authService.findEducatorByEmail(email);
    const educatorSchoolIds = launchEducator
      ? this.authService.getEducatorSchoolIds(launchEducator)
      : [];
    const resolvedForEducator = await this.lmsConfigService.resolveEducatorLaunchConfig(
      launchIssuer,
      launchClientId,
      educatorSchoolIds.length ? educatorSchoolIds : undefined,
    );
    const activeLmsConfig = resolvedForEducator ?? initialLmsConfig;

    if (!launchEducator || !educatorSchoolIds.length || !activeLmsConfig?.schoolId) {
      sendReviewError('educator_unauthorized');
      return;
    }

    const review = await this.submissionReviewService.resolveReviewLaunch({
      payload,
      lmsConfig: activeLmsConfig,
      educatorId: launchEducator.id,
      educatorSchoolIds,
    });

    if (!review.ok) {
      sendReviewError(review.reason);
      return;
    }

    const redirectPath =
      `/report-detail?` +
      new URLSearchParams({
        classId: review.classId,
        studentCode: review.studentCode,
        simulationId: review.simulationId,
        reportId: review.reportId,
      }).toString();

    this.logger.log(
      `[SubmissionReview] outcome=ok school=${review.schoolId} class=${review.classId} mapping=${review.mappingId}`,
    );

    await this.completeEducatorHandoff(
      res,
      payload,
      launchIssuer,
      launchClientId,
      redirectPath,
    );
  }

  private submissionReviewErrorCopy(reason: SubmissionReviewFailureReason): {
    title: string;
    message: string;
  } {
    switch (reason) {
      case 'educators_only':
        return {
          title: 'This view is only available to educators',
          message: 'Student accounts cannot open RealityWorks reports from the LMS gradebook.',
        };
      case 'report_not_available':
        return {
          title: 'Report not available yet',
          message:
            'This student has not completed a report for this simulation yet. Try again after they finish.',
        };
      case 'educator_unauthorized':
      case 'school_mismatch':
        return {
          title: 'Not authorized',
          message: 'You do not have access to this class report in RealityWorks.',
        };
      case 'course_not_linked':
      case 'assignment_not_mapped':
      case 'student_not_mapped':
      case 'missing_for_user':
        return {
          title: 'Report not available',
          message:
            'This LMS grade is not linked to a RealityWorks class, assignment, or student yet.',
        };
      default:
        return {
          title: 'Report not available',
          message: 'Unable to open this report from the LMS right now.',
        };
    }
  }

  /**
   * Complete Educator auto-login after a verified LTI token.
   * Used by educator-tool launches and instructor handoffs from the student tool.
   */
  private async completeEducatorHandoff(
    res: Response,
    payload: Record<string, unknown>,
    launchIssuer: string,
    launchClientId: string | null | undefined,
    redirectPath?: string | null,
  ): Promise<void> {
    const frontendUrl = this.getEducatorFrontendUrl();
    const courseContext = extractLaunchCourseContext(payload);
    const lmsCourseId = courseContext.courseId;
    const lmsCourseName = courseContext.courseTitle
      ? encodeURIComponent(courseContext.courseTitle)
      : '';
    const courseSource = courseContext.source;
    const nrpsClaim = payload['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'] as
      Record<string, unknown> | undefined;
    const nrpsUrl =
      typeof nrpsClaim?.['context_memberships_url'] === 'string'
        ? nrpsClaim['context_memberships_url']
        : '';
    const launchUserId = typeof payload.sub === 'string' ? payload.sub : '';

    const initialLmsConfig = await this.lmsConfigService.resolveEducatorLaunchConfig(
      launchIssuer,
      launchClientId,
    );
    const email = await this.resolveLaunchEmail(payload, initialLmsConfig, '[educatorHandoff]');

    if (!email) {
      res.redirect(`${frontendUrl}/login?lti_launch=error&reason=email_required_from_lms`);
      return;
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
          `[educatorHandoff] No LMS config matches educator schools for email=${redactEmail(email)} (memberships=${educatorSchoolIds?.length ?? 0})`,
        );
        res.redirect(`${frontendUrl}/login?lti_launch=error&reason=school_mismatch`);
        return;
      }
    }

    const activeLmsConfig = resolvedForEducator ?? initialLmsConfig;

    if (!activeLmsConfig?.schoolId) {
      res.redirect(`${frontendUrl}/login?lti_launch=error&reason=school_not_configured`);
      return;
    }

    const loginResult = await this.authService.ltiLogin(
      email,
      activeLmsConfig.schoolId,
      launchEducator ?? null,
      res,
    );

    if (!loginResult.success || !loginResult.data) {
      const reason = this.mapEducatorLoginFailureToReason(loginResult.message);
      res.redirect(`${frontendUrl}/login?lti_launch=error&reason=${reason}`);
      return;
    }

    const loginData = loginResult.data as {
      tokens: { accessToken: string; csrfToken: string };
      user: Record<string, unknown>;
    };
    const { accessToken, csrfToken } = loginData.tokens;
    const user = loginData.user;
    const educatorId = typeof user['id'] === 'string' ? user['id'] : null;

    const enableLtiAutoProvision =
      String(
        this.configService.get<string>('LMS_ENABLE_LTI_AUTO_PROVISION', 'false'),
      ).toLowerCase() === 'true';
    if (enableLtiAutoProvision && educatorId) {
      void this.provisionService.provisionFromLtiLogin(
        educatorId,
        lmsCourseId,
        activeLmsConfig.schoolId,
        nrpsUrl,
        launchIssuer,
        launchUserId,
        courseContext.courseTitle || undefined,
      );
    }

    const provisioningStatus = !enableLtiAutoProvision
      ? 'disabled'
      : lmsCourseId
        ? 'queued'
        : 'skipped_missing_course_context';

    const sessionCode = await this.sessionService.createSession({
      audience: 'educator',
      userId: educatorId,
      schoolId: activeLmsConfig.schoolId,
      ltiContext: {
        issuer: launchIssuer,
        lmsUserId: launchUserId,
        lmsCourseId,
        clientId: launchClientId ?? null,
      },
      accessToken,
      csrfToken,
      user,
      nrpsUrl,
      lmsCourseId,
      lmsCourseName: lmsCourseName ? decodeURIComponent(lmsCourseName) : '',
      provisioningStatus,
      courseSource,
      redirectPath: redirectPath?.trim() || null,
    });

    const trimmedRedirect = redirectPath?.trim() || '';
    const handoffQuery = new URLSearchParams({
      lti_launch: 'success',
      code: sessionCode,
    });
    if (trimmedRedirect.startsWith('/')) {
      handoffQuery.set('redirect', trimmedRedirect);
    }

    const handoffUrl = `${frontendUrl}/login?${handoffQuery.toString()}`;
    const isCanvas = activeLmsConfig.lmsType === LmsType.CANVAS;
    // SpeedGrader / submission-review only: Canvas blocks top-frame nav when opening a
    // student report. Course-nav launches (e.g. RealityWorks Setup) use normal top redirect.
    const useCanvasReportNewTab = isCanvas && trimmedRedirect.startsWith('/');

    this.logger.log(
      `[educatorHandoff] Redirecting instructor ${launchUserId} to Educator with session code (${useCanvasReportNewTab ? 'new-tab button' : 'top-level'})${trimmedRedirect ? ` redirect=${trimmedRedirect}` : ''}`,
    );

    res
      .status(200)
      .type('html')
      .send(
        useCanvasReportNewTab
          ? buildOpenInNewTabHandoffHtml(handoffUrl)
          : buildTopLevelRedirectHtml(handoffUrl),
      );
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

  /** Verify Canvas AGS `rw_review` token and build `/report-detail?…` redirect. */
  private async resolveCanvasReviewRedirectPath(token: string): Promise<string | null> {
    const secret =
      this.configService.get<string>('jwt.accessSecret')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim() ||
      '';
    if (!secret) {
      this.logger.warn('[educatorLaunch] Cannot verify Canvas review token — JWT secret missing');
      return null;
    }
    const claims = await verifyCanvasReviewToken(token, secret);
    if (!claims) {
      this.logger.warn('[educatorLaunch] Canvas review token invalid or expired');
      return null;
    }
    return buildReportDetailRedirectPath(claims);
  }

  private encryptStudentCode(studentCode: string): string {
    // Prefer namespaced keys so encrypt matches decrypt in students.controller.
    const secret =
      this.configService.get<string>('lti.studentCodeSecret') ||
      this.configService.get<string>('jwt.accessSecret') ||
      this.configService.get<string>('LTI_STUDENT_CODE_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'lti-student-code-default-secret';

    return aesGcmEncrypt(deriveAesKey(secret), studentCode);
  }

  /** Capture AGS line item from student launch — non-blocking; Moodle passback depends on this mapping. */
  private async captureAgsMapping(
    payload: Record<string, unknown>,
    studentData: Pick<StudentLoginData, 'class_id'>,
    schoolId: string | null,
    launchClientId?: string | null,
  ): Promise<void> {
    const classId = studentData.class_id ?? null;
    if (!schoolId || !classId) {
      return;
    }

    const agsEndpoint = extractAgsEndpoint(payload);
    const lineItemUrl = getLineItemUrl(agsEndpoint);

    if (!lineItemUrl) {
      this.logger.debug(`[AGS Capture] No line item URL in launch claim for class ${classId}`);
      return;
    }

    if (!hasScoreScope(agsEndpoint)) {
      this.logger.warn(`[AGS Capture] AGS endpoint missing score scope for class ${classId}`);
    }

    const lmsConfig = await this.lmsConfigService.resolveOAuthConfigForClient(
      schoolId,
      launchClientId,
      LmsToolType.STUDENT,
    );
    try {
      assertLineItemUrlAllowed(lineItemUrl, lmsConfig);
    } catch (err) {
      this.logger.warn(
        `[AGS Capture] Rejected line item URL for class ${classId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const resourceLinkId = extractResourceLinkId(payload);
    const resourceLinkTitle = extractResourceLinkTitle(payload);

    const simLink = await this.lmsAssignmentService.resolveLaunchSimulation(
      classId,
      extractCustomSimulationId(payload),
    );
    const simulationId = simLink?.simulationId;
    const classSimulationId = simLink?.classSimulationId;

    await this.lmsAssignmentService.upsertMapping({
      schoolId,
      classId,
      simulationId,
      classSimulationId,
      lmsLineItemUrl: lineItemUrl,
      lmsLineItemLabel: resourceLinkTitle ?? undefined,
      lmsResourceLinkId: resourceLinkId ?? undefined,
      lmsClientId: launchClientId?.trim() || undefined,
    });

    this.logger.log(
      `[AGS Capture] Captured line item for class ${classId}` +
      (simulationId ? ` with simulation ${simulationId}` : '') +
      `: ${lineItemUrl.substring(0, 60)}...`,
    );
  }

  constructor(
    private readonly keyService: LtiKeyService,
    private readonly ltiService: LtiService,
    private readonly ltiJwtService: LtiJwtService,
    private readonly stateService: LtiStateService,
    private readonly sessionService: LtiSessionService,
    private readonly deepLinkingService: LtiDeepLinkingService,
    private readonly submissionReviewService: LtiSubmissionReviewService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly provisionService: LmsProvisionService,
    private readonly lmsLookupService: LmsLookupService,
    private readonly lmsAssignmentService: LmsAssignmentService,
    private readonly studentsService: StudentsService,
    private readonly lmsAdapterFactory: LmsAdapterFactory,
    private readonly lmsConfigService: LmsConfigService,
    private readonly classSimulationService: ClassSimulationService,
    private readonly tokenService: TokenService,
    private readonly logger: LoggerService,
  ) { }

  /**
   * Invalidate any prior Educator-portal JWT presented on the exchange request
   * (cookie or Authorization header) so an old admin/educator session cannot
   * continue after LTI replaces it.
   */
  private async revokePriorPortalSession(
    req: Request,
    replacementAccessToken: string,
  ): Promise<void> {
    const priorToken = extractAccessToken(req);
    if (!priorToken || priorToken === replacementAccessToken) {
      return;
    }
    await this.tokenService.blackListToken(priorToken);
    this.logger.log(
      '[sessionExchange] Blacklisted prior portal access token before LTI session handoff',
    );
  }

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
  // Rate limit: AuthThrottlerGuard LTI_LAUNCH bucket (shared with login/callback/launch).
  @ApiOperation({
    summary: 'Exchange one-time code for LTI session data',
    description:
      'Public + CSRF-exempt (see CsrfGuard). Used by Google Classroom and LTI handoffs; sets auth cookies on success.',
  })
  async exchangeSessionCode(
    @Body() body: { code?: string; audience?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.enforceHttpsInProduction(req);

      const audience = this.parseSessionAudience(body.audience);
      const code = body.code;

      if (!audience || !code || typeof code !== 'string') {
        res.status(400).json({ error: 'Invalid or expired session code' });
        return;
      }

      const sessionData = await this.sessionService.consumeSession(code, audience);

      if (sessionData.audience === 'deep_linking') {
        res.status(400).json({ error: 'Cannot exchange Deep Linking session via this endpoint' });
        return;
      }

      const accessToken = sessionData.accessToken;
      if (accessToken) {
        await this.revokePriorPortalSession(req, accessToken);
      }

      if (sessionData.audience === 'educator') {
        this.tokenService.setAuthCookies(res, {
          access_token: sessionData.accessToken,
          expires_in: this.configService.get<number>('jwt.accessExpiresIn') as number,
        });

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
          redirectPath: sessionData.redirectPath ?? null,
        });
        return;
      }

      if (accessToken) {
        this.tokenService.setAuthCookies(res, {
          access_token: accessToken,
          expires_in: this.configService.get<number>('jwt.accessExpiresIn') as number,
        });
      }

      res.status(200).json({
        audience: 'student',
        studentCode: sessionData.studentCode,
        classId: sessionData.classId,
        className: sessionData.className,
        accessToken,
        studentData: sessionData.studentData,
        ltiLaunchContext: sessionData.ltiLaunchContext,
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        res.status(403).json({ error: err.message });
        return;
      }
      // A storage outage is not a bad code — don't hide it behind the 400 below.
      if (err instanceof ServiceUnavailableException) {
        this.logger.error('Session exchange failed: LTI handoff storage unavailable');
        res.status(503).json({ error: Messages.LTI_STORAGE_UNAVAILABLE });
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

  @Get(LtiConstants.ROUTES.DEEP_LINKING_PICKER)
  @ApiOperation({ summary: 'Deep Linking picker UI (embedded in LMS iframe)' })
  deepLinkingPicker(@Req() req: Request, @Res() res: Response): void {
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    if (!code) {
      res.status(400).send('Missing session code');
      return;
    }

    const apiBase = this.keyService.getBaseUrl();
    res.type('html').send(generateDeepLinkingPickerHtml(apiBase, code));
  }

  @Get(LtiConstants.ROUTES.DEEP_LINKING_SIMULATIONS)
  @ApiOperation({ summary: 'List class simulations for Deep Linking picker' })
  async deepLinkingSimulations(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
      if (!code) {
        res.status(400).json({ error: 'Invalid or expired session code' });
        return;
      }

      const sessionData = await this.sessionService.getSession(code);
      if (!sessionData || sessionData.audience !== 'deep_linking') {
        res.status(400).json({ error: 'Invalid or expired session code' });
        return;
      }

      const courseContext = extractLaunchCourseContext(sessionData.payload);
      const launchCourseIds = extractStudentLaunchCourseIds(sessionData.payload);
      const lmsCourseIds = launchCourseIds.length
        ? launchCourseIds
        : courseContext.courseId
          ? [courseContext.courseId]
          : [];

      const pickerStatus = LtiConstants.DEEP_LINKING_PICKER_STATUS;

      if (lmsCourseIds.length === 0) {
        res.status(200).json({
          simulations: [],
          status: pickerStatus.COURSE_NOT_LINKED,
        });
        return;
      }

      const resolved = await this.lmsLookupService.resolveClassForDeepLinking({
        lmsCourseIds,
        issuer: sessionData.issuer,
        preferredSchoolId: sessionData.schoolId,
      });

      if (!resolved?.rwClass?.id) {
        this.logger.warn(
          `[Deep Linking] No class found for courseIds=${lmsCourseIds.join(',')} schoolId=${sessionData.schoolId}`,
        );
        res.status(200).json({
          simulations: [],
          status: pickerStatus.COURSE_NOT_LINKED,
        });
        return;
      }

      const result = await this.classSimulationService.findByClass(resolved.rwClass.id);
      const simulations = (result.data ?? []).map((sim) => ({
        id: sim.simulation_id,
        title: sim.simulation_title || sim.simulation_id,
        maxScore: 100,
        estimatedDuration: sim.estimated_duration,
        difficulty: sim.difficulty,
        learnerLevel: sim.learner_level,
        purpose: sim.purpose,
      }));

      if (simulations.length === 0) {
        res.status(200).json({
          simulations: [],
          status: pickerStatus.NO_SIMULATIONS_ASSIGNED,
        });
        return;
      }

      res.status(200).json({ simulations, status: pickerStatus.READY });
    } catch (err) {
      this.logger.warn(
        `Deep Linking simulations failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      res.status(400).json({ error: 'Failed to load simulations' });
    }
  }

  @Post(LtiConstants.ROUTES.DEEP_LINKING_EXCHANGE)
  @Throttle({
    default: {
      limit: AuthThrottleConstants.LTI_SESSION_EXCHANGE.LIMIT,
      ttl: AuthThrottleConstants.LTI_SESSION_EXCHANGE.TTL,
    },
  })
  @ApiOperation({ summary: 'Exchange Deep Linking session code for picker context' })
  async deepLinkingExchange(
    @Body() body: DeepLinkingExchangeDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.enforceHttpsInProduction(req);

      const code = body.code;
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Invalid or expired session code' });
        return;
      }

      // Get session without consuming it (we'll need it again for submit)
      const sessionData = await this.sessionService.getSession(code);
      if (!sessionData || sessionData.audience !== 'deep_linking') {
        res.status(400).json({ error: 'Invalid or expired session code' });
        return;
      }

      res.status(200).json({
        schoolId: sessionData.schoolId,
        courseTitle: sessionData.courseTitle,
        deepLinkingSettings: sessionData.deepLinkingSettings,
      });
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        this.logger.error('Deep Linking exchange failed: storage unavailable');
        res.status(503).json({ error: Messages.LTI_STORAGE_UNAVAILABLE });
        return;
      }
      this.logger.warn(
        `Deep Linking exchange failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      res.status(400).json({ error: 'Invalid or expired session code' });
    }
  }

  @Post(LtiConstants.ROUTES.DEEP_LINKING_SUBMIT)
  @Throttle({
    default: {
      limit: AuthThrottleConstants.LTI_SESSION_EXCHANGE.LIMIT,
      ttl: AuthThrottleConstants.LTI_SESSION_EXCHANGE.TTL,
    },
  })
  @ApiOperation({ summary: 'Submit Deep Linking selections and return to LMS' })
  async deepLinkingSubmit(
    @Body() body: DeepLinkingSubmitDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.enforceHttpsInProduction(req);

      const code = body.code;
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Invalid or expired session code' });
        return;
      }

      if (!Array.isArray(body.selections) || body.selections.length === 0) {
        res.status(400).json({ error: 'No simulations selected' });
        return;
      }

      // Consume the session atomically to prevent double-submit race
      const sessionData = await this.sessionService.consumeSession(code, 'deep_linking');

      // Type guard for Deep Linking session
      if (sessionData.audience !== 'deep_linking') {
        res.status(400).json({ error: 'Invalid session type' });
        return;
      }

      const deepLinkingSession = sessionData;

      const schoolConfig = await this.lmsConfigService.resolveOAuthConfigForClient(
        deepLinkingSession.schoolId,
        deepLinkingSession.clientId,
        LmsToolType.EDUCATOR,
      );

      if (!schoolConfig) {
        this.logger.warn(`[Deep Linking Submit] No school config found for schoolId=${deepLinkingSession.schoolId}`);
        res.status(400).json({ error: 'School configuration not found' });
        return;
      }

      // Issue #4: Validate selections against actual class-assigned simulations
      const courseContext = extractLaunchCourseContext(deepLinkingSession.payload);
      const launchCourseIds = extractStudentLaunchCourseIds(deepLinkingSession.payload);
      const lmsCourseIds = launchCourseIds.length
        ? launchCourseIds
        : courseContext.courseId
          ? [courseContext.courseId]
          : [];

      const resolved = lmsCourseIds.length > 0
        ? await this.lmsLookupService.resolveClassForDeepLinking({
          lmsCourseIds,
          issuer: deepLinkingSession.issuer,
          preferredSchoolId: deepLinkingSession.schoolId,
        })
        : null;

      if (!resolved?.rwClass?.id) {
        this.logger.warn(
          `[Deep Linking Submit] No class found for courseIds=${lmsCourseIds.join(',')} schoolId=${sessionData.schoolId}`,
        );
        res.status(400).json({ error: 'Course not linked to a class' });
        return;
      }

      const classSimResult = await this.classSimulationService.findByClass(resolved.rwClass.id);
      const assignedSimulations = classSimResult.data ?? [];
      const assignedSimIds = new Set(
        assignedSimulations.map((sim) => sim.simulation_id).filter(Boolean),
      );

      if (assignedSimIds.size === 0) {
        this.logger.warn(
          `[Deep Linking Submit] No simulations assigned to class ${resolved.rwClass.id}`,
        );
        res.status(400).json({ error: 'No simulations assigned to this class' });
        return;
      }

      // Build a map of simulationId -> class_simulation data for date lookup
      const simDataMap = new Map(
        assignedSimulations.map((sim) => [sim.simulation_id, sim]),
      );

      // Filter selections to only include valid, assigned simulations
      const validSelections = body.selections.filter((sel) =>
        sel.simulationId && sel.title && assignedSimIds.has(sel.simulationId)
      );

      if (validSelections.length === 0) {
        this.logger.warn(
          `[Deep Linking Submit] All selected simulations were invalid or unassigned`,
        );
        res.status(400).json({ error: 'No valid simulations selected' });
        return;
      }

      // Build content items from validated selections with date fields
      const studentLaunchUrl = `${this.configService.get<string>('STUDENT_FRONTEND_URL')}/lti-launch`;
      const contentItems = validSelections.map((sel) => {
        const simData = simDataMap.get(sel.simulationId);
        const startDateTime = toIsoStartDateTime(simData?.start_date);
        const endDateTime = toIsoEndDateTime(simData?.end_date);
        const dueDateTime = toIsoEndDateTime(simData?.due_date);

        return {
          type: 'ltiResourceLink' as const,
          title: sel.title,
          url: studentLaunchUrl,
          custom: {
            custom_simulation_id: sel.simulationId,
          },
          lineItem: sel.scoreMaximum
            ? {
              scoreMaximum: sel.scoreMaximum,
              label: sel.title,
              resourceId: sel.simulationId,
              // Moodle gradebook "Submission review" — uses the tool launch URL.
              submissionReview: {},
            }
            : undefined,
          available: startDateTime || endDateTime
            ? {
              startDateTime,
              endDateTime,
            }
            : undefined,
          submission: dueDateTime
            ? {
              endDateTime: dueDateTime,
            }
            : undefined,
          window: {
            targetName: '_blank',
          },
        };
      });

      // Sign Deep Linking response JWT
      const jwt = await this.deepLinkingService.signDeepLinkingResponse({
        issuer: deepLinkingSession.issuer,
        clientId: deepLinkingSession.clientId,
        deploymentId: deepLinkingSession.deploymentId,
        contentItems,
        data: deepLinkingSession.deepLinkingSettings.data,
        schoolConfig,
      });

      // Generate HTML form that auto-submits back to the LMS
      const returnForm = this.deepLinkingService.generateReturnForm(
        deepLinkingSession.deepLinkingSettings.deep_link_return_url,
        jwt,
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(returnForm);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        this.logger.error('Deep Linking submit failed: storage unavailable');
        res.status(503).json({ error: Messages.LTI_STORAGE_UNAVAILABLE });
        return;
      }
      this.logger.warn(
        `Deep Linking submit failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      res.status(400).json({ error: 'Deep Linking submission failed' });
    }
  }

  @Get(LtiConstants.ROUTES.METADATA)
  @ApiOperation({ summary: 'LTI tool URLs for LMS manual registration' })
  getMetadata(): unknown {
    return this.ltiService.getToolMetadata();
  }

  @All(LtiConstants.ROUTES.LOGIN)
  @Redirect()
  @HttpCode(302)
  async initiateLogin(@Req() req: Request): Promise<{ url: string; statusCode: number }> {
    const params = this.ltiService.mergeRequestParams(req);
    const redirectUrl = await this.ltiService.buildLoginRedirect(params);
    return { url: redirectUrl, statusCode: 302 };
  }

  @All(LtiConstants.ROUTES.STUDENTLOGIN)
  @Redirect()
  @HttpCode(302)
  async initiateStudentLogin(@Req() req: Request): Promise<{ url: string; statusCode: number }> {
    const params = this.ltiService.mergeRequestParams(req);
    const redirectUrl = await this.ltiService.buildStudentLoginRedirect(params);
    return { url: redirectUrl, statusCode: 302 };
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
    const frontendUrl = this.getEducatorFrontendUrl();

    if (!idToken) {
      return res.redirect(`${frontendUrl}/login?lti_launch=missing_token`);
    }

    try {
      // Quick decode to extract iss/aud before full verification
      const unverifiedPayload = this.ltiJwtService['quickDecode'](idToken);
      const launchIssuer = this.firstNonEmpty([params.iss, unverifiedPayload.iss]) ?? '';
      // Prefer raw JWT digits — Canvas client IDs exceed Number.MAX_SAFE_INTEGER.
      const launchClientId = this.firstNonEmpty([
        this.ltiJwtService.extractClientIdFromRawToken(idToken),
        typeof unverifiedPayload.aud === 'string' || typeof unverifiedPayload.aud === 'number'
          ? unverifiedPayload.aud
          : null,
        Array.isArray(unverifiedPayload.aud)
          ? unverifiedPayload.aud.find((v) => typeof v === 'string' || typeof v === 'number')
          : null,
        typeof unverifiedPayload.azp === 'string' || typeof unverifiedPayload.azp === 'number'
          ? unverifiedPayload.azp
          : null,
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
      const stateRecord = await this.stateService.validateAndConsume(
        state,
        nonceFromToken,
        'educator',
      );

      const normalizedRoles = this.normalizeLtiRoles(
        payload['https://purl.imsglobal.org/spec/lti/claim/roles'],
      );
      const isInstructor = this.isInstructorRole(normalizedRoles);
      const isLearner = this.isLearnerRole(normalizedRoles);

      // Check message type — route Deep Linking requests to the picker flow
      const messageType = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'];

      if (messageType === LtiConstants.MESSAGE_TYPES.DEEP_LINKING_REQUEST) {
        if (!isInstructor) {
          this.logger.warn('[Deep Linking] Rejected request without an instructor role');
          return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=educator_role_required`);
        }
        this.logger.log('[educatorLaunch] Deep Linking request detected — routing to picker flow');
        await this.handleDeepLinkingRequest(res, payload, launchIssuer, launchClientId, lmsConfig, req);
        return;
      }

      this.logger.debug(`[educatorLaunch] User roles: ${JSON.stringify(normalizedRoles)}`);

      // Canvas SpeedGrader: AGS submission launch URL carries rw_review (report deep link).
      // Canvas often omits for_user on that launch — token is the authoritative student/report.
      if (isInstructor && stateRecord?.canvasReviewToken) {
        const canvasRedirect = await this.resolveCanvasReviewRedirectPath(
          stateRecord.canvasReviewToken,
        );
        if (canvasRedirect) {
          this.logger.log(
            `[educatorLaunch] Canvas review token handoff redirect=${canvasRedirect}`,
          );
          await this.completeEducatorHandoff(
            res,
            payload,
            launchIssuer,
            launchClientId,
            canvasRedirect,
          );
          return;
        }
      }

      // Submission review (Moodle gradebook / Canvas when for_user is present) — educators only.
      if (isSubmissionReviewLaunch(payload)) {
        await this.handleSubmissionReviewLaunch(
          res,
          payload,
          launchIssuer,
          launchClientId,
          lmsConfig,
          isInstructor,
        );
        return;
      }

      // Role routing: instructor → Educator only; learner → HS Online only.
      if (isInstructor) {
        this.logger.warn(
          `[educatorLaunch] Instructor launch without review context (message_type=${String(messageType)}; no rw_review / for_user) — dashboard handoff`,
        );
        await this.completeEducatorHandoff(res, payload, launchIssuer, launchClientId);
        return;
      }

      if (isLearner) {
        this.logger.log(
          `[educatorLaunch] Learner on educator tool — handing off to HS Online (roles: ${normalizedRoles.join(', ')})`,
        );
        await this.completeStudentHandoff(res, payload, launchClientId);
        return;
      }

      this.logger.warn(
        `[educatorLaunch] No instructor/learner role. Roles: ${normalizedRoles.length ? normalizedRoles.join(', ') : '(none)'}`,
      );
      return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=educator_role_required`);
    } catch (err) {
      // Nest UnauthorizedException.message is often generic; map from getResponse().
      // Also covers ServiceUnavailableException → storage_unavailable (Redis outage).
      const reason = this.mapStudentLaunchExceptionToReason(err);
      this.logger.warn(
        `[educatorLaunch] Launch failed reason=${reason}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return res.redirect(`${frontendUrl}/login?lti_launch=error&reason=${reason}`);
    }
  }

  @All(LtiConstants.ROUTES.STUDENTLAUNCH)
  async studentLaunch(@Req() req: Request, @Res() res: Response): Promise<void> {
    const studentUrl = this.getStudentFrontendUrl();
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
          this.ltiJwtService.extractClientIdFromRawToken(idToken),
          typeof unverifiedPayload.aud === 'string' || typeof unverifiedPayload.aud === 'number'
            ? unverifiedPayload.aud
            : null,
          Array.isArray(unverifiedPayload.aud)
            ? unverifiedPayload.aud.find((v) => typeof v === 'string' || typeof v === 'number')
            : null,
          typeof unverifiedPayload.azp === 'string' || typeof unverifiedPayload.azp === 'number'
            ? unverifiedPayload.azp
            : null,
        ]) ?? '';

      // Resolve student-tool LMS config (never fall back to educator deployment_id)
      const lmsConfig = await this.lmsConfigService.resolveStudentLaunchConfig(
        launchIssuer,
        launchClientId,
      );

      // Verify signature, issuer, and student-tool deployment_id when configured.
      const expectedClientId = lmsConfig?.clientId?.trim() || undefined;
      const expectedDeploymentId = lmsConfig?.deploymentId?.trim() || undefined;

      const payload = await this.ltiJwtService.verifyIdToken(
        idToken,
        undefined,
        expectedClientId,
        expectedDeploymentId,
      );

      // Validate state and nonce to prevent CSRF and replay attacks
      const nonceFromToken = typeof payload.nonce === 'string' ? payload.nonce : undefined;
      await this.stateService.validateAndConsume(state, nonceFromToken, 'student');

      const normalizedRoles = this.normalizeLtiRoles(
        payload['https://purl.imsglobal.org/spec/lti/claim/roles'],
      );
      const isInstructor = this.isInstructorRole(normalizedRoles);
      const isLearner = this.isLearnerRole(normalizedRoles);

      this.logger.log(
        `[studentLaunch] Processing launch for user: ${String(payload.sub)}, issuer: ${String(payload.iss)}`,
      );
      this.logger.debug(`[studentLaunch] User roles: ${JSON.stringify(normalizedRoles)}`);

      // Instructor always → Educator (never HS Online). Learner → HS Online.
      if (isInstructor) {
        this.logger.log(
          `[studentLaunch] Instructor on student tool — handing off to Educator (roles: ${normalizedRoles.join(', ')})`,
        );
        await this.completeEducatorHandoff(
          res,
          payload,
          launchIssuer || (typeof payload.iss === 'string' ? payload.iss : ''),
          launchClientId,
        );
        return;
      }

      if (isLearner) {
        await this.completeStudentHandoff(res, payload, launchClientId);
        return;
      }

      this.logger.warn(
        `[studentLaunch] Student role required. Roles: ${normalizedRoles.length ? normalizedRoles.join(', ') : '(none)'}`,
      );
      return res.redirect(`${studentUrl}/login?lti_launch=error&reason=student_role_required`);
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
}
