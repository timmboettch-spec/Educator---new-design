import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import { LmsSchoolConfig } from '../entity/lms-school-config.entity';
import { NRPS_SCOPE } from '../lms.constants';

const LEGACY_NRPS_SCOPE = 'https://purl.imsglobal.org/spec/lis/v2/membership#read';

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class LmsAuthService {
  private readonly logger = new Logger(LmsAuthService.name);
  private readonly tokenCache = new Map<string, TokenCacheEntry>();

  async getAccessToken(config: LmsSchoolConfig): Promise<string> {
    const cacheKey = `${config.schoolId}:${config.clientId}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 30_000) {
      return cached.token;
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

    const scopesToTry = [NRPS_SCOPE, LEGACY_NRPS_SCOPE];
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
        `[LmsAuth] Token request → endpoint: ${config.tokenEndpoint}, clientId: ${config.clientId}, scope: ${scope}`,
      );

      const response = await fetch(config.tokenEndpoint, {
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
        `[LmsAuth] Token request failed — status: ${response.status}, scope: ${scope}, body: ${errorBody}`,
      );

      const normalizedError = errorBody.toLowerCase();
      const canRetryWithAnotherScope =
        response.status === 400 &&
        (normalizedError.includes('invalid_scope') || normalizedError.includes('invalid_request'));

      if (!canRetryWithAnotherScope) {
        throw new Error(`LMS token request failed (${response.status}): ${errorBody}`);
      }
    }

    throw new Error(
      `LMS token request failed (${lastStatus}): ${lastBody}. Moodle LTI tool must allow NRPS scope (${NRPS_SCOPE}) or legacy scope (${LEGACY_NRPS_SCOPE}) for this client_id.`,
    );
  }
}
