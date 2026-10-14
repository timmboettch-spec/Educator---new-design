import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ClassTransferController } from '../../../src/class-transfer/class-transfer.controller';
import { ClassTransferService } from '../../../src/class-transfer/class-transfer.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import {
  expectErrorEnvelope,
  expectSuccessEnvelope,
  parseErrorBody,
} from '../setup/error-envelope.util';
import {
  CLASS_REPOSITORY,
  CLASS_TRANSFER_AUDIT_REPOSITORY,
  EDUCATOR_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
} from 'src/database/tokens';
import { Educator } from 'src/database/entities';
import { UserTokenType } from 'src/common/constants';
import type { ITransferTargetRow } from 'src/common/interfaces';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const URL = `/api/class-transfers/educators/${SOURCE_ID}/target-educators`;

const makeRow = (n: number, o: Partial<ITransferTargetRow> = {}): ITransferTargetRow => ({
  id: `550e8400-e29b-41d4-a716-44665544080${n}`,
  fullName: `Educator ${n}`,
  email: `educator${n}@test.com`,
  schoolsCount: 1,
  ...o,
});

/**
 * `GET /api/class-transfers/educators/:educatorId/target-educators` through the real HTTP stack:
 * the global auth guard, `createValidationPipe()` (query coercion and limits), `ResponseInterceptor`
 * and `HttpExceptionFilter` (i18n echoes keys). The DB query is covered by the real-Postgres spec.
 */
describe('GET /api/class-transfers/educators/:educatorId/target-educators (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const educatorRepo = {
    findByIdForDistrictAdmin: jest.fn(),
    findTransferTargetsForDistrictAdmin: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: CLASS_REPOSITORY, useValue: {} },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_TRANSFER_AUDIT_REPOSITORY, useValue: {} },
        { provide: GOOGLE_SCHOOL_CONNECTION_REPOSITORY, useValue: {} },
        { provide: NotificationsGateway, useValue: {} },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  beforeEach(() => {
    educatorRepo.findByIdForDistrictAdmin.mockImplementation((id: string) =>
      Promise.resolve(id === SOURCE_ID ? ({ id: SOURCE_ID } as Educator) : null),
    );
    educatorRepo.findTransferTargetsForDistrictAdmin.mockResolvedValue({
      rows: [makeRow(1, { schoolsCount: 2 }), makeRow(2, { fullName: null })],
      total: 12,
    });
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  const get = (query = '', token: string | null = adminToken, url = URL): request.Test => {
    const req = request(httpServer()).get(`${url}${query}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  describe('refusals', () => {
    it('401s without a JWT', async () => {
      await get('', null).expect(401);
    });

    it('403s for an educator, and for a dual-role account acting as educator', async () => {
      await get('', signToken(TEST_USERS.educator))
        .expect(403)
        .expect((res) => expectErrorEnvelope(res));
      await get('', signToken(TEST_USERS.dualRole)).expect(403);
      await get('', signToken({ ...TEST_USERS.dualRole, type: UserTokenType.ADMIN })).expect(200);
    });

    it('400s for a non-uuid educator id in the path', async () => {
      await get('', adminToken, '/api/class-transfers/educators/not-a-uuid/target-educators')
        .expect(400)
        .expect((res) => expectErrorEnvelope(res));
      expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
    });

    it.each([
      ['pageSize above 50', '?pageSize=51', 'pageSize', 'validation.MAX_VALUE'],
      ['page below 1', '?page=0', 'page', 'validation.MIN_VALUE'],
      ['an unknown sortBy', '?sortBy=school', 'sortBy', 'validation.IS_ENUM'],
      ['an invalid sortDir without sortBy', '?sortDir=up', 'sortDir', 'validation.IS_ENUM'],
    ])('400s through the real validation pipe for %s', async (_label, query, field, message) => {
      const res = await get(query).expect(400);
      expectErrorEnvelope(res);
      expect(parseErrorBody(res).error).toEqual({ [field]: message });
    });

    it('400s for an unknown query parameter', async () => {
      await get('?classIds=abc').expect(400);
    });

    it('404s when the source educator is not under the acting district admin', async () => {
      educatorRepo.findByIdForDistrictAdmin.mockResolvedValue(null);
      await get()
        .expect(404)
        .expect((res) => expectErrorEnvelope(res));
      expect(educatorRepo.findTransferTargetsForDistrictAdmin).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('200s with the paginated envelope, coerced query and small rows', async () => {
      const res = await get('?page=2&pageSize=5&search=Max&sortBy=email&sortDir=desc').expect(200);

      expectSuccessEnvelope(res);
      const body = res.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['data', 'error', 'message', 'meta']);
      expect(body.message).toBe('success.COMMON.FETCHED');
      expect(body.meta).toEqual({
        total: 12,
        page: 2,
        pageSize: 5,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
      expect(educatorRepo.findTransferTargetsForDistrictAdmin).toHaveBeenCalledWith(
        expect.any(String),
        SOURCE_ID,
        { search: 'Max', sortBy: 'email', sortDir: 'DESC', skip: 5, take: 5 },
      );
      expect(body.data).toEqual([
        {
          educatorId: makeRow(1).id,
          name: 'Educator 1',
          email: 'educator1@test.com',
          schoolsCount: 2,
        },
        {
          educatorId: makeRow(2).id,
          name: 'educator2@test.com',
          email: 'educator2@test.com',
          schoolsCount: 1,
        },
      ]);
    });

    it('uses page 1 and page size 10 by default', async () => {
      const res = await get().expect(200);
      expect((res.body as { meta: Record<string, unknown> }).meta).toMatchObject({
        page: 1,
        pageSize: 10,
      });
      expect(educatorRepo.findTransferTargetsForDistrictAdmin).toHaveBeenCalledWith(
        expect.any(String),
        SOURCE_ID,
        expect.objectContaining({ skip: 0, take: 10, sortDir: 'ASC' }),
      );
    });
  });
});
