import { GatewayTimeoutException } from '@nestjs/common';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsConfigStatus, LmsToolType, LmsType } from 'src/common/enums/lms.enum';
import { LmsConstants } from 'src/lms/lms.constants';
import { LmsSchoolConfig } from 'src/database/entities';

describe('LmsConfigService.testConfig', () => {
  let service: LmsConfigService;
  let configRepo: { findOne: jest.Mock; create: jest.Mock };
  let lmsAuthService: { getAccessToken: jest.Mock };
  let fetchMock: jest.Mock;
  const savedConfig = {
    id: 'cfg-1',
    schoolId: 'school-1',
    toolType: LmsToolType.EDUCATOR,
    lmsType: LmsType.MOODLE,
    issuer: 'https://moodle.test',
    clientId: 'client-1',
    authEndpoint: 'https://moodle.test/auth',
    tokenEndpoint: 'https://moodle.test/token',
    jwksUrl: 'https://moodle.test/jwks',
    platformPrivateKeyPem: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
    platformKeyId: 'kid-1',
    lmsBaseUrl: 'https://moodle.test',
    lmsApiToken: 'saved-ws-token',
    status: LmsConfigStatus.ACTIVE,
  } as LmsSchoolConfig;

  beforeEach(() => {
    configRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    lmsAuthService = {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    service = new LmsConfigService(
      configRepo as never,
      {} as never,
      { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
      lmsAuthService as never,
      {
        fetch: (_integration: unknown, url: string, init?: RequestInit) => fetchMock(url, init),
      } as never,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns success when Moodle OAuth and API ping succeed', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ sitename: 'Test Moodle' }),
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
      clientId: 'client-1',
      tokenEndpoint: 'https://moodle.test/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://moodle.test',
      lmsApiToken: 'ws-token',
    });

    expect(result.success).toBe(true);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBe(true);
    expect(result.message).toBe(LmsConstants.MESSAGES.CONFIG_TEST_SUCCESS);
    expect(lmsAuthService.getAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-1' }),
      { bypassCache: true },
    );
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('returns failure when Canvas OAuth fails', async () => {
    configRepo.findOne.mockResolvedValue(null);
    lmsAuthService.getAccessToken.mockRejectedValue(new Error('token rejected'));
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/external_tools')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              { developer_key_id: 'canvas-client', deployment_id: '215:abc123def456' },
            ]),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 1 }),
        json: async () => ({ id: 1 }),
      };
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://myschool.instructure.com',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).toBe(false);
    expect(result.message).not.toMatch(/<!DOCTYPE|<html|<style/i);
    expect(result.message.length).toBeLessThan(220);
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('returns a short user-safe message when OAuth returns HTML 404', async () => {
    configRepo.findOne.mockResolvedValue(null);
    lmsAuthService.getAccessToken.mockRejectedValue(
      new Error(
        'LMS token request failed (404): <!DOCTYPE html><html><style>body{}</style><h1>404 Not Found</h1></html>',
      ),
    );
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/external_tools')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              { developer_key_id: 'canvas-client', deployment_id: '215:abc123def456' },
            ]),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 1 }),
        json: async () => ({ id: 1 }),
      };
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://myschool.instructure.com',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(false);
    expect(result.message).not.toMatch(/<!DOCTYPE|<html|<style/i);
    expect(result.message.toLowerCase()).toMatch(/oauth|failed|404|not found/);
  });

  it('returns failure when Canvas issuer is a typo / invalid hosted URL', async () => {
    configRepo.findOne.mockResolvedValue(null);

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvass.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://wthrive.instructure.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://wthrive.instructure.com',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).toBe(false);
    expect(result.message).toMatch(/Invalid Canvas Issuer URL/i);
    expect(lmsAuthService.getAccessToken).not.toHaveBeenCalled();
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('passes on OAuth + base URL probe when Canvas API token is omitted', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '' });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://myschool.instructure.com',
    });

    expect(result.success).toBe(true);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBe(true);
    expect(result.message).toBe(
      LmsConstants.MESSAGES.CONFIG_TEST_SUCCESS_CANVAS_DEPLOYMENT_AT_LAUNCH,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myschool.instructure.com/api/v1/users/self',
      expect.not.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.anything() }),
      }),
    );
  });

  it('returns failure when Canvas base URL / API is unreachable', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND wthrivesdsd.instructure.com'));

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://wthrivesdsd.instructure.com',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBe(false);
    expect(result.message.toLowerCase()).toMatch(/unreachable|api check failed|enotfound|failed/);
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('returns success when Canvas OAuth, API token, and Deployment ID match', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/external_tools')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              { developer_key_id: 'canvas-client', deployment_id: '215:abc123def456' },
            ]),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 1 }),
        json: async () => ({ id: 1 }),
      };
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://wthrive.instructure.com',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(true);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/external_tools'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer canvas-key' }),
      }),
    );
  });

  it('returns failure when Moodle API ping fails', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ exception: 'invalidtoken', message: 'Invalid token' }),
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
      clientId: 'client-1',
      tokenEndpoint: 'https://moodle.test/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://moodle.test',
      lmsApiToken: 'bad-token',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBe(false);
    expect(result.message).not.toMatch(/<!DOCTYPE|<html/i);
    expect(result.message.toLowerCase()).toMatch(
      /invalid token|api check failed|connection failed/,
    );
  });

  it('returns success for Canvas API ping with token and matching Deployment ID', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/external_tools')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              { developer_key_id: 'canvas-client', deployment_id: '215:abc123def456' },
            ]),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: 'Admin' }),
        text: async () => JSON.stringify({ id: 1 }),
      };
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.test',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://canvas.test/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://canvas.test',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(true);
    expect(result.apiOk).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://canvas.test/api/v1/users/self',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer canvas-key' }),
      }),
    );
  });

  it('matches Canvas Deployment ID when Client ID is larger than JS safe integer', async () => {
    configRepo.findOne.mockResolvedValue(null);
    const largeClientId = '130420000000000286';
    const deploymentId = '215:030d15f44d80b7262192e13b4a2629d3cb70704b';
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/external_tools')) {
        // Simulate Canvas JSON number (would lose precision if parsed naively)
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            `[{"name":"RW","developer_key_id":${largeClientId},"deployment_id":"${deploymentId}"}]`,
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 1 }),
        json: async () => ({ id: 1 }),
      };
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: largeClientId,
      deploymentId,
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://myschool.instructure.com',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(true);
    expect(result.apiOk).toBe(true);
  });

  it('fails when Deployment ID does not match Client ID on Canvas account', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/external_tools')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              { developer_key_id: 'canvas-client', deployment_id: 'other-deployment' },
            ]),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 1 }),
        json: async () => ({ id: 1 }),
      };
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:wrong-deployment',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://myschool.instructure.com',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(false);
    expect(result.apiOk).toBe(false);
    expect(result.message).toMatch(/Deployment ID was not found|API check failed/i);
  });

  it('passes without Canvas Deployment ID (checked at launch instead)', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '' });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://myschool.instructure.com',
    });

    expect(result.success).toBe(true);
    expect(result.oauthOk).toBe(true);
    expect(lmsAuthService.getAccessToken).toHaveBeenCalled();
  });

  it('fails when Canvas API token is provided but invalid', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ errors: [{ message: 'Invalid access token.' }] }),
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'canvas-client',
      deploymentId: '215:abc123def456',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://myschool.instructure.com',
      lmsApiToken: 'bad-token',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBe(false);
    expect(result.message.toLowerCase()).toMatch(/api token|api check failed|invalid|401/);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myschool.instructure.com/api/v1/users/self',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer bad-token' }),
      }),
    );
  });

  it('merges saved secrets when body omits token and private key', async () => {
    configRepo.findOne.mockResolvedValue(savedConfig);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ sitename: 'Saved Moodle' }),
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
      clientId: 'client-1',
      tokenEndpoint: 'https://moodle.test/token',
    });

    expect(result.success).toBe(true);
    expect(lmsAuthService.getAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        platformPrivateKeyPem: expect.stringContaining('PRIVATE KEY'),
        lmsApiToken: 'saved-ws-token',
      }),
      { bypassCache: true },
    );
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('returns incomplete when neither OAuth nor API credentials are available', async () => {
    configRepo.findOne.mockResolvedValue(null);

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(LmsConstants.MESSAGES.CONFIG_TEST_MOODLE_BASE_REQUIRED);
    expect(lmsAuthService.getAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes on OAuth alone when Moodle web service token is omitted', async () => {
    configRepo.findOne.mockResolvedValue(null);

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
      clientId: 'client-1',
      tokenEndpoint: 'https://moodle.test/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://moodle.test',
    });

    expect(result.success).toBe(true);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails when Moodle OAuth fails and no web service token is given', async () => {
    configRepo.findOne.mockResolvedValue(null);
    lmsAuthService.getAccessToken.mockRejectedValue(new Error('invalid_client'));

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
      clientId: 'wrong-client',
      tokenEndpoint: 'https://moodle.test/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://moodle.test',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).toBe(false);
  });

  it('asks to save first when the school has no signing keys yet', async () => {
    configRepo.findOne.mockResolvedValue(null);

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
      clientId: 'client-1',
      tokenEndpoint: 'https://moodle.test/token',
      lmsBaseUrl: 'https://moodle.test',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(LmsConstants.MESSAGES.CONFIG_TEST_KEYS_PENDING);
    expect(lmsAuthService.getAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails when Moodle web service token is invalid', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ exception: 'invalidtoken', message: 'Invalid token' }),
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.MOODLE,
      clientId: 'client-1',
      tokenEndpoint: 'https://moodle.test/token',
      platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
      platformKeyId: 'kid-1',
      lmsBaseUrl: 'https://moodle.test',
      lmsApiToken: 'bad-ws-token',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).toBe(true);
    expect(result.apiOk).toBe(false);
    expect(result.message.toLowerCase()).toMatch(
      /invalid token|api check failed|connection failed/,
    );
  });

  it('fails when Client ID is set but OAuth cannot run (API alone must not pass)', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/external_tools')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify([
              { developer_key_id: 'wrong-client-id', deployment_id: '215:abc123def456' },
            ]),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 1 }),
        json: async () => ({ id: 1 }),
      };
    });

    const result = await service.testConfig('school-1', {
      lmsType: LmsType.CANVAS,
      issuer: 'https://canvas.instructure.com',
      clientId: 'wrong-client-id',
      deploymentId: '215:abc123def456',
      // No tokenEndpoint / platform keys → OAuth skipped
      lmsBaseUrl: 'https://myschool.instructure.com',
      lmsApiToken: 'canvas-key',
    });

    expect(result.success).toBe(false);
    expect(result.oauthOk).not.toBe(true);
    expect(result.message).toBe(LmsConstants.MESSAGES.CONFIG_TEST_KEYS_PENDING);
    expect(lmsAuthService.getAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('propagates an outbound timeout as a 504 instead of a failed test result', async () => {
    configRepo.findOne.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new GatewayTimeoutException('error.COMMON.UPSTREAM_TIMEOUT'));

    await expect(
      service.testConfig('school-1', {
        lmsType: LmsType.MOODLE,
        clientId: 'client-1',
        tokenEndpoint: 'https://moodle.test/token',
        platformPrivateKeyPem: savedConfig.platformPrivateKeyPem,
        platformKeyId: 'kid-1',
        lmsBaseUrl: 'https://moodle.test',
        lmsApiToken: 'ws-token',
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
  });
});
