import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LmsConfigStatus, LmsType } from 'src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/lms/entity/lms-school-config.entity';
import { resolveDefaultLtiEndpoints } from 'src/lms/utils/lms-endpoints.util';
import { LtiKeyService } from './lti-key.service';
import { LtiStateService } from './lti-state.service';

@Injectable()
export class LtiService {
  private readonly logger = new Logger(LtiService.name);

  constructor(
    private readonly keyService: LtiKeyService,
    private readonly stateService: LtiStateService,
    @InjectRepository(LmsSchoolConfig)
    private readonly configRepo: Repository<LmsSchoolConfig>,
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

    // Store state/nonce pair for validation in callback
    this.stateService.createStatePair(state, nonce, 'educator');

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
    this.stateService.createStatePair(state, nonce, 'student');

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
          `[LTI] No active school config found for client_id "${clientId}" — falling back to issuer-based auth endpoint`,
        );
      }
    }

    const configuredEndpoint = config?.authEndpoint?.trim();
    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    const normalizedIssuer = (issuer ?? 'http://localhost').replace(/\/+$/, '');
    const lmsType = config?.lmsType ?? LmsType.MOODLE;
    const fallbackEndpoint = resolveDefaultLtiEndpoints(lmsType, normalizedIssuer).authEndpoint;
    this.logger.warn(`[LTI] Using fallback auth endpoint: ${fallbackEndpoint}`);
    return fallbackEndpoint;
  }
}
