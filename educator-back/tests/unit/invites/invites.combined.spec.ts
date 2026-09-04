import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvitesController } from '../../../src/invites/invites.controller';
import { InvitesService } from '../../../src/invites/invites.service';
import { Invite, InviteStatus } from '../../../src/invites/entity/invite.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { Role } from '../../../src/roles/entity/role.entity';
import { UsersService } from '../../../src/users/users.service';
import { MailService } from '../../../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';

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

  const inviteRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn(), delete: jest.fn() };
  const userRepo = { findOne: jest.fn(), save: jest.fn() };
  const schoolRepo = { findOne: jest.fn() };
  const educatorRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ id: 'edu-uuid' }] }),
    }),
    delete: jest.fn(),
  };
  const roleRepo = { findOne: jest.fn() };
  const mailerService = { sendMail: jest.fn().mockResolvedValue({}) };
  const configService = { get: jest.fn().mockReturnValue('http://localhost:5173') };
  const usersService = { findByEmail: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitesController],
      providers: [
        InvitesService,
        { provide: UsersService, useValue: usersService },
        { provide: getRepositoryToken(Invite), useValue: inviteRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(EducatorSchool), useValue: { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0), upsert: jest.fn().mockResolvedValue({}) } },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: MailService, useValue: mailerService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: { query: jest.fn() } },
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
      inviteRepo.create.mockReturnValue(makeInvite());
      inviteRepo.save.mockResolvedValue(makeInvite());
      const result = await service.createInvite(dto, makeUser(), makeSchool(), null, null);
      expect(result.success).toBe(true);
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

    it('INTEGRATION: throws BadRequestException when user email exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(makeUser());
      await expect(controller.createInvite(dto, makeReq('admin-uuid'))).rejects.toThrow(
        BadRequestException,
      );
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
      const creator = makeUser({ subscriptions: [{ seats_available: 1 }] as object[] });
      await expect(
        service.createInvite(
          { email: 'x@x.com', school_id: 'school-uuid', tokens: 5 },
          creator,
          makeSchool(),
          null,
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyInvite', () => {
    it('UNIT: returns invite data', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite());
      const result = await service.verifyInvite(makeInvite());
      expect(result.success).toBe(true);
    });

    it('INTEGRATION: throws when invite not found', async () => {
      inviteRepo.findOne.mockResolvedValue(null);
      await expect(controller.verifyInvite({ invite_id: 'bad-uuid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: throws when invite ACCEPTED', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite({ status: InviteStatus.ACCEPTED }));
      await expect(controller.verifyInvite({ invite_id: 'invite-uuid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: throws when invite EXPIRED', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite({ status: InviteStatus.EXPIRED }));
      await expect(controller.verifyInvite({ invite_id: 'invite-uuid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: throws when expires_at in the past', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite({ expires_at: new Date(Date.now() - 1000) }));
      await expect(controller.verifyInvite({ invite_id: 'invite-uuid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: succeeds with valid invite', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite());
      jest
        .spyOn(service, 'verifyInvite')
        .mockResolvedValue({ success: true, message: 'Valid', data: makeInvite() });
      const result = await controller.verifyInvite({ invite_id: 'invite-uuid' });
      expect(result.success).toBe(true);
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

    it('INTEGRATION: throws when invite not found', async () => {
      inviteRepo.findOne.mockResolvedValue(null);
      await expect(controller.getInviteDetails('bad-uuid')).rejects.toThrow(BadRequestException);
    });

    it('INTEGRATION: throws when invite not PENDING', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite({ status: InviteStatus.ACCEPTED }));
      await expect(controller.getInviteDetails('invite-uuid')).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptInvite', () => {
    it('UNIT: sets status to ACCEPTED', async () => {
      const invite = makeInvite();
      inviteRepo.save.mockResolvedValue({ ...invite, status: InviteStatus.ACCEPTED });
      const result = await service.acceptInvite(invite);
      expect(result.status).toBe(InviteStatus.ACCEPTED);
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
