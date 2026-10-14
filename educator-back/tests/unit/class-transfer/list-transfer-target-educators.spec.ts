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
import { ListTransferTargetEducatorsReqDto } from 'src/class-transfer/dto/list-transfer-target-educators.dto';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { LoggerService } from 'src/common/services';
import {
  CLASS_REPOSITORY,
  CLASS_TRANSFER_AUDIT_REPOSITORY,
  EDUCATOR_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
} from 'src/database/tokens';
import { Educator } from 'src/database/entities';
import { ClassTransferTargetSortField, RoleSlug } from 'src/common/constants';
import type { ICurrentUser, ITransferTargetRow } from 'src/common/interfaces';
import { CLASS_MSG } from 'src/common/messages/class.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

const ADMIN_ID = 'da-1';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';

const currentUser: ICurrentUser = {
  userId: 'admin-user-1',
  email: 'admin@test.com',
  adminId: ADMIN_ID,
  roles: [RoleSlug.DISTRICT_ADMIN],
};

const makeRow = (n: number, o: Partial<ITransferTargetRow> = {}): ITransferTargetRow => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  fullName: `Educator ${n}`,
  email: `educator${n}@test.com`,
  schoolsCount: 1,
  ...o,
});

describe('ClassTransfer receiving-educator list (Controller + Service)', () => {
  let controller: ClassTransferController;
  let service: ClassTransferService;

  const educatorRepo = {
    findByIdForDistrictAdmin: jest.fn(),
    findTransferTargetsForDistrictAdmin: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    educatorRepo.findByIdForDistrictAdmin.mockImplementation((id: string) =>
      Promise.resolve(id === SOURCE_ID ? ({ id: SOURCE_ID } as Educator) : null),
    );
    educatorRepo.findTransferTargetsForDistrictAdmin.mockResolvedValue({
      rows: [makeRow(1)],
      total: 1,
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: CLASS_REPOSITORY, useValue: {} },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_TRANSFER_AUDIT_REPOSITORY, useValue: {} },
        { provide: GOOGLE_SCHOOL_CONNECTION_REPOSITORY, useValue: {} },
        { provide: NotificationsGateway, useValue: {} },
        { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LoggerService, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    controller = module.get(ClassTransferController);
    service = module.get(ClassTransferService);
  });

  const list = (dto: Partial<ListTransferTargetEducatorsReqDto> = {}, educatorId = SOURCE_ID) =>
    service.listTransferTargetEducators(currentUser, educatorId, { page: 1, pageSize: 10, ...dto });

  describe('controller', () => {
    it('is restricted to district admins', () => {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          ClassTransferController.prototype.listTransferTargetEducators,
        ),
      ).toEqual([RoleSlug.DISTRICT_ADMIN]);
    });

    it('passes currentUser, the educator id and the query straight through', async () => {
      const result = { message: 'm', data: [] };
      const spy = jest.spyOn(service, 'listTransferTargetEducators').mockResolvedValue(result);
      const dto = { page: 2, pageSize: 20 };

      await expect(
        controller.listTransferTargetEducators(currentUser, SOURCE_ID, dto),
      ).resolves.toBe(result);
      expect(spy).toHaveBeenCalledWith(currentUser, SOURCE_ID, dto);
    });
  });

  describe('ListTransferTargetEducatorsReqDto validation', () => {
    const firstMessage = async (query: Record<string, unknown>, field: string) => {
      const errors = await validate(plainToInstance(ListTransferTargetEducatorsReqDto, query), {
        whitelist: true,
        forbidNonWhitelisted: true,
        stopAtFirstError: true,
      });
      return Object.values(errors.find((e) => e.property === field)?.constraints ?? {})[0];
    };

    it('accepts an empty query and applies the pagination defaults', async () => {
      const dto = plainToInstance(ListTransferTargetEducatorsReqDto, {});
      expect(await validate(dto)).toEqual([]);
      expect(dto).toMatchObject({ page: 1, pageSize: 10 });
    });

    it('accepts every supported filter, coercing page numbers from the query string', async () => {
      const dto = plainToInstance(ListTransferTargetEducatorsReqDto, {
        page: '2',
        pageSize: '50',
        search: 'Max',
        sortBy: ClassTransferTargetSortField.EMAIL,
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
      ['an unknown sortBy', { sortBy: 'school' }, 'sortBy', VALIDATION_MSG.IS_ENUM('sortBy')],
      [
        'an invalid sortDir without sortBy',
        { sortDir: 'up' },
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

    it('rejects an unknown query parameter', async () => {
      const errors = await validate(
        plainToInstance(ListTransferTargetEducatorsReqDto, { classIds: 'x' }),
        { whitelist: true, forbidNonWhitelisted: true },
      );
      expect(errors.map((e) => e.property)).toEqual(['classIds']);
    });
  });

  describe('service', () => {
    it('400 when the token carries no district admin id', async () => {
      await expect(
        service.listTransferTargetEducators({ ...currentUser, adminId: undefined }, SOURCE_ID, {}),
      ).rejects.toThrow(new BadRequestException(CLASS_MSG.TRANSFER.MISSING_ADMIN));
      expect(educatorRepo.findTransferTargetsForDistrictAdmin).not.toHaveBeenCalled();
    });

    it('404 when the source educator is not under the acting admin, without listing', async () => {
      educatorRepo.findByIdForDistrictAdmin.mockResolvedValue(null);
      await expect(list()).rejects.toThrow(
        new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator')),
      );
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(SOURCE_ID, ADMIN_ID);
      expect(educatorRepo.findTransferTargetsForDistrictAdmin).not.toHaveBeenCalled();
    });

    it('looks the source up in lower case, so an upper-case id still matches', async () => {
      await list({}, SOURCE_ID.toUpperCase());
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(SOURCE_ID, ADMIN_ID);
    });

    it('excludes the source and passes the trimmed search, sort and page window', async () => {
      await list({
        page: 3,
        pageSize: 5,
        search: '  Max  ',
        sortBy: ClassTransferTargetSortField.EMAIL,
        sortDir: 'desc',
      });
      expect(educatorRepo.findTransferTargetsForDistrictAdmin).toHaveBeenCalledWith(
        ADMIN_ID,
        SOURCE_ID,
        { search: 'Max', sortBy: 'email', sortDir: 'DESC', skip: 10, take: 5 },
      );
    });

    it('drops a whitespace-only search and defaults sortDir to ASC', async () => {
      await list({ search: '   ' });
      expect(educatorRepo.findTransferTargetsForDistrictAdmin).toHaveBeenCalledWith(
        ADMIN_ID,
        SOURCE_ID,
        { search: undefined, sortBy: undefined, sortDir: 'ASC', skip: 0, take: 10 },
      );
    });

    it('maps rows, falling back from the name to the email, then the id', async () => {
      const noName = makeRow(2, { fullName: null, schoolsCount: 0 });
      const nothing = makeRow(3, { fullName: null, email: null, schoolsCount: 3000 });
      educatorRepo.findTransferTargetsForDistrictAdmin.mockResolvedValue({
        rows: [makeRow(1, { schoolsCount: 2 }), noName, nothing],
        total: 23,
      });

      const result = await list({ page: 2, pageSize: 10 });

      expect(result.message).toBe(SUCCESS_MSG.COMMON.FETCHED('Educators'));
      expect(result.data).toEqual([
        {
          educatorId: makeRow(1).id,
          name: 'Educator 1',
          email: 'educator1@test.com',
          schoolsCount: 2,
        },
        {
          educatorId: noName.id,
          name: 'educator2@test.com',
          email: 'educator2@test.com',
          schoolsCount: 0,
        },
        { educatorId: nothing.id, name: nothing.id, email: null, schoolsCount: 3000 },
      ]);
      expect(result.meta).toEqual({
        total: 23,
        page: 2,
        pageSize: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('returns an empty page with a zero total', async () => {
      educatorRepo.findTransferTargetsForDistrictAdmin.mockResolvedValue({ rows: [], total: 0 });
      const result = await list();
      expect(result.data).toEqual([]);
      expect(result.meta).toMatchObject({ total: 0, totalPages: 0, hasNextPage: false });
    });
  });
});
