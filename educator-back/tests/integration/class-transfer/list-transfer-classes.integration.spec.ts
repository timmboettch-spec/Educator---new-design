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
import { Educator, Schools } from 'src/database/entities';
import { ClassTransferFailureReason, UserTokenType } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import type { ITransferClassListRow } from 'src/common/interfaces';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_ID = '33333333-3333-4333-8333-333333333333';
const URL = `/api/class-transfers/educators/${SOURCE_ID}/classes`;

const makeEducator = (id: string, fullName: string): Educator =>
  ({
    id,
    full_name: fullName,
    is_active: true,
    school: null,
    schoolAssignments: [{ school: { id: SCHOOL_ID } as Schools, is_primary: true }],
    userRole: { status: CommonStatus.ACTIVE, user: { email: `${id}@test.com` } },
  }) as unknown as Educator;

const makeRow = (n: number, o: Partial<ITransferClassListRow> = {}): ITransferClassListRow => ({
  id: `550e8400-e29b-41d4-a716-44665544070${n}`,
  className: `Class ${n}`,
  educatorId: SOURCE_ID,
  schoolId: SCHOOL_ID,
  schoolName: 'Lincoln High',
  googleCourseId: null,
  isActive: true,
  deletedAt: null,
  status: CommonStatus.ACTIVE,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  studentsCount: 5,
  ...o,
});

/**
 * `GET /api/class-transfers/educators/:educatorId/classes` through the real HTTP stack: the
 * global auth guard, `createValidationPipe()` (query coercion and limits), `ResponseInterceptor`
 * and `HttpExceptionFilter` (i18n echoes keys). The DB query is covered by the real-Postgres spec.
 */
describe('GET /api/class-transfers/educators/:educatorId/classes (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const classRepo = { findTransferClassesForEducator: jest.fn() };
  const educatorRepo = { findByIdForDistrictAdmin: jest.fn() };
  const googleConnectionRepo = { findConnectedSchoolIds: jest.fn() };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_TRANSFER_AUDIT_REPOSITORY, useValue: {} },
        { provide: GOOGLE_SCHOOL_CONNECTION_REPOSITORY, useValue: googleConnectionRepo },
        { provide: NotificationsGateway, useValue: {} },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  beforeEach(() => {
    educatorRepo.findByIdForDistrictAdmin.mockImplementation((id: string) =>
      Promise.resolve(
        id === SOURCE_ID
          ? makeEducator(SOURCE_ID, 'Jhon Educator')
          : id === TARGET_ID
            ? makeEducator(TARGET_ID, 'Max Educator')
            : null,
      ),
    );
    classRepo.findTransferClassesForEducator.mockResolvedValue({
      rows: [makeRow(1), makeRow(2, { isActive: false, status: CommonStatus.INACTIVE })],
      total: 12,
    });
    googleConnectionRepo.findConnectedSchoolIds.mockResolvedValue([]);
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
      await get('', adminToken, '/api/class-transfers/educators/not-a-uuid/classes')
        .expect(400)
        .expect((res) => expectErrorEnvelope(res));
      expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
    });

    it.each([
      ['pageSize above 50', '?pageSize=51', 'pageSize', 'validation.MAX_VALUE'],
      ['page below 1', '?page=0', 'page', 'validation.MIN_VALUE'],
      ['an unknown sortBy', '?sortBy=sims', 'sortBy', 'validation.IS_ENUM'],
      ['an invalid sortDir without sortBy', '?sortDir=up', 'sortDir', 'validation.IS_ENUM'],
      [
        'a malformed targetEducatorId',
        '?targetEducatorId=abc',
        'targetEducatorId',
        'validation.IS_UUID',
      ],
    ])('400s through the real validation pipe for %s', async (_label, query, field, message) => {
      const res = await get(query).expect(400);
      expectErrorEnvelope(res);
      expect(parseErrorBody(res).error).toEqual({ [field]: message });
    });

    it('400s for a transferableOnly that is not a boolean', async () => {
      const res = await get('?transferableOnly=maybe').expect(400);
      expect(parseErrorBody(res).error).toEqual({ transferableOnly: 'validation.IS_BOOLEAN' });
    });

    it('400s for an unknown query parameter', async () => {
      await get('?foo=bar').expect(400);
    });

    it('400s when the target is the source', async () => {
      const res = await get(`?targetEducatorId=${SOURCE_ID}`).expect(400);
      expect(parseErrorBody(res).message).toBe('class.TRANSFER.SAME_EDUCATOR');
    });

    it('404s when the educator is not under the acting district admin', async () => {
      educatorRepo.findByIdForDistrictAdmin.mockResolvedValue(null);
      await get()
        .expect(404)
        .expect((res) => expectErrorEnvelope(res));
    });
  });

  describe('success', () => {
    it('200s with the paginated envelope, coerced query and per-class flags', async () => {
      const res = await get('?page=2&pageSize=5&search=Bio&sortBy=status&sortDir=desc').expect(200);

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
      expect(classRepo.findTransferClassesForEducator).toHaveBeenCalledWith(SOURCE_ID, {
        search: 'Bio',
        transferableOnly: false,
        sortBy: 'status',
        sortDir: 'DESC',
        skip: 5,
        take: 5,
      });
      expect(body.data).toEqual([
        {
          classId: makeRow(1).id,
          className: 'Class 1',
          status: 'ACTIVE',
          isActive: true,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          studentsCount: 5,
          schoolId: SCHOOL_ID,
          schoolName: 'Lincoln High',
          googleLinked: false,
          transferable: true,
          reasonCode: null,
          reason: null,
        },
        expect.objectContaining({
          classId: makeRow(2).id,
          transferable: false,
          reasonCode: ClassTransferFailureReason.CLASS_INACTIVE,
          reason: 'class.TRANSFER.REASON.CLASS_INACTIVE',
        }),
      ]);
    });

    it('uses page 1 and page size 10 by default', async () => {
      const res = await get().expect(200);
      expect((res.body as { meta: Record<string, unknown> }).meta).toMatchObject({
        page: 1,
        pageSize: 10,
      });
      expect(classRepo.findTransferClassesForEducator).toHaveBeenCalledWith(
        SOURCE_ID,
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('coerces ?transferableOnly=true from the query string and passes it on', async () => {
      await get('?transferableOnly=true').expect(200);
      expect(classRepo.findTransferClassesForEducator).toHaveBeenCalledWith(
        SOURCE_ID,
        expect.objectContaining({ transferableOnly: true }),
      );
    });

    it('applies the receiver rules when targetEducatorId is given', async () => {
      classRepo.findTransferClassesForEducator.mockResolvedValue({
        rows: [makeRow(1, { googleCourseId: 'gc-1' })],
        total: 1,
      });
      const res = await get(`?targetEducatorId=${TARGET_ID}`).expect(200);
      expect((res.body as { data: Array<Record<string, unknown>> }).data[0]).toMatchObject({
        transferable: false,
        reasonCode: ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION,
      });
    });
  });
});
