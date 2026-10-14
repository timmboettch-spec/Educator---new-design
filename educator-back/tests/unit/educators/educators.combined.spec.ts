import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { SeatRequestCooldownException } from 'src/common/exceptions/seat-request-cooldown.exception';
import { EducatorsController } from '../../../src/educators/educators.controller';
import { EducatorsService } from '../../../src/educators/educators.service';
import { EducatorConstants } from '../../../src/educators/educators.constants';

import { AzureBlobService, LoggerService } from '../../../src/common/services';
import { MailService } from '../../../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { AppStatus, ErrorTypes } from 'src/common/utils/messages';
import {
  DistrictAdmin,
  Educator,
  Invite,
  InviteStatus,
  Schools,
  Student,
  UserRole,
} from 'src/database/entities';
import { EducatorResponse } from 'src/common/interfaces';
import { toEducatorResponse } from 'src/common/utils/educator-identity.util';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SEAT_REQUEST_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  INVITE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_ROLE_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
} from 'src/database/tokens';
import { RoleSlug } from 'src/common/constants';

const makeReq = (userId: string, roles: RoleSlug[] = [RoleSlug.DISTRICT_ADMIN]): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId, roles } });
  return req;
};

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({
    id: 'edu-1',
    full_name: 'Test Educator',
    is_active: true,
    tokens: 10,
    created_at: new Date(),
    updated_at: new Date(),
    // `educators.district_admin_id` is the DistrictAdmin's own PK, not its `user_role_id`.
    districtAdminId: 'da-1',
    admin: {
      districtAdminId: 'da-1',
      userRoleId: 'admin-role-1',
      fullName: 'Admin User',
      userRole: {
        userId: 'admin-1',
        user: { id: 'admin-1', email: 'admin@test.com' },
      },
    } as unknown as DistrictAdmin,
    school: { id: 'school-1', school_name: 'Test School' } as Schools,
    // `Educator.email`/`.status` no longer exist — identity/status now resolve via the linked
    // `userRole.user`/`userRole.status` chain, so the default mock is v2-linked by default.
    userRole: {
      userId: 'user-1',
      status: CommonStatus.ACTIVE,
      user: { id: 'user-1', email: 'edu@test.com', password: null },
    } as unknown as UserRole,
    ...o,
  }) as Educator;

/**
 * The shape services actually return — `email`/`status` are surfaced at the root by
 * `toEducatorResponse`, resolved from the `userRole.user`/`userRole.status` chain, since
 * neither exists as a column on `Educator` any more.
 */
const makeEducatorResponse = (o: Partial<Educator> = {}): EducatorResponse =>
  toEducatorResponse(makeEducator(o));

const makeSchool = (o: Partial<Schools> = {}): Schools =>
  ({ id: 'school-1', school_name: 'Test School', ...o }) as Schools;

const adminReq = makeReq('admin-1');

