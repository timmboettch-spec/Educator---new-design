import { BadRequestException } from '@nestjs/common';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsConfigStatus, LmsToolType, LmsType } from 'src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/database/entities';

function mockCanvasApiFetch(
  fetchMock: jest.Mock,
  opts: {
    clientId: string;
    deploymentId: string;
    tokenValid?: boolean;
    toolsMatch?: boolean;
  },
): void {
  const tokenValid = opts.tokenValid !== false;
  const toolsMatch = opts.toolsMatch !== false;
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('/external_tools')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify(
            toolsMatch
              ? [{ developer_key_id: opts.clientId, deployment_id: opts.deploymentId }]
              : [{ developer_key_id: 'other-client', deployment_id: 'other-deploy' }],
          ),
      };
    }
    return {
      ok: tokenValid,
      status: tokenValid ? 200 : 401,
      text: async () =>
        tokenValid
          ? JSON.stringify({ id: 1 })
          : JSON.stringify({ errors: [{ message: 'Invalid access token.' }] }),
      json: async () => ({ id: 1 }),
    };
  });
}

describe('LmsConfigService.upsertConfig verify-before-save', () => {
  let service: LmsConfigService;
  let configRepo: { findOne: jest.Mock; create: jest.Mock; deleteById: jest.Mock };
  let schoolsRepo: { update: jest.Mock };
  let lmsAuthService: { getAccessToken: jest.Mock };
  let fetchMock: jest.Mock;

  const existing = {
    id: 'cfg-1',
    schoolId: 'school-1',
    toolType: LmsToolType.EDUCATOR,
    lmsType: LmsType.CANVAS,
    issuer: 'https://canvas.instructure.com',
    clientId: 'client-1',
    deploymentId: 'deploy-1',
    authEndpoint: 'https://sso.canvaslms.com/login/oauth2/auth',
    tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
    jwksUrl: 'https://sso.canvaslms.com/login/oauth2/jwks',
    platformPrivateKeyPem: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
    platformKeyId: 'kid-1',
    lmsBaseUrl: 'https://myschool.instructure.com',
    lmsApiToken: null,
    status: LmsConfigStatus.ACTIVE,
    sharePii: true,
  } as LmsSchoolConfig;

  const dto = {
    schoolId: 'school-1',
    lmsType: LmsType.CANVAS,
    toolType: LmsToolType.EDUCATOR,
    issuer: 'https://canvas.instructure.com',
    clientId: 'client-1',
    deploymentId: 'deploy-1',
    authEndpoint: 'https://sso.canvaslms.com/login/oauth2/auth',
    tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
    jwksUrl: 'https://sso.canvaslms.com/login/oauth2/jwks',
    lmsBaseUrl: 'https://myschool.instructure.com',
    lmsApiToken: 'canvas-api-token',
  };

  beforeEach(() => {
    configRepo = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(async (data) => ({ ...existing, ...data })),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };
    schoolsRepo = { update: jest.fn().mockResolvedValue(undefined) };
    lmsAuthService = {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    service = new LmsConfigService(
      configRepo as never,
      schoolsRepo as never,
      { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
      lmsAuthService as never,
      {
        fetch: (_integration: unknown, url: string, init?: RequestInit) => fetchMock(url, init),
      } as never,
    );
    fetchMock = jest.fn();
    mockCanvasApiFetch(fetchMock, { clientId: 'client-1', deploymentId: 'deploy-1' });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saves when OAuth and Deployment ID verification succeed', async () => {
    const saved = await service.upsertConfig(dto);

    expect(lmsAuthService.getAccessToken).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/external_tools'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer canvas-api-token' }),
      }),
    );
    expect(configRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-1', status: LmsConfigStatus.ACTIVE }),
    );
    expect(saved.clientId).toBe('client-1');
    expect(schoolsRepo.update).toHaveBeenCalledWith('school-1', { lms_enabled: true });
  });

  it('does not save when OAuth fails', async () => {
    lmsAuthService.getAccessToken.mockRejectedValue(new Error('invalid_client'));

    await expect(service.upsertConfig(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(configRepo.create).not.toHaveBeenCalled();
    expect(schoolsRepo.update).not.toHaveBeenCalled();
  });

  it('saves without a Canvas API token when OAuth passes', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '' });

    await service.upsertConfig({ ...dto, lmsApiToken: undefined });

    expect(lmsAuthService.getAccessToken).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/external_tools'),
      expect.anything(),
    );
    expect(configRepo.create).toHaveBeenCalledTimes(1);
  });

  it('saves Moodle without a web service token when OAuth passes', async () => {
    configRepo.findOne.mockResolvedValue({
      ...existing,
      lmsType: LmsType.MOODLE,
      issuer: 'https://moodle.test',
      lmsBaseUrl: 'https://moodle.test',
    });

    await service.upsertConfig({
      schoolId: 'school-1',
      lmsType: LmsType.MOODLE,
      toolType: LmsToolType.EDUCATOR,
      issuer: 'https://moodle.test',
      clientId: 'client-1',
      authEndpoint: 'https://moodle.test/mod/lti/auth.php',
      tokenEndpoint: 'https://moodle.test/mod/lti/token.php',
      jwksUrl: 'https://moodle.test/mod/lti/certs.php',
      lmsBaseUrl: 'https://moodle.test',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(configRepo.create).toHaveBeenCalledTimes(1);
    expect(schoolsRepo.update).toHaveBeenCalledWith('school-1', { lms_enabled: true });
  });

  it('new school: saves as PENDING so keys are published, then activates after verifying', async () => {
    configRepo.findOne.mockResolvedValue(null);
    configRepo.create.mockImplementation(async (data) => ({ id: 'new-cfg', ...data }));
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '' });

    const saved = await service.upsertConfig({ ...dto, lmsApiToken: undefined });

    expect(configRepo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: LmsConfigStatus.PENDING }),
    );
    expect(configRepo.create.mock.invocationCallOrder[0]).toBeLessThan(
      lmsAuthService.getAccessToken.mock.invocationCallOrder[0],
    );
    expect(configRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'new-cfg', status: LmsConfigStatus.ACTIVE }),
    );
    expect(saved.id).toBe('new-cfg');
    expect(saved.status).toBe(LmsConfigStatus.ACTIVE);
    expect(configRepo.deleteById).not.toHaveBeenCalled();
    expect(schoolsRepo.update).toHaveBeenCalledWith('school-1', { lms_enabled: true });
  });

  it('new school: deletes the saved row when verification fails', async () => {
    configRepo.findOne.mockResolvedValue(null);
    configRepo.create.mockImplementation(async (data) => ({ id: 'new-cfg', ...data }));
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '' });
    lmsAuthService.getAccessToken.mockRejectedValue(new Error('invalid_client'));

    await expect(service.upsertConfig({ ...dto, lmsApiToken: undefined })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(configRepo.create).toHaveBeenCalledTimes(1);
    expect(configRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: LmsConfigStatus.PENDING }),
    );
    expect(configRepo.deleteById).toHaveBeenCalledWith('new-cfg');
    expect(schoolsRepo.update).not.toHaveBeenCalled();
  });

  it('restores the previous row when new keys fail verification', async () => {
    configRepo.findOne.mockResolvedValue({ ...existing, status: LmsConfigStatus.INACTIVE });
    lmsAuthService.getAccessToken.mockRejectedValue(new Error('invalid_client'));

    await expect(service.upsertConfig(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(configRepo.create).toHaveBeenCalledTimes(2);
    expect(configRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cfg-1', status: LmsConfigStatus.INACTIVE }),
    );
    expect(configRepo.deleteById).not.toHaveBeenCalled();
  });

  it('does not save when Canvas API token is invalid', async () => {
    mockCanvasApiFetch(fetchMock, {
      clientId: 'client-1',
      deploymentId: 'deploy-1',
      tokenValid: false,
    });

    await expect(service.upsertConfig(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('does not save when Deployment ID does not match Client ID on Canvas', async () => {
    mockCanvasApiFetch(fetchMock, {
      clientId: 'client-1',
      deploymentId: 'deploy-1',
      toolsMatch: false,
    });

    await expect(service.upsertConfig(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(configRepo.create).not.toHaveBeenCalled();
  });

  it('saves without a Canvas Deployment ID (checked at launch instead)', async () => {
    configRepo.findOne.mockResolvedValue({ ...existing, deploymentId: null });

    await service.upsertConfig({ ...dto, deploymentId: undefined });

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/external_tools'),
      expect.anything(),
    );
    expect(configRepo.create).toHaveBeenCalledTimes(1);
  });
});
