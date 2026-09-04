import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsController } from '../../../src/products/products.controller';
import { ProductsService } from '../../../src/products/products.service';
import { Product } from '../../../src/products/entity/product.entity';
import { User } from '../../../src/users/entity/user.entity';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { Messages, AppStatus } from '../../../src/common/utils/messages';
import { ProductConstants } from '../../../src/products/products.constants';
import { JwtRequest } from '../../../src/common/types';

const USER_ID = 'user-001';
const PRODUCT_ID = 'prod-001';

const makeReq = (userId = USER_ID): JwtRequest => {
  return Object.assign(new Request('http://localhost'), { user: { userId } });
};

const makeUser = (o: Partial<User> = {}): User =>
  ({ id: USER_ID, email: 'admin@test.com', password: '', status: CommonStatus.ACTIVE, ...o } as User);

const makeProduct = (o: Partial<Product> = {}): Product =>
  ({
    id: PRODUCT_ID,
    title: 'Total Seats',
    value: 100,
    icon: 'cube',
    meta: { label: '54% utilized' },
    status: CommonStatus.ACTIVE,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    user_id: { id: USER_ID } as User,
    ...o,
  });

describe('Products (Controller + Service)', () => {
  let controller: ProductsController;
  let service: ProductsService;

  const qbMock = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const productRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qbMock),
  };
  const userRepo = { findOne: jest.fn() };
  const tutorPatientService = { getFile: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: TutorPatientService, useValue: tutorPatientService },
      ],
    }).compile();

    controller = module.get(ProductsController);
    service = module.get(ProductsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── ProductsService.create ───────────────────────────────────────────────────

  describe('ProductsService.create', () => {
    it('UNIT: returns success with created product', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      productRepo.findOne.mockResolvedValueOnce(null); // no duplicate
      productRepo.create.mockReturnValue(makeProduct());
      productRepo.save.mockResolvedValue(makeProduct());
      productRepo.findOne.mockResolvedValueOnce(makeProduct());

      const result = await service.create(USER_ID, { title: 'Total Seats', value: 100, icon: 'cube' });

      expect(result.success).toBe(true);
      expect(result.message).toBe(Messages.PRODUCT_CREATED);
      expect(result.data?.title).toBe('Total Seats');
    });

    it('UNIT: returns failure when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      const result = await service.create(USER_ID, { title: 'Total Seats', value: 100, icon: 'cube' });

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.USER_NOT_FOUND);
    });

    it('UNIT: returns failure when user is inactive', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ status: CommonStatus.INACTIVE }));

      const result = await service.create(USER_ID, { title: 'Total Seats', value: 100, icon: 'cube' });

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.USER_NOT_FOUND);
    });

    it('UNIT: returns failure when product with same title already exists for user', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      productRepo.findOne.mockResolvedValue(makeProduct()); // duplicate found

      const result = await service.create(USER_ID, { title: 'Total Seats', value: 100, icon: 'cube' });

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.PRODUCT_EXISTS);
    });

    it('UNIT: creates product with null meta when not provided', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      productRepo.findOne.mockResolvedValueOnce(null);
      productRepo.create.mockReturnValue(makeProduct({ meta: null }));
      productRepo.save.mockResolvedValue(makeProduct({ meta: null }));
      productRepo.findOne.mockResolvedValueOnce(makeProduct({ meta: null }));

      const result = await service.create(USER_ID, { title: 'Total Seats', value: 100, icon: 'cube' });

      expect(result.success).toBe(true);
      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ meta: null }),
      );
    });

    it('UNIT: creates product with provided status', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      productRepo.findOne.mockResolvedValueOnce(null);
      const inactive = makeProduct({ status: CommonStatus.INACTIVE });
      productRepo.create.mockReturnValue(inactive);
      productRepo.save.mockResolvedValue(inactive);
      productRepo.findOne.mockResolvedValueOnce(inactive);

      const result = await service.create(USER_ID, {
        title: 'Total Seats', value: 100, icon: 'cube', status: CommonStatus.INACTIVE,
      });

      expect(result.success).toBe(true);
      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: CommonStatus.INACTIVE }),
      );
    });
  });

  // ─── ProductsService.findAll ──────────────────────────────────────────────────

  describe('ProductsService.findAll', () => {
    it('UNIT: returns list of products for user', async () => {
      qbMock.getMany.mockResolvedValue([makeProduct(), makeProduct({ id: 'p-2', title: 'Used Seats' })]);

      const result = await service.findAll(USER_ID);

      expect(result.success).toBe(true);
      expect(result.message).toBe(Messages.PRODUCT_FETCHED);
      expect(result.data).toHaveLength(2);
    });

    it('UNIT: returns empty array when user has no products', async () => {
      qbMock.getMany.mockResolvedValue([]);

      const result = await service.findAll(USER_ID);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('UNIT: builds query with correct userId and ordering', async () => {
      qbMock.getMany.mockResolvedValue([]);

      await service.findAll(USER_ID);

      expect(productRepo.createQueryBuilder).toHaveBeenCalledWith('product');
      expect(qbMock.where).toHaveBeenCalledWith('product.user_id = :userId', { userId: USER_ID });
      expect(qbMock.orderBy).toHaveBeenCalledWith('product.created_at', 'DESC');
    });
  });

  // ─── ProductsService.findOne ──────────────────────────────────────────────────

  describe('ProductsService.findOne', () => {
    it('UNIT: returns product when found for user', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct());

      const result = await service.findOne(PRODUCT_ID, USER_ID);

      expect(result.success).toBe(true);
      expect(result.message).toBe(Messages.PRODUCT_FETCHED);
      expect(result.data?.id).toBe(PRODUCT_ID);
    });

    it('UNIT: returns failure when product not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent', USER_ID);

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.PRODUCT_NOT_FOUND);
    });

    it('UNIT: queries with both id and user_id to enforce ownership', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await service.findOne(PRODUCT_ID, USER_ID);

      expect(productRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PRODUCT_ID, user_id: { id: USER_ID } },
        }),
      );
    });
  });

  // ─── ProductsService.update ───────────────────────────────────────────────────

  describe('ProductsService.update', () => {
    it('UNIT: returns success with updated product', async () => {
      const original = makeProduct();
      const updated = makeProduct({ title: 'Used Seats', value: 50 });
      productRepo.findOne.mockResolvedValueOnce(original);
      productRepo.save.mockResolvedValue(updated);
      productRepo.findOne.mockResolvedValueOnce(updated);

      const result = await service.update(PRODUCT_ID, USER_ID, { title: 'Used Seats', value: 50, icon: 'cube' });

      expect(result.success).toBe(true);
      expect(result.message).toBe(Messages.PRODUCT_UPDATED);
      expect(result.data?.title).toBe('Used Seats');
      expect(result.data?.value).toBe(50);
    });

    it('UNIT: returns failure when product not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      const result = await service.update('bad-id', USER_ID, { title: 'T', value: 1, icon: 'i' });

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.PRODUCT_NOT_FOUND);
    });

    it('UNIT: only updates provided fields (partial update)', async () => {
      const original = makeProduct();
      productRepo.findOne.mockResolvedValueOnce(original);
      productRepo.save.mockImplementation((p: Product) => Promise.resolve(p));
      productRepo.findOne.mockResolvedValueOnce(original);

      await service.update(PRODUCT_ID, USER_ID, { value: 999 });

      expect(productRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ value: 999, title: 'Total Seats', icon: 'cube' }),
      );
    });

    it('UNIT: can update meta to null', async () => {
      const original = makeProduct({ meta: { label: 'old' } });
      productRepo.findOne.mockResolvedValueOnce(original);
      productRepo.save.mockImplementation((p: Product) => Promise.resolve(p));
      productRepo.findOne.mockResolvedValueOnce(makeProduct({ meta: null }));

      await service.update(PRODUCT_ID, USER_ID, { meta: null });

      expect(productRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ meta: null }),
      );
    });

    it('UNIT: can update status to INACTIVE', async () => {
      const original = makeProduct();
      productRepo.findOne.mockResolvedValueOnce(original);
      productRepo.save.mockImplementation((p: Product) => Promise.resolve(p));
      productRepo.findOne.mockResolvedValueOnce(makeProduct({ status: CommonStatus.INACTIVE }));

      await service.update(PRODUCT_ID, USER_ID, { status: CommonStatus.INACTIVE });

      expect(productRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: CommonStatus.INACTIVE }),
      );
    });
  });

  // ─── ProductsService.remove ───────────────────────────────────────────────────

  describe('ProductsService.remove', () => {
    it('UNIT: returns success with null data on delete', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct());
      productRepo.remove.mockResolvedValue(undefined);

      const result = await service.remove(PRODUCT_ID, USER_ID);

      expect(result.success).toBe(true);
      expect(result.message).toBe(Messages.PRODUCT_DELETED);
      expect(result.data).toBeNull();
    });

    it('UNIT: returns failure when product not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      const result = await service.remove('non-existent', USER_ID);

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.PRODUCT_NOT_FOUND);
    });

    it('UNIT: calls remove with the found product entity', async () => {
      const product = makeProduct();
      productRepo.findOne.mockResolvedValue(product);
      productRepo.remove.mockResolvedValue(undefined);

      await service.remove(PRODUCT_ID, USER_ID);

      expect(productRepo.remove).toHaveBeenCalledWith(product);
    });
  });

  // ─── ProductsService.findAllBundles ──────────────────────────────────────────

  describe('ProductsService.findAllBundles', () => {
    const bundlePayload = JSON.stringify({
      unit_id: 'UNIT-001',
      simulations: [{ scenario_id: 'sim-1', title: 'CPR Basics' }],
    });

    it('UNIT: returns parsed bundle data on success', async () => {
      tutorPatientService.getFile.mockResolvedValue(bundlePayload);

      const result = await service.findAllBundles('TraumaBundle');

      expect(result.success).toBe(true);
      expect(result.message).toBe(ProductConstants.VALIDATION.BUNDLE_FETCHED);
      expect(result.data).toEqual(expect.objectContaining({ unit_id: 'UNIT-001' }));
    });

    it('UNIT: calls getFile with correct path using data container', async () => {
      tutorPatientService.getFile.mockResolvedValue(bundlePayload);

      await service.findAllBundles('TraumaBundle');

      expect(tutorPatientService.getFile).toHaveBeenCalledWith(
        'TraumaBundle.json',
        true,
      );
    });

    it('UNIT: returns failure when bundle file is null', async () => {
      tutorPatientService.getFile.mockResolvedValue(null);

      const result = await service.findAllBundles('NonExistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe(ProductConstants.VALIDATION.BUNDLE_NOT_FOUND);
    });

    it('UNIT: returns failure when blob service throws an error', async () => {
      tutorPatientService.getFile.mockRejectedValue(new Error('Blob error'));

      const result = await service.findAllBundles('TraumaBundle');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Blob error');
    });

    it('UNIT: returns generic failure message when error has no message', async () => {
      tutorPatientService.getFile.mockRejectedValue('unexpected string error');

      const result = await service.findAllBundles('TraumaBundle');

      expect(result.success).toBe(false);
      expect(typeof result.message).toBe('string');
    });
  });

  // ─── ProductsController (via spies) ──────────────────────────────────────────

  describe('ProductsController', () => {
    describe('create', () => {
      it('UNIT: returns SUCCESS response on valid create', async () => {
        jest.spyOn(service, 'create').mockResolvedValue({
          success: true, message: Messages.PRODUCT_CREATED, data: makeProduct(),
        });

        const result = await controller.create(
          { title: 'Total Seats', value: 100, icon: 'cube' },
          makeReq(),
        );

        expect(result.status).toBe(AppStatus.SUCCESS);
        expect((result.data as Product)?.title).toBe('Total Seats');
      });

      it('UNIT: throws BadRequestException when service signals duplicate', async () => {
        jest.spyOn(service, 'create').mockResolvedValue({
          success: false, message: Messages.PRODUCT_EXISTS, type: 'bad',
        });

        await expect(
          controller.create({ title: 'Total Seats', value: 100, icon: 'cube' }, makeReq()),
        ).rejects.toThrow(BadRequestException);
      });

      it('UNIT: throws UnauthorizedException when user not found', async () => {
        jest.spyOn(service, 'create').mockResolvedValue({
          success: false, message: Messages.USER_NOT_FOUND, type: 'unauthorized',
        });

        await expect(
          controller.create({ title: 'Total Seats', value: 100, icon: 'cube' }, makeReq()),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('findAll', () => {
      it('UNIT: returns SUCCESS with product list', async () => {
        jest.spyOn(service, 'findAll').mockResolvedValue({
          success: true, message: Messages.PRODUCT_FETCHED, data: [makeProduct()],
        });

        const result = await controller.findAll(makeReq());

        expect(result.status).toBe(AppStatus.SUCCESS);
        expect(Array.isArray(result.data)).toBe(true);
      });
    });

    describe('findOne', () => {
      it('UNIT: returns SUCCESS with product data', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
          success: true, message: Messages.PRODUCT_FETCHED, data: makeProduct(),
        });

        const result = await controller.findOne(PRODUCT_ID, makeReq());

        expect(result.status).toBe(AppStatus.SUCCESS);
        expect((result.data as Product)?.id).toBe(PRODUCT_ID);
      });

      it('UNIT: throws NotFoundException when product not found', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
          success: false, message: Messages.PRODUCT_NOT_FOUND, type: 'notfound',
        });

        await expect(controller.findOne('bad-id', makeReq())).rejects.toThrow(NotFoundException);
      });
    });

    describe('update', () => {
      it('UNIT: returns SUCCESS with updated product', async () => {
        jest.spyOn(service, 'update').mockResolvedValue({
          success: true, message: Messages.PRODUCT_UPDATED, data: makeProduct({ title: 'New Title' }),
        });

        const result = await controller.update(
          PRODUCT_ID,
          { title: 'New Title', value: 100, icon: 'cube' },
          makeReq(),
        );

        expect(result.status).toBe(AppStatus.SUCCESS);
        expect((result.data as Product)?.title).toBe('New Title');
      });

      it('UNIT: throws NotFoundException when product not found for update', async () => {
        jest.spyOn(service, 'update').mockResolvedValue({
          success: false, message: Messages.PRODUCT_NOT_FOUND, type: 'notfound',
        });

        await expect(
          controller.update('bad-id', { title: 'T', value: 1, icon: 'i' }, makeReq()),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('remove', () => {
      it('UNIT: returns SUCCESS on delete', async () => {
        jest.spyOn(service, 'remove').mockResolvedValue({
          success: true, message: Messages.PRODUCT_DELETED, data: null,
        });

        const result = await controller.remove(PRODUCT_ID, makeReq());

        expect(result.status).toBe(AppStatus.SUCCESS);
        expect(result.data).toBeNull();
      });

      it('UNIT: throws NotFoundException when product not found for delete', async () => {
        jest.spyOn(service, 'remove').mockResolvedValue({
          success: false, message: Messages.PRODUCT_NOT_FOUND, type: 'notfound',
        });

        await expect(controller.remove('bad-id', makeReq())).rejects.toThrow(NotFoundException);
      });
    });

    describe('findAllBundles', () => {
      it('UNIT: returns SUCCESS with bundle data', async () => {
        jest.spyOn(service, 'findAllBundles').mockResolvedValue({
          success: true,
          message: ProductConstants.VALIDATION.BUNDLE_FETCHED,
          data: { unit_id: 'UNIT-001', simulations: [] },
        });

        const result = await controller.findAllBundles('TraumaBundle');

        expect(result.status).toBe(AppStatus.SUCCESS);
        expect((result.data as Record<string, unknown>)?.unit_id).toBe('UNIT-001');
      });

      it('UNIT: throws NotFoundException when bundle not found', async () => {
        jest.spyOn(service, 'findAllBundles').mockResolvedValue({
          success: false, message: ProductConstants.VALIDATION.BUNDLE_NOT_FOUND, type: 'notfound',
        });

        await expect(controller.findAllBundles('missing')).rejects.toThrow(NotFoundException);
      });
    });
  });
});
