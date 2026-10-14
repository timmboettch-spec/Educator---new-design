import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InvitesController } from '../../../src/invites/invites.controller';
import { InvitesService } from '../../../src/invites/invites.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';
import { InvitesConstants } from '../../../src/invites/invites.constants';

import { UsersService } from '../../../src/users/users.service';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { LoggerService, TokenService } from '../../../src/common/services';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { ResponseResult } from 'src/common/class/response.class';
import { Invite, InviteStatus, User, Schools, Role } from 'src/database/entities';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  INVITE_REPOSITORY,
  ROLE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';

const makeReq = (userId: string): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId } });
  return req;
};

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: 'admin-uuid',
    email: 'admin@test.com',
    full_name: 'Admin',
    status: CommonStatus.ACTIVE,
    subscriptions: [],
    ...o,
  }) as User;

const makeSchool = (o: Partial<Schools> = {}): Schools =>
  ({ id: 'school-uuid', school_name: 'Test School', ...o }) as Schools;

const makeInvite = (o: Partial<Invite> = {}): Invite => ({
  id: 'invite-uuid',
  full_name: '',
  email: 'educator@test.com',
  status: InviteStatus.PENDING,
  expires_at: new Date(Date.now() + 3600000),
  school: makeSchool(),
  createdBy: makeUser(),
  created_at: new Date(),
  updated_at: new Date(),
  is_active: true,
  deleted_at: null,
  ...o,
});

