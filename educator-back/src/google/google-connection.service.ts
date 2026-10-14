import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GoogleSchoolConnection } from 'src/database/entities';
import {
  EDUCATOR_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
  SCHOOLS_REPOSITORY,
} from 'src/database/tokens';
import {
  EducatorRepository,
  GoogleSchoolConnectionRepository,
  SchoolsRepository,
} from 'src/database/repositories';
import { LoggerService } from 'src/common/services';
import { EDUCATOR_USER_SELECT, resolveEducatorEmail } from 'src/common/utils/educator-identity.util';
import { GoogleConnectionStatus, GoogleConstants } from './google.constants';
import {
  GoogleOAuthService,
  GoogleTokenResponse,
  redactSensitiveGoogleText,
} from './google-oauth.service';
import { findMissingGoogleClassroomScopes } from './utils/google-scopes.util';

export interface GoogleConnectionStatusDto {
  connected: boolean;
  schoolId: string;
  status: GoogleConnectionStatus | null;
  googleAccountEmail: string | null;
  googleAccountId: string | null;
  scopes: string | null;
  tokenExpiresAt: string | null;
  connectedByEducatorId: string | null;
}

@Injectable()
export class GoogleConnectionService {
  constructor(
    @Inject(GOOGLE_SCHOOL_CONNECTION_REPOSITORY)
    private readonly connectionRepo: GoogleSchoolConnectionRepository,
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,
    @Inject(SCHOOLS_REPOSITORY)
    private readonly schoolsRepo: SchoolsRepository,
    private readonly oauthService: GoogleOAuthService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Authorization codes are single-use and cannot be rolled back in a SQL
   * transaction (Google has already consumed the code). Persist tokens as soon
   * as exchange succeeds. If DB save still fails after retries, the educator
   * must reconnect — the code cannot be replayed.
   */
  async completeConnect(params: {
    schoolId: string;
    educatorId: string;
    code: string;
  }): Promise<GoogleSchoolConnection> {
    await this.assertSchoolGoogleClassroomEnabled(params.schoolId);
    const tokens = await this.oauthService.exchangeCodeForTokens(params.code);
    await this.assertGrantedScopesComplete(tokens.scope, params.schoolId, params.educatorId);
    const profile = await this.oauthService.resolveConnectedAccountProfile(tokens.accessToken);
    await this.assertGoogleEmailMatchesEducator(params.educatorId, profile.email);
    if (!profile.sub?.trim()) {
      this.logger.warn(
        `[Google Connection] reject connect for educator ${params.educatorId}: Google profile sub missing`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.GOOGLE_ACCOUNT_ID_REQUIRED);
    }
    try {
      return await this.persistConnectionWithRetry({
        schoolId: params.schoolId,
        educatorId: params.educatorId,
        tokens,
        googleAccountEmail: profile.email,
        googleAccountId: profile.sub.trim(),
      });
    } catch (err) {
      if (!(err instanceof BadRequestException)) {
        this.logger.error(
          `[Google Connection] persist failed after token exchange for school ${params.schoolId} educator ${params.educatorId}. Authorization code is consumed; educator must reconnect.`,
        );
      }
      throw err;
    }
  }

  private async assertSchoolGoogleClassroomEnabled(schoolId: string): Promise<void> {
    const school = await this.schoolsRepo.findOne({ where: { id: schoolId } });
    if (!school || school.google_classroom_enabled !== true) {
      this.logger.warn(
        `[Google Connection] reject connect: Google Classroom disabled or school missing (${schoolId})`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.FEATURE_DISABLED);
    }
  }

  /**
   * Partial Google consent must not create/keep an ACTIVE connection — coursework
   * and grade passback would fail later with unclear errors.
   */
  private async assertGrantedScopesComplete(
    grantedScope: string | null | undefined,
    schoolId: string,
    educatorId: string,
  ): Promise<void> {
    const missing = findMissingGoogleClassroomScopes(grantedScope);
    if (missing.length === 0) {
      return;
    }
    this.logger.warn(
      `[Google Connection] reject connect for school ${schoolId} educator ${educatorId}: missing scopes [${missing.join(', ')}]`,
    );
    const existing = await this.connectionRepo.findBySchoolAndEducator(schoolId, educatorId);
    if (existing && existing.status === GoogleConnectionStatus.ACTIVE) {
      existing.status = GoogleConnectionStatus.ERROR;
      await this.connectionRepo.save(existing);
    }
    throw new BadRequestException(GoogleConstants.MESSAGES.SCOPES_INCOMPLETE);
  }

  /**
   * Teacher CourseWork handoff looks up the RW educator by Google email only.
   * Reject Connect when emails differ so we never store a mismatched connection.
   */
  private async assertGoogleEmailMatchesEducator(
    educatorId: string,
    googleEmail: string | null,
  ): Promise<void> {
    const normalizedGoogle = googleEmail?.trim().toLowerCase() || '';
    if (!normalizedGoogle) {
      this.logger.warn(
        `[Google Connection] reject connect for educator ${educatorId}: Google profile email missing`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.GOOGLE_EMAIL_MISMATCH);
    }

    const educator = await this.educatorRepo.findOne({
      where: { id: educatorId },
      relations: { userRole: { user: true } },
      select: {
        id: true,
        userRole: {
          userRoleId: true,
          user: EDUCATOR_USER_SELECT,
        },
      },
    });
    if (!educator) {
      this.logger.warn(
        `[Google Connection] reject connect: educator ${educatorId} not found (educators only)`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.GOOGLE_EMAIL_MISMATCH);
    }

    const rwEmail = resolveEducatorEmail(educator)?.trim().toLowerCase() || '';
    if (!rwEmail || rwEmail !== normalizedGoogle) {
      this.logger.warn(
        `[Google Connection] reject connect for educator ${educatorId}: Google email does not match RW login email`,
      );
      throw new BadRequestException(GoogleConstants.MESSAGES.GOOGLE_EMAIL_MISMATCH);
    }
  }

  async getStatus(schoolId: string, educatorId: string): Promise<GoogleConnectionStatusDto> {
    let connection = await this.connectionRepo.findBySchoolAndEducator(schoolId, educatorId);
    if (connection && connection.status === GoogleConnectionStatus.ACTIVE) {
      connection = await this.ensureGoogleAccountIdentity(connection);
    }
    return this.sanitize(schoolId, connection);
  }

  /**
   * Active connection with googleAccountId/email backfilled when missing.
   * Used by course list/provision/link so visibility never falls open on null identity.
   */
  async resolveActiveConnectionIdentity(
    schoolId: string,
    educatorId: string,
  ): Promise<GoogleSchoolConnection | null> {
    const connection = await this.findActiveConnection(schoolId, educatorId);
    if (!connection) {
      return null;
    }
    return this.ensureGoogleAccountIdentity(connection);
  }

  /**
   * Backfill Google sub/email for older connections saved before profile resolution worked.
   */
  async ensureGoogleAccountIdentity(
    connection: GoogleSchoolConnection,
  ): Promise<GoogleSchoolConnection> {
    const hasId = Boolean(connection.googleAccountId?.trim());
    const hasEmail = Boolean(connection.googleAccountEmail?.trim());
    if (hasId && hasEmail) {
      return connection;
    }
    return this.hydrateMissingAccountProfile(connection);
  }

  private async hydrateMissingAccountProfile(
    connection: GoogleSchoolConnection,
  ): Promise<GoogleSchoolConnection> {
    try {
      const accessToken = await this.getValidAccessToken(
        connection.schoolId,
        connection.connectedByEducatorId,
      );
      const latest =
        (await this.connectionRepo.findBySchoolAndEducator(
          connection.schoolId,
          connection.connectedByEducatorId,
        )) ?? connection;
      const profile = await this.oauthService.resolveConnectedAccountProfile(accessToken);
      if (!profile.email && !profile.sub) {
        return latest;
      }
      if (profile.email) {
        latest.googleAccountEmail = profile.email;
      }
      if (profile.sub) {
        latest.googleAccountId = profile.sub;
      }
      return this.connectionRepo.save(latest);
    } catch (err) {
      this.logger.warn(
        `[Google Connection] identity hydrate failed for school ${connection.schoolId} educator ${connection.connectedByEducatorId}: ${redactSensitiveGoogleText(
          err instanceof Error ? err.message : 'unknown',
        )}`,
      );
      return connection;
    }
  }

  async disconnect(schoolId: string, educatorId: string): Promise<GoogleConnectionStatusDto> {
    const connection = await this.connectionRepo.findBySchoolAndEducator(schoolId, educatorId);
    if (connection) {
      try {
        await this.oauthService.revokeGrantedTokens({
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
        });
      } catch (err) {
        this.logger.warn(
          `[Google Connection] token revoke failed for school ${schoolId} educator ${educatorId}: ${redactSensitiveGoogleText(
            err instanceof Error ? err.message : 'unknown',
          )}`,
        );
      }
    }
    const deleted = await this.connectionRepo.deleteBySchoolAndEducator(schoolId, educatorId);
    if (!deleted) {
      this.logger.log(
        `[Google Connection] disconnect: no row for school ${schoolId} educator ${educatorId}`,
      );
    }
    return this.sanitize(schoolId, null);
  }

  sanitize(
    schoolId: string,
    connection: GoogleSchoolConnection | null,
  ): GoogleConnectionStatusDto {
    if (!connection) {
      return {
        connected: false,
        schoolId,
        status: null,
        googleAccountEmail: null,
        googleAccountId: null,
        scopes: null,
        tokenExpiresAt: null,
        connectedByEducatorId: null,
      };
    }

    return {
      connected: connection.status === GoogleConnectionStatus.ACTIVE,
      schoolId: connection.schoolId,
      status: connection.status,
      googleAccountEmail: connection.googleAccountEmail,
      googleAccountId: connection.googleAccountId,
      scopes: connection.scopes,
      tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
      connectedByEducatorId: connection.connectedByEducatorId,
    };
  }

  /**
   * Returns a usable access token for the educator's connection at this school,
   * refreshing when near expiry.
   */
  async getValidAccessToken(schoolId: string, educatorId: string): Promise<string> {
    const connection = await this.connectionRepo.findBySchoolAndEducator(schoolId, educatorId);
    if (!connection) {
      throw new BadRequestException(GoogleConstants.MESSAGES.CONNECTION_NOT_FOUND);
    }
    if (connection.status === GoogleConnectionStatus.ERROR) {
      throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
    }
    if (connection.status !== GoogleConnectionStatus.ACTIVE) {
      throw new BadRequestException(GoogleConstants.MESSAGES.CONNECTION_NOT_FOUND);
    }

    const expiresAt = connection.tokenExpiresAt?.getTime() ?? 0;
    const stillValid = expiresAt - Date.now() > GoogleConstants.OAUTH.EXPIRY_SKEW_MS;
    if (stillValid && connection.accessToken) {
      return connection.accessToken;
    }

    if (!connection.refreshToken) {
      connection.status = GoogleConnectionStatus.ERROR;
      await this.connectionRepo.save(connection);
      throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
    }

    try {
      const refreshed = await this.oauthService.refreshAccessToken(connection.refreshToken);
      connection.accessToken = refreshed.accessToken;
      if (refreshed.refreshToken) {
        connection.refreshToken = refreshed.refreshToken;
      }
      if (refreshed.scope) {
        connection.scopes = refreshed.scope;
      }
      connection.tokenExpiresAt = this.expiresAtFromTokens(refreshed);
      connection.status = GoogleConnectionStatus.ACTIVE;
      await this.connectionRepo.save(connection);
      return connection.accessToken;
    } catch (err) {
      this.logger.warn(
        `[Google Connection] refresh failed for school ${schoolId} educator ${educatorId}: ${redactSensitiveGoogleText(
          err instanceof Error ? err.message : 'unknown',
        )}`,
      );
      connection.status = GoogleConnectionStatus.ERROR;
      await this.connectionRepo.save(connection);
      throw new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED);
    }
  }

