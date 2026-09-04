import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClassTransferController } from '../../../src/class-transfer/class-transfer.controller';
import { ClassTransferService } from '../../../src/class-transfer/class-transfer.service';
import {
  ClassTransferAudit,
  ClassTransferStatus,
} from '../../../src/class-transfer/entity/class-transfer-audit.entity';
import type { ClassTransferDto } from '../../../src/class-transfer/dto/class-transfer.dto';
import { Class } from '../../../src/class/entity/class.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { EducatorSimulation } from '../../../src/educator-simulations/entity/educator-simulation.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import type { JwtRequest } from '../../../src/common/types';
import { AppStatus } from '../../../src/common/utils/messages';
import { ClassTransferConstants } from '../../../src/class-transfer/class-transfer.constants';

// ── Helpers ───────────────────────────────────────────────────────────────

const makeReq = (userId: string, roles: string[]): JwtRequest =>
  Object.assign(new Request('http://localhost'), {
    user: { userId, roles, email: `${userId}@test.com` },
  });

const adminReq   = makeReq('admin-1', ['Admin']);
const educatorReq = makeReq('edu-1',  ['Educator']);

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({ id: 'edu-1', email: 'edu@test.com', full_name: 'Alice Educator',
     status: CommonStatus.ACTIVE, is_active: true, deleted_at: null, ...o }) as Educator;

const makeClass = (o: Partial<Class> = {}): Class =>
  ({ id: 'class-1', class_name: 'Biology 101', educator_id: 'edu-1',
     is_active: true, deleted_at: null, educator: makeEducator(), students: [], ...o });

const makeAudit = (o: Partial<ClassTransferAudit> = {}): ClassTransferAudit =>
  ({ id: 'audit-1', classId: 'class-1', className: 'Biology 101',
     sourceEducatorId: 'edu-1', sourceEducatorName: 'Alice Educator',
     targetEducatorId: 'edu-2', targetEducatorName: 'Bob Educator',
     adminId: 'admin-1', adminEmail: 'admin@test.com',
     status: ClassTransferStatus.SUCCESS, notes: null,
     transferredAt: new Date('2026-01-15T10:00:00Z'), ...o });

const validDto: ClassTransferDto = { classId: 'class-1', targetEducatorId: 'edu-2' };

// ── Mock builder ──────────────────────────────────────────────────────────

/** Creates a fresh mock manager with all methods the service uses inside the transaction. */
function makeMockManager(audit: ClassTransferAudit): {
  manager: { update: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock; createQueryBuilder: jest.Mock; getRepository: jest.Mock };
  qb: { update: jest.Mock; set: jest.Mock; where: jest.Mock; andWhere: jest.Mock; execute: jest.Mock; getMany: jest.Mock };
} {
  const qb = {
    update:       jest.fn().mockReturnThis(),
    set:          jest.fn().mockReturnThis(),
    where:        jest.fn().mockReturnThis(),
    andWhere:     jest.fn().mockReturnThis(),
    execute:      jest.fn().mockResolvedValue({ affected: 1 }),
    getMany:      jest.fn().mockResolvedValue([]),
  };

  const manager = {
    update:             jest.fn().mockResolvedValue(undefined),
    find:               jest.fn().mockResolvedValue([]),
    create:             jest.fn().mockReturnValue(audit),
    save:               jest.fn().mockResolvedValue(audit),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    getRepository:      jest.fn().mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(qb) }),
  };

  return { manager, qb };
}

// ── Test suite ────────────────────────────────────────────────────────────

