import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { LmsConfigStatus, LmsType } from 'src/common/enums/lms.enum';

import { resolveDefaultLtiEndpoints } from 'src/lms/utils/lms-endpoints.util';
import { LtiKeyService } from './lti-key.service';
import { LtiStateService } from './lti-state.service';
import { extractCanvasReviewTokenFromTargetLinkUri } from './utils/canvas-review-token.util';
import { LmsSchoolConfig } from 'src/database/entities';
import { LMS_SCHOOL_CONFIG_REPOSITORY } from 'src/database/tokens';
import { LmsSchoolConfigRepository } from 'src/database/repositories';
import { LoggerService } from '../common/services';

@Injectable()
export class LtiService {
  constructor(
    private readonly keyService: LtiKeyService,
    private readonly stateService: LtiStateService,
    @Inject(LMS_SCHOOL_CONFIG_REPOSITORY)
    private readonly configRepo: LmsSchoolConfigRepository,
    private readonly logger: LoggerService,
  ) {}

  getToolMetadata(): Record<string, unknown> {
    const baseUrl = this.keyService.getBaseUrl();
    return {
      baseUrl,
      initiateLoginUrl: `${baseUrl}/lti/login`,
      redirectUris: [`${baseUrl}/lti/callback`],
      jwksUrl: `${baseUrl}/lti/jwks`,
      targetLinkUri: `${baseUrl}/lti/launch`,
      studentinitiateLoginUrl: `${baseUrl}/lti/studentlogin`,
      studentredirectUris: [`${baseUrl}/lti/studentcallback`],
      studentjwksUrl: `${baseUrl}/lti/studentjwks`,
      studenttargetLinkUri: `${baseUrl}/lti/studentlaunch`,
      // Deep Linking support
      deepLinkingEnabled: true,
      deepLinkingMessageType: 'LtiDeepLinkingRequest',
      deepLinkingResponseType: 'LtiDeepLinkingResponse',
      deepLinkingAcceptedContentTypes: ['ltiResourceLink'],
      deepLinkingClaims: [
        'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
      ],
    };
  }

  mergeRequestParams(req: Request): Record<string, string> {
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

  async buildLoginRedirect(params: Record<string, string | undefined>): Promise<string> {
    const clientId = params.client_id?.trim() ?? '';
    const authEndpoint = await this.resolveAuthEndpoint(clientId, params.iss);

    const redirectUri = `${this.keyService.getBaseUrl()}/lti/callback`;
    this.logger.log(
      `[LTI] Redirecting to auth endpoint: ${authEndpoint} with redirect_uri: ${redirectUri}`,
    );

    const state = randomUUID();
    const nonce = randomUUID();

    // Canvas SpeedGrader submission launches put `rw_review` on target_link_uri;
    // stash it on state because callback → /launch drops the original query string.
    const canvasReviewToken = extractCanvasReviewTokenFromTargetLinkUri(
      params.target_link_uri,
    );

    // Store state/nonce pair for validation in callback
    await this.stateService.createStatePair(state, nonce, 'educator', {
      canvasReviewToken,
    });

    const search = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: clientId,
      redirect_uri: redirectUri,
      login_hint: params.login_hint ?? '',
      lti_message_hint: params.lti_message_hint ?? '',
      state,
      nonce,
    });

    return `${authEndpoint}?${search.toString()}`;
  }

  async buildStudentLoginRedirect(params: Record<string, string | undefined>): Promise<string> {
    const clientId = params.client_id?.trim() ?? '';
    const authEndpoint = await this.resolveAuthEndpoint(clientId, params.iss, 'student');

    const redirectUri = `${this.keyService.getBaseUrl()}/lti/studentcallback`;
    this.logger.log(
      `[LTI] Redirecting to auth endpoint: ${authEndpoint} with redirect_uri: ${redirectUri}`,
    );

    const state = randomUUID();
    const nonce = randomUUID();

    // Store state/nonce pair for validation in callback
    await this.stateService.createStatePair(state, nonce, 'student');

    const search = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: clientId,
      redirect_uri: redirectUri,
      login_hint: params.login_hint ?? '',
      lti_message_hint: params.lti_message_hint ?? '',
      state,
      nonce,
      lti_rlid: 'student',
    });

    return `${authEndpoint}?${search.toString()}`;
  }

  async findActiveConfigByClientId(clientId: string): Promise<LmsSchoolConfig | null> {
    const normalizedClientId = clientId.trim();
    if (!normalizedClientId) {
      return null;
    }

    return this.configRepo.findOne({
      where: { clientId: normalizedClientId, status: LmsConfigStatus.ACTIVE },
    });
  }

  async findActiveConfigByIssuer(issuer: string): Promise<LmsSchoolConfig | null> {
    const normalizedIssuer = issuer.trim().replace(/\/$/, '');
    if (!normalizedIssuer) {
      return null;
    }

    return this.configRepo.findOne({
      where: { issuer: normalizedIssuer, status: LmsConfigStatus.ACTIVE },
    });
  }

  private async resolveAuthEndpoint(
    clientId: string,
    issuer?: string,
    audience: 'educator' | 'student' = 'educator',
  ): Promise<string> {
    this.logger.log(
      `[LTI] ${audience} login initiated — client_id: "${clientId}", iss: "${issuer ?? ''}"`,
    );

    let config: LmsSchoolConfig | null = null;
    if (clientId) {
      config = await this.configRepo.findOne({
        where: { clientId, status: LmsConfigStatus.ACTIVE },
      });
      if (config) {
        this.logger.log(
          `[LTI] Found active school config for client_id "${clientId}" (school: ${config.schoolId}, lmsType: ${config.lmsType})`,
        );
      } else {
        this.logger.warn(
          `[LTI] No active school config found for client_id "${clientId}" — trying issuer lookup`,
        );
      }
    }

    if (!config && issuer?.trim()) {
      config = await this.findActiveConfigByIssuer(issuer);
      if (config) {
        this.logger.log(
          `[LTI] Found active school config for issuer "${issuer}" (school: ${config.schoolId}, lmsType: ${config.lmsType})`,
        );
      }
    }

    const configuredEndpoint = config?.authEndpoint?.trim();

    const fallbackBase = (
      config?.lmsBaseUrl?.trim() ||
      config?.issuer?.trim() ||
      issuer ||
      'http://localhost'
    ).replace(/\/+$/, '');
    const lmsType = config?.lmsType ?? this.inferLmsTypeFromIssuer(fallbackBase);

    const moodleAuthOnCanvas =
      lmsType === LmsType.CANVAS && !!configuredEndpoint?.includes('/mod/lti/auth.php');
    const cloudIssWithLocalBase =
      lmsType === LmsType.CANVAS &&
      !!configuredEndpoint &&
      /canvas\.instructure\.com/i.test(configuredEndpoint) &&
      /canvas\.docker/i.test(fallbackBase);

    if (configuredEndpoint && !moodleAuthOnCanvas && !cloudIssWithLocalBase) {
      return configuredEndpoint;
    }

    const fallbackEndpoint = resolveDefaultLtiEndpoints(lmsType, fallbackBase).authEndpoint;
    this.logger.warn(
      `[LTI] Using fallback auth endpoint: ${fallbackEndpoint} (lmsType=${lmsType}, base=${fallbackBase})`,
    );
    return fallbackEndpoint;
  }

  private inferLmsTypeFromIssuer(issuer: string): LmsType {
    const host = issuer.toLowerCase();
    if (host.includes('canvas') || host.includes('instructure')) {
      return LmsType.CANVAS;
    }
    return LmsType.MOODLE;
  }
}
