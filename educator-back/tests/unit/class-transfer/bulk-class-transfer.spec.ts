import 'reflect-metadata';
import { HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';
import { ClassTransferController } from 'src/class-transfer/class-transfer.controller';
import { ClassTransferService } from 'src/class-transfer/class-transfer.service';
import { BulkClassTransferReqDto } from 'src/class-transfer/dto/bulk-class-transfer.dto';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { LoggerService } from 'src/common/services';
import {
  CLASS_REPOSITORY,
  CLASS_TRANSFER_AUDIT_REPOSITORY,
  EDUCATOR_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassTransferAudit,
  ClassTransferStatus,
  Educator,
  EducatorSchool,
  Schools,
  UserRole,
} from 'src/database/entities';
import { ClassConstants, ClassTransferFailureReason, RoleSlug } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ClassTransferConflictException } from 'src/common/exceptions/class-transfer-conflict.exception';
import type {
  IClassTransferCandidate,
  IClassTransferFailureRecord,
  ICurrentUser,
} from 'src/common/interfaces';
import { CLASS_MSG } from 'src/common/messages/class.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

// ── Fixtures ──────────────────────────────────────────────────────────────

const ADMIN_ID = 'da-1';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_A = 'school-a';
const SCHOOL_B = 'school-b';

const classId = (n: number): string => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const currentUser: ICurrentUser = {
  userId: 'admin-user-1',
  email: 'admin@test.com',
  adminId: ADMIN_ID,
  roles: [RoleSlug.DISTRICT_ADMIN],
};

const makeEducator = (
  o: Partial<Educator> & { status?: CommonStatus; schoolIds?: string[] } = {},
): Educator => {
  const { status = CommonStatus.ACTIVE, schoolIds = [SCHOOL_A], ...rest } = o;
  return {
    id: SOURCE_ID,
    full_name: 'Jhon Educator',
    is_active: true,
    deleted_at: null,
    school: null,
    schoolAssignments: schoolIds.map(
      (id) => ({ school: { id } as Schools, is_primary: false }) as unknown as EducatorSchool,
    ),
    userRole: {
      status,
      user: { id: 'u-1', email: 'edu@test.com' },
    } as unknown as UserRole,
    ...rest,
  } as Educator;
};

const source = (o: Parameters<typeof makeEducator>[0] = {}): Educator =>
  makeEducator({ id: SOURCE_ID, full_name: 'Jhon Educator', ...o });
const target = (o: Parameters<typeof makeEducator>[0] = {}): Educator =>
  makeEducator({ id: TARGET_ID, full_name: 'Max Educator', ...o });

const makeCandidate = (
  n: number,
  o: Partial<IClassTransferCandidate> = {},
): IClassTransferCandidate => ({
  id: classId(n),
  className: `Class ${n}`,
  educatorId: SOURCE_ID,
  schoolId: SCHOOL_A,
  googleCourseId: null,
  isActive: true,
  deletedAt: null,
  status: CommonStatus.ACTIVE,
  ...o,
});

const makeAudit = (n: number): ClassTransferAudit =>
  ({
    id: `audit-${n}`,
    classId: classId(n),
    className: `Class ${n}`,
    status: ClassTransferStatus.SUCCESS,
    transferredAt: new Date(`2026-10-08T07:56:2${n}.000Z`),
  }) as ClassTransferAudit;

const dtoFor = (...ns: number[]): BulkClassTransferReqDto => ({
  sourceEducatorId: SOURCE_ID,
  targetEducatorId: TARGET_ID,
  classIds: ns.map(classId),
});

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

// ── Suite ─────────────────────────────────────────────────────────────────