  /** Marks this educator's school connection as needing Google re-consent. */
  async markConnectionNeedsReauth(schoolId: string, educatorId: string): Promise<void> {
    const connection = await this.connectionRepo.findBySchoolAndEducator(schoolId, educatorId);
    if (!connection) return;
    if (connection.status === GoogleConnectionStatus.ERROR) return;
    connection.status = GoogleConnectionStatus.ERROR;
    await this.connectionRepo.save(connection);
  }

  async findActiveConnection(
    schoolId: string,
    educatorId: string,
  ): Promise<GoogleSchoolConnection | null> {
    const connection = await this.connectionRepo.findBySchoolAndEducator(schoolId, educatorId);
    if (!connection || connection.status !== GoogleConnectionStatus.ACTIVE) {
      return null;
    }
    return connection;
  }

  private async upsertConnection(params: {
    schoolId: string;
    educatorId: string;
    tokens: GoogleTokenResponse;
    googleAccountEmail: string | null;
    googleAccountId: string | null;
  }): Promise<GoogleSchoolConnection> {
    const existing = await this.connectionRepo.findBySchoolAndEducator(
      params.schoolId,
      params.educatorId,
    );
    const scopes =
      params.tokens.scope ||
      this.oauthService.getConfiguredScopes().join(' ') ||
      existing?.scopes ||
      '';

    if (!scopes) {
      throw new BadRequestException('Google token response missing scopes');
    }

    const expiresAt = this.expiresAtFromTokens(params.tokens);

    if (existing) {
      existing.connectedByEducatorId = params.educatorId;
      existing.accessToken = params.tokens.accessToken;
      if (params.tokens.refreshToken) {
        existing.refreshToken = params.tokens.refreshToken;
      }
      existing.tokenExpiresAt = expiresAt;
      existing.scopes = scopes;
      existing.googleAccountEmail = params.googleAccountEmail ?? existing.googleAccountEmail;
      existing.googleAccountId = params.googleAccountId ?? existing.googleAccountId;
      existing.status = GoogleConnectionStatus.ACTIVE;
      return this.connectionRepo.save(existing);
    }

    if (!params.tokens.refreshToken) {
      throw new BadRequestException(
        'Google did not return a refresh token. Re-consent with prompt=consent and access_type=offline.',
      );
    }

    return this.connectionRepo.create({
      schoolId: params.schoolId,
      connectedByEducatorId: params.educatorId,
      accessToken: params.tokens.accessToken,
      refreshToken: params.tokens.refreshToken,
      tokenExpiresAt: expiresAt,
      scopes,
      googleAccountEmail: params.googleAccountEmail,
      googleAccountId: params.googleAccountId,
      status: GoogleConnectionStatus.ACTIVE,
    });
  }

  private async persistConnectionWithRetry(params: {
    schoolId: string;
    educatorId: string;
    tokens: GoogleTokenResponse;
    googleAccountEmail: string | null;
    googleAccountId: string | null;
  }): Promise<GoogleSchoolConnection> {
    let lastError: unknown;
    const attempts = GoogleConstants.OAUTH.TOKEN_RETRY_ATTEMPTS;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.upsertConnection(params);
      } catch (err) {
        lastError = err;
        if (err instanceof BadRequestException) {
          throw err;
        }
        if (attempt < attempts) {
          this.logger.warn(
            `[Google Connection] persist retry ${attempt}/${attempts} for school ${params.schoolId} educator ${params.educatorId}`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, GoogleConstants.OAUTH.TOKEN_RETRY_BASE_DELAY_MS * attempt),
          );
          continue;
        }
      }
    }

    throw lastError;
  }

  private expiresAtFromTokens(tokens: GoogleTokenResponse): Date | null {
    if (typeof tokens.expiresIn !== 'number' || !Number.isFinite(tokens.expiresIn)) {
      return null;
    }
    return new Date(Date.now() + tokens.expiresIn * 1000);
  }
}
