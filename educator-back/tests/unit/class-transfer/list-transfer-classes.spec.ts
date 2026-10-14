import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { ClsService } from 'nestjs-cls';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { ClassTransferController } from 'src/class-transfer/class-transfer.controller';
import { ClassTransferService } from 'src/class-transfer/class-transfer.service';
import { ListTransferClassesReqDto } from 'src/class-transfer/dto/list-transfer-classes.dto';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { LoggerService } from 'src/common/services';
import {
  CLASS_REPOSITORY,
  CLASS_TRANSFER_AUDIT_REPOSITORY,
  EDUCATOR_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
} from 'src/database/tokens';
import { Educator, EducatorSchool, Schools, UserRole } from 'src/database/entities';
import {
  ClassTransferFailureReason,
  ClassTransferListSortField,
  RoleSlug,
} from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import type { ICurrentUser, ITransferClassListRow } from 'src/common/interfaces';
import { CLASS_MSG } from 'src/common/messages/class.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

const ADMIN_ID = 'da-1';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_A = 'school-a';
const SCHOOL_B = 'school-b';

const currentUser: ICurrentUser = {
  userId: 'admin-user-1',
  email: 'admin@test.com',
  adminId: ADMIN_ID,
  roles: [RoleSlug.DISTRICT_ADMIN],
};

const makeEducator = (
  id: string,
  name: string,
  o: { status?: CommonStatus; isActive?: boolean; schoolIds?: string[] } = {},
): Educator =>
  ({
    id,
    full_name: name,
    is_active: o.isActive ?? true,
    school: null,
    schoolAssignments: (o.schoolIds ?? [SCHOOL_A]).map(
      (schoolId) => ({ school: { id: schoolId } as Schools }) as unknown as EducatorSchool,
    ),
    userRole: {
      status: o.status ?? CommonStatus.ACTIVE,
      user: { email: `${id}@test.com` },
    } as unknown as UserRole,
  }) as Educator;