describe('ClassTransfer bulk transfer (Controller + Service)', () => {
  let controller: ClassTransferController;
  let service: ClassTransferService;

  const classRepo = { findTransferCandidates: jest.fn(), transferClassInBatch: jest.fn() };
  const educatorRepo = { findByIdForDistrictAdmin: jest.fn() };
  const auditRepo = { recordFailures: jest.fn() };
  const googleConnectionRepo = { findConnectedSchoolIds: jest.fn() };
  const notificationsGateway = {
    notifyClassesTransferredSource: jest.fn(),
    notifyClassesTransferredTarget: jest.fn(),
  };
  // Echo the key and args, so assertions can see exactly what was translated.
  const i18n = {
    t: jest.fn((key: string, opts?: { args?: Record<string, unknown> }) =>
      opts?.args ? `${key}${JSON.stringify(opts.args)}` : key,
    ),
  };
  const cls = { get: jest.fn(() => undefined as AbortController | undefined) };
  // `app.apiTimeoutMs`: 10 s, so the bulk time budget (80%) is 8 s.
  const config = { get: jest.fn(() => 10_000 as number | undefined) };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const givenEducators = (src: Educator | null, tgt: Educator | null): void => {
    educatorRepo.findByIdForDistrictAdmin.mockImplementation((id: string) =>
      Promise.resolve(id === SOURCE_ID ? src : id === TARGET_ID ? tgt : null),
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    givenEducators(source(), target());
    classRepo.findTransferCandidates.mockResolvedValue([]);
    classRepo.transferClassInBatch.mockImplementation((input: { classId: string }) =>
      Promise.resolve(makeAudit(Number(input.classId.slice(-12)))),
    );
    auditRepo.recordFailures.mockResolvedValue(undefined);
    googleConnectionRepo.findConnectedSchoolIds.mockResolvedValue([]);
    notificationsGateway.notifyClassesTransferredSource.mockResolvedValue(undefined);
    notificationsGateway.notifyClassesTransferredTarget.mockResolvedValue(undefined);
    cls.get.mockReturnValue(undefined);
    config.get.mockReturnValue(10_000);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_TRANSFER_AUDIT_REPOSITORY, useValue: auditRepo },
        { provide: GOOGLE_SCHOOL_CONNECTION_REPOSITORY, useValue: googleConnectionRepo },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: I18nService, useValue: i18n },
        { provide: ClsService, useValue: cls },
        { provide: ConfigService, useValue: config },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get(ClassTransferController);
    service = module.get(ClassTransferService);
  });

  // ── Controller ─────────────────────────────────────────────────────────

  describe('controller', () => {
    it('is restricted to district admins only, and is not public', () => {
      expect(
        Reflect.getMetadata(ROLES_KEY, ClassTransferController.prototype.bulkTransfer),
      ).toEqual([RoleSlug.DISTRICT_ADMIN]);
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, ClassTransferController.prototype.bulkTransfer),
      ).toBeUndefined();
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, ClassTransferController)).toBeUndefined();
    });

    it('responds 200, not the POST default 201', () => {
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, ClassTransferController.prototype.bulkTransfer),
      ).toBe(HttpStatus.OK);
    });

    it('passes currentUser and the dto straight through and returns the service result as-is', async () => {
      const result = { message: 'm', data: undefined };
      const spy = jest.spyOn(service, 'bulkTransfer').mockResolvedValue(result);
      const dto = dtoFor(1);

      await expect(controller.bulkTransfer(currentUser, dto)).resolves.toBe(result);
      expect(spy).toHaveBeenCalledWith(currentUser, dto);
    });
  });

  // ── DTO ────────────────────────────────────────────────────────────────

  describe('BulkClassTransferReqDto validation', () => {
    const errorsFor = async (body: Record<string, unknown>): Promise<string[]> => {
      const errors = await validate(plainToInstance(BulkClassTransferReqDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      return errors.map((e) => e.property);
    };
    const valid = {
      sourceEducatorId: SOURCE_ID,
      targetEducatorId: TARGET_ID,
      classIds: [classId(1)],
    };
    const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => classId(i + 1));

    it('accepts a valid body', async () => {
      expect(await errorsFor(valid)).toEqual([]);
    });

    it.each([
      ['missing sourceEducatorId', { ...valid, sourceEducatorId: undefined }, 'sourceEducatorId'],
      ['missing targetEducatorId', { ...valid, targetEducatorId: undefined }, 'targetEducatorId'],
      ['non-uuid sourceEducatorId', { ...valid, sourceEducatorId: 'abc' }, 'sourceEducatorId'],
      [
        'uuid v1 targetEducatorId',
        { ...valid, targetEducatorId: 'a8098c1a-f86e-11da-bd1a-00112444be1e' },
        'targetEducatorId',
      ],
      ['missing classIds', { ...valid, classIds: undefined }, 'classIds'],
      ['classIds not an array', { ...valid, classIds: classId(1) }, 'classIds'],
      ['empty classIds', { ...valid, classIds: [] }, 'classIds'],
      ['duplicate classIds', { ...valid, classIds: [classId(1), classId(1)] }, 'classIds'],
      ['non-uuid class id', { ...valid, classIds: [classId(1), 'nope'] }, 'classIds'],
      ['unknown extra field', { ...valid, extra: true }, 'extra'],
    ])('rejects %s', async (_label, body, property) => {
      expect(await errorsFor(body)).toContain(property);
    });

    it(`accepts exactly ${ClassConstants.TRANSFER.BULK_MAX_CLASSES} classes and rejects one more`, async () => {
      const max = ClassConstants.TRANSFER.BULK_MAX_CLASSES;
      expect(await errorsFor({ ...valid, classIds: ids(max) })).toEqual([]);
      expect(await errorsFor({ ...valid, classIds: ids(max + 1) })).toContain('classIds');
    });

    // The global pipe stops at the first failing check per field, so the reported message must be
    // the one that actually describes the problem.
    describe('reports the message that matches the problem (stopAtFirstError)', () => {
      const firstMessage = async (
        body: Record<string, unknown>,
        field: string,
      ): Promise<string> => {
        const errors = await validate(plainToInstance(BulkClassTransferReqDto, body), {
          whitelist: true,
          forbidNonWhitelisted: true,
          stopAtFirstError: true,
        });
        const constraints = errors.find((e) => e.property === field)?.constraints ?? {};
        return Object.values(constraints)[0];
      };
      const max = ClassConstants.TRANSFER.BULK_MAX_CLASSES;

      it.each([
        ['missing', undefined, VALIDATION_MSG.IS_NOT_EMPTY('classIds')],
        ['null', null, VALIDATION_MSG.IS_NOT_EMPTY('classIds')],
        ['a single uuid string', classId(1), VALIDATION_MSG.IS_ARRAY('classIds')],
        ['a number', 5, VALIDATION_MSG.IS_ARRAY('classIds')],
        ['an object', {}, VALIDATION_MSG.IS_ARRAY('classIds')],
        ['empty', [], VALIDATION_MSG.ARRAY_NOT_EMPTY('classIds')],
        ['over the cap', ids(max + 1), VALIDATION_MSG.ARRAY_MAX_SIZE('classIds', max)],
        ['duplicated', [classId(1), classId(1)], VALIDATION_MSG.ARRAY_UNIQUE('classIds')],
        ['holding a non-uuid', [classId(1), 'nope'], VALIDATION_MSG.IS_UUID('classIds')],
      ])('classIds %s', async (_label, classIds, expected) => {
        expect(await firstMessage({ ...valid, classIds }, 'classIds')).toBe(expected);
      });

      it.each(['sourceEducatorId', 'targetEducatorId'])(
        '%s missing vs malformed',
        async (field) => {
          expect(await firstMessage({ ...valid, [field]: undefined }, field)).toBe(
            VALIDATION_MSG.IS_NOT_EMPTY(field),
          );
          expect(await firstMessage({ ...valid, [field]: '' }, field)).toBe(
            VALIDATION_MSG.IS_NOT_EMPTY(field),
          );
          expect(await firstMessage({ ...valid, [field]: 'abc' }, field)).toBe(
            VALIDATION_MSG.IS_UUID(field),
          );
        },
      );
    });
  });

  // ── Request-level refusals ─────────────────────────────────────────────

  describe('request-level refusals (nothing moves, nothing is audited)', () => {
    const expectNothingMoved = (): void => {
      expect(classRepo.findTransferCandidates).not.toHaveBeenCalled();
      expect(classRepo.transferClassInBatch).not.toHaveBeenCalled();
      expect(auditRepo.recordFailures).not.toHaveBeenCalled();
    };

    it('400 when the token carries no district admin id', async () => {
      await expect(
        service.bulkTransfer({ ...currentUser, adminId: undefined }, dtoFor(1)),
      ).rejects.toThrow(new BadRequestException(CLASS_MSG.TRANSFER.MISSING_ADMIN));
      expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
      expectNothingMoved();
    });

    it('400 when source and target are the same educator', async () => {
      await expect(
        service.bulkTransfer(currentUser, { ...dtoFor(1), targetEducatorId: SOURCE_ID }),
      ).rejects.toThrow(new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR));
      expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
      expectNothingMoved();
    });

    it('400 when source and target are the same educator in different letter case', async () => {
      await expect(
        service.bulkTransfer(currentUser, {
          ...dtoFor(1),
          sourceEducatorId: SOURCE_ID.toUpperCase(),
          targetEducatorId: SOURCE_ID,
        }),
      ).rejects.toThrow(new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR));
      expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
      expectNothingMoved();
    });

    it('400 when the two ids load the same educator row', async () => {
      // Defence in depth: the comparison after loading catches any id form that resolves to one row.
      educatorRepo.findByIdForDistrictAdmin.mockResolvedValue(source());
      await expect(service.bulkTransfer(currentUser, dtoFor(1))).rejects.toThrow(
        new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR),
      );
      expectNothingMoved();
    });

    it('looks educators up by their lower-cased ids', async () => {
      await service.bulkTransfer(currentUser, {
        ...dtoFor(1),
        sourceEducatorId: SOURCE_ID.toUpperCase(),
        targetEducatorId: TARGET_ID.toUpperCase(),
      });
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(SOURCE_ID, ADMIN_ID);
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(TARGET_ID, ADMIN_ID);
    });

    it('looks both educators up scoped to the acting district admin', async () => {
      await service.bulkTransfer(currentUser, dtoFor(1));
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(SOURCE_ID, ADMIN_ID);
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(TARGET_ID, ADMIN_ID);
      expect(classRepo.findTransferCandidates).toHaveBeenCalledWith([classId(1)], ADMIN_ID);
    });

    it.each([
      ['source missing / deleted / another admin', null, target()],
      ['target missing / deleted / another admin', source(), null],
    ])('404 when %s', async (_label, src, tgt) => {
      givenEducators(src, tgt);
      await expect(service.bulkTransfer(currentUser, dtoFor(1))).rejects.toThrow(
        new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator')),
      );
      expectNothingMoved();
    });

    it.each([
      ['is_active=false', source({ is_active: false })],
      ['role status PENDING', source({ status: CommonStatus.PENDING })],
      ['role status INACTIVE', source({ status: CommonStatus.INACTIVE })],
    ])('400 SOURCE_INACTIVE when the source has %s', async (_label, src) => {
      givenEducators(src, target());
      await expect(service.bulkTransfer(currentUser, dtoFor(1))).rejects.toThrow(
        new BadRequestException(CLASS_MSG.TRANSFER.SOURCE_INACTIVE),
      );
      expectNothingMoved();
    });

    it.each([
      ['is_active=false', target({ is_active: false })],
      ['role status PENDING', target({ status: CommonStatus.PENDING })],
    ])('400 TARGET_INACTIVE when the target has %s', async (_label, tgt) => {
      givenEducators(source(), tgt);
      await expect(service.bulkTransfer(currentUser, dtoFor(1))).rejects.toThrow(
        new BadRequestException(CLASS_MSG.TRANSFER.TARGET_INACTIVE),
      );
      expectNothingMoved();
    });

    it('reports SOURCE_INACTIVE first when both educators are inactive', async () => {
      givenEducators(source({ is_active: false }), target({ is_active: false }));
      await expect(service.bulkTransfer(currentUser, dtoFor(1))).rejects.toThrow(
        new BadRequestException(CLASS_MSG.TRANSFER.SOURCE_INACTIVE),
      );
    });

    it('wraps an unexpected repository error as a 500', async () => {
      educatorRepo.findByIdForDistrictAdmin.mockRejectedValue(new Error('db down'));
      await expect(service.bulkTransfer(currentUser, dtoFor(1))).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  // ── Per-class checks ───────────────────────────────────────────────────

  describe('per-class checks (first failure wins)', () => {
    const failureFor = async (
      candidate: IClassTransferCandidate | null,
      connectedSchoolIds: string[] = [],
      tgt: Educator = target(),
    ): Promise<{ reasonCode: ClassTransferFailureReason; reason: string } | undefined> => {
      givenEducators(source(), tgt);
      classRepo.findTransferCandidates.mockResolvedValue(candidate ? [candidate] : []);
      googleConnectionRepo.findConnectedSchoolIds.mockResolvedValue(connectedSchoolIds);
      const { data } = await service.bulkTransfer(currentUser, dtoFor(1));
      return data!.failed[0];
    };

    it('CLASS_NOT_FOUND for a class the loader did not return (missing or another admin), with no audit', async () => {
      expect(await failureFor(null)).toMatchObject({
        reasonCode: ClassTransferFailureReason.CLASS_NOT_FOUND,
      });
      expect(auditRepo.recordFailures).toHaveBeenCalledWith([]);
    });

    it('CLASS_NOT_FOUND for a soft-deleted class in scope, with a FAILED audit', async () => {
      const failure = await failureFor(makeCandidate(1, { deletedAt: new Date() }));
      expect(failure?.reasonCode).toBe(ClassTransferFailureReason.CLASS_NOT_FOUND);
      expect(auditRepo.recordFailures).toHaveBeenCalledWith([
        expect.objectContaining({
          classId: classId(1),
          reason: ClassTransferFailureReason.CLASS_NOT_FOUND,
        }),
      ]);
    });

    it.each([
      ['false', false],
      ['NULL (same rule as legacy)', null],
    ])('CLASS_INACTIVE when is_active is %s', async (_label, isActive) => {
      expect((await failureFor(makeCandidate(1, { isActive })))?.reasonCode).toBe(
        ClassTransferFailureReason.CLASS_INACTIVE,
      );
    });

    it.each([CommonStatus.ARCHIVED, CommonStatus.ARCHIEVED])(
      'CLASS_ARCHIVED when the class status is %s',
      async (status) => {
        expect((await failureFor(makeCandidate(1, { status })))?.reasonCode).toBe(
          ClassTransferFailureReason.CLASS_ARCHIVED,
        );
      },
    );

    it.each([
      CommonStatus.ACTIVE,
      CommonStatus.INACTIVE,
      CommonStatus.DRAFT,
      CommonStatus.ATTENTION,
      CommonStatus.PENDING,
    ])('allows a class whose status is %s', async (status) => {
      expect(await failureFor(makeCandidate(1, { status }))).toBeUndefined();
    });

    it('reports CLASS_INACTIVE before CLASS_ARCHIVED, and CLASS_ARCHIVED before ownership', async () => {
      expect(
        (await failureFor(makeCandidate(1, { isActive: false, status: CommonStatus.ARCHIVED })))
          ?.reasonCode,
      ).toBe(ClassTransferFailureReason.CLASS_INACTIVE);
      expect(
        (
          await failureFor(
            makeCandidate(1, { status: CommonStatus.ARCHIVED, educatorId: 'someone-else' }),
          )
        )?.reasonCode,
      ).toBe(ClassTransferFailureReason.CLASS_ARCHIVED);
    });

    it('translates CLASS_ARCHIVED', async () => {
      expect((await failureFor(makeCandidate(1, { status: CommonStatus.ARCHIVED })))?.reason).toBe(
        CLASS_MSG.TRANSFER.REASON.CLASS_ARCHIVED,
      );
    });

    it('CLASS_NOT_OWNED_BY_SOURCE when another educator owns the class', async () => {
      expect((await failureFor(makeCandidate(1, { educatorId: 'someone-else' })))?.reasonCode).toBe(
        ClassTransferFailureReason.CLASS_NOT_OWNED_BY_SOURCE,
      );
    });

    it("TARGET_NOT_IN_CLASS_SCHOOL when the target isn't assigned to the class's school", async () => {
      expect((await failureFor(makeCandidate(1, { schoolId: SCHOOL_B })))?.reasonCode).toBe(
        ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL,
      );
    });

    it('passes the school check through a non-primary school assignment or the legacy school FK', async () => {
      expect(
        await failureFor(
          makeCandidate(1, { schoolId: SCHOOL_B }),
          [],
          target({ schoolIds: [SCHOOL_A, SCHOOL_B] }),
        ),
      ).toBeUndefined();
      expect(
        await failureFor(
          makeCandidate(1, { schoolId: SCHOOL_B }),
          [],
          target({ schoolIds: [], school: { id: SCHOOL_B } as Schools }),
        ),
      ).toBeUndefined();
    });

    it('skips the school check for a class with no school', async () => {
      expect(await failureFor(makeCandidate(1, { schoolId: null }))).toBeUndefined();
    });

    it('TARGET_NO_GOOGLE_CONNECTION for a Google-linked class without a target connection, with help text naming the target', async () => {
      const failure = await failureFor(makeCandidate(1, { googleCourseId: 'gc-1' }));
      expect(failure).toEqual(
        expect.objectContaining({
          reasonCode: ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION,
          reason: 'class.TRANSFER.REASON.TARGET_NO_GOOGLE_CONNECTION{"targetName":"Max Educator"}',
        }),
      );
      expect(googleConnectionRepo.findConnectedSchoolIds).toHaveBeenCalledWith(TARGET_ID, [
        SCHOOL_A,
      ]);
    });

    it('passes a Google-linked class when the target is connected for its school', async () => {
      expect(
        await failureFor(makeCandidate(1, { googleCourseId: 'gc-1' }), [SCHOOL_A]),
      ).toBeUndefined();
    });

    it('never queries Google connections when no class is Google-linked', async () => {
      await failureFor(makeCandidate(1));
      expect(googleConnectionRepo.findConnectedSchoolIds).not.toHaveBeenCalled();
    });

    it('reports the first failing rule: inactive beats wrong school', async () => {
      expect(
        (await failureFor(makeCandidate(1, { isActive: false, schoolId: SCHOOL_B })))?.reasonCode,
      ).toBe(ClassTransferFailureReason.CLASS_INACTIVE);
    });

    it('translates every reason through i18n with the reason key', async () => {
      const failure = await failureFor(makeCandidate(1, { isActive: false }));
      expect(failure?.reason).toBe(CLASS_MSG.TRANSFER.REASON.CLASS_INACTIVE);
      expect(i18n.t).toHaveBeenCalledWith(
        CLASS_MSG.TRANSFER.REASON.CLASS_INACTIVE,
        expect.anything(),
      );
    });
  });

  // ── Outcome ────────────────────────────────────────────────────────────

  describe('outcome', () => {
    it('transfers every class sequentially under one batch id', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([
        makeCandidate(1),
        makeCandidate(2),
        makeCandidate(3),
      ]);
      let inFlight = 0;
      let maxInFlight = 0;
      classRepo.transferClassInBatch.mockImplementation(async (input: { classId: string }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await flush();
        inFlight -= 1;
        return makeAudit(Number(input.classId.slice(-12)));
      });

      const result = await service.bulkTransfer(currentUser, dtoFor(1, 2, 3));

      expect(maxInFlight).toBe(1);
      const batchIds = classRepo.transferClassInBatch.mock.calls.map(([input]) => input.batchId);
      expect(new Set(batchIds).size).toBe(1);
      expect(result.message).toBe(CLASS_MSG.TRANSFER.BULK_COMPLETED(3, 3));
      expect(result.data).toMatchObject({
        batchId: batchIds[0],
        sourceEducator: { id: SOURCE_ID, name: 'Jhon Educator' },
        targetEducator: { id: TARGET_ID, name: 'Max Educator' },
        requestedCount: 3,
        transferredCount: 3,
        failedCount: 0,
        transferredAt: '2026-10-08T07:56:23.000Z',
        failed: [],
      });
      expect(result.data!.transferred.map((t) => t.classId)).toEqual([
        classId(1),
        classId(2),
        classId(3),
      ]);
      expect(result.data!.transferred[0]).toEqual({
        classId: classId(1),
        className: 'Class 1',
        auditId: 'audit-1',
        transferredAt: '2026-10-08T07:56:21.000Z',
        notice: null,
      });
    });

    it('writes the audit with the admin users.id (not district_admin_id) and the resolved names', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1)]);
      await service.bulkTransfer(currentUser, dtoFor(1));
      expect(classRepo.transferClassInBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: classId(1),
          className: 'Class 1',
          sourceEducatorId: SOURCE_ID,
          sourceEducatorName: 'Jhon Educator',
          targetEducatorId: TARGET_ID,
          targetEducatorName: 'Max Educator',
          adminId: 'admin-user-1',
          adminEmail: 'admin@test.com',
        }),
      );
    });

    it('falls back to the educator email when there is no full name', async () => {
      givenEducators(source(), target({ full_name: null }));
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1)]);
      const { data } = await service.bulkTransfer(currentUser, dtoFor(1));
      expect(data!.targetEducator.name).toBe('edu@test.com');
    });

    it('adds the Google help notice only to Google-linked transferred classes', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([
        makeCandidate(1, { googleCourseId: 'gc-1' }),
        makeCandidate(2),
      ]);
      googleConnectionRepo.findConnectedSchoolIds.mockResolvedValue([SCHOOL_A]);
      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));
      expect(data!.transferred[0].notice).toBe(
        'class.TRANSFER.GOOGLE_ADD_TARGET_TO_COURSE{"targetName":"Max Educator"}',
      );
      expect(data!.transferred[1].notice).toBeNull();
    });

    it('keeps successful classes transferred when others fail, preserving request order', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([
        makeCandidate(1),
        makeCandidate(2, { isActive: false }),
        makeCandidate(3),
        makeCandidate(4, { schoolId: SCHOOL_B }),
        makeCandidate(5),
      ]);

      const { message, data } = await service.bulkTransfer(currentUser, dtoFor(1, 2, 3, 4, 5));

      expect(classRepo.transferClassInBatch).toHaveBeenCalledTimes(3);
      expect(data!.transferred.map((t) => t.classId)).toEqual([classId(1), classId(3), classId(5)]);
      expect(data!.failed.map((f) => [f.classId, f.reasonCode])).toEqual([
        [classId(2), ClassTransferFailureReason.CLASS_INACTIVE],
        [classId(4), ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL],
      ]);
      expect(data).toMatchObject({ requestedCount: 5, transferredCount: 3, failedCount: 2 });
      expect(message).toBe(CLASS_MSG.TRANSFER.BULK_COMPLETED(3, 5));
    });

    it('returns normally (200) when every class fails, with no notifications', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1, { isActive: false })]);
      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));
      expect(data).toMatchObject({
        transferredCount: 0,
        failedCount: 2,
        transferredAt: null,
        transferred: [],
      });
      expect(notificationsGateway.notifyClassesTransferredSource).not.toHaveBeenCalled();
      expect(notificationsGateway.notifyClassesTransferredTarget).not.toHaveBeenCalled();
    });

    it.each([
      ClassTransferFailureReason.CLASS_NOT_OWNED_BY_SOURCE,
      ClassTransferFailureReason.CLASS_INACTIVE,
      ClassTransferFailureReason.CLASS_ARCHIVED,
      ClassTransferFailureReason.CLASS_NOT_FOUND,
    ])(
      'reports %s when the guarded write finds the class changed since the checks',
      async (reason) => {
        classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1)]);
        classRepo.transferClassInBatch.mockRejectedValue(
          new ClassTransferConflictException(classId(1), reason),
        );
        const { data } = await service.bulkTransfer(currentUser, dtoFor(1));
        expect(data!.failed[0].reasonCode).toBe(reason);
        expect(auditRepo.recordFailures).toHaveBeenCalledWith([
          expect.objectContaining({ classId: classId(1), reason }),
        ]);
        expect(logger.error).not.toHaveBeenCalled();
      },
    );

    it('reports TRANSFER_FAILED and logs on an unexpected write error, then carries on', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1), makeCandidate(2)]);
      classRepo.transferClassInBatch
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockResolvedValueOnce(makeAudit(2));

      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));

      expect(data!.failed).toEqual([
        expect.objectContaining({
          classId: classId(1),
          reasonCode: ClassTransferFailureReason.TRANSFER_FAILED,
        }),
      ]);
      expect(data!.transferred.map((t) => t.classId)).toEqual([classId(2)]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('deadlock'));
    });

    it('records every in-scope failure as one FAILED audit batch, after the loop', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([
        makeCandidate(1, { isActive: false }),
        makeCandidate(2),
      ]);
      classRepo.transferClassInBatch.mockRejectedValue(new Error('boom'));

      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2, 3));

      expect(auditRepo.recordFailures).toHaveBeenCalledTimes(1);
      const records = auditRepo.recordFailures.mock.calls[0][0] as IClassTransferFailureRecord[];
      expect(records.map((r) => [r.classId, r.reason])).toEqual([
        [classId(1), ClassTransferFailureReason.CLASS_INACTIVE],
        [classId(2), ClassTransferFailureReason.TRANSFER_FAILED],
      ]);
      expect(
        records.every((r) => r.batchId === data!.batchId && r.adminId === 'admin-user-1'),
      ).toBe(true);
    });

    it('still returns the outcome when writing FAILED audits throws', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1, { isActive: false })]);
      auditRepo.recordFailures.mockRejectedValue(new Error('audit insert failed'));
      const { data } = await service.bulkTransfer(currentUser, dtoFor(1));
      expect(data!.failedCount).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('audit insert failed'));
    });

    it('normalises upper-case ids so they match the loaded (lower-case) rows', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1)]);
      const { data } = await service.bulkTransfer(currentUser, {
        ...dtoFor(),
        classIds: [classId(1).toUpperCase()],
      });
      expect(classRepo.findTransferCandidates).toHaveBeenCalledWith([classId(1)], ADMIN_ID);
      expect(data!.transferredCount).toBe(1);
    });
  });

  // ── Time budget ────────────────────────────────────────────────────────

  describe('time budget (stops early, reports the rest as NOT_PROCESSED)', () => {
    const start = new Date('2026-10-09T08:00:00.000Z').getTime();

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      jest.setSystemTime(start);
    });
    afterEach(() => jest.useRealTimers());

    it('moves classes while inside 80% of the request timeout, then reports the rest as NOT_PROCESSED', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([
        makeCandidate(1),
        makeCandidate(2),
        makeCandidate(3),
      ]);
      // Class 1 takes 8.5 s: past the 8 s budget (80% of 10 s) before class 2 starts.
      classRepo.transferClassInBatch.mockImplementation(async () => {
        jest.setSystemTime(start + 8_500);
        return makeAudit(1);
      });

      const { message, data } = await service.bulkTransfer(currentUser, dtoFor(1, 2, 3));

      expect(classRepo.transferClassInBatch).toHaveBeenCalledTimes(1);
      expect(data).toMatchObject({ requestedCount: 3, transferredCount: 1, failedCount: 2 });
      expect(data!.failed).toEqual([
        {
          classId: classId(2),
          className: 'Class 2',
          reasonCode: ClassTransferFailureReason.NOT_PROCESSED,
          reason: CLASS_MSG.TRANSFER.REASON.NOT_PROCESSED,
        },
        {
          classId: classId(3),
          className: 'Class 3',
          reasonCode: ClassTransferFailureReason.NOT_PROCESSED,
          reason: CLASS_MSG.TRANSFER.REASON.NOT_PROCESSED,
        },
      ]);
      expect(message).toBe(CLASS_MSG.TRANSFER.BULK_COMPLETED(1, 3));
      expect(auditRepo.recordFailures).toHaveBeenCalledWith([
        expect.objectContaining({
          classId: classId(2),
          reason: ClassTransferFailureReason.NOT_PROCESSED,
        }),
        expect.objectContaining({
          classId: classId(3),
          reason: ClassTransferFailureReason.NOT_PROCESSED,
        }),
      ]);
      expect(notificationsGateway.notifyClassesTransferredSource).toHaveBeenCalledWith(
        SOURCE_ID,
        expect.objectContaining({ classIds: [classId(1)] }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('2 of 3 classes not processed'),
      );
    });

    it('keeps going while just inside the budget', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1), makeCandidate(2)]);
      classRepo.transferClassInBatch.mockImplementation(async (input: { classId: string }) => {
        jest.setSystemTime(start + 7_999);
        return makeAudit(Number(input.classId.slice(-12)));
      });

      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));

      expect(data).toMatchObject({ transferredCount: 2, failedCount: 0 });
    });

    it('uses a 60 s request timeout (48 s budget) when none is configured', async () => {
      config.get.mockReturnValueOnce(undefined);
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1), makeCandidate(2)]);
      classRepo.transferClassInBatch.mockImplementation(async () => {
        jest.setSystemTime(start + 47_000);
        return makeAudit(1);
      });

      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));

      expect(data).toMatchObject({ transferredCount: 2, failedCount: 0 });
      expect(config.get).toHaveBeenCalledWith('app.apiTimeoutMs');
    });

    it('reports a class the loader did not return as NOT_PROCESSED too, with no audit row', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1)]);
      classRepo.transferClassInBatch.mockImplementation(async () => {
        jest.setSystemTime(start + 9_000);
        return makeAudit(1);
      });

      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));

      expect(data!.failed).toEqual([
        expect.objectContaining({
          classId: classId(2),
          className: null,
          reasonCode: ClassTransferFailureReason.NOT_PROCESSED,
        }),
      ]);
      expect(auditRepo.recordFailures).toHaveBeenCalledWith([]);
    });

    it('also stops, the same way, once the request has been aborted', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1), makeCandidate(2)]);
      const aborted = new AbortController();
      classRepo.transferClassInBatch.mockImplementation(async () => {
        aborted.abort();
        cls.get.mockReturnValue(aborted);
        return makeAudit(1);
      });

      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));

      expect(classRepo.transferClassInBatch).toHaveBeenCalledTimes(1);
      expect(data!.failed).toEqual([
        expect.objectContaining({
          classId: classId(2),
          reasonCode: ClassTransferFailureReason.NOT_PROCESSED,
        }),
      ]);
    });
  });

  // ── Notifications ──────────────────────────────────────────────────────

  describe('notifications', () => {
    it('sends exactly one summary to each educator', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1), makeCandidate(2)]);
      const { data } = await service.bulkTransfer(currentUser, dtoFor(1, 2));

      const summary = {
        batchId: data!.batchId,
        classIds: [classId(1), classId(2)],
        classNames: ['Class 1', 'Class 2'],
        transferredAt: data!.transferredAt,
      };
      expect(notificationsGateway.notifyClassesTransferredSource).toHaveBeenCalledTimes(1);
      expect(notificationsGateway.notifyClassesTransferredSource).toHaveBeenCalledWith(SOURCE_ID, {
        ...summary,
        otherEducatorName: 'Max Educator',
      });
      expect(notificationsGateway.notifyClassesTransferredTarget).toHaveBeenCalledTimes(1);
      expect(notificationsGateway.notifyClassesTransferredTarget).toHaveBeenCalledWith(TARGET_ID, {
        ...summary,
        otherEducatorName: 'Jhon Educator',
      });
    });

    it('does not fail the transfer when a notification fails, and logs it', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([makeCandidate(1)]);
      notificationsGateway.notifyClassesTransferredTarget.mockRejectedValue(
        new Error('socket down'),
      );

      const { data } = await service.bulkTransfer(currentUser, dtoFor(1));
      await flush();

      expect(data!.transferredCount).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('socket down'));
    });
  });
});
