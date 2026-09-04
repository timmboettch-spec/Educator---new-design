import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../../src/auth/auth.controller';
import { AuthService } from '../../../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../../src/users/users.service';
import { InvitesService } from '../../../src/invites/invites.service';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { RedemptionsService } from '../../../src/users/redemptions.service';
import { CsrfService } from '../../../src/csrf/csrf.service';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { User } from '../../../src/users/entity/user.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { AppStatus } from 'src/common/utils/messages';
import * as bcrypt from 'bcrypt';

const T_EMAIL = 'admin@test.com';
const T_PASS = 'pass';
const T_EDU_EMAIL = 'edu@test.com';
const T_TOKEN = 'tok';
const T_OTP = '123456';

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: T_EMAIL,
    password: '',
    status: CommonStatus.ACTIVE,
    role: { role_name: 'District Admin' },
    ...o,
  }) as User;

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({
    id: 'edu-1',
    email: T_EDU_EMAIL,
    status: CommonStatus.ACTIVE,
    tokens: 5,
    allocated_tokens: 5,
    is_active: true,
    school: { id: 'school-1', school_name: 'Test School' },
    admin: { id: 'admin-1' },
    ...o,
  }) as Educator;

describe('Auth (Controller + Service)', () => {
  let controller: AuthController;
  let service: AuthService;

  const usersService = { findByEmail: jest.fn(), createUser: jest.fn(), updateByEmail: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue('1d') };
  const invitesService = { findInviteById: jest.fn(), acceptInvite: jest.fn() };
  const mailerService = { sendMail: jest.fn().mockResolvedValue({}) };
  const blacklistService = { add: jest.fn(), has: jest.fn().mockReturnValue(false) };
  const educatorRepo: {
    findOne: jest.Mock<Promise<Educator | null>, unknown[]>;
    save: jest.Mock<Promise<Educator>, [Partial<Educator>]>;
  } = {
    findOne: jest.fn<Promise<Educator | null>, unknown[]>(),
    save: jest.fn<Promise<Educator>, [Partial<Educator>]>(),
  };
  const notificationsGateway = { notifyAdminEducatorStatusUpdated: jest.fn() };
  const tutorPatientService = { getSalesOrderByRedeemCode: jest.fn() };
  const csrfService = { generateToken: jest.fn().mockReturnValue('mock-csrf-token'), storeToken: jest.fn().mockResolvedValue(undefined) };
  const redemptionsService = {
    findByUserAndRedeemCode: jest.fn(),
    redeemAndActivateUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: InvitesService, useValue: invitesService },
        { provide: MailService, useValue: mailerService },
        { provide: TokenBlacklistService, useValue: blacklistService },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        {
          provide: getRepositoryToken(EducatorSchool),
          useValue: {
            findOne: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        { provide: getRepositoryToken(Schools), useValue: { findOne: jest.fn() } },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: CsrfService, useValue: csrfService },
        { provide: RedemptionsService, useValue: redemptionsService },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]), createQueryRunner: jest.fn() } },
        { provide: AzureBlobService, useValue: { uploadFile: jest.fn(), generateSasUrl: jest.fn().mockResolvedValue('') } },
      ],
    }).compile();
    controller = module.get(AuthController);
    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore sendMail default so clearAllMocks doesn't leave it returning undefined
    mailerService.sendMail.mockResolvedValue({});
    blacklistService.has.mockReturnValue(false);
  });

  describe('login', () => {
    it('UNIT: admin login succeeds', async () => {
      const hash = await bcrypt.hash(T_PASS, 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ password: hash }));
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.login({ email: T_EMAIL, password: T_PASS });
      expect(result.success).toBe(true);
    });

    it('UNIT: login fails with wrong password', async () => {
      const hash = await bcrypt.hash('correct', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ password: hash }));
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.login({ email: T_EMAIL, password: 'wrong' });
      expect(result.success).toBe(false);
    });

    it('UNIT: educator login succeeds', async () => {
      const hash = await bcrypt.hash(T_PASS, 10);
      educatorRepo.findOne.mockResolvedValue(makeEducator({ password: hash }));
      usersService.findByEmail.mockResolvedValue(null);
      const result = await service.login({ email: T_EDU_EMAIL, password: T_PASS });
      expect(result.success).toBe(true);
    });

    it('UNIT: educator login fails when inactive', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ status: CommonStatus.INACTIVE }));
      const result = await service.login({ email: T_EDU_EMAIL, password: 'any' });
      expect(result.success).toBe(false);
    });

    it('UNIT: educator login fails when no password', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ password: null }));
      const result = await service.login({ email: T_EDU_EMAIL, password: 'any' });
      expect(result.success).toBe(false);
    });

    it('UNIT: login fails when user not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      const result = await service.login({ email: 'nobody@test.com', password: 'x' });
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: POST /auth/login — returns SUCCESS', async () => {
      jest
        .spyOn(service, 'login')
        .mockResolvedValue({ success: true, data: { tokens: { accessToken: T_TOKEN } } });
      const result = await controller.login({ email: T_EMAIL, password: T_PASS });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: POST /auth/login — throws on failure', async () => {
      jest.spyOn(service, 'login').mockResolvedValue({
        success: false,
        message: 'Invalid credentials',
        type: 'unauthorized',
      });
      await expect(controller.login({ email: 'x@x.com', password: 'bad' })).rejects.toThrow();
    });
  });

  describe('signup', () => {
    it('UNIT: admin signup succeeds', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue(makeUser());
      const result = await service.signup({
        email: 'new@test.com',
        password: T_PASS,
        full_name: 'New',
        status: CommonStatus.ACTIVE,
      });
      expect(result.success).toBe(true);
    });

    it('UNIT: signup fails when user exists', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.signup({
        email: T_EMAIL,
        password: T_PASS,
        full_name: 'X',
        status: CommonStatus.ACTIVE,
      });
      expect(result.success).toBe(false);
    });

    it('UNIT: signup succeeds when only an educator exists (cross-role)', async () => {
      // No admin exists — educator with same email should NOT block admin creation.
      const passwordlessEducator = makeEducator({ password: null });
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(passwordlessEducator);
      usersService.createUser.mockResolvedValue(makeUser({ email: T_EDU_EMAIL }));
      educatorRepo.save.mockResolvedValue(passwordlessEducator);

      const result = await service.signup({
        email: T_EDU_EMAIL,
        password: T_PASS,
        full_name: 'Cross',
        status: CommonStatus.ACTIVE,
      });

      expect(result.success).toBe(true);
      // Password should be synced to the passwordless educator so dual-role
      // login works immediately after signup.
      expect(educatorRepo.save).toHaveBeenCalled();
      const savedArg = educatorRepo.save.mock.calls[0][0];
      expect(savedArg.password).toBeDefined();
      expect(savedArg.password).not.toBeNull();
    });

    it('UNIT: signup with existing educator (with password) overwrites educator password to keep both identities in sync', async () => {
      const educatorWithPassword = makeEducator({
        password: '$2b$10$existingHashedPassword',
      });
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(educatorWithPassword);
      usersService.createUser.mockResolvedValue(makeUser({ email: T_EDU_EMAIL }));
      educatorRepo.save.mockResolvedValue(educatorWithPassword);

      const result = await service.signup({
        email: T_EDU_EMAIL,
        password: 'newSharedPassword',
        full_name: 'Cross',
        status: CommonStatus.ACTIVE,
      });

      expect(result.success).toBe(true);
      // The most-recent password change wins — the new admin's hash is
      // mirrored onto the existing educator so a single credential unlocks
      // both identities.
      expect(educatorRepo.save).toHaveBeenCalled();
      const savedArg = educatorRepo.save.mock.calls[0][0];
      expect(savedArg.password).toBeDefined();
      expect(savedArg.password).not.toBe('$2b$10$existingHashedPassword');
    });

    it('INTEGRATION: POST /auth/signup — returns SUCCESS', async () => {
      jest
        .spyOn(service, 'signup')
        .mockResolvedValue({ success: true, message: 'Admin registered successfully', data: {} });
      const result = await controller.signup({
        email: 'new@test.com',
        password: T_PASS,
        full_name: 'X',
        status: CommonStatus.ACTIVE,
      });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: POST /auth/signup — throws on failure', async () => {
      jest
        .spyOn(service, 'signup')
        .mockResolvedValue({ success: false, message: 'User already exists' });
      await expect(
        controller.signup({
          email: 'x@x.com',
          password: 'p',
          full_name: 'X',
          status: CommonStatus.ACTIVE,
        }),
      ).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('UNIT: blacklists token', () => {
      const result = controller.logout('Bearer abc123');
      expect((blacklistService.add.mock.calls as [string, []][]).at(0)?.[0]).toBe('abc123');
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('UNIT: returns message when no token', () => {
      const result = controller.logout(undefined);
      expect(result.message).toBeDefined();
    });
  });

  describe('forgotPassword', () => {
    it('UNIT: sends OTP when user found', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: T_EMAIL });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('reset_token');
    });

    it('UNIT: fails when admin user is not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nobody@test.com',
        role: 'admin',
      });

      expect(result.success).toBe(false);
    });

    it('UNIT: fails when mailer throws', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mailerService.sendMail.mockRejectedValueOnce(new Error('SMTP down'));
      const result = await service.forgotPassword({ email: T_EMAIL });
      expect(result.success).toBe(false);
      consoleSpy.mockRestore();
    });

    it('INTEGRATION: POST /auth/forgot-password — returns SUCCESS', async () => {
      jest
        .spyOn(service, 'forgotPassword')
        .mockResolvedValue({ success: true, message: 'OTP sent', data: { reset_token: T_TOKEN } });
      const result = await controller.forgotPassword({ email: T_EMAIL });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('resendOtp', () => {
    it('UNIT: fails when reset_token is invalid (malformed JWT)', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('invalid signature'); });
      const result = await service.resendOtp({ reset_token: 'bad-token' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid reset token');
    });

    it('UNIT: fails when token purpose is not otp_verify', async () => {
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'reset_password', exp: Math.floor(Date.now() / 1000) + 300 });
      const result = await service.resendOtp({ reset_token: T_TOKEN });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid reset token');
    });

    it('UNIT: fails when cooldown period has not elapsed', async () => {
      // exp set so that token was issued only 30 seconds ago (well within the 5-min cooldown)
      const exp = Math.floor(Date.now() / 1000) + (5 * 60) - 30;
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'otp_verify', exp });
      const result = await service.resendOtp({ reset_token: T_TOKEN });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Please wait');
    });

    it('UNIT: fails when neither user nor educator exists for the email', async () => {
      // exp set so token was issued > 5 minutes ago (cooldown elapsed)
      const exp = Math.floor(Date.now() / 1000) + (5 * 60) + 60;
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'otp_verify', exp });
      // Simulate token issued more than cooldown ago by back-dating exp so issuedAt is in the past
      const pastExp = Math.floor(Date.now() / 1000) - 1; // exp is in the past → issuedAt = exp - 300
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'otp_verify', exp: pastExp });
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.resendOtp({ reset_token: T_TOKEN });
      expect(result.success).toBe(false);
      expect(result.message).toContain('No account found');
    });

    it('UNIT: resends OTP successfully for existing user', async () => {
      // Token expired (past exp) so cooldown check passes
      const pastExp = Math.floor(Date.now() / 1000) - 1;
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'otp_verify', exp: pastExp });
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.resendOtp({ reset_token: T_TOKEN });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('reset_token');
    });

    it('UNIT: returns SMTP error when mailer fails', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 1;
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'otp_verify', exp: pastExp });
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);
      mailerService.sendMail.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await service.resendOtp({ reset_token: T_TOKEN });
      expect(result.success).toBe(false);
      expect(result.message).toContain('SMTP Error');
    });

    it('INTEGRATION: POST /auth/resend-otp — controller returns SUCCESS', async () => {
      jest.spyOn(service, 'resendOtp').mockResolvedValue({
        success: true,
        message: 'OTP resent to your email',
        data: { reset_token: T_TOKEN },
      });
      const result = await controller.resendOtp({ reset_token: T_TOKEN });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('verifyOtp', () => {
    it('UNIT: verifies OTP successfully', async () => {
      jwtService.verify.mockReturnValue({ email: T_EMAIL, otp: T_OTP, purpose: 'otp_verify' });
      const result = await service.verifyOtp({ otp: T_OTP, reset_token: 'valid' });
      expect(result.success).toBe(true);
    });

    it('UNIT: fails with wrong OTP', async () => {
      jwtService.verify.mockReturnValue({ email: T_EMAIL, otp: '999999', purpose: 'otp_verify' });
      const result = await service.verifyOtp({ otp: T_OTP, reset_token: 'valid' });
      expect(result.success).toBe(false);
    });

    it('UNIT: fails when token expired', async () => {
      jwtService.verify.mockImplementation(() => {
        const e = new Error();
        e.name = 'TokenExpiredError';
        throw e;
      });
      const result = await service.verifyOtp({ otp: T_OTP, reset_token: 'expired' });
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: POST /auth/verify-otp — returns SUCCESS', async () => {
      jest.spyOn(service, 'verifyOtp').mockResolvedValue({
        success: true,
        message: 'OTP verified',
        data: { verified_token: T_TOKEN },
      });
      const result = await controller.verifyOtp({ otp: T_OTP, reset_token: T_TOKEN });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('resetPassword', () => {
    it('UNIT: resets password for user', async () => {
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'reset_password' });
      blacklistService.has.mockReturnValue(false);
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);
      usersService.updateByEmail.mockResolvedValue(makeUser());
      const result = await service.resetPassword({ verified_token: T_TOKEN, new_password: 'new' });
      expect(result.success).toBe(true);
    });

    it('UNIT: fails when token blacklisted', async () => {
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'reset_password' });
      blacklistService.has.mockReturnValue(true);
      const result = await service.resetPassword({ verified_token: 'used', new_password: 'x' });
      expect(result.success).toBe(false);
    });

    it('UNIT: resets password for educator', async () => {
      jwtService.verify.mockReturnValue({ email: T_EDU_EMAIL, purpose: 'reset_password' });
      blacklistService.has.mockReturnValue(false);
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      educatorRepo.save.mockResolvedValue(makeEducator());
      const result = await service.resetPassword({ verified_token: T_TOKEN, new_password: 'new' });
      expect(result.success).toBe(true);
    });

    it('INTEGRATION: POST /auth/reset-password — returns SUCCESS', async () => {
      jest
        .spyOn(service, 'resetPassword')
        .mockResolvedValue({ success: true, message: 'Password reset successfully' });
      const result = await controller.resetPassword({
        verified_token: T_TOKEN,
        new_password: 'new',
      });
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('regression', () => {
    it('resetPassword: blacklists token after success', async () => {
      jwtService.verify.mockReturnValue({ email: T_EMAIL, purpose: 'reset_password' });
      blacklistService.has.mockReturnValue(false);
      usersService.findByEmail.mockResolvedValue(makeUser());
      usersService.updateByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);
      await service.resetPassword({ verified_token: T_TOKEN, new_password: 'new' });
      expect((blacklistService.add.mock.calls as [string[]][]).at(0)?.[0]).toBe(T_TOKEN);
    });

    it('signup: educator invite email mismatch throws', async () => {
      invitesService.findInviteById.mockResolvedValue({ id: 'inv-1', email: 'other@test.com' });
      invitesService.acceptInvite.mockResolvedValue({ email: 'other@test.com' });
      await expect(
        service.signup({
          email: 'different@test.com',
          password: 'p',
          full_name: 'X',
          invite_id: 'inv-1',
          status: CommonStatus.ACTIVE,
        }),
      ).rejects.toThrow();
    });
  });
});
