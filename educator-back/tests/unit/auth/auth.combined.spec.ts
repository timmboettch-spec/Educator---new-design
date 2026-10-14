import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { AuthController } from '../../../src/auth/auth.controller';
import { AuthService } from '../../../src/auth/auth.service';
import type { ICurrentUser } from 'src/common/interfaces';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../../src/users/users.service';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { SalesOrderLinesService } from '../../../src/sales-order-lines/sales-order-lines.service';
import { RedemptionsService } from '../../../src/users/redemptions.service';
import { CsrfService } from '../../../src/csrf/csrf.service';
import { TokenService } from '../../../src/common/services';
import { AzureBlobService } from '../../../src/common/services';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { LoggerService } from '../../../src/common/services';
import { ForgotPasswordRateLimiterService } from '../../../src/auth/services/forgot-password-rate-limiter.service';
import { ForgotPasswordThrottleGuard } from '../../../src/auth/guards/forgot-password-throttle.guard';
import { DataSource } from 'typeorm';
import { Educator } from 'src/database/entities';
import { EDUCATOR_USER_SELECT } from 'src/common/utils/educator-identity.util';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  ROLE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
  USER_TOKEN_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
describe('Auth (Controller + Service)', () => {
  let controller: AuthController;
  let service: AuthService;

  const usersService = { findByEmail: jest.fn(), createUser: jest.fn(), updateByEmail: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue('1d') };
  const mailerService = { sendMail: jest.fn().mockResolvedValue({}) };
  const userRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    findByIdWithPassword: jest.fn(),
  };
  const educatorRepo: {
    findOne: jest.Mock<Promise<Educator | null>, unknown[]>;
    create: jest.Mock<Promise<Educator>, [Partial<Educator>]>;
    update: jest.Mock<Promise<number>, unknown[]>;
  } = {
    findOne: jest.fn<Promise<Educator | null>, unknown[]>(),
    create: jest.fn<Promise<Educator>, [Partial<Educator>]>(),
    update: jest.fn<Promise<number>, unknown[]>().mockResolvedValue(1),
  };
  const notificationsGateway = { notifyAdminEducatorStatusUpdated: jest.fn() };
  const notificationsServiceMock = {
    isPreferenceEnabled: jest.fn().mockResolvedValue(true),
    getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
  };
  const salesOrderLinesService = { getSalesOrderByRedeemCode: jest.fn() };
  const csrfService = {
    generateToken: jest.fn().mockReturnValue('mock-csrf-token'),
    storeToken: jest.fn().mockResolvedValue(undefined),
  };
  const redemptionsService = {
    findByUserAndRedeemCode: jest.fn(),
    redeemAndActivateUser: jest.fn(),
  };
  const tokenService = {
    generateTokens: jest.fn().mockReturnValue({ access_token: 'mock-token', expires_in: 86400 }),
    setAuthCookies: jest.fn(),
    clearAuthCookies: jest.fn(),
    verifyToken: jest.fn(),
    blackListToken: jest.fn().mockResolvedValue(undefined),
    isBlackListed: jest.fn().mockResolvedValue(false),
  };
  const educatorSessionService = {
    invalidateEducator: jest.fn().mockResolvedValue(undefined),
    isTokenInvalidated: jest.fn().mockResolvedValue(false),
    evictCache: jest.fn(),
  };
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: MailService, useValue: mailerService },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        {
          provide: EDUCATOR_SCHOOL_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        { provide: SCHOOLS_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: ROLE_REPOSITORY, useValue: { findOne: jest.fn(), findBySlug: jest.fn() } },
        { provide: STUDENT_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: USER_REPOSITORY, useValue: userRepo },
        {
          provide: USER_TOKEN_REPOSITORY,
          useValue: {
            findActiveByPurposeAndUserId: jest.fn(),
            upsertActive: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: USER_ROLE_REPOSITORY,
          useValue: {
            activate: jest.fn(),
            create: jest.fn(),
            findByUserId: jest.fn(),
            findByUserAndRoleSlug: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: DISTRICT_ADMIN_REPOSITORY,
          useValue: { findByUserRoleId: jest.fn(), updateByUserRoleId: jest.fn() },
        },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
        { provide: SalesOrderLinesService, useValue: salesOrderLinesService },
        { provide: CsrfService, useValue: csrfService },
        { provide: RedemptionsService, useValue: redemptionsService },
        { provide: TokenService, useValue: tokenService },
        { provide: EducatorSessionService, useValue: educatorSessionService },
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]), createQueryRunner: jest.fn() },
        },
        {
          provide: AzureBlobService,
          useValue: { uploadFile: jest.fn(), generateSasUrl: jest.fn().mockResolvedValue('') },
        },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
        {
          provide: ForgotPasswordRateLimiterService,
          useValue: { consume: jest.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }) },
        },
        ForgotPasswordThrottleGuard,
        { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
      ],
    }).compile();
    controller = module.get(AuthController);
    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore sendMail default so clearAllMocks doesn't leave it returning undefined
    mailerService.sendMail.mockResolvedValue({});
    tokenService.blackListToken.mockResolvedValue(undefined);
    tokenService.isBlackListed.mockResolvedValue(false);
    notificationsServiceMock.isPreferenceEnabled.mockResolvedValue(true);
  });

  describe('logout', () => {
    const buildReq = (authHeader?: string, cookies: Record<string, string> = {}) =>
      ({ headers: { authorization: authHeader }, cookies }) as unknown as Request;
    const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
    const currentUser = { userId: 'u-1', email: 'admin@test.com' } as ICurrentUser;

    it('UNIT: blacklists token', async () => {
      const result = await controller.logout(currentUser, buildReq('Bearer abc123'), mockRes);
      expect((tokenService.blackListToken.mock.calls as [string, []][]).at(0)?.[0]).toBe('abc123');
      expect(result.message).toBeDefined();
    });

    it('UNIT: prefers the Authorization header over the accessToken cookie', async () => {
      const result = await controller.logout(
        currentUser,
        buildReq('Bearer abc123', { accessToken: 'from-cookie' }),
        mockRes,
      );
      expect((tokenService.blackListToken.mock.calls as [string, []][]).at(0)?.[0]).toBe('abc123');
      expect(result.message).toBeDefined();
    });

    it('UNIT: returns message when no token', async () => {
      const result = await controller.logout(currentUser, buildReq(undefined), mockRes);
      expect(result.message).toBeDefined();
      expect(tokenService.blackListToken).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const currentUser = { userId: 'u-1', email: 'admin@test.com' } as ICurrentUser;

    it('UNIT: updates the password when the old password matches', async () => {
      const oldHashed = await bcrypt.hash('OldP@ssw0rd', 10);
      userRepo.findByIdWithPassword.mockResolvedValue({ id: 'u-1', password: oldHashed });
      userRepo.update.mockResolvedValue(1);

      const result = await controller.changePassword(currentUser, {
        oldPassword: 'OldP@ssw0rd',
        newPassword: 'NewP@ssw0rd',
      });

      expect(userRepo.update).toHaveBeenCalledWith('u-1', { password: expect.any(String) });
      expect(result.message).toBeDefined();
    });

    it('UNIT: rejects when the old password does not match', async () => {
      const oldHashed = await bcrypt.hash('OldP@ssw0rd', 10);
      userRepo.findByIdWithPassword.mockResolvedValue({ id: 'u-1', password: oldHashed });

      await expect(
        controller.changePassword(currentUser, {
          oldPassword: 'WrongPassword',
          newPassword: 'NewP@ssw0rd',
        }),
      ).rejects.toThrow();
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('UNIT: rejects when the account is not found', async () => {
      userRepo.findByIdWithPassword.mockResolvedValue(null);

      await expect(
        controller.changePassword(currentUser, {
          oldPassword: 'OldP@ssw0rd',
          newPassword: 'NewP@ssw0rd',
        }),
      ).rejects.toThrow();
    });
  });
  describe('findEducatorByEmail', () => {
    const expectedSelect = {
      userRole: {
        userRoleId: true,
        userId: true,
        status: true,
        user: EDUCATOR_USER_SELECT,
      },
    };

    it('UNIT: selects userRole.status and userRole.userId alongside the user relation', async () => {
      educatorRepo.findOne.mockResolvedValue({ id: 'e-1' } as unknown as Educator);

      await service.findEducatorByEmail('  Educator@Test.com  ');

      expect(educatorRepo.findOne).toHaveBeenCalledTimes(1);
      expect(educatorRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userRole: { user: { email: 'educator@test.com' } } },
          select: expectedSelect,
        }),
      );
    });

    it('UNIT: keeps the same select on the plus-alias retry', async () => {
      educatorRepo.findOne.mockResolvedValue(null);

      await service.findEducatorByEmail('educator+canvas@test.com');

      expect(educatorRepo.findOne).toHaveBeenCalledTimes(2);
      expect(educatorRepo.findOne).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { userRole: { user: { email: 'educator@test.com' } } },
          select: expectedSelect,
        }),
      );
    });
  });
});
