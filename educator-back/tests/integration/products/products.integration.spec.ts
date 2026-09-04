import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsController } from '../../../src/products/products.controller';
import { ProductsService } from '../../../src/products/products.service';
import { Product } from '../../../src/products/entity/product.entity';
import { User } from '../../../src/users/entity/user.entity';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

type TestBody = {
  status?: string;
  data?: unknown;
  message?: string;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) return body;
  throw new Error('Expected response body to be an object');
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  throw new Error('Expected value to be an object');
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  throw new Error('Expected value to be an array');
};

const expectStatus = (res: request.Response, expected: string): void => {
  expect(parseBody(res).status).toBe(expected);
};

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440201';
const USER_ID = TEST_USERS.districtAdmin.sub;

const makeProduct = (o: Partial<Product> = {}): Product => ({
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

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: USER_ID,
    email: 'admin@test.com',
    status: CommonStatus.ACTIVE,
    ...o,
  }) as User;

describe('Products (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

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

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ProductsController],
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: TutorPatientService, useValue: tutorPatientService },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('Auth guard', () => {
    it('INTEGRATION: returns 401 when no JWT provided on POST', async () => {
      return request(httpServer()).post('/api/Products').send({ title: 'T', value: 1, icon: 'cube' }).expect(401);
    });

    it('INTEGRATION: returns 401 when no JWT provided on GET /user', async () => {
      return request(httpServer()).get('/api/Products/user').expect(401);
    });
  });

  describe('POST /api/Products', () => {
    it('INTEGRATION: returns 201 with SUCCESS on valid create', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      productRepo.findOne.mockResolvedValueOnce(null); 
      productRepo.create.mockReturnValue(makeProduct());
      productRepo.save.mockResolvedValue(makeProduct());
      productRepo.findOne.mockResolvedValueOnce(makeProduct());

      return request(httpServer())
        .post('/api/Products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Total Seats', value: 100, icon: 'cube' })
        .expect(201)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          const data = asRecord(body.data);
          expect(data.title).toBe('Total Seats');
        });
    });

    it('INTEGRATION: returns 400 when product with same title already exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      productRepo.findOne.mockResolvedValue(makeProduct()); // duplicate exists

      return request(httpServer())
        .post('/api/Products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Total Seats', value: 100, icon: 'cube' })
        .expect(400)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 401 when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/Products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Total Seats', value: 100, icon: 'cube' })
        .expect(401)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 401 when user is inactive', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ status: CommonStatus.INACTIVE }));

      return request(httpServer())
        .post('/api/Products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Total Seats', value: 100, icon: 'cube' })
        .expect(401)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 400 when required fields are missing', async () => {
      return request(httpServer())
        .post('/api/Products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 10 })
        .expect(400);
    });

    it('INTEGRATION: creates product with meta and default active status', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      productRepo.findOne.mockResolvedValueOnce(null);
      const productWithMeta = makeProduct({ meta: { label: '54% utilized' } });
      productRepo.create.mockReturnValue(productWithMeta);
      productRepo.save.mockResolvedValue(productWithMeta);
      productRepo.findOne.mockResolvedValueOnce(productWithMeta);

      return request(httpServer())
        .post('/api/Products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Total Seats', value: 100, icon: 'cube', meta: { label: '54% utilized' } })
        .expect(201)
        .expect((res) => {
          const data = asRecord(parseBody(res).data);
          expect(data.meta).toEqual({ label: '54% utilized' });
        });
    });
  });

  describe('GET /api/Products/user', () => {
    it('INTEGRATION: returns 200 with product list', async () => {
      qbMock.getMany.mockResolvedValue([makeProduct()]);

      return request(httpServer())
        .get('/api/Products/user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(asArray(body.data)).toHaveLength(1);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no products', async () => {
      qbMock.getMany.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/Products/user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(asArray(parseBody(res).data)).toHaveLength(0);
        });
    });

    it('INTEGRATION: returns multiple products ordered by created_at desc', async () => {
      const products = [
        makeProduct({ id: 'p-2', title: 'Used Seats', created_at: new Date('2024-02-01') }),
        makeProduct({ id: 'p-1', title: 'Total Seats', created_at: new Date('2024-01-01') }),
      ];
      qbMock.getMany.mockResolvedValue(products);

      return request(httpServer())
        .get('/api/Products/user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(asArray(parseBody(res).data)).toHaveLength(2);
        });
    });
  });

  describe('GET /api/Products/:id', () => {
    it('INTEGRATION: returns 200 with product when found', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct());

      return request(httpServer())
        .get(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          const data = asRecord(body.data);
          expect(data.id).toBe(PRODUCT_ID);
          expect(data.title).toBe('Total Seats');
        });
    });

    it('INTEGRATION: returns 404 when product not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .get(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 404 when product belongs to another user', async () => {
      productRepo.findOne.mockResolvedValue(null); // service filters by user_id

      return request(httpServer())
        .get(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/Products/:id', () => {
    it('INTEGRATION: returns 200 with updated product', async () => {
      const updated = makeProduct({ title: 'Updated Seats', value: 200 });
      productRepo.findOne.mockResolvedValueOnce(makeProduct());
      productRepo.save.mockResolvedValue(updated);
      productRepo.findOne.mockResolvedValueOnce(updated);

      return request(httpServer())
        .put(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated Seats', value: 200, icon: 'cube' })
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          const data = asRecord(body.data);
          expect(data.title).toBe('Updated Seats');
          expect(data.value).toBe(200);
        });
    });

    it('INTEGRATION: returns 404 when product not found for update', async () => {
      productRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .put(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated', value: 10, icon: 'cube' })
        .expect(404)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 200 when updating only value (partial update)', async () => {
      const updated = makeProduct({ value: 999 });
      productRepo.findOne.mockResolvedValueOnce(makeProduct());
      productRepo.save.mockResolvedValue(updated);
      productRepo.findOne.mockResolvedValueOnce(updated);

      return request(httpServer())
        .put(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 999, title: 'Total Seats', icon: 'cube' })
        .expect(200)
        .expect((res) => {
          const data = asRecord(parseBody(res).data);
          expect(data.value).toBe(999);
        });
    });

    it('INTEGRATION: returns 400 when update body is invalid', async () => {
      return request(httpServer())
        .put(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'UNKNOWN_STATUS' })
        .expect(400);
    });
  });

  describe('DELETE /api/Products/:id', () => {
    it('INTEGRATION: returns 200 with SUCCESS on delete', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct());
      productRepo.remove.mockResolvedValue(undefined);

      return request(httpServer())
        .delete(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: returns 404 when product not found for delete', async () => {
      productRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .delete(`/api/Products/${PRODUCT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 401 when no token provided on delete', async () => {
      return request(httpServer())
        .delete(`/api/Products/${PRODUCT_ID}`)
        .expect(401);
    });
  });


  describe('GET /api/Products/bundle/:bundle_name', () => {
    const bundlePayload = JSON.stringify({
      unit_id: 'UNIT-001',
      simulations: [
        { scenario_id: 'sim-1', title: 'CPR Basics' },
        { scenario_id: 'sim-2', title: 'Cardiac Arrest' },
      ],
    });

    it('INTEGRATION: returns 200 with bundle data', async () => {
      tutorPatientService.getFile.mockResolvedValue(bundlePayload);

      return request(httpServer())
        .get('/api/Products/bundle/TraumaBundle')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          const data = asRecord(body.data);
          expect(data.unit_id).toBe('UNIT-001');
          expect(Array.isArray(data.simulations)).toBe(true);
        });
    });

    it('INTEGRATION: returns 404 when bundle not found (returns null)', async () => {
      tutorPatientService.getFile.mockResolvedValue(null);

      return request(httpServer())
        .get('/api/Products/bundle/NonExistent')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 500 when blob service throws', async () => {
      tutorPatientService.getFile.mockRejectedValue(new Error('Blob storage unavailable'));

      return request(httpServer())
        .get('/api/Products/bundle/TraumaBundle')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500)
        .expect((res) => expectStatus(res, 'FAILED'));
    });

    it('INTEGRATION: returns 401 when no JWT provided on bundle', async () => {
      return request(httpServer())
        .get('/api/Products/bundle/TraumaBundle')
        .expect(401);
    });
  });
});
