import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SchoolsController } from '../../../src/schools/schools.controller';
import { SchoolsService } from '../../../src/schools/schools.service';

import { ResponseResult } from 'src/common/class/response.class';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { MailService } from '../../../src/mail/mail.service';
import { Schools, User } from 'src/database/entities';
import { DatabaseService } from 'src/database/services/database.service';
import { LoggerService } from 'src/common/services';
import {
  CLASS_SIMULATION_REPOSITORY,
  INVITE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_REPOSITORY,
} from 'src/database/tokens';
import { RoleSlug } from 'src/common/constants';
import { InviteTokenService } from '../../../src/invites/invite-token.service';

const makeReq = (userId: string, roles: RoleSlug[]): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId, roles } });
  return req;
};

const makeUser = (o: Partial<User> = {}): User =>
  ({ id: 'user-1', status: CommonStatus.ACTIVE, ...o }) as User;

const makeSchool = (o: Partial<Schools> = {}): Schools => ({
  id: 'school-1',
  school_name: 'Test School',
  status: CommonStatus.ACTIVE,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  lms_enabled: false,
  user_id: makeUser(),
  ...o,
});

const districtReq = makeReq('user-1', [RoleSlug.DISTRICT_ADMIN]);
const educatorReq = makeReq('user-1', [RoleSlug.EDUCATOR]);

