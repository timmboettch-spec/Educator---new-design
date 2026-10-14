import { BadRequestException, GatewayTimeoutException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboundIntegration } from 'src/common/constants';
import { LoggerService, OutboundHttpClient } from 'src/common/services';
import { GoogleConstants } from './google.constants';

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
  tokenType: string | null;
}

export interface GoogleUserInfo {
  sub: string | null;
  email: string | null;
}

/** Never log Google token values (access/refresh) from error or debug paths. */
export function redactSensitiveGoogleText(value: string): string {
  return value
    .replace(/(access_token"?\s*[:=]\s*"?)[^"&\s]+/gi, '$1[redacted]')
    .replace(/(refresh_token"?\s*[:=]\s*"?)[^"&\s]+/gi, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [redacted]');
}

export function parseGoogleTokenResponse(payload: Record<string, unknown>): GoogleTokenResponse {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) {
    throw new BadRequestException('Google token response missing access_token');
  }

  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : null,
    scope: typeof payload.scope === 'string' ? payload.scope : null,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : null,
  };
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly outboundHttp: OutboundHttpClient,
  ) {}

  private requireClientConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = this.configService.get<string>('google.clientId')?.trim() || '';
    const clientSecret = this.configService.get<string>('google.clientSecret')?.trim() || '';
    const redirectUri = this.configService.get<string>('google.redirectUri')?.trim() || '';

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(GoogleConstants.MESSAGES.OAUTH_NOT_CONFIGURED);
    }

    return { clientId, clientSecret, redirectUri };
  }

  getConfiguredScopes(): string[] {
    const scopes = this.configService.get<string[]>('google.scopes') ?? [];
    return scopes.filter(Boolean);
  }

  buildAuthorizationUrl(state: string): string {
    const { clientId, redirectUri } = this.requireClientConfig();
    const authUrl =
      this.configService.get<string>('google.authUrl') ||
      'https://accounts.google.com/o/oauth2/v2/auth';
    const scopes = this.getConfiguredScopes();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: GoogleConstants.OAUTH.RESPONSE_TYPE,
      scope: scopes.join(' '),
      state,
      access_type: GoogleConstants.OAUTH.ACCESS_TYPE,
      prompt: GoogleConstants.OAUTH.PROMPT,
    });

    if (this.configService.get<boolean>('google.includeGrantedScopes') !== false) {
      params.set('include_granted_scopes', 'true');
    }

    return `${authUrl}?${params.toString()}`;
  }

  /**
   * Student Classroom assignment sign-in: openid/email only (no Classroom teacher scopes).
   * Uses the same redirect URI as educator connect so Google Console stays a single entry.
   */
  buildStudentAuthorizationUrl(state: string): string {
    const { clientId, redirectUri } = this.requireClientConfig();
    const authUrl =
      this.configService.get<string>('google.authUrl') ||
      'https://accounts.google.com/o/oauth2/v2/auth';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: GoogleConstants.OAUTH.RESPONSE_TYPE,
      scope: GoogleConstants.STUDENT_OAUTH.SCOPES.join(' '),
      state,
      access_type: GoogleConstants.STUDENT_OAUTH.ACCESS_TYPE,
      prompt: GoogleConstants.STUDENT_OAUTH.PROMPT,
    });

    return `${authUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    if (!code?.trim()) {
      throw new BadRequestException('Missing Google authorization code');
    }

    const { clientId, clientSecret, redirectUri } = this.requireClientConfig();
    const tokenUrl =
      this.configService.get<string>('google.tokenUrl') || 'https://oauth2.googleapis.com/token';

    const body = new URLSearchParams({
      code: code.trim(),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    return this.requestTokens(tokenUrl, body);
  }

  /**
   * Google often omits `refresh_token` on refresh. Keep the existing refresh token
   * unless Google rotates and returns a new one.
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    if (!refreshToken?.trim()) {
      throw new BadRequestException('Missing Google refresh token');
    }

    const { clientId, clientSecret } = this.requireClientConfig();
    const tokenUrl =
      this.configService.get<string>('google.tokenUrl') || 'https://oauth2.googleapis.com/token';

    const body = new URLSearchParams({
      refresh_token: refreshToken.trim(),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    });

    const tokens = await this.requestTokens(tokenUrl, body);
    return {
      ...tokens,
      refreshToken: tokens.refreshToken ?? refreshToken,
    };
  }

  async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const userInfoUrl =
      this.configService.get<string>('google.userInfoUrl') ||
      'https://openidconnect.googleapis.com/v1/userinfo';
    const attempts = GoogleConstants.OAUTH.TOKEN_RETRY_ATTEMPTS;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.outboundHttp.fetch(OutboundIntegration.Google, userInfoUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < attempts) {
            this.logger.warn(
              `[Google OAuth] userinfo ${response.status}; retry ${attempt}/${attempts}`,
            );
            await this.delay(GoogleConstants.OAUTH.TOKEN_RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          this.logger.warn(
            `[Google OAuth] userinfo failed with status ${response.status}; continuing without profile`,
          );
          return { sub: null, email: null };
        }

        const payload = await this.readJsonPayload(response, 'userinfo');
        return {
          sub: typeof payload.sub === 'string' ? payload.sub : null,
          email: typeof payload.email === 'string' ? payload.email : null,
        };
      } catch (err) {
        if (err instanceof GatewayTimeoutException) throw err;
        if (attempt < attempts) {
          this.logger.warn(
            `[Google OAuth] userinfo request error (${this.toSafeErrorMessage(err)}); retry ${attempt}/${attempts}`,
          );
          await this.delay(GoogleConstants.OAUTH.TOKEN_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        this.logger.warn(
          `[Google OAuth] userinfo request error: ${this.toSafeErrorMessage(err)}`,
        );
        return { sub: null, email: null };
      }
    }

    return { sub: null, email: null };
  }

  /**
   * Resolves the signed-in Google identity for "Connected as …".
   * Prefers OIDC userinfo (`openid`/`email`), then Classroom `userProfiles/me`
   * (works with `classroom.profile.emails` from the DevOps scope set).
   */
  async resolveConnectedAccountProfile(accessToken: string): Promise<GoogleUserInfo> {
    const oidc = await this.fetchUserInfo(accessToken);
    if (oidc.email?.trim()) {
      return {
        sub: oidc.sub,
        email: oidc.email.trim(),
      };
    }

    const classroom = await this.fetchClassroomUserProfile(accessToken);
    return {
      sub: oidc.sub ?? classroom.sub,
      email: classroom.email?.trim() || null,
    };
  }

  /**
   * Revokes Google-issued tokens so disconnect actually invalidates the grant.
   * Refresh token first (also invalidates access); access token is a fallback.
   * Failures are logged and swallowed so disconnect can still delete the DB row.
   */
  async revokeGrantedTokens(tokens: {
    accessToken?: string | null;
    refreshToken?: string | null;
  }): Promise<void> {
    const revokeUrl =
      this.configService.get<string>('google.revokeUrl')?.trim() ||
      'https://oauth2.googleapis.com/revoke';
    const uniqueTokens = [
      ...new Set(
        [tokens.refreshToken, tokens.accessToken]
          .map((token) => token?.trim())
          .filter((token): token is string => Boolean(token)),
      ),
    ];

    for (const token of uniqueTokens) {
      try {
        const response = await this.outboundHttp.fetch(OutboundIntegration.Google, revokeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString(),
        });
        if (!response.ok) {
          this.logger.warn(
            `[Google OAuth] token revoke failed with status ${response.status}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `[Google OAuth] token revoke error: ${this.toSafeErrorMessage(err)}`,
        );
      }
    }
  }

  async fetchClassroomUserProfile(accessToken: string): Promise<GoogleUserInfo> {
    const profileUrl =
      this.configService.get<string>('google.classroomUserProfileUrl') ||
      'https://classroom.googleapis.com/v1/userProfiles/me';

    try {
      const response = await this.outboundHttp.fetch(OutboundIntegration.Google, profileUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        this.logger.warn(
          `[Google OAuth] Classroom userProfiles/me failed with status ${response.status}`,
        );
        return { sub: null, email: null };
      }

      const payload = await this.readJsonPayload(response, 'classroom-profile');
      const email =
        typeof payload.emailAddress === 'string' ? payload.emailAddress.trim() : null;
      return {
        sub: typeof payload.id === 'string' ? payload.id : null,
        email: email || null,
      };
    } catch (err) {
      this.logger.warn(
        `[Google OAuth] Classroom userProfiles/me error: ${this.toSafeErrorMessage(err)}`,
      );
      return { sub: null, email: null };
    }
  }

  buildFrontendRedirect(params: Record<string, string>): string {
    const frontendUrl = (this.configService.get<string>('app.frontendUrl') || '').replace(
      /\/+$/,
      '',
    );
    const path = this.configService.get<string>('google.successRedirectPath') || '/google-classroom';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const base = frontendUrl || 'http://localhost:5173';
    const url = new URL(`${base}${normalizedPath}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  /** Educator portal login handoff (same query contract as LTI: lti_launch + code). */
  buildEducatorLoginRedirect(query: Record<string, string>): string {
    const frontendUrl = (
      this.configService.get<string>('app.frontendUrl') ||
      process.env.FRONTEND_URL ||
      ''
    ).replace(/\/+$/, '');
    const base = frontendUrl || 'http://localhost:5173';
    const url = new URL(`${base}/login`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  getStudentFrontendBaseUrl(): string {
    const configured = (
      this.configService.get<string>('app.studentFrontendUrl') ||
      process.env.STUDENT_FRONTEND_URL ||
      ''
    ).replace(/\/+$/, '');
    return configured || 'http://localhost:5174';
  }

  /**
   * Mirror LTI student handoff: one-time session code on /student-dashboard,
   * or error reason on /login (same query contract as LTI).
   */
  buildStudentAppRedirect(params: {
    path: '/student-dashboard' | '/login';
    query: Record<string, string>;
  }): string {
    const url = new URL(`${this.getStudentFrontendBaseUrl()}${params.path}`);
    for (const [key, value] of Object.entries(params.query)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async requestTokens(tokenUrl: string, body: URLSearchParams): Promise<GoogleTokenResponse> {
    const attempts = GoogleConstants.OAUTH.TOKEN_RETRY_ATTEMPTS;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.outboundHttp.fetch(OutboundIntegration.Google, tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const payload = await this.readJsonPayload(response, 'token');

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const errorDescription = this.googleErrorDescription(payload, response.status);
          if (retryable && attempt < attempts) {
            this.logger.warn(
              `[Google OAuth] token endpoint ${response.status}; retry ${attempt}/${attempts}`,
            );
            await this.delay(GoogleConstants.OAUTH.TOKEN_RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          this.logger.warn(`[Google OAuth] token exchange rejected: ${errorDescription}`);
          throw new BadRequestException(`Google token exchange failed: ${errorDescription}`);
        }

        return parseGoogleTokenResponse(payload);
      } catch (err) {
        lastError = err;
        if (err instanceof BadRequestException || err instanceof GatewayTimeoutException) {
          throw err;
        }
        if (attempt < attempts) {
          this.logger.warn(
            `[Google OAuth] token request failed (${this.toSafeErrorMessage(err)}); retry ${attempt}/${attempts}`,
          );
          await this.delay(GoogleConstants.OAUTH.TOKEN_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
      }
    }

    this.logger.error(
      `[Google OAuth] token request failed: ${this.toSafeErrorMessage(lastError)}`,
    );
    throw new BadRequestException('Failed to contact Google token endpoint');
  }

  private async readJsonPayload(
    response: Response,
    context: string,
  ): Promise<Record<string, unknown>> {
    const contentType = response.headers?.get?.('content-type') ?? '';
    const raw = await response.text().catch(() => '');
    if (!raw.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      this.logger.warn(`[Google OAuth] ${context} JSON was not an object (status ${response.status})`);
      return {};
    } catch (err) {
      this.logger.warn(
        `[Google OAuth] ${context} JSON parse failed status=${response.status} content-type=${contentType}: ${this.toSafeErrorMessage(err)} body=${redactSensitiveGoogleText(raw).slice(0, 200)}`,
      );
      return {};
    }
  }

  private googleErrorDescription(payload: Record<string, unknown>, status: number): string {
    if (typeof payload.error_description === 'string') {
      return redactSensitiveGoogleText(payload.error_description);
    }
    if (typeof payload.error === 'string') {
      return redactSensitiveGoogleText(payload.error);
    }
    return `HTTP ${status}`;
  }

  private toSafeErrorMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : 'unknown';
    return redactSensitiveGoogleText(message);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
