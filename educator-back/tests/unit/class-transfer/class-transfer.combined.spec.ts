import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClassTransferController } from '../../../src/class-transfer/class-transfer.controller';
import { ClassTransferService } from '../../../src/class-transfer/class-transfer.service';

import type { ClassTransferDto } from '../../../src/class-transfer/dto/class-transfer.dto';

import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { LoggerService } from '../../../src/common/services';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import type { JwtRequest } from '../../../src/common/types';
import { AppStatus } from '../../../src/common/utils/messages';
import { ClassTransferConstants } from '../../../src/class-transfer/class-transfer.constants';
import {
  CLASS_REPOSITORY,
  CLASS_TRANSFER_AUDIT_REPOSITORY,
  EDUCATOR_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
} from '../../../src/database/tokens';
import { I18nService } from 'nestjs-i18n';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import {
  ClassTransferAudit,
  ClassTransferStatus,
  Class,
  Educator,
  Student,
  UserRole,
} from 'src/database/entities';
import { RoleSlug } from 'src/common/constants';

// ── Helpers ───────────────────────────────────────────────────────────────

const makeReq = (userId: string, roles: RoleSlug[]): JwtRequest =>
  Object.assign(new Request('http://localhost'), {
    user: { userId, roles, email: `${userId}@test.com` },
  });

const adminReq = makeReq('admin-1', [RoleSlug.DISTRICT_ADMIN]);

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({
    id: 'edu-1',
    full_name: 'Alice Educator',
    is_active: true,
    deleted_at: null,
    // `Educator.email`/`.status` no longer exist — identity/status resolve via the linked
    // `userRole.user`/`userRole.status` chain, so the default mock is v2-linked by default.
    userRole: {
      userId: 'user-1',
      status: CommonStatus.ACTIVE,
      user: { id: 'user-1', email: 'edu@test.com', password: null },
    } as unknown as UserRole,
    ...o,
  }) as Educator;

const makeClass = (o: Partial<Class> = {}): Class => ({
  id: 'class-1',
  class_name: 'Biology 101',
  educator_id: 'edu-1',
  is_active: true,
  deleted_at: null,
  educator: makeEducator(),
  students: [],
  ...o,
});

const makeAudit = (o: Partial<ClassTransferAudit> = {}): ClassTransferAudit => ({
  id: 'audit-1',
  classId: 'class-1',
  className: 'Biology 101',
  sourceEducatorId: 'edu-1',
  sourceEducatorName: 'Alice Educator',
  targetEducatorId: 'edu-2',
  targetEducatorName: 'Bob Educator',
  adminId: 'admin-1',
  adminEmail: 'admin@test.com',
  status: ClassTransferStatus.SUCCESS,
  notes: null,
  transferredAt: new Date('2026-01-15T10:00:00Z'),
  ...o,
});

const validDto: ClassTransferDto = { classId: 'class-1', targetEducatorId: 'edu-2' };

// ── Test suite ────────────────────────────────────────────────────────────

