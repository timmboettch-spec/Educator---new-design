import { BadRequestException } from '@nestjs/common';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import {
  GOOGLE_CLASSROOM_DEFAULT_SCOPES,
  GoogleConnectionStatus,
  GoogleConstants,
} from '../../../src/google/google.constants';
import { GoogleOAuthService } from '../../../src/google/google-oauth.service';
import { GoogleSchoolConnectionRepository } from '../../../src/database/repositories';
import { LoggerService } from '../../../src/common/services';
import { GoogleSchoolConnection } from '../../../src/database/entities';

const FULL_CLASSROOM_SCOPES = GOOGLE_CLASSROOM_DEFAULT_SCOPES.join(' ');

describe('GoogleConnectionService', () => {
  const connectionRepo = {
    findBySchoolId: jest.fn(),
    findBySchoolAndEducator: jest.fn(),
    deleteBySchoolId: jest.fn(),
    deleteBySchoolAndEducator: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<GoogleSchoolConnectionRepository>;

  const educatorRepo = {
    findOne: jest.fn(),
  };

  const schoolsRepo = {
    findOne: jest.fn(),
  };

  const oauthService = {
    exchangeCodeForTokens: jest.fn(),
    fetchUserInfo: jest.fn(),
    resolveConnectedAccountProfile: jest.fn(),
    fetchClassroomUserProfile: jest.fn(),
    refreshAccessToken: jest.fn(),
    revokeGrantedTokens: jest.fn().mockResolvedValue(undefined),
    getConfiguredScopes: jest.fn().mockReturnValue([...GOOGLE_CLASSROOM_DEFAULT_SCOPES]),
    buildAuthorizationUrl: jest.fn().mockReturnValue('https://accounts.google.com/auth'),
  } as unknown as jest.Mocked<GoogleOAuthService>;

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  let service: GoogleConnectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    oauthService.revokeGrantedTokens.mockResolvedValue(undefined);
    educatorRepo.findOne.mockResolvedValue({
      id: 'educator-1',
      userRole: { user: { id: 'user-1', email: 'teacher@curionn.com' } },
    });
    schoolsRepo.findOne.mockResolvedValue({
      id: 'school-1',
      google_classroom_enabled: true,
    });
    service = new GoogleConnectionService(
      connectionRepo,
      educatorRepo as never,
      schoolsRepo as never,
      oauthService,
      logger,
    );
  });

  it('sanitizes status without exposing tokens', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue({
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      googleAccountEmail: 'teacher@curionn.com',
      googleAccountId: 'sub-1',
      scopes: 'scope-a',
      tokenExpiresAt: new Date('2026-09-03T12:00:00.000Z'),
      connectedByEducatorId: 'educator-1',
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    } as GoogleSchoolConnection);

    const status = await service.getStatus('school-1', 'educator-1');

    expect(connectionRepo.findBySchoolAndEducator).toHaveBeenCalledWith('school-1', 'educator-1');
    expect(status).toEqual({
      connected: true,
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      googleAccountEmail: 'teacher@curionn.com',
      googleAccountId: 'sub-1',
      scopes: 'scope-a',
      tokenExpiresAt: '2026-09-03T12:00:00.000Z',
      connectedByEducatorId: 'educator-1',
    });
    expect(JSON.stringify(status)).not.toContain('secret-access');
    expect(JSON.stringify(status)).not.toContain('secret-refresh');
  });

  it('upserts a new connection after code exchange', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'teacher@curionn.com',
    });
    connectionRepo.create.mockImplementation((data) =>
      Promise.resolve(data as GoogleSchoolConnection),
    );

    const connection = await service.completeConnect({
      schoolId: 'school-1',
      educatorId: 'educator-1',
      code: 'auth-code',
    });

    expect(oauthService.resolveConnectedAccountProfile).toHaveBeenCalledWith('access-1');
    expect(connectionRepo.findBySchoolAndEducator).toHaveBeenCalledWith('school-1', 'educator-1');
    expect(connectionRepo.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        schoolId: 'school-1',
        connectedByEducatorId: 'educator-1',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        googleAccountEmail: 'teacher@curionn.com',
        googleAccountId: 'sub-1',
        status: GoogleConnectionStatus.ACTIVE,
      }),
    );
    expect(connection.accessToken).toBe('access-1');
  });

  it('rejects connect when Google Classroom is disabled for the school', async () => {
    schoolsRepo.findOne.mockResolvedValue({
      id: 'school-1',
      google_classroom_enabled: false,
    });

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      }),
    ).rejects.toThrow(GoogleConstants.MESSAGES.FEATURE_DISABLED);

    expect(oauthService.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(connectionRepo.create).not.toHaveBeenCalled();
  });

  it('rejects connect when required Classroom scopes were declined', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: 'openid email',
      tokenType: 'Bearer',
    });

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      }),
    ).rejects.toThrow(GoogleConstants.MESSAGES.SCOPES_INCOMPLETE);

    expect(connectionRepo.create).not.toHaveBeenCalled();
    expect(oauthService.resolveConnectedAccountProfile).not.toHaveBeenCalled();
  });

  it('marks existing ACTIVE connection ERROR when reconnect grants partial scopes', async () => {
    const existing = {
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      accessToken: 'old',
      refreshToken: 'refresh-1',
    } as GoogleSchoolConnection;
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(existing);
    connectionRepo.save.mockImplementation((row) => Promise.resolve(row as GoogleSchoolConnection));
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: 'openid email',
      tokenType: 'Bearer',
    });

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      }),
    ).rejects.toThrow(GoogleConstants.MESSAGES.SCOPES_INCOMPLETE);

    expect(existing.status).toBe(GoogleConnectionStatus.ERROR);
    expect(connectionRepo.save).toHaveBeenCalledWith(existing);
  });

  it('refreshes expired access tokens', async () => {
    const existing = {
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      accessToken: 'old-access',
      refreshToken: 'refresh-1',
      tokenExpiresAt: new Date(Date.now() - 1_000),
      scopes: 'scope-a',
    } as GoogleSchoolConnection;

    connectionRepo.findBySchoolAndEducator.mockResolvedValue(existing);
    oauthService.refreshAccessToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    connectionRepo.save.mockImplementation((entity) => Promise.resolve(entity));

    await expect(service.getValidAccessToken('school-1', 'educator-1')).resolves.toBe('new-access');
    expect(existing.accessToken).toBe('new-access');
    expect(existing.status).toBe(GoogleConnectionStatus.ACTIVE);
  });

  it('marks connection error when refresh token is missing', async () => {
    const existing = {
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      accessToken: 'old-access',
      refreshToken: null,
      tokenExpiresAt: new Date(Date.now() - 1_000),
      scopes: 'scope-a',
    } as GoogleSchoolConnection;

    connectionRepo.findBySchoolAndEducator.mockResolvedValue(existing);
    connectionRepo.save.mockImplementation((entity) => Promise.resolve(entity));

    await expect(service.getValidAccessToken('school-1', 'educator-1')).rejects.toThrow(
      GoogleConstants.MESSAGES.REAUTH_REQUIRED,
    );
    expect(existing.status).toBe(GoogleConnectionStatus.ERROR);
  });

  it('requires refresh token on first connect', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: null,
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'teacher@curionn.com',
    });

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects connect when Google email does not match RW educator email', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'other@example.com',
    });
    educatorRepo.findOne.mockResolvedValue({
      id: 'educator-1',
      userRole: { user: { id: 'user-1', email: 'teacher@curionn.com' } },
    });

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      }),
    ).rejects.toMatchObject({
      message: GoogleConstants.MESSAGES.GOOGLE_EMAIL_MISMATCH,
    });
    expect(connectionRepo.create).not.toHaveBeenCalled();
    expect(connectionRepo.save).not.toHaveBeenCalled();
  });

  it('accepts connect when Google email matches RW educator email (case-insensitive)', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'Teacher@Curionn.com',
    });
    educatorRepo.findOne.mockResolvedValue({
      id: 'educator-1',
      userRole: { user: { id: 'user-1', email: '  teacher@curionn.com ' } },
    });
    connectionRepo.create.mockImplementation((data) =>
      Promise.resolve(data as GoogleSchoolConnection),
    );

    const connection = await service.completeConnect({
      schoolId: 'school-1',
      educatorId: 'educator-1',
      code: 'auth-code',
    });

    expect(connection.googleAccountEmail).toBe('Teacher@Curionn.com');
    expect(connectionRepo.create).toHaveBeenCalled();
  });

  it('rejects connect when educator record is not found', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'admin@rwthrive.com',
    });
    educatorRepo.findOne.mockResolvedValue(null);

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'admin-1',
        code: 'auth-code',
      }),
    ).rejects.toMatchObject({
      message: GoogleConstants.MESSAGES.GOOGLE_EMAIL_MISMATCH,
    });
    expect(connectionRepo.create).not.toHaveBeenCalled();
  });

  it('keeps the existing refresh token when Google omits it on reconnect', async () => {
    const existing = {
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      accessToken: 'old-access',
      refreshToken: 'existing-refresh',
      scopes: 'scope-a',
      googleAccountEmail: 'teacher@curionn.com',
      googleAccountId: 'sub-1',
    } as GoogleSchoolConnection;

    connectionRepo.findBySchoolAndEducator.mockResolvedValue(existing);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: null,
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'teacher@curionn.com',
    });
    connectionRepo.save.mockImplementation((entity) => Promise.resolve(entity));

    const connection = await service.completeConnect({
      schoolId: 'school-1',
      educatorId: 'educator-1',
      code: 'auth-code',
    });

    expect(connection.refreshToken).toBe('existing-refresh');
    expect(connection.accessToken).toBe('new-access');
  });

  it('rejects connect when Google profile email is missing', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({ sub: null, email: null });

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      }),
    ).rejects.toMatchObject({
      message: GoogleConstants.MESSAGES.GOOGLE_EMAIL_MISMATCH,
    });
    expect(connectionRepo.create).not.toHaveBeenCalled();
  });

  it('rejects connect when Google profile sub is missing', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: null,
      email: 'teacher@curionn.com',
    });

    await expect(
      service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      }),
    ).rejects.toMatchObject({
      message: GoogleConstants.MESSAGES.GOOGLE_ACCOUNT_ID_REQUIRED,
    });
    expect(connectionRepo.create).not.toHaveBeenCalled();
  });

  it('hydrates missing googleAccountId even when email is already present', async () => {
    const existing = {
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      googleAccountEmail: 'teacher@curionn.com',
      googleAccountId: null,
      scopes: 'scope-a',
      tokenExpiresAt: new Date(Date.now() + 120_000),
      connectedByEducatorId: 'educator-1',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    } as GoogleSchoolConnection;

    connectionRepo.findBySchoolAndEducator.mockResolvedValue(existing);
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'teacher@curionn.com',
    });
    connectionRepo.save.mockImplementation(async (row) => row as GoogleSchoolConnection);

    const status = await service.getStatus('school-1', 'educator-1');

    expect(oauthService.resolveConnectedAccountProfile).toHaveBeenCalledWith('access-1');
    expect(status.googleAccountId).toBe('sub-1');
  });

  it('logs that the educator must reconnect if persist fails after token exchange', async () => {
    jest.useFakeTimers();
    connectionRepo.findBySchoolAndEducator.mockResolvedValue(null);
    oauthService.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: FULL_CLASSROOM_SCOPES,
      tokenType: 'Bearer',
    });
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'teacher@curionn.com',
    });
    connectionRepo.create.mockRejectedValue(new Error('db unavailable'));

    try {
      const pending = service.completeConnect({
        schoolId: 'school-1',
        educatorId: 'educator-1',
        code: 'auth-code',
      });
      const expectation = expect(pending).rejects.toThrow('db unavailable');
      await jest.runAllTimersAsync();
      await expectation;
    } finally {
      jest.useRealTimers();
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Authorization code is consumed; educator must reconnect'),
    );
  });

  it('revokes Google tokens then deletes the educator connection row', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue({
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    } as GoogleSchoolConnection);
    connectionRepo.deleteBySchoolAndEducator.mockResolvedValue(true);

    const status = await service.disconnect('school-1', 'educator-1');

    expect(oauthService.revokeGrantedTokens).toHaveBeenCalledWith({
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    });
    expect(connectionRepo.deleteBySchoolAndEducator).toHaveBeenCalledWith(
      'school-1',
      'educator-1',
    );
    expect(status).toEqual({
      connected: false,
      schoolId: 'school-1',
      status: null,
      googleAccountEmail: null,
      googleAccountId: null,
      scopes: null,
      tokenExpiresAt: null,
      connectedByEducatorId: null,
    });
  });

  it('still deletes the connection when Google revoke fails', async () => {
    connectionRepo.findBySchoolAndEducator.mockResolvedValue({
      schoolId: 'school-1',
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    } as GoogleSchoolConnection);
    oauthService.revokeGrantedTokens.mockRejectedValue(new Error('revoke failed'));
    connectionRepo.deleteBySchoolAndEducator.mockResolvedValue(true);

    await expect(service.disconnect('school-1', 'educator-1')).resolves.toMatchObject({
      connected: false,
      schoolId: 'school-1',
    });
    expect(connectionRepo.deleteBySchoolAndEducator).toHaveBeenCalledWith(
      'school-1',
      'educator-1',
    );
  });

  it('hydrates missing Google account email using the latest saved connection', async () => {
    const existing = {
      schoolId: 'school-1',
      status: GoogleConnectionStatus.ACTIVE,
      googleAccountEmail: null,
      googleAccountId: null,
      scopes: 'scope-a',
      tokenExpiresAt: new Date(Date.now() + 120_000),
      connectedByEducatorId: 'educator-1',
      accessToken: 'old-access',
      refreshToken: 'refresh-1',
    } as GoogleSchoolConnection;
    const afterRefresh = {
      ...existing,
      accessToken: 'new-access',
    } as GoogleSchoolConnection;

    connectionRepo.findBySchoolAndEducator
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(afterRefresh);
    oauthService.resolveConnectedAccountProfile.mockResolvedValue({
      sub: 'sub-1',
      email: 'gc-teacher1@curionn.com',
    });
    connectionRepo.save.mockImplementation(async (row) => row as GoogleSchoolConnection);

    const status = await service.getStatus('school-1', 'educator-1');

    expect(oauthService.resolveConnectedAccountProfile).toHaveBeenCalledWith('old-access');
    expect(connectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'new-access',
        googleAccountEmail: 'gc-teacher1@curionn.com',
        googleAccountId: 'sub-1',
      }),
    );
    expect(status.googleAccountEmail).toBe('gc-teacher1@curionn.com');
    expect(status.connected).toBe(true);
  });
});
