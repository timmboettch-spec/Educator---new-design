import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createPublicKey, createVerify } from 'crypto';
import { createRemoteJWKSet, decodeProtectedHeader, JWTPayload, jwtVerify } from 'jose';
import { LmsType } from 'src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/database/entities';
import { LmsConfigService } from 'src/lms/services/lms-config.service';
import { OutboundIntegration } from '../common/constants';
import { LoggerService, OutboundHttpClient } from '../common/services';

/**
 * Verifies LTI 1.3 id_token JWTs against the platform's JWKS.
 *
 * Required before trusting any claims (iss, sub, email, roles, etc.) from LTI launches.
 */
@Injectable()
export class LtiJwtService {
  constructor(
    private readonly lmsConfigService: LmsConfigService,
    private readonly logger: LoggerService,
    private readonly outboundHttp: OutboundHttpClient,
  ) {}

  /**
   * Verify and decode an LTI id_token.
   *
   * @param idToken - JWT from LMS LTI launch
   * @param expectedIssuer - Optional issuer to validate against (iss claim)
   * @param expectedClientId - Optional client ID to validate against (aud claim)
   * @param expectedDeploymentId - Optional deployment ID to validate against (deployment_id claim)
   * @returns Verified JWT payload
   * @throws UnauthorizedException if verification fails
   */
  async verifyIdToken(
    idToken: string,
    expectedIssuer?: string,
    expectedClientId?: string,
    expectedDeploymentId?: string,
  ): Promise<JWTPayload> {
    try {
      // Quick decode to extract issuer for JWKS lookup (not yet verified)
      const unverifiedPayload = this.quickDecode(idToken);
      const issuer = this.resolveIssuer(unverifiedPayload.iss, expectedIssuer);

      if (!issuer) {
        throw new UnauthorizedException('Missing issuer (iss) in id_token');
      }

      // Fetch platform JWKS URL from school config
      const schoolConfig = await this.lmsConfigService.findByIssuer(issuer);
      if (!schoolConfig?.jwksUrl) {
        this.logger.warn(`[LTI JWT] No school config found for issuer: ${issuer}`);
        throw new UnauthorizedException('Unknown LTI platform issuer');
      }

      const jwksUrl = schoolConfig.jwksUrl.trim();
      const resolvedIssuer = expectedIssuer || issuer;
      this.logger.log(`[LTI JWT] Verifying id_token against JWKS: ${jwksUrl}`);

      const payload = await this.verifySignature(idToken, jwksUrl, resolvedIssuer, schoolConfig);

      this.assertAudienceMatchesClientId(payload, expectedClientId, idToken);
      this.validateLtiClaims(payload, expectedDeploymentId);

      this.logger.log(
        `[LTI JWT] Token verified — iss: ${this.claimToLogString(payload.iss)}, sub: ${this.claimToLogString(payload.sub)}, aud: ${this.claimToLogString(payload.aud)}`,
      );
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[LTI JWT] Verification failed: ${message}`);
      throw new UnauthorizedException(`Invalid id_token: ${message}`);
    }
  }

  private async verifySignature(
    idToken: string,
    jwksUrl: string,
    resolvedIssuer: string,
    schoolConfig: LmsSchoolConfig,
  ): Promise<JWTPayload> {
    try {
      const JWKS = createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: resolvedIssuer,
        clockTolerance: 60,
      });
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('modulusLength') &&
        this.allowsWeakPlatformRsaKeys(schoolConfig, resolvedIssuer)
      ) {
        this.logger.warn(
          `[LTI JWT] Platform JWKS uses RSA <2048 bits (local Canvas). Using Node crypto fallback.`,
        );
        return this.verifySignatureWithNodeCrypto(idToken, jwksUrl, resolvedIssuer);
      }
      throw error;
    }
  }

  private allowsWeakPlatformRsaKeys(schoolConfig: LmsSchoolConfig, issuer: string): boolean {
    if (schoolConfig.lmsType !== LmsType.CANVAS) {
      return false;
    }
    const host = issuer.toLowerCase();
    return (
      host.includes('canvas.docker') || host.includes('localhost') || host.includes('127.0.0.1')
    );
  }

  private async verifySignatureWithNodeCrypto(
    idToken: string,
    jwksUrl: string,
    resolvedIssuer: string,
  ): Promise<JWTPayload> {
    const header = decodeProtectedHeader(idToken);
    if (header.alg !== 'RS256') {
      throw new UnauthorizedException(`Invalid id_token: unsupported alg ${String(header.alg)}`);
    }

    const response = await this.outboundHttp.fetch(OutboundIntegration.Lms, jwksUrl);
    if (!response.ok) {
      throw new UnauthorizedException(
        `Invalid id_token: failed to fetch JWKS (${response.status})`,
      );
    }

    const jwks = (await response.json()) as { keys?: Array<Record<string, unknown>> };
    const keys = Array.isArray(jwks.keys) ? jwks.keys : [];
    const jwk =
      (header.kid
        ? keys.find((key) => typeof key.kid === 'string' && key.kid === header.kid)
        : undefined) ?? keys[0];

    if (!jwk) {
      throw new UnauthorizedException('Invalid id_token: no matching JWK in platform JWKS');
    }

    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed id_token');
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64, 'base64url');
    const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();

    if (!verifier.verify(keyObject, signature)) {
      throw new UnauthorizedException('Invalid id_token: signature verification failed');
    }

    const payload = this.quickDecode(idToken) as JWTPayload;
    this.assertStandardClaims(payload, resolvedIssuer);
    return payload;
  }

  private assertStandardClaims(payload: JWTPayload, resolvedIssuer: string): void {
    if (typeof payload.iss !== 'string' || payload.iss.trim() !== resolvedIssuer.trim()) {
      throw new UnauthorizedException('Invalid id_token: unexpected "iss" claim value');
    }

    const now = Math.floor(Date.now() / 1000);
    const clockTolerance = 60;
    if (typeof payload.exp === 'number' && payload.exp < now - clockTolerance) {
      throw new UnauthorizedException('Invalid id_token: "exp" claim timestamp check failed');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > now + clockTolerance) {
      throw new UnauthorizedException('Invalid id_token: "nbf" claim timestamp check failed');
    }
  }

  private assertAudienceMatchesClientId(
    payload: JWTPayload,
    expectedClientId?: string,
    rawIdToken?: string,
  ): void {
    if (!expectedClientId?.trim()) {
      return;
    }

    const expected = expectedClientId.trim();
    const candidates = new Set<string>();

    const add = (value: unknown): void => {
      if (typeof value === 'string' && value.trim()) {
        candidates.add(value.trim());
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        // Unsafe for Canvas client IDs past Number.MAX_SAFE_INTEGER — also read raw JWT below.
        candidates.add(String(value));
      } else if (typeof value === 'bigint') {
        candidates.add(value.toString());
      }
    };

    add(payload.aud);
    if (Array.isArray(payload.aud)) {
      for (const entry of payload.aud) {
        add(entry);
      }
    }
    add(payload.azp);

    for (const claim of this.extractAudienceClaimsFromRawToken(rawIdToken)) {
      candidates.add(claim);
    }

    if (!candidates.has(expected)) {
      this.logger.warn(
        `[LTI JWT] Audience mismatch — expected client_id=${expected}, token aud/azp=${[...candidates].join(',') || '(none)'}`,
      );
      throw new UnauthorizedException('Invalid id_token: unexpected "aud" claim value');
    }
  }

  extractClientIdFromRawToken(idToken?: string): string | undefined {
    return this.extractAudienceClaimsFromRawToken(idToken)[0];
  }

  private extractAudienceClaimsFromRawToken(idToken?: string): string[] {
    if (!idToken?.trim()) {
      return [];
    }
    try {
      const payloadBase64 = idToken.split('.')[1];
      if (!payloadBase64) {
        return [];
      }
      const json = Buffer.from(payloadBase64, 'base64url').toString('utf8');
      const values: string[] = [];

      const pushFrom = (source: string, pattern: RegExp): void => {
        for (const match of source.matchAll(pattern)) {
          const value = match[1]?.trim();
          if (value) {
            values.push(value);
          }
        }
      };

      pushFrom(json, /"aud"\s*:\s*"([^"]+)"/g);
      pushFrom(json, /"aud"\s*:\s*(\d+)/g);
      pushFrom(json, /"azp"\s*:\s*"([^"]+)"/g);
      pushFrom(json, /"azp"\s*:\s*(\d+)/g);

      const audArray = json.match(/"aud"\s*:\s*\[(.*?)\]/s);
      if (audArray?.[1]) {
        pushFrom(audArray[1], /"([^"]+)"/g);
        pushFrom(audArray[1], /(\d{10,})/g);
      }

      return [...new Set(values)];
    } catch {
      return [];
    }
  }

  private resolveIssuer(issClaim: unknown, expectedIssuer?: string): string {
    if (typeof issClaim === 'string' && issClaim.trim()) {
      return issClaim.trim();
    }
    if (typeof expectedIssuer === 'string' && expectedIssuer.trim()) {
      return expectedIssuer.trim();
    }
    return '';
  }

  private claimToLogString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.claimToLogString(item)).join(',');
    }
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  /**
   * Quick base64 decode (unverified) to extract issuer for JWKS lookup.
   * DO NOT use this payload for any trust decisions; only for routing to correct JWKS.
   */
  private quickDecode(idToken: string): Record<string, unknown> {
    try {
      const payloadBase64 = idToken.split('.')[1];
      if (!payloadBase64) {
        throw new Error('Malformed JWT');
      }
      return JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new UnauthorizedException('Malformed id_token');
    }
  }

  /**
   * Validate required LTI 1.3 claims.
   *
   * @param payload - Verified JWT payload
   * @param expectedDeploymentId - Optional expected deployment ID from school config
   */
  private validateLtiClaims(payload: JWTPayload, expectedDeploymentId?: string): void {
    // LTI message_type (should be LtiResourceLinkRequest for launches)
    const messageType = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'];
    if (!messageType) {
      throw new UnauthorizedException('Missing LTI message_type claim');
    }

    // LTI version
    const version = payload['https://purl.imsglobal.org/spec/lti/claim/version'];
    if (version !== '1.3.0') {
      this.logger.warn(`[LTI JWT] Unexpected LTI version: ${this.claimToLogString(version)}`);
    }

    // Deployment ID validation — fail closed when school config requires one.
    const deploymentId = payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
    const hasDeploymentClaim =
      deploymentId !== undefined && deploymentId !== null && deploymentId !== '';

    if (expectedDeploymentId) {
      const normalizedExpectedDeployment = expectedDeploymentId.trim();
      const normalizedTokenDeployment =
        typeof deploymentId === 'string' || typeof deploymentId === 'number'
          ? String(deploymentId).trim()
          : '';

      if (!hasDeploymentClaim || !normalizedTokenDeployment) {
        this.logger.warn(
          `[LTI JWT] Missing deployment_id claim — expected: ${normalizedExpectedDeployment}`,
        );
        throw new UnauthorizedException('Deployment ID mismatch');
      }

      if (normalizedTokenDeployment !== normalizedExpectedDeployment) {
        this.logger.warn(
          `[LTI JWT] Deployment ID mismatch — token: ${normalizedTokenDeployment}, expected: ${normalizedExpectedDeployment}`,
        );
        throw new UnauthorizedException('Deployment ID mismatch');
      }

      this.logger.log(`[LTI JWT] Deployment ID validated: ${normalizedTokenDeployment}`);
    } else if (!hasDeploymentClaim) {
      this.logger.debug('[LTI JWT] No deployment_id claim present');
    }

    // Resource link (required for resource launches, NOT required for Deep Linking)
    const resourceLink = payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'];
    if (!resourceLink) {
      this.logger.debug('[LTI JWT] No resource_link claim present');
    }
  }

  /**
   * Extract Deep Linking settings from an LTI launch payload
   *
   * @param payload - Verified JWT payload
   * @returns Deep Linking settings or null if not present
   */
  extractDeepLinkingSettings(payload: Record<string, unknown>): {
    deep_link_return_url: string;
    accept_types: string[];
    accept_multiple?: boolean;
    data?: string;
  } | null {
    const dlClaim = payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'];

    if (!dlClaim || typeof dlClaim !== 'object') {
      return null;
    }

    const settings = dlClaim as Record<string, unknown>;
    const returnUrl = settings.deep_link_return_url;
    const acceptTypes = settings.accept_types;

    if (typeof returnUrl !== 'string' || !returnUrl) {
      this.logger.warn('[LTI JWT] Invalid deep_link_return_url in deep_linking_settings');
      return null;
    }

    if (!Array.isArray(acceptTypes)) {
      this.logger.warn('[LTI JWT] Invalid accept_types in deep_linking_settings');
      return null;
    }

    return {
      deep_link_return_url: returnUrl,
      accept_types: acceptTypes.filter((t) => typeof t === 'string'),
      accept_multiple:
        typeof settings.accept_multiple === 'boolean' ? settings.accept_multiple : undefined,
      data: typeof settings.data === 'string' ? settings.data : undefined,
    };
  }
}