describe('ClassTransfer (Controller + Service)', () => {
  let controller: ClassTransferController;
  let service: ClassTransferService;

  const classRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    findActiveByEducatorWithSchool: jest.fn(),
    transferToEducator: jest.fn(),
  };
  const educatorRepo = { findOne: jest.fn() };
  const auditRepo = { find: jest.fn() };

  const notificationsGateway = {
    notifyClassTransferSourceEducator: jest.fn().mockResolvedValue(undefined),
    notifyClassTransferTargetEducator: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    classRepo.transferToEducator.mockResolvedValue(makeAudit());

    // Default result for getEducatorClasses
    classRepo.findActiveByEducatorWithSchool.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_TRANSFER_AUDIT_REPOSITORY, useValue: auditRepo },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        // Dependencies of the bulk transfer method on the same service; unused by these tests.
        { provide: GOOGLE_SCHOOL_CONNECTION_REPOSITORY, useValue: {} },
        { provide: I18nService, useValue: {} },
        { provide: ClsService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
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

    controller = module.get(ClassTransferController);
    service = module.get(ClassTransferService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── RBAC ──────────────────────────────────────────────────────────────

  describe('RBAC', () => {
    // Per ADR-0006 these routes no longer refuse an educator inside the handler — the
    // imperative isAdmin() check was replaced by @RequiredRoles(DISTRICT_ADMIN), which the
    // global AuthGuard evaluates before the handler runs. A unit test calling the controller
    // method directly bypasses the guard entirely, so it can only assert the declaration.
    // Runtime enforcement is proved in tests/integration/auth/route-coverage.integration.spec.ts.
    it.each([
      ['transfer', ClassTransferController.prototype.transfer],
      ['getAuditHistory', ClassTransferController.prototype.getAuditHistory],
      ['getEducatorClasses', ClassTransferController.prototype.getEducatorClasses],
    ])('declares @RequiredRoles(DISTRICT_ADMIN) on %s, locking educators out', (_name, handler) => {
      const roles = new Reflector().getAllAndOverride<RoleSlug[]>(ROLES_KEY, [
        handler as () => unknown,
        ClassTransferController,
      ]);
      expect(roles).toEqual([RoleSlug.DISTRICT_ADMIN]);
      expect(roles).not.toContain(RoleSlug.EDUCATOR);
    });

    it('INTEGRATION: District Admin role is permitted', async () => {
      const req = makeReq('admin-1', [RoleSlug.DISTRICT_ADMIN]);
      classRepo.findOne.mockResolvedValue(makeClass());
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())
        .mockResolvedValueOnce(makeEducator({ id: 'edu-2' }));
      const res = await controller.transfer(validDto, req);
      expect(res.status).toBe(AppStatus.SUCCESS);
    });
  });

  // ── Validation ────────────────────────────────────────────────────────

  describe('transfer() — validation', () => {
    it('throws NotFoundException when class not found', async () => {
      classRepo.findOne.mockResolvedValue(null);
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when class is soft-deleted', async () => {
      classRepo.findOne.mockResolvedValue(makeClass({ deleted_at: new Date() }));
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when class is inactive', async () => {
      classRepo.findOne.mockResolvedValue(makeClass({ is_active: false }));
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when class has no owner', async () => {
      classRepo.findOne.mockResolvedValue(makeClass({ educator_id: undefined }));
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when source === target', async () => {
      classRepo.findOne.mockResolvedValue(makeClass({ educator_id: 'edu-2' }));
      await expect(
        service.transfer({ classId: 'class-1', targetEducatorId: 'edu-2' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when source educator missing', async () => {
      classRepo.findOne.mockResolvedValue(makeClass());
      educatorRepo.findOne.mockResolvedValue(null);
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when target educator missing', async () => {
      classRepo.findOne.mockResolvedValue(makeClass());
      educatorRepo.findOne.mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(null);
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when target is soft-deleted', async () => {
      classRepo.findOne.mockResolvedValue(makeClass());
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())
        .mockResolvedValueOnce(makeEducator({ id: 'edu-2', deleted_at: new Date() }));
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when target is inactive', async () => {
      classRepo.findOne.mockResolvedValue(makeClass());
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())
        .mockResolvedValueOnce(makeEducator({ id: 'edu-2', is_active: false }));
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(
        ClassTransferConstants.ERRORS.TARGET_EDUCATOR_INACTIVE,
      );
    });

    it('throws correct message for same educator', async () => {
      classRepo.findOne.mockResolvedValue(makeClass({ educator_id: 'edu-2' }));
      await expect(
        service.transfer({ classId: 'class-1', targetEducatorId: 'edu-2' }, 'admin-1'),
      ).rejects.toThrow(ClassTransferConstants.ERRORS.SAME_EDUCATOR);
    });
  });

  // ── Successful transfer ───────────────────────────────────────────────

  describe('transfer() — success path', () => {
    beforeEach(() => {
      classRepo.findOne.mockResolvedValue(makeClass());
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())
        .mockResolvedValueOnce(makeEducator({ id: 'edu-2', full_name: 'Bob Educator' }));
    });

    it('returns success and audit data', async () => {
      const result = await service.transfer(validDto, 'admin-1', 'admin@test.com');
      expect(result.success).toBe(true);
      expect(result.data?.classId).toBe('class-1');
      expect(result.data?.sourceEducatorId).toBe('edu-1');
      expect(result.data?.targetEducatorId).toBe('edu-2');
    });

    it('delegates every write to one transactional repository call', async () => {
      await service.transfer(validDto, 'admin-1', 'admin@test.com');
      expect(classRepo.transferToEducator).toHaveBeenCalledTimes(1);
      expect(classRepo.transferToEducator).toHaveBeenCalledWith({
        classId: 'class-1',
        className: 'Biology 101',
        sourceEducatorId: 'edu-1',
        sourceEducatorName: 'Alice Educator',
        targetEducatorId: 'edu-2',
        targetEducatorName: 'Bob Educator',
        adminId: 'admin-1',
        adminEmail: 'admin@test.com',
      });
    });

    it('fires source educator notification', async () => {
      await service.transfer(validDto, 'admin-1');
      await Promise.resolve();
      expect(notificationsGateway.notifyClassTransferSourceEducator).toHaveBeenCalledWith(
        'edu-1',
        'class-1',
        'Biology 101',
        'Bob Educator',
        expect.any(String),
      );
    });

    it('fires target educator notification', async () => {
      await service.transfer(validDto, 'admin-1');
      await Promise.resolve();
      expect(notificationsGateway.notifyClassTransferTargetEducator).toHaveBeenCalledWith(
        'edu-2',
        'class-1',
        'Biology 101',
        'Alice Educator',
        expect.any(String),
      );
    });

    it('notification failure does NOT roll back the transfer', async () => {
      notificationsGateway.notifyClassTransferSourceEducator.mockRejectedValueOnce(
        new Error('socket down'),
      );
      await expect(service.transfer(validDto, 'admin-1')).resolves.toMatchObject({ success: true });
    });
  });

  describe('transfer() — rollback', () => {
    it('sends no notification and propagates the error when the repository transaction fails', async () => {
      classRepo.findOne.mockResolvedValue(makeClass());
      educatorRepo.findOne
        .mockResolvedValueOnce(makeEducator())
        .mockResolvedValueOnce(makeEducator({ id: 'edu-2', full_name: 'Bob Educator' }));
      classRepo.transferToEducator.mockRejectedValue(new Error('library sync failed'));

      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow('library sync failed');
      expect(notificationsGateway.notifyClassTransferSourceEducator).not.toHaveBeenCalled();
      expect(notificationsGateway.notifyClassTransferTargetEducator).not.toHaveBeenCalled();
    });
  });

  // ── Audit history ─────────────────────────────────────────────────────

  describe('getAuditHistory()', () => {
    it('returns all records with no filters', async () => {
      auditRepo.find.mockResolvedValue([makeAudit(), makeAudit({ id: 'audit-2' })]);
      const result = await service.getAuditHistory({});
      expect(result.data).toHaveLength(2);
    });

    it('passes classId filter', async () => {
      auditRepo.find.mockResolvedValue([makeAudit()]);
      await service.getAuditHistory({ classId: 'class-1' });
      expect(auditRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ classId: 'class-1' }) as object,
        }),
      );
    });

    it('passes sourceEducatorId filter', async () => {
      auditRepo.find.mockResolvedValue([]);
      await service.getAuditHistory({ sourceEducatorId: 'edu-1' });
      expect(auditRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sourceEducatorId: 'edu-1' }) as object,
        }),
      );
    });

    it('passes targetEducatorId filter', async () => {
      auditRepo.find.mockResolvedValue([]);
      await service.getAuditHistory({ targetEducatorId: 'edu-2' });
      expect(auditRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ targetEducatorId: 'edu-2' }) as object,
        }),
      );
    });

    it('returns empty array when no records match', async () => {
      auditRepo.find.mockResolvedValue([]);
      const result = await service.getAuditHistory({ classId: 'none' });
      expect(result.data).toHaveLength(0);
    });
  });

  // ── getEducatorClasses ────────────────────────────────────────────────

  describe('getEducatorClasses()', () => {
    it('returns classes via the repository adapter (no raw SQL)', async () => {
      classRepo.findActiveByEducatorWithSchool.mockResolvedValue([
        makeClass(),
        makeClass({ id: 'class-2' }),
      ]);
      const result = await service.getEducatorClasses('edu-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('returns empty array when educator has no classes', async () => {
      classRepo.findActiveByEducatorWithSchool.mockResolvedValue([]);
      const result = await service.getEducatorClasses('edu-1');
      expect(result.data).toHaveLength(0);
    });

    it('Admin can call getEducatorClasses endpoint', async () => {
      classRepo.findActiveByEducatorWithSchool.mockResolvedValue([makeClass()]);
      const result = await controller.getEducatorClasses('edu-1', adminReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    // Educator lockout is now a declaration, asserted once in the RBAC block above.
  });
});
