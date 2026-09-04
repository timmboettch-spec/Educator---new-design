import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { LmsConfigService } from 'src/lms/services/lms-config.service';

/**
 * Verifies LTI 1.3 id_token JWTs against the platform's JWKS.
 *
 * Required before trusting any claims (iss, sub, email, roles, etc.) from LTI launches.
 */
@Injectable()
export class LtiJwtService {
  private readonly logger = new Logger(LtiJwtService.name);

  constructor(private readonly lmsConfigService: LmsConfigService) {}

  /**
   * Verify and decode an LTI id_token.
   *
   * @param idToken - JWT from Moodle LTI launch
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
      this.logger.log(`[LTI JWT] Verifying id_token against JWKS: ${jwksUrl}`);

      // Verify signature and claims
      const JWKS = createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: expectedIssuer || issuer,
        audience: expectedClientId,
        // LTI tokens typically have short TTL; verify exp/iat
        clockTolerance: 60, // 60 seconds clock skew tolerance
      });

      // Additional LTI-specific claim validation
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

    // Deployment ID validation
    const deploymentId = payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
    if (!deploymentId) {
      this.logger.debug('[LTI JWT] No deployment_id claim present');
    } else if (expectedDeploymentId && typeof deploymentId === 'string') {
      const normalizedTokenDeployment = deploymentId.trim();
      const normalizedExpectedDeployment = expectedDeploymentId.trim();

      if (normalizedTokenDeployment !== normalizedExpectedDeployment) {
        this.logger.warn(
          `[LTI JWT] Deployment ID mismatch — token: ${normalizedTokenDeployment}, expected: ${normalizedExpectedDeployment}`,
        );
        throw new UnauthorizedException('Deployment ID mismatch');
      }

      this.logger.log(`[LTI JWT] Deployment ID validated: ${normalizedTokenDeployment}`);
    }

    // Resource link (required for resource launches)
    const resourceLink = payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'];
    if (!resourceLink) {
      this.logger.debug('[LTI JWT] No resource_link claim present');
    }
  }
}