describe('Invites (Controller + Service)', () => {
  let controller: InvitesController;
  let service: InvitesService;

  const inviteRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteByEmail: jest.fn().mockResolvedValue(0),
    acceptInvite: jest.fn(),
    ensureColumns: jest.fn().mockResolvedValue(undefined),
  };
  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    findByEmail: jest.fn(),
    findByEmailWithRoles: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    activateInvitedAccount: jest.fn(),
    createInvitedAccount: jest.fn().mockResolvedValue({
      user: { id: 'user-v2-uuid', email: 'educator@test.com' },
      userRoleId: 'user-role-uuid',
    }),
  };
  const schoolRepo = { findOne: jest.fn() };
  const educatorRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'edu-uuid', email: 'educator@test.com' }),
    upsertByEmail: jest.fn().mockResolvedValue('edu-uuid'),
    existsByUserRoleId: jest.fn().mockResolvedValue(false),
    delete: jest.fn(),
  };
  const roleRepo = {
    findOne: jest.fn(),
    findBySlug: jest.fn().mockResolvedValue({ id: 'role-v2-uuid' }),
  };
  const userRoleRepo = {
    findByUserId: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ userRoleId: 'role-v2-uuid' }),
    update: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    activate: jest.fn().mockResolvedValue(undefined),
    findByUserAndRoleSlug: jest.fn().mockResolvedValue({ userRoleId: 'da-role-uuid' }),
  };
  const districtAdminRepo = {
    findByUserRoleId: jest.fn().mockResolvedValue({ userRoleId: 'da-role-uuid', fullName: 'Admin', subscriptions: [] }),
    updateByUserRoleId: jest.fn().mockResolvedValue(undefined),
  };
  const mailerService = { sendMail: jest.fn().mockResolvedValue({}) };
  const configService = { get: jest.fn().mockReturnValue('http://localhost:5173') };
  const usersService = { findByEmail: jest.fn() };
  const loggerService = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  const notificationsGateway = {
    notifyAdminEducatorInvitationAccepted: jest.fn().mockResolvedValue(undefined),
  };
  const tokenService = {
    generateTokens: jest.fn().mockReturnValue({ access_token: 'mock-token', expires_in: 86400 }),
    setAuthCookies: jest.fn(),
  };
  const inviteTokenService = {
    issue: jest.fn().mockReturnValue('mock-invite-token'),
    buildInviteUrl: jest
      .fn()
      .mockReturnValue('http://localhost:5173/signup/mock-invite-token'),
    resolve: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitesController],
      providers: [
        InvitesService,
        { provide: UsersService, useValue: usersService },
        { provide: INVITE_REPOSITORY, useValue: inviteRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        {
          provide: EDUCATOR_SCHOOL_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            upsert: jest.fn().mockResolvedValue({}),
          },
        },
        { provide: ROLE_REPOSITORY, useValue: roleRepo },
        { provide: USER_ROLE_REPOSITORY, useValue: userRoleRepo },
        { provide: DISTRICT_ADMIN_REPOSITORY, useValue: districtAdminRepo },
        { provide: MailService, useValue: mailerService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: LoggerService, useValue: loggerService },
        { provide: TokenService, useValue: tokenService },
        { provide: InviteTokenService, useValue: inviteTokenService },
        {
          provide: NotificationsGateway,
          useValue: {
            notifyAdminEducatorInvitationAccepted:
              notificationsGateway.notifyAdminEducatorInvitationAccepted,
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
        { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
      ],
    }).compile();
    controller = module.get(InvitesController);
    service = module.get(InvitesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createInvite', () => {
    const dto = { email: 'educator@test.com', school_id: 'school-uuid' };

    it('UNIT: creates invite successfully', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue({
        id: 'edu-uuid',
        email: 'educator@test.com',
        is_active: false,
      });
      inviteRepo.delete.mockResolvedValue({});
      inviteRepo.create.mockResolvedValue(makeInvite());
      const result = await service.createInvite(dto, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null);
      expect(result).toBeInstanceOf(ResponseResult);
    });

    it('UNIT: creates the new user_roles link as PENDING when the invite has no explicit status', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.delete.mockResolvedValue({});
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue(null);

      await service.createInvite(dto, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null);

      expect(userRepo.createInvitedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ roleStatus: CommonStatus.PENDING }),
      );
    });

    it('UNIT: creates the new user_roles link as IN_ACTIVE when the invite body status is INACTIVE', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.delete.mockResolvedValue({});
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue(null);

      await service.createInvite(
        { ...dto, status: CommonStatus.INACTIVE },
        makeUser(),
        makeSchool(),
        { id: 'role-v2-uuid' } as Role,
        null,
      );

      expect(userRepo.createInvitedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ roleStatus: CommonStatus.INACTIVE }),
      );
    });

    it('UNIT: creates the new user_roles link as PENDING when the invite has no explicit status', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.delete.mockResolvedValue({});
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue(null);

      await service.createInvite(dto, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null);

      expect(userRepo.createInvitedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ roleStatus: CommonStatus.PENDING }),
      );
    });

    it('UNIT: creates the new user_roles link as IN_ACTIVE when the invite body status is INACTIVE', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.delete.mockResolvedValue({});
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue(null);

      await service.createInvite(
        { ...dto, status: CommonStatus.INACTIVE },
        makeUser(),
        makeSchool(),
        { id: 'role-v2-uuid' } as Role,
        null,
      );

      expect(userRepo.createInvitedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ roleStatus: CommonStatus.INACTIVE }),
      );
    });

    it('INTEGRATION: throws NotFoundException when creator not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(controller.createInvite(dto, makeReq('bad-uuid'))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: throws NotFoundException when school not found', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(null);
      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: throws BadRequestException when educator already exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue({ id: 'edu-1', is_active: true });
      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: throws BadRequestException when a v2 account already exists and is ACTIVE with no roles', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        status: CommonStatus.ACTIVE,
        userRoles: [],
      });
      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: throws BadRequestException when a v2 account already exists and is PENDING', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        status: CommonStatus.PENDING,
        userRoles: [],
      });
      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: throws BadRequestException (Educator already registered) when the account already has the Educator role', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        status: CommonStatus.ACTIVE,
        userRoles: [{ role: { slug: 'educator' } }],
      });
      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        BadRequestException,
      );
      expect(userRoleRepo.create).not.toHaveBeenCalled();
    });

    it('UNIT: grants Educator as a dual role when the existing ACTIVE account is District-Admin-only', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.delete.mockResolvedValue({});
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        status: CommonStatus.ACTIVE,
        userRoles: [{ role: { slug: 'district_admin' } }],
      });

      const result = await service.createInvite(dto, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null);

      expect(userRoleRepo.create).toHaveBeenCalledWith({
        userId: 'user-v2-uuid',
        roleId: 'role-v2-uuid',
        status: CommonStatus.PENDING,
      });
      expect(result).toBeInstanceOf(ResponseResult);
    });

    it('UNIT: skips the invite and activates the educator directly when the existing District-Admin role is ACTIVE and the body status is ACTIVE', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        status: CommonStatus.ACTIVE,
        userRoles: [{ role: { slug: 'district_admin' }, status: CommonStatus.ACTIVE }],
      });

      const result = await service.createInvite(
        { ...dto, status: CommonStatus.ACTIVE },
        makeUser(),
        makeSchool(),
        { id: 'role-v2-uuid' } as Role,
        null,
      );

      expect(userRoleRepo.create).toHaveBeenCalledWith({
        userId: 'user-v2-uuid',
        roleId: 'role-v2-uuid',
        status: CommonStatus.ACTIVE,
      });
      expect(inviteRepo.create).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(ResponseResult);
      expect(result.data?.invite).toBeNull();
    });

    it('UNIT: still sends a normal (pending) invite when the existing District-Admin role is not yet ACTIVE, even if the body status is ACTIVE', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.delete.mockResolvedValue({});
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        status: CommonStatus.ACTIVE,
        userRoles: [{ role: { slug: 'district_admin' }, status: CommonStatus.PENDING }],
      });

      const result = await service.createInvite(
        { ...dto, status: CommonStatus.ACTIVE },
        makeUser(),
        makeSchool(),
        { id: 'role-v2-uuid' } as Role,
        null,
      );

      expect(userRoleRepo.create).toHaveBeenCalledWith({
        userId: 'user-v2-uuid',
        roleId: 'role-v2-uuid',
        status: CommonStatus.PENDING,
      });
      expect(inviteRepo.create).toHaveBeenCalled();
      expect(result.data?.invite).not.toBeNull();
    });

    it('INTEGRATION: throws BadRequestException when the existing ACTIVE account has a role other than District Admin', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        status: CommonStatus.ACTIVE,
        userRoles: [{ role: { slug: 'scenario_admin' } }],
      });

      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        BadRequestException,
      );
      expect(userRoleRepo.create).not.toHaveBeenCalled();
    });

    it('REGRESSION: re-invites a deleted educator by reusing its INACTIVE Educator role link', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          {
            userRoleId: 'old-edu-role-uuid',
            roleId: 'role-v2-uuid',
            status: CommonStatus.INACTIVE,
            role: { slug: 'educator' },
          },
        ],
      });

      const result = await service.createInvite(dto, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null);

      expect(educatorRepo.existsByUserRoleId).toHaveBeenCalledWith('old-edu-role-uuid');
      expect(userRoleRepo.updateStatus).toHaveBeenCalledWith('old-edu-role-uuid', CommonStatus.PENDING);
      expect(userRoleRepo.create).not.toHaveBeenCalled();
      expect(userRepo.createInvitedAccount).not.toHaveBeenCalled();
      expect(educatorRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userRoleId: 'old-edu-role-uuid' }),
      );
      expect(inviteRepo.create).toHaveBeenCalled();
      expect(result.data?.invite).not.toBeNull();
    });

    it('UNIT: re-invites a deleted educator on a District-Admin account as a dual role', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.create.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          { role: { slug: 'district_admin' }, status: CommonStatus.PENDING },
          {
            userRoleId: 'old-edu-role-uuid',
            roleId: 'role-v2-uuid',
            status: CommonStatus.INACTIVE,
            role: { slug: 'educator' },
          },
        ],
      });

      await service.createInvite(dto, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null);

      expect(userRoleRepo.updateStatus).toHaveBeenCalledWith('old-edu-role-uuid', CommonStatus.PENDING);
      expect(userRoleRepo.create).not.toHaveBeenCalled();
    });

    it('INTEGRATION: still rejects an INACTIVE Educator role whose educator is deactivated, not deleted', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      inviteRepo.findOne.mockResolvedValue(null);
      educatorRepo.existsByUserRoleId.mockResolvedValueOnce(true);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          {
            userRoleId: 'edu-role-uuid',
            roleId: 'role-v2-uuid',
            status: CommonStatus.INACTIVE,
            role: { slug: 'educator' },
          },
        ],
      });

      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        InvitesConstants.MESSAGES.EDUCATOR_ALREADY_REGISTERED,
      );
      expect(userRoleRepo.updateStatus).not.toHaveBeenCalled();
      expect(userRoleRepo.create).not.toHaveBeenCalled();
    });

    it('REGRESSION: a re-invite rejected for insufficient seats leaves the deleted educator\'s role untouched', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          {
            userRoleId: 'old-edu-role-uuid',
            roleId: 'role-v2-uuid',
            status: CommonStatus.INACTIVE,
            role: { slug: 'educator' },
          },
        ],
      });
      districtAdminRepo.findByUserRoleId.mockResolvedValueOnce({
        userRoleId: 'da-role-uuid',
        fullName: 'Admin',
        subscriptions: [{ seats_available: 1 }] as object[],
      });

      await expect(
        service.createInvite({ ...dto, tokens: 5 }, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null),
      ).rejects.toThrow(BadRequestException);

      expect(userRoleRepo.updateStatus).not.toHaveBeenCalled();
      expect(userRoleRepo.create).not.toHaveBeenCalled();
      expect(inviteRepo.deleteByEmail).not.toHaveBeenCalled();
    });

    it('REGRESSION: a dual-role invite rejected for insufficient seats grants no Educator role', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [{ role: { slug: 'district_admin' }, status: CommonStatus.ACTIVE }],
      });
      districtAdminRepo.findByUserRoleId.mockResolvedValueOnce({
        userRoleId: 'da-role-uuid',
        fullName: 'Admin',
        subscriptions: [{ seats_available: 1 }] as object[],
      });

      await expect(
        service.createInvite({ ...dto, tokens: 5 }, makeUser(), makeSchool(), { id: 'role-v2-uuid' } as Role, null),
      ).rejects.toThrow(BadRequestException);

      expect(userRoleRepo.create).not.toHaveBeenCalled();
    });

    it('UNIT: clears earlier invites for the email case-insensitively before creating the new one', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      userRepo.findByEmailWithRoles.mockResolvedValue(null);
      inviteRepo.create.mockResolvedValue(makeInvite());

      await service.createInvite(
        { ...dto, email: '  Educator@Test.com ' },
        makeUser(),
        makeSchool(),
        { id: 'role-v2-uuid' } as Role,
        null,
      );

      expect(inviteRepo.deleteByEmail).toHaveBeenCalledWith('educator@test.com');
    });

    describe('re-inviting a deleted educator', () => {
      const deletedEducatorRole = {
        userRoleId: 'old-edu-role-uuid',
        roleId: 'role-v2-uuid',
        status: CommonStatus.INACTIVE,
        role: { slug: 'educator' },
      };
      const educatorRole = { id: 'role-v2-uuid' } as Role;

      beforeEach(() => {
        educatorRepo.findOne.mockResolvedValue(null);
        inviteRepo.create.mockResolvedValue(makeInvite());
      });

      it('UNIT: activates directly, with no invite, on an ACTIVE District-Admin account', async () => {
        userRepo.findByEmailWithRoles.mockResolvedValue({
          id: 'user-v2-uuid',
          userRoles: [
            { role: { slug: 'district_admin' }, status: CommonStatus.ACTIVE },
            deletedEducatorRole,
          ],
        });

        const result = await service.createInvite(dto, makeUser(), makeSchool(), educatorRole, null);

        expect(userRoleRepo.updateStatus).toHaveBeenCalledWith(
          'old-edu-role-uuid',
          CommonStatus.ACTIVE,
        );
        expect(userRoleRepo.create).not.toHaveBeenCalled();
        expect(inviteRepo.create).not.toHaveBeenCalled();
        expect(result.data?.invite).toBeNull();
      });

      it('INTEGRATION: rejects with USER_EXISTS when the account also holds a non-District-Admin role', async () => {
        userRepo.findOne.mockResolvedValue(makeUser());
        schoolRepo.findOne.mockResolvedValue(makeSchool());
        inviteRepo.findOne.mockResolvedValue(null);
        userRepo.findByEmailWithRoles.mockResolvedValue({
          id: 'user-v2-uuid',
          userRoles: [{ role: { slug: 'scenario_admin' } }, deletedEducatorRole],
        });

        await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
          InvitesConstants.MESSAGES.USER_EXISTS,
        );
        expect(userRoleRepo.updateStatus).not.toHaveBeenCalled();
        expect(userRoleRepo.create).not.toHaveBeenCalled();
      });

      it('UNIT: keeps an explicit INACTIVE invite status on the reused role', async () => {
        userRepo.findByEmailWithRoles.mockResolvedValue({
          id: 'user-v2-uuid',
          userRoles: [deletedEducatorRole],
        });

        await service.createInvite(
          { ...dto, status: CommonStatus.INACTIVE },
          makeUser(),
          makeSchool(),
          educatorRole,
          null,
        );

        expect(userRoleRepo.updateStatus).toHaveBeenCalledWith(
          'old-edu-role-uuid',
          CommonStatus.INACTIVE,
        );
      });

      it('UNIT: reuses an INACTIVE Educator role that never had an educator row', async () => {
        userRepo.findByEmailWithRoles.mockResolvedValue({
          id: 'user-v2-uuid',
          userRoles: [{ ...deletedEducatorRole, userRoleId: 'orphan-role-uuid' }],
        });

        await service.createInvite(dto, makeUser(), makeSchool(), educatorRole, null);

        expect(educatorRepo.existsByUserRoleId).toHaveBeenCalledWith('orphan-role-uuid');
        expect(userRoleRepo.updateStatus).toHaveBeenCalledWith(
          'orphan-role-uuid',
          CommonStatus.PENDING,
        );
        expect(educatorRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ userRoleId: 'orphan-role-uuid' }),
        );
      });

      it('REGRESSION: a retry with a valid seat count succeeds after an insufficient-seats rejection', async () => {
        // The first attempt writes nothing, so the second sees the same untouched role.
        userRepo.findByEmailWithRoles.mockResolvedValue({
          id: 'user-v2-uuid',
          userRoles: [deletedEducatorRole],
        });
        districtAdminRepo.findByUserRoleId
          .mockResolvedValueOnce({
            districtAdminId: 'da-1',
            userRoleId: 'da-role-uuid',
            fullName: 'Admin',
            subscriptions: [{ seats_available: 1 }] as object[],
          })
          .mockResolvedValueOnce({
            districtAdminId: 'da-1',
            userRoleId: 'da-role-uuid',
            fullName: 'Admin',
            subscriptions: [{ seats_available: 1 }] as object[],
          });

        await expect(
          service.createInvite({ ...dto, tokens: 5 }, makeUser(), makeSchool(), educatorRole, null),
        ).rejects.toThrow(BadRequestException);
        expect(userRoleRepo.updateStatus).not.toHaveBeenCalled();

        const result = await service.createInvite(
          { ...dto, tokens: 1 },
          makeUser(),
          makeSchool(),
          educatorRole,
          null,
        );

        expect(userRoleRepo.updateStatus).toHaveBeenCalledTimes(1);
        expect(userRoleRepo.updateStatus).toHaveBeenCalledWith(
          'old-edu-role-uuid',
          CommonStatus.PENDING,
        );
        expect(inviteRepo.create).toHaveBeenCalledTimes(1);
        expect(result.data?.invite).not.toBeNull();
      });
    });

    it('INTEGRATION: throws BadRequestException when pending invite exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      inviteRepo.findOne.mockResolvedValue(makeInvite());
      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('REGRESSION: insufficient seats throws BadRequestException', async () => {
      const creator = makeUser();
      districtAdminRepo.findByUserRoleId.mockResolvedValueOnce({
        userRoleId: 'da-role-uuid',
        fullName: 'Admin',
        subscriptions: [{ seats_available: 1 }] as object[],
      });
      await expect(
        service.createInvite(
          { email: 'x@x.com', school_id: 'school-uuid', tokens: 5 },
          creator,
          makeSchool(),
          { id: 'role-v2-uuid' } as Role,
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyInviteToken', () => {
    it('INTEGRATION: throws when the token resolves to an invalid/expired invite', async () => {
      inviteTokenService.resolve.mockRejectedValue(
        new BadRequestException('Invalid or expired invite'),
      );
      await expect(
        controller.verifyInviteToken({ token: 'bad-token' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('INTEGRATION: returns invite details for a valid token', async () => {
      inviteTokenService.resolve.mockResolvedValue(makeInvite());
      educatorRepo.findOne.mockResolvedValue({ email: 'educator@test.com', full_name: 'Test' });
      const result = await controller.verifyInviteToken({ token: 'good-token' });
      expect(inviteTokenService.resolve).toHaveBeenCalledWith('good-token');
      expect(result.data?.email).toBe('educator@test.com');
    });
  });

  describe('getInviteDetails', () => {
    it('UNIT: returns email and full_name', async () => {
      educatorRepo.findOne.mockResolvedValue({
        email: 'educator@test.com',
        full_name: 'Test',
      });
      const result = await service.getInviteDetails(makeInvite());
      expect(result.data?.email).toBe('educator@test.com');
    });

    it('UNIT: returns empty full_name when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.getInviteDetails(makeInvite());
      expect(result.data?.full_name).toBe('');
    });
  });

  describe('markInviteAccepted', () => {
    it('UNIT: sets status to ACCEPTED', async () => {
      const invite = makeInvite();
      inviteRepo.create.mockResolvedValue({ ...invite, status: InviteStatus.ACCEPTED });
      const result = await service.markInviteAccepted(invite);
      expect(result.status).toBe(InviteStatus.ACCEPTED);
    });
  });

  describe('acceptInvite', () => {
    const mockRes = { cookie: jest.fn() } as unknown as import('express').Response;
    const dto = { token: 'mock-invite-token', password: 'StrongP@ssw0rd' };

    it('INTEGRATION: activates the account without issuing a session', async () => {
      const invite = makeInvite();
      inviteTokenService.resolve.mockResolvedValue(invite);
      roleRepo.findBySlug.mockResolvedValue({ id: 'educator-role-uuid' });
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          { userRoleId: 'ur-uuid', roleId: 'educator-role-uuid', status: CommonStatus.PENDING },
        ],
      });
      inviteRepo.acceptInvite.mockResolvedValue({ id: 'edu-uuid', is_active: true });

      const result = await service.acceptInvite(dto);

      expect(inviteRepo.acceptInvite).toHaveBeenCalledTimes(1);
      expect(inviteRepo.acceptInvite).toHaveBeenCalledWith({
        inviteId: invite.id,
        userId: 'user-v2-uuid',
        roleId: 'educator-role-uuid',
        userRoleId: 'ur-uuid',
        hashedPassword: expect.any(String) as string,
      });
      expect(tokenService.setAuthCookies).not.toHaveBeenCalled();
      expect(result.data).toBeUndefined();
    });

    it('INTEGRATION: notifies the district admin only after the accept commits', async () => {
      inviteTokenService.resolve.mockResolvedValue(makeInvite());
      roleRepo.findBySlug.mockResolvedValue({ id: 'educator-role-uuid' });
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          { userRoleId: 'ur-uuid', roleId: 'educator-role-uuid', status: CommonStatus.PENDING },
        ],
      });
      inviteRepo.acceptInvite.mockResolvedValue({
        id: 'edu-uuid',
        full_name: 'Edu',
        districtAdminId: 'da-uuid',
        admin: { userRole: { userId: 'admin-user-uuid' } },
      });

      await service.acceptInvite(dto);

      expect(notificationsGateway.notifyAdminEducatorInvitationAccepted).toHaveBeenCalledWith(
        'admin-user-uuid',
        'edu-uuid',
        'Edu',
        expect.any(String) as string,
      );
    });

    it('INTEGRATION: returns 409 and sends no notification when the invite was already accepted', async () => {
      inviteTokenService.resolve.mockResolvedValue(makeInvite());
      roleRepo.findBySlug.mockResolvedValue({ id: 'educator-role-uuid' });
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          { userRoleId: 'ur-uuid', roleId: 'educator-role-uuid', status: CommonStatus.PENDING },
        ],
      });
      inviteRepo.acceptInvite.mockRejectedValue(new ConflictException('Invite already accepted'));

      await expect(service.acceptInvite(dto)).rejects.toThrow(ConflictException);
      expect(notificationsGateway.notifyAdminEducatorInvitationAccepted).not.toHaveBeenCalled();
    });

    it('INTEGRATION: propagates a repository failure without notifying', async () => {
      inviteTokenService.resolve.mockResolvedValue(makeInvite());
      roleRepo.findBySlug.mockResolvedValue({ id: 'educator-role-uuid' });
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-v2-uuid',
        userRoles: [
          { userRoleId: 'ur-uuid', roleId: 'educator-role-uuid', status: CommonStatus.PENDING },
        ],
      });
      inviteRepo.acceptInvite.mockRejectedValue(new Error('db down'));

      await expect(service.acceptInvite(dto)).rejects.toThrow();
      expect(notificationsGateway.notifyAdminEducatorInvitationAccepted).not.toHaveBeenCalled();
    });

    it('INTEGRATION: rejects an invite that is not found', async () => {
      inviteTokenService.resolve.mockRejectedValue(
        new BadRequestException('Invalid or expired invite'),
      );
      await expect(service.acceptInvite(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('service helpers', () => {
    it('findCreatorById returns user', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      expect((await service.findCreatorById('admin-uuid'))?.id).toBe('admin-uuid');
    });

    it('findCreatorById returns null when not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      expect(await service.findCreatorById('bad')).toBeNull();
    });

    it('findSchoolByOwner returns school', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      expect((await service.findSchoolByOwner('school-uuid', 'admin-uuid'))?.id).toBe(
        'school-uuid',
      );
    });

    it('findPendingInviteByEmail returns null when no pending invite', async () => {
      inviteRepo.findOne.mockResolvedValue(null);
      expect(await service.findPendingInviteByEmail('new@test.com')).toBeNull();
    });

    it('findRoleByName returns role', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'r-1', role_name: 'Educator' });
      expect((await service.findRoleByName('Educator'))?.role_name).toBe('Educator');
    });
  });
});