describe('Schools (Controller + Service)', () => {
  let controller: SchoolsController;
  let service: SchoolsService;

  const schoolRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    findAllForAdmin: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const classSimulationRepo = { update: jest.fn() };
  const inviteRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteByEmail: jest.fn(),
  };
  const mailService = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendInviteEmail: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn().mockReturnValue(undefined),
  };
  const notificationsGateway = {
    notifyEducatorSchoolDeactivated: jest.fn(),
    notifyEducatorSchoolRemoved: jest.fn(),
    notifyEducatorSchoolStatusChanged: jest.fn(),
    notifyAdminEducatorStatusUpdated: jest.fn(),
  };

  // Chainable query builder mock for the transaction manager's createQueryBuilder
  const makeQbMock = (): Record<string, jest.Mock> => {
    const qb: Record<string, jest.Mock> = {};
    const chain = (): Record<string, jest.Mock> => qb;
    qb.select = jest.fn().mockReturnValue(qb);
    qb.from = jest.fn().mockReturnValue(qb);
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.groupBy = jest.fn().mockReturnValue(qb);
    qb.having = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.delete = jest.fn().mockReturnValue(qb);
    qb.execute = jest.fn().mockResolvedValue({});
    void chain;
    return qb;
  };

  // Mock EntityManager passed into DatabaseService.runInTransaction's callback.
  const manager = {
    update: jest.fn(),
    find: jest.fn(),
    findByIds: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const databaseService = {
    runInTransaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
  };
  const inviteTokenService = {
    issue: jest.fn().mockReturnValue('mock-invite-token'),
    buildInviteUrl: jest
      .fn()
      .mockReturnValue('http://localhost:5173/signup/mock-invite-token'),
    resolve: jest.fn(),
  };

  beforeEach(async () => {
    manager.find.mockResolvedValue([]);
    manager.findByIds.mockResolvedValue([]);
    manager.update.mockResolvedValue({});
    manager.save.mockResolvedValue({});
    manager.createQueryBuilder.mockReturnValue(makeQbMock());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolsController],
      providers: [
        SchoolsService,
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: INVITE_REPOSITORY, useValue: inviteRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: DatabaseService, useValue: databaseService },
        {
          provide: EducatorSessionService,
          useValue: {
            isTokenInvalidated: jest.fn().mockResolvedValue(false),
            invalidateBySchool: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
        { provide: InviteTokenService, useValue: inviteTokenService },
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
      ],
    }).compile();
    controller = module.get(SchoolsController);
    service = module.get(SchoolsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('UNIT: creates school successfully', async () => {
      schoolRepo.create.mockResolvedValue(makeSchool());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await service.create('user-1', { school_name: 'Test School' });
      expect(result.success).toBe(true);
    });

    it('INTEGRATION: throws ForbiddenException for non-District Admin', async () => {
      await expect(controller.create({ school_name: 'X' }, educatorReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws ForbiddenException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(controller.create({ school_name: 'X' }, districtReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws ForbiddenException when user inactive', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ status: CommonStatus.INACTIVE }));
      await expect(controller.create({ school_name: 'X' }, districtReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws BadRequestException when school exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      await expect(controller.create({ school_name: 'Test School' }, districtReq)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: creates successfully', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeSchool());
      schoolRepo.create.mockResolvedValue(makeSchool());
      const result = await controller.create({ school_name: 'Test School' }, districtReq);
      expect(result.data).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('UNIT: returns schools for user', async () => {
      schoolRepo.findAllForAdmin.mockResolvedValue([makeSchool()]);
      const result = await service.findAll('user-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /schools/user — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [makeSchool()] });
      const result = await controller.findAll(districtReq);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByAdmin', () => {
    // Per ADR-0006 this is enforced by @RequiredRoles on the route, evaluated by the global
    // AuthGuard before the handler runs — a direct controller call in a unit test bypasses the
    // guard, so the declaration is what's assertable here. Runtime enforcement is proved in
    // tests/integration/auth/route-coverage.integration.spec.ts.
    it('declares @RequiredRoles(DISTRICT_ADMIN) on findByAdmin, so a non-admin never reaches it', () => {
      const roles = new Reflector().getAllAndOverride<RoleSlug[]>(ROLES_KEY, [
        SchoolsController.prototype.findByAdmin as () => unknown,
        SchoolsController,
      ]);
      expect(roles).toEqual([RoleSlug.DISTRICT_ADMIN]);
    });

    // A roleless caller is rejected by the guard, not the handler: there is no "Super Admin"
    // bypass anywhere in the RoleSlug model (only DISTRICT_ADMIN/SCENARIO_ADMIN/EDUCATOR/STUDENT
    // exist), and @RequiredRoles(DISTRICT_ADMIN) above admits no one else whatever adminId they
    // ask for. The declaration assertion above covers it; the guard's own refusal of an
    // unmatched role is covered in tests/unit/guards/auth.guard.spec.ts.
  });

  describe('findOne', () => {
    it('UNIT: returns school', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await service.findOne(makeSchool());
      expect(result.data?.id).toBe('school-1');
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      schoolRepo.findOne.mockResolvedValue(null);
      await expect(controller.findOne({ id: 'bad' }, districtReq)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: returns school', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await controller.findOne({ id: 'school-1' }, districtReq);
      expect((result.data as Schools).id).toBe('school-1');
    });
  });

  describe('update', () => {
    it('UNIT: updates school name', async () => {
      const updated = makeSchool({ school_name: 'New' });
      schoolRepo.create.mockResolvedValue(updated);
      schoolRepo.findOne.mockResolvedValue(updated);
      const result = await service.update(makeSchool(), { school_name: 'New' });
      expect(result.data?.school_name).toBe('New');
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      schoolRepo.findOne.mockResolvedValue(null);
      await expect(
        controller.update({ id: 'bad' }, { school_name: 'X' }, districtReq),
      ).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: updates successfully', async () => {
      schoolRepo.findOne
        .mockResolvedValueOnce(makeSchool())
        .mockResolvedValueOnce(makeSchool({ school_name: 'New' }));
      schoolRepo.create.mockResolvedValue(makeSchool({ school_name: 'New' }));
      const result = await controller.update(
        { id: 'school-1' },
        { school_name: 'New' },
        districtReq,
      );
      expect((result.data as Schools).school_name).toBe('New');
    });

    it('REGRESSION: deactivation notifies educators returned by the active-educator lookup', async () => {
      dataSource.query.mockResolvedValueOnce([
        { educator_id: 'edu-survivor-1' },
        { educator_id: 'edu-survivor-2' },
      ]);
      const school = makeSchool({ status: CommonStatus.ACTIVE });
      schoolRepo.findOne.mockResolvedValue(school);

      await service.update(school, { status: CommonStatus.INACTIVE });

      expect(notificationsGateway.notifyEducatorSchoolStatusChanged).toHaveBeenCalledWith(
        'edu-survivor-1',
      );
      expect(notificationsGateway.notifyEducatorSchoolStatusChanged).toHaveBeenCalledWith(
        'edu-survivor-2',
      );
      expect(notificationsGateway.notifyEducatorSchoolStatusChanged).toHaveBeenCalledTimes(2);
    });

    it('REGRESSION: reactivation notifies educators with an activated (not deactivated) status', async () => {
      // 1st dataSource.query call = reactivateEducatorsForActiveSchool's lookup (none to restore).
      // 2nd call = the notification-target lookup in the statusChanged block below.
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ educator_id: 'edu-1' }]);
      const school = makeSchool({ status: CommonStatus.INACTIVE });
      schoolRepo.findOne.mockResolvedValue(school);

      await service.update(school, { status: CommonStatus.ACTIVE });

      expect(notificationsGateway.notifyEducatorSchoolStatusChanged).toHaveBeenCalledWith('edu-1');
    });

    it('REGRESSION: reactivation clears the never-registered educator\'s old invites before re-inviting', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'edu-1',
          full_name: 'Pending Educator',
          admin_user_id: null,
          user_role_id: 'ur-1',
          v2_password: null,
          v2_email: 'edu@test.com',
          districtAdminFullName: null,
        },
      ]);
      inviteRepo.create.mockResolvedValueOnce({ id: 'invite-1' });
      const school = makeSchool({ status: CommonStatus.INACTIVE });
      schoolRepo.findOne.mockResolvedValue(school);

      await service.update(school, { status: CommonStatus.ACTIVE });

      expect(inviteRepo.deleteByEmail).toHaveBeenCalledWith('edu@test.com');
      expect(inviteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'edu@test.com' }),
      );
    });
  });

  describe('remove', () => {
    it('UNIT: removes school', async () => {
      const result = await service.remove(makeSchool());
      expect(result).toBeInstanceOf(ResponseResult);
      expect(result.data).toBeNull();
      expect(databaseService.runInTransaction).toHaveBeenCalled();
    });

    it('REGRESSION: notifies every affected educator, including those deactivated by the deletion', async () => {
      const qb = manager.createQueryBuilder();
      // 1st getRawMany call inside remove() = onlySchoolRows (educators to deactivate)
      // 2nd getRawMany call = allAffectedRows (every educator linked to the school)
      (qb.getRawMany as jest.Mock)
        .mockResolvedValueOnce([{ educatorId: 'edu-deactivated' }])
        .mockResolvedValueOnce([{ educatorId: 'edu-deactivated' }, { educatorId: 'edu-survivor' }]);
      manager.find.mockResolvedValueOnce([
        {
          id: 'edu-deactivated',
          full_name: 'Deactivated Educator',
          admin: { userRole: { userId: 'admin-1' } },
        },
      ]);

      const school = makeSchool();
      await service.remove(school);

      expect(notificationsGateway.notifyEducatorSchoolRemoved).toHaveBeenCalledWith('edu-survivor');
      expect(notificationsGateway.notifyEducatorSchoolRemoved).toHaveBeenCalledWith('edu-deactivated');
      expect(notificationsGateway.notifyEducatorSchoolRemoved).toHaveBeenCalledTimes(2);
      expect(notificationsGateway.notifyAdminEducatorStatusUpdated).toHaveBeenCalledWith(
        'admin-1',
        'edu-deactivated',
        'Deactivated Educator',
        CommonStatus.INACTIVE,
      );
    });

    it('INTEGRATION: throws ForbiddenException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(controller.remove({ id: 'school-1' }, districtReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INTEGRATION: throws NotFoundException when school not found', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(null);
      await expect(controller.remove({ id: 'bad' }, districtReq)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: deletes successfully', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const result = await controller.remove({ id: 'school-1' }, districtReq);
      expect(result.data).toBeNull();
      expect(databaseService.runInTransaction).toHaveBeenCalled();
    });
  });

  describe('regression', () => {
    it('create: uses req.user.userId when dto.user_id not provided', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeSchool());
      schoolRepo.create.mockResolvedValue(makeSchool());
      const spy = jest.spyOn(service, 'findUserById');
      await controller.create({ school_name: 'X' }, districtReq);
      expect(spy).toHaveBeenCalledWith('user-1');
    });

    it('update: status unchanged when not in dto', async () => {
      const school = makeSchool();
      schoolRepo.findOne.mockResolvedValueOnce(school).mockResolvedValueOnce(school);
      schoolRepo.create.mockResolvedValue(school);
      const result = await controller.update(
        { id: 'school-1' },
        { school_name: 'Only Name' },
        districtReq,
      );
      expect((result.data as Schools).status).toBe(CommonStatus.ACTIVE);
    });
  });
});
