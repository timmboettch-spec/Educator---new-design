import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import { LmsSchoolConfig } from 'src/database/entities';
import { LMS_OAUTH_SCOPES, LmsOAuthPurpose } from '../lms.constants';
import { OutboundIntegration } from '../../common/constants';
import { LoggerService, OutboundHttpClient } from '../../common/services';
import { formatLmsHttpFailure, isFriendlyOauthError } from '../utils/lms-error.util';

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

/**
 * OAuth2 token exchange for LTI 1.3 Advantage services.
 * Scope selection is platform-agnostic — Moodle, Canvas
 * use the same IMS scope URLs; only adapter API calls differ per LMS.
 */
@Injectable()
export class LmsAuthService {
  private readonly tokenCache = new Map<string, TokenCacheEntry>();

  constructor(
    private readonly logger: LoggerService,
    private readonly outboundHttp: OutboundHttpClient,
  ) {}

  /** Token for NRPS roster sync (default). */
  async getAccessToken(
    config: LmsSchoolConfig,
    options?: { bypassCache?: boolean },
  ): Promise<string> {
    return this.getAccessTokenForPurpose(config, LmsOAuthPurpose.NRPS, options);
  }

  /** Token for AGS grade passback (POST scores to line item). */
  async getAccessTokenForGradePassback(config: LmsSchoolConfig): Promise<string> {
    return this.getAccessTokenForPurpose(config, LmsOAuthPurpose.AGS_SCORE);
  }

  /** Token for AGS line item management (create/update gradebook columns). */
  async getAccessTokenForLineItems(config: LmsSchoolConfig): Promise<string> {
    return this.getAccessTokenForPurpose(config, LmsOAuthPurpose.AGS_LINEITEM);
  }

  async getAccessTokenForPurpose(
    config: LmsSchoolConfig,
    purpose: LmsOAuthPurpose,
    options?: { bypassCache?: boolean },
  ): Promise<string> {
    const scopesToTry = LMS_OAUTH_SCOPES[purpose];
    const cacheKey = `${config.schoolId}:${config.clientId}:${purpose}`;
    if (!options?.bypassCache) {
      const cached = this.tokenCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now() + 30_000) {
        return cached.token;
      }
    }

    const privateKey = await importPKCS8(
      config.platformPrivateKeyPem.replace(/\\n/g, '\n').trim(),
      'RS256',
    );

    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: config.platformKeyId })
      .setIssuer(config.clientId)
      .setSubject(config.clientId)
      .setAudience(config.tokenEndpoint)
      .setIssuedAt()
      .setExpirationTime('2m')
      .setJti(randomUUID())
      .sign(privateKey);

    let lastStatus = 0;
    let lastBody = '';

    for (const scope of scopesToTry) {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
        scope,
      });

      this.logger.log(
        `[LmsAuth] Token request → endpoint: ${config.tokenEndpoint}, clientId: ${config.clientId}, purpose: ${purpose}, scope: ${scope}`,
      );

      const response = await this.outboundHttp.fetch(OutboundIntegration.Lms, config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          access_token: string;
          expires_in?: number;
        };

        const expiresIn = payload.expires_in ?? 3600;
        this.tokenCache.set(cacheKey, {
          token: payload.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
        });

        return payload.access_token;
      }

      const errorBody = await response.text();
      lastStatus = response.status;
      lastBody = errorBody;
      this.logger.warn(
        `[LmsAuth] Token request failed — status: ${response.status}, purpose: ${purpose}, scope: ${scope}, body: ${errorBody}`,
      );

      const normalizedError = errorBody.toLowerCase();
      const canRetryWithAnotherScope =
        response.status === 400 &&
        (normalizedError.includes('invalid_scope') || normalizedError.includes('invalid_request'));

      if (!canRetryWithAnotherScope) {
        throw new Error(formatLmsHttpFailure(response.status, errorBody, 'oauth'));
      }
    }

    const failure = formatLmsHttpFailure(lastStatus || 400, lastBody, 'oauth');
    throw new Error(
      isFriendlyOauthError(failure)
        ? failure
        : `${failure} Ensure the LMS tool allows the required LTI scopes.`,
    );
  }
}