describe('Educators (Controller + Service)', () => {
  let controller: EducatorsController;
  let service: EducatorsService;

  const educatorRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const userRoleRepo = { update: jest.fn(), findById: jest.fn() };
  const districtAdminRepo = {
    findByUserRoleId: jest.fn(),
    updateByUserRoleId: jest.fn(),
  };
  const schoolRepo = { findOne: jest.fn() };
  const classRepo = { find: jest.fn(), findOne: jest.fn() };
  const studentRepo = { find: jest.fn(), findOne: jest.fn() };
  const classSimulationRepo = { find: jest.fn(), findOne: jest.fn() };
  const inviteRepo = {
    findOne: jest.fn(),
    delete: jest.fn(),
    deleteByEmail: jest.fn(),
    deletePendingByEmail: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const azureBlobService = {
    uploadFile: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
    generateSasUrl: jest.fn().mockImplementation((url: string) => Promise.resolve(url)),
  };
  const dataSource = { query: jest.fn(), transaction: jest.fn() };
  const seatRequestRepo = {
    createWithinCooldown: jest.fn(),
    hardDeleteById: jest.fn(),
  };
  const simulationReportRepo = {
    findStudentScenarioPairsWithAttempts: jest.fn().mockResolvedValue([]),
  };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const loggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue('http://localhost:5173') };
  const notificationsGateway = {
    notifyAccountDeleted: jest.fn(),
    notifyAccountDeactivated: jest.fn(),
    notifyAdminEducatorLowSeatWarning: jest.fn(),
    notifyAdminSchoolLowSeatWarning: jest.fn(),
    notifyAdminEducatorSeatRequest: jest.fn().mockResolvedValue(undefined),
  };
  const educatorSessionService = {
    invalidateEducator: jest.fn().mockResolvedValue(undefined),
    invalidateBySchool: jest.fn().mockResolvedValue([]),
  };
  const inviteTokenService = {
    issue: jest.fn().mockReturnValue('mock-invite-token'),
    buildInviteUrl: jest.fn().mockReturnValue('http://localhost:5173/signup/mock-invite-token'),
    resolve: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EducatorsController],
      providers: [
        EducatorsService,
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: EDUCATOR_SEAT_REQUEST_REPOSITORY, useValue: seatRequestRepo },
        {
          provide: EDUCATOR_SCHOOL_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue({}),
            remove: jest.fn().mockResolvedValue({}),
            update: jest.fn(),
          },
        },
        { provide: USER_ROLE_REPOSITORY, useValue: userRoleRepo },
        { provide: DISTRICT_ADMIN_REPOSITORY, useValue: districtAdminRepo },
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: INVITE_REPOSITORY, useValue: inviteRepo },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
        { provide: EducatorSessionService, useValue: educatorSessionService },
        { provide: InviteTokenService, useValue: inviteTokenService },
        {
          provide: SIMULATION_REPORT_REPOSITORY,
          useValue: simulationReportRepo,
        },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();
    controller = module.get(EducatorsController);
    service = module.get(EducatorsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('UNIT: returns educators for admin', async () => {
      educatorRepo.find.mockResolvedValue([makeEducator()]);
      const result = await service.findAll('admin-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('UNIT: returns empty array when none', async () => {
      educatorRepo.find.mockResolvedValue([]);
      const result = await service.findAll('admin-1');
      expect(result.data).toHaveLength(0);
    });

    it('INTEGRATION: GET /educators — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [makeEducatorResponse()] });
      const result = await controller.findAll(adminReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: GET /educators/admin/:adminId — same admin succeeds', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [] });
      const result = await controller.findByAdmin('admin-1', adminReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('REGRESSION: different admin throws', async () => {
      // AUTHORIZATION GAP fix: findByAdmin previously only checked that the caller HAD the
      // DISTRICT_ADMIN role, never that the caller's own userId matched the requested `adminId`
      // path param — so any district admin could fetch any other admin's educators.
      // `EducatorsController.findByAdmin` now rejects when `req.user.userId !== adminId`.
      await expect(controller.findByAdmin('other-admin', adminReq)).rejects.toThrow();
    });

    it('rejects a caller with no district-admin role and no adminId claim, regardless of the requested adminId', async () => {
      // There is no "Super Admin" bypass anywhere in the RoleSlug model (only
      // DISTRICT_ADMIN/SCENARIO_ADMIN/EDUCATOR/STUDENT exist) or in the auth design docs — a
      // caller without the district-admin role/claim must always be rejected by findByAdmin,
      // regardless of whose educators they ask for.
      const noRoleReq = makeReq('someone-1', []);
      const result = controller.findByAdmin('other-admin', noRoleReq);
      await expect(result).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('UNIT: returns educator', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      const result = await service.findOne(makeEducator());
      expect(result.data?.id).toBe('edu-1');
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue({ success: false, message: 'Not found', type: 'notfound' });
      await expect(controller.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: returns educator', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue({
        success: true,
        message: 'Fetched',
        data: makeEducatorResponse(),
      });
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ success: true, message: 'Fetched', data: makeEducatorResponse() });
      const result = await controller.findOne('edu-1');
      expect((result.data as Educator).id).toBe('edu-1');
    });
  });

  describe('update', () => {
    it('UNIT: updates full_name', async () => {
      const updated = makeEducator({ full_name: 'New Name' });
      educatorRepo.create.mockResolvedValue(updated);
      educatorRepo.findOne.mockResolvedValue(updated);
      const result = await service.update(makeEducator(), { full_name: 'New Name' });
      expect(result.data?.full_name).toBe('New Name');
    });

    it('REGRESSION: reactivating a never-registered educator clears their old invites before re-inviting', async () => {
      const target = makeEducator({
        userRoleId: 'ur-1',
        userRole: {
          userId: 'user-1',
          status: CommonStatus.INACTIVE,
          user: { id: 'user-1', email: 'edu@test.com', password: null },
        } as unknown as UserRole,
      });
      jest.spyOn(service, 'updateProfile').mockResolvedValue({ success: true, data: null });
      educatorRepo.create.mockResolvedValue(target);
      educatorRepo.findOne.mockResolvedValue(target);
      inviteRepo.create.mockResolvedValueOnce({ id: 'invite-1' });

      const result = await service.update(target, { status: CommonStatus.ACTIVE });

      expect(inviteRepo.deleteByEmail).toHaveBeenCalledWith('edu@test.com');
      expect(inviteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'edu@test.com' }),
      );
      expect(result.success).toBe(true);
    });

    it('UNIT: updates status', async () => {
      const target = makeEducator({ userRoleId: 'ur-1' });
      educatorRepo.create.mockResolvedValue(target);
      educatorRepo.findOne.mockResolvedValue(target);
      await service.update(target, { status: CommonStatus.INACTIVE });
      // `Educator.status` no longer exists — the write now targets the linked `user_roles` row.
      expect(userRoleRepo.update).toHaveBeenCalledWith(
        { userRoleId: 'ur-1' },
        { status: expect.any(String) },
      );
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(null);
      await expect(controller.update('bad-id', { full_name: 'X' }, adminReq)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: throws BadRequestException when school not owned', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(makeEducator());
      jest.spyOn(service, 'findSchoolByOwner').mockResolvedValue(null);
      await expect(
        controller.update('edu-1', { school_id: 'bad-school' }, adminReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('INTEGRATION: updates successfully', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(makeEducator());
      jest.spyOn(service, 'update').mockResolvedValue({
        success: true,
        message: 'Updated',
        data: makeEducatorResponse({ full_name: 'New' }),
      });
      const result = await controller.update('edu-1', { full_name: 'New' }, adminReq);
      expect((result.data as Educator).full_name).toBe('New');
    });
  });

  describe('remove', () => {
    it('UNIT: removes educator', async () => {
      dataSource.query.mockResolvedValue([]);
      classRepo.find.mockResolvedValue([]);
      dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
        const manager = {
          findOne: jest.fn().mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(null),
          find: jest.fn().mockResolvedValue([]),
          save: jest.fn().mockResolvedValue({}),
          query: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        };
        await cb(manager);
      });
      const result = await service.remove(makeEducator());
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('UNIT: refunds the educator tokens plus the seats of students with no Attempt, read from the database', async () => {
      dataSource.query.mockResolvedValue([]);
      classRepo.find.mockResolvedValue([]);
      simulationReportRepo.findStudentScenarioPairsWithAttempts.mockResolvedValue([
        { studentId: 'stu-1', scenarioId: 'sim-1' },
      ]);
      const admin = { subscriptions: [{ end: '2027-01-01', seats_available: 5 }] };
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(makeEducator({ tokens: 2 }))
          .mockResolvedValueOnce(admin),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('FROM students s')) {
            return Promise.resolve([
              { id: 'stu-1', class_id: 'class-1' },
              { id: 'stu-2', class_id: 'class-1' },
              { id: 'stu-3', class_id: 'class-1' },
            ]);
          }
          if (sql.includes('FROM class_simulations cs')) {
            return Promise.resolve([{ simulation_id: 'sim-1', class_id: 'class-1' }]);
          }
          return Promise.resolve([]);
        }),
      };
      dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<void>) => {
        await cb(manager);
      });

      await service.remove(makeEducator());

      expect(simulationReportRepo.findStudentScenarioPairsWithAttempts).toHaveBeenCalledWith(
        ['stu-1', 'stu-2', 'stu-3'],
        ['sim-1'],
      );
      // 2 remaining tokens + 2 students (stu-2, stu-3) who never ran the AI sim = 4.
      expect(admin.subscriptions[0].seats_available).toBe(9);
    });

    it('REGRESSION: sends an account-deleted email (durable channel) instead of only a dead in-app notification', async () => {
      dataSource.query.mockResolvedValue([]);
      classRepo.find.mockResolvedValue([]);
      dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
        const manager = {
          findOne: jest.fn().mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(null),
          find: jest.fn().mockResolvedValue([]),
          save: jest.fn().mockResolvedValue({}),
          query: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        };
        await cb(manager);
      });
      mailService.sendMail.mockClear();

      await service.remove(makeEducator());

      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'edu@test.com',
          template: 'account-deleted',
          attachments: expect.any(Array),
        }),
      );
      // Socket-only signal for a live session — no persisted (inaccessible) row.
      expect(notificationsGateway.notifyAccountDeleted).toHaveBeenCalledWith('edu-1');
    });

    it('REGRESSION: deletes the pending invite so the same email can be re-invited', async () => {
      dataSource.query.mockResolvedValue([]);
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(null),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue({}),
        query: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
      dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<void>) => {
        await cb(manager);
      });

      await service.remove(makeEducator());

      const [entity, where] = manager.delete.mock.calls[0] as [
        unknown,
        { email: FindOperator<string>; status: InviteStatus },
      ];
      expect(entity).toBe(Invite);
      expect(where.status).toBe(InviteStatus.PENDING);
      // Matched case-insensitively, so a legacy mixed-case invite row is removed too.
      expect(where.email.type).toBe('raw');
      expect(where.email.objectLiteralParameters).toEqual({ email: 'edu@test.com' });
    });

    it('UNIT: logs a warning and skips the invite cleanup when the educator has no email', async () => {
      dataSource.query.mockResolvedValue([]);
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(null),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue({}),
        query: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
      dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<void>) => {
        await cb(manager);
      });

      const result = await service.remove(makeEducator({ userRole: null }));

      expect(result.success).toBe(true);
      expect(manager.delete).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(expect.stringContaining('edu-1'));
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(null);
      await expect(controller.remove('bad-id', adminReq)).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: deletes successfully', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(makeEducator());
      jest
        .spyOn(service, 'remove')
        .mockResolvedValue({ success: true, message: 'Deleted', data: null });
      const result = await controller.remove('edu-1', adminReq);
      expect(result.data).toBeNull();
    });
  });

  describe('resendInvite', () => {
    it('REGRESSION: clears the pending invites for the email before sending a fresh one', async () => {
      jest.spyOn(service, 'findByIdAndOwner').mockResolvedValue(
        makeEducator({
          userRole: {
            userId: 'user-1',
            status: CommonStatus.PENDING,
            user: { id: 'user-1', email: 'edu@test.com', password: null },
          } as unknown as UserRole,
        }),
      );
      inviteRepo.create.mockResolvedValueOnce({ id: 'invite-1' });

      const result = await service.resendInvite('edu-1', 'admin-1');

      expect(result.success).toBe(true);
      expect(inviteRepo.deletePendingByEmail).toHaveBeenCalledWith('edu@test.com');
      expect(inviteRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('removeSeats / reallocateSeats — ownership check', () => {
    // Both methods lock the target educator row(s) via a raw `manager.query` (pessimistic write
    // lock) inside `dataSource.transaction`, then compare the row's `district_admin_id` against
    // the caller's own admin id — rejecting with NOT_FOUND on a mismatch (educators.service.ts
    // now uses `district_admins`/`district_admin_id`, not the stale `users`/`admin_id`).
    it('removeSeats: rejects when the educator belongs to a different admin', async () => {
      dataSource.transaction.mockImplementation(
        async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
          const manager = {
            query: jest
              .fn()
              .mockResolvedValueOnce([{ tokens: 10, district_admin_id: 'other-admin' }]),
          };
          await cb(manager);
        },
      );

      const result = await service.removeSeats('edu-1', 2, 'admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorConstants.MESSAGES.NOT_FOUND);
      expect(result.type).toBe(ErrorTypes.NOT_FOUND);
    });

    it('removeSeats: succeeds and deducts tokens when the educator belongs to the calling admin', async () => {
      dataSource.transaction.mockImplementation(
        async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
          const manager = {
            query: jest
              .fn()
              .mockResolvedValueOnce([{ tokens: 10, district_admin_id: 'admin-1' }])
              .mockResolvedValueOnce(undefined)
              .mockResolvedValueOnce([]),
          };
          await cb(manager);
        },
      );

      const result = await service.removeSeats('edu-1', 3, 'admin-1');

      expect(result.success).toBe(true);
      expect(result.data?.remainingTokens).toBe(7);
    });

    it('reallocateSeats: rejects when the source educator belongs to a different admin', async () => {
      dataSource.transaction.mockImplementation(
        async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
          const manager = {
            query: jest.fn().mockResolvedValueOnce([
              { id: 'edu-source', tokens: 10, district_admin_id: 'other-admin' },
              { id: 'edu-target', tokens: 5, district_admin_id: 'admin-1' },
            ]),
          };
          await cb(manager);
        },
      );

      const result = await service.reallocateSeats('edu-source', 'edu-target', 2, 'admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorConstants.MESSAGES.NOT_FOUND);
      expect(result.type).toBe(ErrorTypes.NOT_FOUND);
    });

    it('reallocateSeats: rejects when the target educator belongs to a different admin', async () => {
      dataSource.transaction.mockImplementation(
        async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
          const manager = {
            query: jest.fn().mockResolvedValueOnce([
              { id: 'edu-source', tokens: 10, district_admin_id: 'admin-1' },
              { id: 'edu-target', tokens: 5, district_admin_id: 'other-admin' },
            ]),
          };
          await cb(manager);
        },
      );

      const result = await service.reallocateSeats('edu-source', 'edu-target', 2, 'admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe(EducatorConstants.MESSAGES.REALLOCATE_SEATS_TARGET_NOT_FOUND);
      expect(result.type).toBe(ErrorTypes.NOT_FOUND);
    });

    it('reallocateSeats: succeeds when both source and target belong to the calling admin', async () => {
      dataSource.transaction.mockImplementation(
        async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
          const manager = {
            query: jest
              .fn()
              .mockResolvedValueOnce([
                { id: 'edu-source', tokens: 10, district_admin_id: 'admin-1' },
                { id: 'edu-target', tokens: 5, district_admin_id: 'admin-1' },
              ])
              .mockResolvedValueOnce(undefined)
              .mockResolvedValueOnce(undefined),
          };
          await cb(manager);
        },
      );

      const result = await service.reallocateSeats('edu-source', 'edu-target', 4, 'admin-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ sourceRemainingTokens: 6, targetRemainingTokens: 9 });
    });
  });

  describe('tokens', () => {
    it('UNIT: availableTokens returns count', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ tokens: 10 }));
      expect(await service.availableTokens('edu-1')).toBe(10);
    });

    it('UNIT: availableTokens returns 0 when not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      expect(await service.availableTokens('bad')).toBe(0);
    });

    it('UNIT: updateToken deducts correctly', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ tokens: 10 }));
      educatorRepo.create.mockResolvedValue(makeEducator({ tokens: 7 }));
      await service.updateToken('edu-1', 3);
      expect(educatorRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tokens: 7 }));
    });

    it('UNIT: updateToken does not go below 0', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ tokens: 2 }));
      educatorRepo.create.mockResolvedValue(makeEducator({ tokens: 0 }));
      await service.updateToken('edu-1', 10);
      expect(educatorRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tokens: 0 }));
    });

    it('UNIT: updateToken no-op when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      await service.updateToken('bad', 5);
      expect(educatorRepo.create).not.toHaveBeenCalled();
    });

    describe('notifyIfSeatsBelowThreshold', () => {
      const withAdmin = () =>
        makeEducator({ admin: { userRole: { userId: 'admin-user-1' } } } as never);

      it('UNIT: warns the admin when the balance crosses below the threshold', async () => {
        educatorRepo.findOne.mockResolvedValue(withAdmin());
        await service.notifyIfSeatsBelowThreshold('edu-1', 12, 4);
        expect(notificationsGateway.notifyAdminEducatorLowSeatWarning).toHaveBeenCalledWith(
          'admin-user-1',
          'edu-1',
          expect.any(String),
          4,
        );
      });

      it('UNIT: stays quiet when the balance was already below the threshold', async () => {
        educatorRepo.findOne.mockResolvedValue(withAdmin());
        await service.notifyIfSeatsBelowThreshold('edu-1', 8, 4);
        expect(notificationsGateway.notifyAdminEducatorLowSeatWarning).not.toHaveBeenCalled();
      });

      it('UNIT: skips the lookup when nothing was spent', async () => {
        await service.notifyIfSeatsBelowThreshold('edu-1', 12, 12);
        expect(educatorRepo.findOne).not.toHaveBeenCalled();
        expect(notificationsGateway.notifyAdminEducatorLowSeatWarning).not.toHaveBeenCalled();
      });

      it('UNIT: updateToken still warns when its deduction crosses the threshold', async () => {
        educatorRepo.findOne.mockResolvedValue({ ...withAdmin(), tokens: 12 });
        await service.updateToken('edu-1', 5);
        expect(notificationsGateway.notifyAdminEducatorLowSeatWarning).toHaveBeenCalledWith(
          'admin-user-1',
          'edu-1',
          expect.any(String),
          7,
        );
      });
    });
  });

  describe('updateProfile', () => {
    it('UNIT: returns not found when educator missing', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.updateProfile('bad', { full_name: 'X' });
      expect(result.success).toBe(false);
    });

    it('UNIT: updates full_name', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      educatorRepo.create.mockResolvedValue(makeEducator({ full_name: 'New' }));
      const result = await service.updateProfile('edu-1', { full_name: 'New' });
      expect(result.success).toBe(true);
      expect(result.message).toBe(EducatorConstants.MESSAGES.PROFILE_UPDATED);
      expect(result.data?.full_name).toBe('New');
    });

    it('UNIT: uploads profile picture when file provided', async () => {
      azureBlobService.uploadFile.mockResolvedValue('https://azure.blob/pic.png');
      const updatedEducator = makeEducator({ profile_picture: 'https://azure.blob/pic.png' });
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      educatorRepo.create.mockResolvedValue(updatedEducator);
      const file = {
        buffer: Buffer.from('img'),
        originalname: 'pic.png',
        mimetype: 'image/png',
      } as Express.Multer.File;
      const result = await service.updateProfile('edu-1', {}, file);
      expect(result.success).toBe(true);
      expect(azureBlobService.uploadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('service helpers', () => {
    it('findByIdAndOwner returns educator', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      expect((await service.findByIdAndOwner('edu-1', 'admin-1'))?.id).toBe('edu-1');
    });

    it('findByIdAndOwner returns null for wrong admin', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      expect(await service.findByIdAndOwner('edu-1', 'wrong')).toBeNull();
    });

    it('findSchoolByOwner returns school', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      expect((await service.findSchoolByOwner('school-1', 'admin-1'))?.id).toBe('school-1');
    });
  });

  describe('requestMoreSeats', () => {
    const requestedAt = new Date('2026-01-01T00:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
      seatRequestRepo.createWithinCooldown
        .mockReset()
        .mockResolvedValue({ seatRequestId: 'sr-1', requestedAt });
      seatRequestRepo.hardDeleteById.mockReset().mockResolvedValue(1);
      notificationsGateway.notifyAdminEducatorSeatRequest.mockClear();
      mailService.sendMail.mockClear();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('UNIT: sends notification + email and returns success', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      userRepo.findOne.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        full_name: 'Admin User',
      });

      const result = await service.requestMoreSeats('edu-1', {
        requested_seats: 20,
        note: 'Need more for new class',
      });

      expect(result.success).toBe(true);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).toHaveBeenCalledWith(
        'admin-1',
        'edu-1',
        'Test Educator',
        'edu@test.com',
        20,
        10,
        'Need more for new class',
      );
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@test.com',
          template: 'educator-seat-request',
        }),
      );
    });

    it('UNIT: succeeds without requested_seats or note (general CTA)', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      userRepo.findOne.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });

      const result = await service.requestMoreSeats('edu-1', {});
      expect(result.success).toBe(true);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).toHaveBeenCalledWith(
        'admin-1',
        'edu-1',
        'Test Educator',
        'edu@test.com',
        null,
        10,
        undefined,
      );
    });

    it('UNIT: returns not found when educator is inactive/missing', async () => {
      educatorRepo.findOne.mockResolvedValue(null);
      const result = await service.requestMoreSeats('nope', { requested_seats: 5 });
      expect(result.success).toBe(false);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).not.toHaveBeenCalled();
    });

    it('UNIT: returns admin-not-found when educator has no admin owner', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ admin: null }));
      const result = await service.requestMoreSeats('edu-1', {});
      expect(result.success).toBe(false);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).not.toHaveBeenCalled();
    });

    it('UNIT: returns NOT_FOUND when the repository reports the educator is no longer active', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      seatRequestRepo.createWithinCooldown.mockRejectedValue(new NotFoundException());

      const result = await service.requestMoreSeats('edu-1', { requested_seats: 5 });

      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.NOT_FOUND);
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).not.toHaveBeenCalled();
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('UNIT: returns cooldown error with stored requestedAt and seconds remaining', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      seatRequestRepo.createWithinCooldown.mockRejectedValue(
        new SeatRequestCooldownException(requestedAt),
      );

      const result = await service.requestMoreSeats('edu-1', { requested_seats: 5 });

      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.BAD_REQUEST);
      expect(result.data).toEqual({
        requestedAt: '2026-01-01T00:00:00.000Z',
        cooldownSeconds: 23 * 60 * 60,
      });
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).not.toHaveBeenCalled();
    });

    it('UNIT: rethrows unexpected repository errors without notifying', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      seatRequestRepo.createWithinCooldown.mockRejectedValue(new Error('db down'));

      await expect(service.requestMoreSeats('edu-1', {})).rejects.toThrow('db down');
      expect(notificationsGateway.notifyAdminEducatorSeatRequest).not.toHaveBeenCalled();
    });

    it('UNIT: creates via the repository with the admin id and cooldown minutes, then notifies', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());

      const result = await service.requestMoreSeats('edu-1', { requested_seats: 5, note: ' hi ' });

      expect(result.success).toBe(true);
      expect(seatRequestRepo.createWithinCooldown).toHaveBeenCalledWith(
        { educatorId: 'edu-1', districtAdminId: 'da-1', requestedSeats: 5, note: 'hi' },
        1440,
      );
      expect(seatRequestRepo.createWithinCooldown.mock.invocationCallOrder[0]).toBeLessThan(
        notificationsGateway.notifyAdminEducatorSeatRequest.mock.invocationCallOrder[0],
      );
      expect(result.data).toEqual({
        requestedAt: '2026-01-01T00:00:00.000Z',
        cooldownSeconds: 23 * 60 * 60,
      });
    });

    it('UNIT: removes the row and returns SEAT_REQUEST_FAILED when notifying fails', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      notificationsGateway.notifyAdminEducatorSeatRequest.mockRejectedValueOnce(new Error('boom'));

      const result = await service.requestMoreSeats('edu-1', {});

      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.INTERNAL_SERVER_ERROR);
      expect(seatRequestRepo.hardDeleteById).toHaveBeenCalledWith('sr-1');
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('UNIT: logs seat_request_id when notify and cleanup both fail', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      notificationsGateway.notifyAdminEducatorSeatRequest.mockRejectedValueOnce(new Error('boom'));
      seatRequestRepo.hardDeleteById.mockRejectedValueOnce(new Error('db down'));
      const loggerError = jest.spyOn(service['logger'], 'error');

      const result = await service.requestMoreSeats('edu-1', {});

      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.INTERNAL_SERVER_ERROR);
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('seat_request_id=sr-1'),
        expect.any(Error),
      );
    });

    it('UNIT: does not fail request when email send throws', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      userRepo.findOne.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
      mailService.sendMail.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.requestMoreSeats('edu-1', { requested_seats: 5 });
      expect(result.success).toBe(true);
    });
  });
});