describe('ClassTransfer (Controller + Service)', () => {
  let controller: ClassTransferController;
  let service: ClassTransferService;

  const classRepo        = { findOne: jest.fn(), find: jest.fn(),
                              createQueryBuilder: jest.fn() };
  const educatorRepo     = { findOne: jest.fn() };
  const classSimRepo     = { find: jest.fn() };
  const educatorSimRepo  = { find: jest.fn() };
  const auditRepo        = { find: jest.fn() };

  let mockManager: ReturnType<typeof makeMockManager>['manager'];

  const dataSource = {
    transaction: jest.fn(),
  };

  const notificationsGateway = {
    notifyClassTransferSourceEducator: jest.fn().mockResolvedValue(undefined),
    notifyClassTransferTargetEducator:  jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const audit = makeAudit();
    const { manager } = makeMockManager(audit);
    mockManager = manager;
    dataSource.transaction.mockImplementation(
      (cb: (m: typeof manager) => Promise<ClassTransferAudit>) => cb(manager),
    );

    // Default QB chain for getEducatorClasses
    const qb = {
      select:   jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where:    jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy:  jest.fn().mockReturnThis(),
      getMany:  jest.fn().mockResolvedValue([]),
    };
    classRepo.createQueryBuilder.mockReturnValue(qb);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: getRepositoryToken(Class),             useValue: classRepo },
        { provide: getRepositoryToken(Educator),          useValue: educatorRepo },
        { provide: getRepositoryToken(ClassSimulation),   useValue: classSimRepo },
        { provide: getRepositoryToken(EducatorSimulation), useValue: educatorSimRepo },
        { provide: getRepositoryToken(ClassTransferAudit), useValue: auditRepo },
        { provide: DataSource,                            useValue: dataSource },
        { provide: NotificationsGateway,                  useValue: notificationsGateway },
      ],
    }).compile();

    controller = module.get(ClassTransferController);
    service    = module.get(ClassTransferService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── RBAC ──────────────────────────────────────────────────────────────

  describe('RBAC', () => {
    it('INTEGRATION: Educator cannot POST transfer', async () => {
      await expect(controller.transfer(validDto, educatorReq)).rejects.toThrow(ForbiddenException);
    });

    it('INTEGRATION: Educator cannot GET audit', async () => {
      await expect(controller.getAuditHistory({}, educatorReq)).rejects.toThrow(ForbiddenException);
    });

    it('INTEGRATION: Educator cannot GET educator classes', async () => {
      await expect(controller.getEducatorClasses('edu-1', educatorReq)).rejects.toThrow(ForbiddenException);
    });

    it.each([['Admin', ['Admin']], ['District Admin', ['District Admin']]])(
      'INTEGRATION: %s role is permitted',
      async (_, roles) => {
        const req = makeReq('admin-1', roles);
        classRepo.findOne.mockResolvedValue(makeClass());
        educatorRepo.findOne
          .mockResolvedValueOnce(makeEducator())
          .mockResolvedValueOnce(makeEducator({ id: 'edu-2' }));
        const res = await controller.transfer(validDto, req);
        expect(res.status).toBe(AppStatus.SUCCESS);
      },
    );
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
      await expect(service.transfer({ classId: 'class-1', targetEducatorId: 'edu-2' }, 'admin-1'))
        .rejects.toThrow(BadRequestException);
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
        .mockResolvedValueOnce(makeEducator({ id: 'edu-2', status: CommonStatus.INACTIVE, is_active: false }));
      await expect(service.transfer(validDto, 'admin-1')).rejects.toThrow(
        ClassTransferConstants.ERRORS.TARGET_EDUCATOR_INACTIVE,
      );
    });

    it('throws correct message for same educator', async () => {
      classRepo.findOne.mockResolvedValue(makeClass({ educator_id: 'edu-2' }));
      await expect(service.transfer({ classId: 'class-1', targetEducatorId: 'edu-2' }, 'admin-1'))
        .rejects.toThrow(ClassTransferConstants.ERRORS.SAME_EDUCATOR);
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

    it('updates classes.educator_id via manager.update()', async () => {
      await service.transfer(validDto, 'admin-1');
      expect(mockManager.update).toHaveBeenCalledWith(
        Class, { id: 'class-1' }, { educator_id: 'edu-2' },
      );
    });

    it('calls manager.update for students educator_id', async () => {
      await service.transfer(validDto, 'admin-1');
      expect(mockManager.update).toHaveBeenCalledWith(
        Student,
        { class_id: 'class-1' },
        { educator_id: 'edu-2' },
      );
    });

    it('updates both class and students records within same transaction', async () => {
      await service.transfer(validDto, 'admin-1');
      expect(mockManager.update).toHaveBeenCalledTimes(2);
    });

    it('creates audit record with correct fields', async () => {
      await service.transfer(validDto, 'admin-1');
      expect(mockManager.create).toHaveBeenCalledWith(
        ClassTransferAudit,
        expect.objectContaining({
          classId: 'class-1',
          sourceEducatorId: 'edu-1',
          targetEducatorId: 'edu-2',
          adminId: 'admin-1',
          status: ClassTransferStatus.SUCCESS,
        }),
      );
    });

    it('fires source educator notification', async () => {
      await service.transfer(validDto, 'admin-1');
      await Promise.resolve();
      expect(notificationsGateway.notifyClassTransferSourceEducator).toHaveBeenCalledWith(
        'edu-1', 'Biology 101', 'Bob Educator', expect.any(String),
      );
    });

    it('fires target educator notification', async () => {
      await service.transfer(validDto, 'admin-1');
      await Promise.resolve();
      expect(notificationsGateway.notifyClassTransferTargetEducator).toHaveBeenCalledWith(
        'edu-2', 'Biology 101', 'Alice Educator', expect.any(String),
      );
    });

    it('notification failure does NOT roll back the transfer', async () => {
      notificationsGateway.notifyClassTransferSourceEducator
        .mockRejectedValueOnce(new Error('socket down'));
      await expect(service.transfer(validDto, 'admin-1')).resolves.toMatchObject({ success: true });
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
        expect.objectContaining({ where: expect.objectContaining({ classId: 'class-1' }) as object }),
      );
    });

    it('passes sourceEducatorId filter', async () => {
      auditRepo.find.mockResolvedValue([]);
      await service.getAuditHistory({ sourceEducatorId: 'edu-1' });
      expect(auditRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sourceEducatorId: 'edu-1' }) as object }),
      );
    });

    it('passes targetEducatorId filter', async () => {
      auditRepo.find.mockResolvedValue([]);
      await service.getAuditHistory({ targetEducatorId: 'edu-2' });
      expect(auditRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ targetEducatorId: 'edu-2' }) as object }),
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
    it('returns classes via QueryBuilder (no raw SQL)', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(), leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([makeClass(), makeClass({ id: 'class-2' })]),
      };
      classRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await service.getEducatorClasses('edu-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('returns empty array when educator has no classes', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(), leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      classRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await service.getEducatorClasses('edu-1');
      expect(result.data).toHaveLength(0);
    });

    it('Admin can call getEducatorClasses endpoint', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(), leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([makeClass()]),
      };
      classRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await controller.getEducatorClasses('edu-1', adminReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('Educator cannot call getEducatorClasses endpoint', async () => {
      await expect(controller.getEducatorClasses('edu-1', educatorReq))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