const makeRow = (n: number, o: Partial<ITransferClassListRow> = {}): ITransferClassListRow => ({
  id: `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  className: `Class ${n}`,
  educatorId: SOURCE_ID,
  schoolId: SCHOOL_A,
  schoolName: 'Lincoln High',
  googleCourseId: null,
  isActive: true,
  deletedAt: null,
  status: CommonStatus.ACTIVE,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  studentsCount: 12,
  ...o,
});

describe('ClassTransfer class list (Controller + Service)', () => {
  let controller: ClassTransferController;
  let service: ClassTransferService;

  const classRepo = { findTransferClassesForEducator: jest.fn() };
  const educatorRepo = { findByIdForDistrictAdmin: jest.fn() };
  const googleConnectionRepo = { findConnectedSchoolIds: jest.fn() };
  const i18n = {
    t: jest.fn((key: string, opts?: { args?: Record<string, unknown> }) =>
      opts?.args ? `${key}${JSON.stringify(opts.args)}` : key,
    ),
  };

  const givenEducators = (map: Record<string, Educator | null>): void => {
    educatorRepo.findByIdForDistrictAdmin.mockImplementation((id: string) =>
      Promise.resolve(map[id] ?? null),
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    givenEducators({
      [SOURCE_ID]: makeEducator(SOURCE_ID, 'Jhon Educator'),
      [TARGET_ID]: makeEducator(TARGET_ID, 'Max Educator'),
    });
    classRepo.findTransferClassesForEducator.mockResolvedValue({ rows: [makeRow(1)], total: 1 });
    googleConnectionRepo.findConnectedSchoolIds.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_TRANSFER_AUDIT_REPOSITORY, useValue: {} },
        { provide: GOOGLE_SCHOOL_CONNECTION_REPOSITORY, useValue: googleConnectionRepo },
        { provide: NotificationsGateway, useValue: {} },
        { provide: I18nService, useValue: i18n },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LoggerService, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    controller = module.get(ClassTransferController);
    service = module.get(ClassTransferService);
  });

  const list = (dto: Partial<ListTransferClassesReqDto> = {}, educatorId = SOURCE_ID) =>
    service.listTransferClasses(currentUser, educatorId, { page: 1, pageSize: 10, ...dto });

  describe('controller', () => {
    it('is restricted to district admins', () => {
      expect(
        Reflect.getMetadata(ROLES_KEY, ClassTransferController.prototype.listTransferClasses),
      ).toEqual([RoleSlug.DISTRICT_ADMIN]);
    });

    it('passes currentUser, the educator id and the query straight through', async () => {
      const result = { message: 'm', data: [] };
      const spy = jest.spyOn(service, 'listTransferClasses').mockResolvedValue(result);
      const dto = { page: 2, pageSize: 20 };

      await expect(controller.listTransferClasses(currentUser, SOURCE_ID, dto)).resolves.toBe(
        result,
      );
      expect(spy).toHaveBeenCalledWith(currentUser, SOURCE_ID, dto);
    });
  });

  describe('ListTransferClassesReqDto validation', () => {
    const firstMessage = async (query: Record<string, unknown>, field: string) => {
      const errors = await validate(plainToInstance(ListTransferClassesReqDto, query), {
        whitelist: true,
        forbidNonWhitelisted: true,
        stopAtFirstError: true,
      });
      return Object.values(errors.find((e) => e.property === field)?.constraints ?? {})[0];
    };

    it('accepts an empty query and applies the pagination defaults', async () => {
      const dto = plainToInstance(ListTransferClassesReqDto, {});
      expect(await validate(dto)).toEqual([]);
      expect(dto).toMatchObject({ page: 1, pageSize: 10 });
    });

    it('accepts every supported filter, coercing page numbers from the query string', async () => {
      const dto = plainToInstance(ListTransferClassesReqDto, {
        page: '2',
        pageSize: '50',
        search: 'Bio',
        targetEducatorId: TARGET_ID,
        sortBy: ClassTransferListSortField.STUDENTS,
        sortDir: 'desc',
      });
      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
      expect(dto).toMatchObject({ page: 2, pageSize: 50 });
    });

    it.each([
      [
        'pageSize above 50',
        { pageSize: '51' },
        'pageSize',
        VALIDATION_MSG.MAX_VALUE('pageSize', 50),
      ],
      ['page below 1', { page: '0' }, 'page', VALIDATION_MSG.MIN_VALUE('page', 1)],
      [
        'a non-uuid targetEducatorId',
        { targetEducatorId: 'abc' },
        'targetEducatorId',
        VALIDATION_MSG.IS_UUID('targetEducatorId'),
      ],
      ['an unknown sortBy', { sortBy: 'sims' }, 'sortBy', VALIDATION_MSG.IS_ENUM('sortBy')],
      [
        'an unknown sortDir',
        { sortBy: 'status', sortDir: 'up' },
        'sortDir',
        VALIDATION_MSG.IS_ENUM('sortDir'),
      ],
      [
        'a search over 200 characters',
        { search: 'x'.repeat(201) },
        'search',
        VALIDATION_MSG.MAX_LENGTH('search', 200),
      ],
    ])('rejects %s', async (_label, query, field, message) => {
      expect(await firstMessage(query, field)).toBe(message);
    });

    it.each([
      ['true', true],
      ['false', false],
    ])('coerces transferableOnly=%s from the query string', async (raw, expected) => {
      const dto = plainToInstance(ListTransferClassesReqDto, { transferableOnly: raw });
      expect(await validate(dto)).toEqual([]);
      expect(dto.transferableOnly).toBe(expected);
    });

    it('rejects an invalid sortDir even without sortBy', async () => {
      expect(await firstMessage({ sortDir: 'up' }, 'sortDir')).toBe(
        VALIDATION_MSG.IS_ENUM('sortDir'),
      );
    });

    it('accepts a valid sortDir without sortBy (it is simply unused)', async () => {
      const dto = plainToInstance(ListTransferClassesReqDto, { sortDir: 'desc' });
      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    });

    it('rejects a transferableOnly that is not a boolean', async () => {
      expect(await firstMessage({ transferableOnly: 'yes' }, 'transferableOnly')).toBe(
        VALIDATION_MSG.IS_BOOLEAN('transferableOnly'),
      );
    });

    it('rejects an unknown query field', async () => {
      const errors = await validate(plainToInstance(ListTransferClassesReqDto, { extra: '1' }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errors.map((e) => e.property)).toContain('extra');
    });
  });

  describe('refusals', () => {
    it('400 when the token carries no district admin id', async () => {
      await expect(
        service.listTransferClasses({ ...currentUser, adminId: undefined }, SOURCE_ID, {}),
      ).rejects.toThrow(new BadRequestException(CLASS_MSG.TRANSFER.MISSING_ADMIN));
    });

    it('404 when the source educator is not under the acting admin', async () => {
      givenEducators({});
      await expect(list()).rejects.toThrow(
        new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator')),
      );
      expect(classRepo.findTransferClassesForEducator).not.toHaveBeenCalled();
    });

    it('404 when the given target is not under the acting admin', async () => {
      givenEducators({ [SOURCE_ID]: makeEducator(SOURCE_ID, 'Jhon') });
      await expect(list({ targetEducatorId: TARGET_ID })).rejects.toThrow(NotFoundException);
    });

    it('400 when the target is the source, in any letter case', async () => {
      await expect(list({ targetEducatorId: SOURCE_ID.toUpperCase() })).rejects.toThrow(
        new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR),
      );
      expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
    });

    it('400 when the target is not active', async () => {
      givenEducators({
        [SOURCE_ID]: makeEducator(SOURCE_ID, 'Jhon'),
        [TARGET_ID]: makeEducator(TARGET_ID, 'Max', { status: CommonStatus.PENDING }),
      });
      await expect(list({ targetEducatorId: TARGET_ID })).rejects.toThrow(
        new BadRequestException(CLASS_MSG.TRANSFER.TARGET_INACTIVE),
      );
    });

    it('still lists the classes of a source educator who is not active (read-only)', async () => {
      givenEducators({ [SOURCE_ID]: makeEducator(SOURCE_ID, 'Jhon', { isActive: false }) });
      const { data } = await list();
      expect(data).toHaveLength(1);
    });
  });

  describe('query and pagination', () => {
    it('looks up the source by its lower-cased id, scoped to the acting admin', async () => {
      await list({}, SOURCE_ID.toUpperCase());
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(SOURCE_ID, ADMIN_ID);
      expect(classRepo.findTransferClassesForEducator).toHaveBeenCalledWith(
        SOURCE_ID,
        expect.anything(),
      );
    });

    it('passes the page as skip/take, the trimmed search and the sort', async () => {
      await list({
        page: 3,
        pageSize: 20,
        search: '  Bio ',
        sortBy: ClassTransferListSortField.STUDENTS,
        sortDir: 'desc',
      });
      expect(classRepo.findTransferClassesForEducator).toHaveBeenCalledWith(SOURCE_ID, {
        search: 'Bio',
        transferableOnly: false,
        sortBy: ClassTransferListSortField.STUDENTS,
        sortDir: 'DESC',
        skip: 40,
        take: 20,
      });
    });

    it('passes transferableOnly through only when it is true', async () => {
      await list({ transferableOnly: true });
      expect(classRepo.findTransferClassesForEducator).toHaveBeenLastCalledWith(
        SOURCE_ID,
        expect.objectContaining({ transferableOnly: true }),
      );
      await list({ transferableOnly: false });
      expect(classRepo.findTransferClassesForEducator).toHaveBeenLastCalledWith(
        SOURCE_ID,
        expect.objectContaining({ transferableOnly: false }),
      );
    });

    it('still flags receiver problems on listed classes when transferableOnly is combined with a target', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({
        rows: [makeRow(1, { schoolId: SCHOOL_B })],
        total: 1,
      });
      const { data } = await list({ transferableOnly: true, targetEducatorId: TARGET_ID });
      expect(data![0]).toMatchObject({
        transferable: false,
        reasonCode: ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL,
      });
    });

    it('drops a blank search and defaults the sort direction to ascending', async () => {
      await list({ search: '   ' });
      expect(classRepo.findTransferClassesForEducator).toHaveBeenCalledWith(
        SOURCE_ID,
        expect.objectContaining({ search: undefined, sortBy: undefined, sortDir: 'ASC' }),
      );
    });

    it('returns the paginated envelope with meta built from the total', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({
        rows: [makeRow(11)],
        total: 25,
      });
      const result = await list({ page: 2, pageSize: 10 });
      expect(result.message).toBe(SUCCESS_MSG.COMMON.FETCHED('Classes'));
      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        pageSize: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('returns an empty page with the true total when the page is past the end', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({ rows: [], total: 5 });
      const result = await list({ page: 9, pageSize: 10 });
      expect(result.data).toEqual([]);
      expect(result.meta).toMatchObject({ total: 5, hasNextPage: false, hasPrevPage: true });
    });
  });

  describe('transferability per class', () => {
    it('maps each row to the item shape', async () => {
      const { data } = await list();
      expect(data).toEqual([
        {
          classId: makeRow(1).id,
          className: 'Class 1',
          status: CommonStatus.ACTIVE,
          isActive: true,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          studentsCount: 12,
          schoolId: SCHOOL_A,
          schoolName: 'Lincoln High',
          googleLinked: false,
          transferable: true,
          reasonCode: null,
          reason: null,
        },
      ]);
    });

    it('without a target, flags archived classes but not INACTIVE or DRAFT ones', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({
        rows: [
          makeRow(1, { status: CommonStatus.ARCHIVED }),
          makeRow(2, { status: CommonStatus.ARCHIEVED }),
          makeRow(3, { status: CommonStatus.INACTIVE }),
          makeRow(4, { status: CommonStatus.DRAFT }),
        ],
        total: 4,
      });

      const { data } = await list();

      expect(data!.map((c) => [c.transferable, c.reasonCode])).toEqual([
        [false, ClassTransferFailureReason.CLASS_ARCHIVED],
        [false, ClassTransferFailureReason.CLASS_ARCHIVED],
        [true, null],
        [true, null],
      ]);
      expect(data![0].reason).toBe(CLASS_MSG.TRANSFER.REASON.CLASS_ARCHIVED);
    });

    it('without a target, flags only inactive classes and ignores receiver rules', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({
        rows: [
          makeRow(1, { isActive: false, status: CommonStatus.INACTIVE }),
          makeRow(2, { schoolId: SCHOOL_B }),
          makeRow(3, { googleCourseId: 'gc-1' }),
        ],
        total: 3,
      });

      const { data } = await list();

      expect(data!.map((c) => [c.transferable, c.reasonCode])).toEqual([
        [false, ClassTransferFailureReason.CLASS_INACTIVE],
        [true, null],
        [true, null],
      ]);
      expect(data![0].reason).toBe(CLASS_MSG.TRANSFER.REASON.CLASS_INACTIVE);
      expect(data![2].googleLinked).toBe(true);
      expect(googleConnectionRepo.findConnectedSchoolIds).not.toHaveBeenCalled();
    });

    it('with a target, applies the school and Google rules exactly as the bulk transfer does', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({
        rows: [
          makeRow(1),
          makeRow(2, { schoolId: SCHOOL_B }),
          makeRow(3, { googleCourseId: 'gc-1' }),
          makeRow(4, { schoolId: null }),
        ],
        total: 4,
      });

      const { data } = await list({ targetEducatorId: TARGET_ID });

      expect(data!.map((c) => c.reasonCode)).toEqual([
        null,
        ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL,
        ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION,
        null,
      ]);
      expect(data![2].reason).toBe(
        'class.TRANSFER.REASON.TARGET_NO_GOOGLE_CONNECTION{"targetName":"Max Educator"}',
      );
      expect(googleConnectionRepo.findConnectedSchoolIds).toHaveBeenCalledWith(TARGET_ID, [
        SCHOOL_A,
      ]);
    });

    it('passes a Google-linked class when the target is connected for its school', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({
        rows: [makeRow(1, { googleCourseId: 'gc-1' })],
        total: 1,
      });
      googleConnectionRepo.findConnectedSchoolIds.mockResolvedValue([SCHOOL_A]);

      const { data } = await list({ targetEducatorId: TARGET_ID });

      expect(data![0]).toMatchObject({ transferable: true, reasonCode: null });
    });
  });
});
