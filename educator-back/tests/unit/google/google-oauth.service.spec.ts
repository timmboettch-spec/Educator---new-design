import { BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleOAuthService,
  parseGoogleTokenResponse,
  redactSensitiveGoogleText,
} from '../../../src/google/google-oauth.service';
import { GOOGLE_CLASSROOM_DEFAULT_SCOPES } from '../../../src/google/google.constants';
import { LoggerService } from '../../../src/common/services';
import { OutboundIntegration } from '../../../src/common/constants';
import { createOutboundHttpStub } from '../helpers/outbound-http.stub';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('parseGoogleTokenResponse', () => {
  it('maps Google token JSON into a typed response', () => {
    expect(
      parseGoogleTokenResponse({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        scope: 'scope-a',
        token_type: 'Bearer',
      }),
    ).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: 'scope-a',
      tokenType: 'Bearer',
    });
  });

  it('throws when access_token is missing', () => {
    expect(() => parseGoogleTokenResponse({ refresh_token: 'refresh-1' })).toThrow(
      BadRequestException,
    );
  });
});

describe('redactSensitiveGoogleText', () => {
  it('redacts access and refresh tokens from log text', () => {
    const redacted = redactSensitiveGoogleText(
      'access_token=ya29.secret-access&refresh_token=1//secret-refresh Bearer abc.def',
    );
    expect(redacted).not.toContain('ya29.secret-access');
    expect(redacted).not.toContain('1//secret-refresh');
    expect(redacted).toContain('[redacted]');
  });
});

describe('GoogleOAuthService', () => {
  const configValues: Record<string, unknown> = {
    'google.clientId': 'client-123',
    'google.clientSecret': 'secret-456',
    'google.redirectUri': 'http://localhost:3000/api/auth/google/callback',
    'google.scopes': [...GOOGLE_CLASSROOM_DEFAULT_SCOPES],
    'google.authUrl': 'https://accounts.google.com/o/oauth2/v2/auth',
    'google.tokenUrl': 'https://oauth2.googleapis.com/token',
    'google.userInfoUrl': 'https://openidconnect.googleapis.com/v1/userinfo',
    'google.successRedirectPath': '/google-classroom',
    'google.includeGrantedScopes': true,
    'app.frontendUrl': 'http://localhost:5173',
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  let service: GoogleOAuthService;
  let outbound: ReturnType<typeof createOutboundHttpStub>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    configValues['google.includeGrantedScopes'] = true;
    outbound = createOutboundHttpStub();
    service = new GoogleOAuthService(configService, logger, outbound.client);
    jest
      .spyOn(service as unknown as { delay: (ms: number) => Promise<void> }, 'delay')
      .mockResolvedValue();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('builds authorization URL with offline access, consent, and include_granted_scopes', () => {
    const url = new URL(service.buildAuthorizationUrl('state-abc'));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-abc');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(
      expect.arrayContaining([...GOOGLE_CLASSROOM_DEFAULT_SCOPES]),
    );
  });

  it('omits include_granted_scopes when disabled via config', () => {
    configValues['google.includeGrantedScopes'] = false;
    const url = new URL(service.buildAuthorizationUrl('state-abc'));
    expect(url.searchParams.has('include_granted_scopes')).toBe(false);
  });

  it('throws when OAuth client env is missing', () => {
    const brokenConfig = {
      get: jest.fn(() => ''),
    } as unknown as ConfigService;
    const broken = new GoogleOAuthService(brokenConfig, logger, createOutboundHttpStub().client);

    expect(() => broken.buildAuthorizationUrl('state')).toThrow(BadRequestException);
  });

  it('exchanges authorization code for tokens', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        scope: GOOGLE_CLASSROOM_DEFAULT_SCOPES.join(' '),
        token_type: 'Bearer',
      }),
    );

    const tokens = await service.exchangeCodeForTokens('auth-code');

    expect(tokens.accessToken).toBe('access-1');
    expect(tokens.refreshToken).toBe('refresh-1');
    expect(tokens.expiresIn).toBe(3600);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retries token exchange on transient 5xx then succeeds', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
        }),
      );

    const tokens = await service.exchangeCodeForTokens('auth-code');

    expect(tokens.accessToken).toBe('access-1');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('calls Google through the outbound client and does not retry a timed-out token exchange', async () => {
    global.fetch = jest.fn().mockRejectedValue(new GatewayTimeoutException('timed out'));

    await expect(service.exchangeCodeForTokens('auth-code')).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(outbound.integrations).toEqual([OutboundIntegration.Google]);
  });

  it('logs JSON parse failures for non-JSON token errors without swallowing context', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve('<html>bad gateway access_token=ya29.should-not-log</html>'),
    });

    await expect(service.exchangeCodeForTokens('auth-code')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const warnText = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(warnText).toContain('JSON parse failed');
    expect(warnText).toContain('text/html');
    expect(warnText).not.toContain('ya29.should-not-log');
    expect(warnText).toContain('[redacted]');
  });

  it('does not log access or refresh tokens from Google error payloads', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(
        {
          error: 'invalid_grant',
          error_description: 'code expired access_token=ya29.secret',
        },
        400,
      ),
    );

    await expect(service.exchangeCodeForTokens('auth-code')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const logged = JSON.stringify([
      ...(logger.warn as jest.Mock).mock.calls,
      ...(logger.error as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toContain('ya29.secret');
    expect(logged).not.toContain('access-1');
  });

  it('refreshes access tokens and preserves refresh token when omitted', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        access_token: 'access-2',
        expires_in: 1800,
        token_type: 'Bearer',
      }),
    );

    const tokens = await service.refreshAccessToken('refresh-1');

    expect(tokens.accessToken).toBe('access-2');
    expect(tokens.refreshToken).toBe('refresh-1');
  });

  it('builds frontend redirect with query params', () => {
    const redirect = service.buildFrontendRedirect({
      googleClassroom: 'connected',
      schoolId: 'school-1',
    });

    expect(redirect).toBe(
      'http://localhost:5173/google-classroom?googleClassroom=connected&schoolId=school-1',
    );
  });

  it('falls back to Classroom userProfiles/me when OIDC userinfo has no email', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'classroom-user-1',
          emailAddress: 'gc-teacher1@curionn.com',
        }),
      );

    const profile = await service.resolveConnectedAccountProfile('access-token');

    expect(profile).toEqual({
      sub: 'classroom-user-1',
      email: 'gc-teacher1@curionn.com',
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://classroom.googleapis.com/v1/userProfiles/me',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('trims Classroom fallback email', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sub: 'oidc-1', email: '  ' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'classroom-user-1',
          emailAddress: '  gc-teacher1@curionn.com  ',
        }),
      );

    const profile = await service.resolveConnectedAccountProfile('access-token');

    expect(profile.email).toBe('gc-teacher1@curionn.com');
  });

  it('revokes refresh then access tokens at Google', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}));

    await service.revokeGrantedTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/revoke',
      expect.objectContaining({
        method: 'POST',
        body: 'token=refresh-1',
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://oauth2.googleapis.com/revoke',
      expect.objectContaining({
        method: 'POST',
        body: 'token=access-1',
      }),
    );
  });
});
