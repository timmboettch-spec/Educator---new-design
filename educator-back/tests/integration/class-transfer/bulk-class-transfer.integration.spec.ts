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
import { ClassTransferAudit, ClassTransferStatus, Educator, Schools } from 'src/database/entities';
import { ClassConstants, ClassTransferFailureReason, UserTokenType } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import type { IBatchClassTransferInput, IClassTransferCandidate } from 'src/common/interfaces';

const URL = '/api/class-transfers/bulk';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_ID = '33333333-3333-4333-8333-333333333333';
const CLASS_A = '550e8400-e29b-41d4-a716-446655440701';
const CLASS_B = '550e8400-e29b-41d4-a716-446655440702';

const validBody = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  sourceEducatorId: SOURCE_ID,
  targetEducatorId: TARGET_ID,
  classIds: [CLASS_A, CLASS_B],
  ...o,
});

const makeEducator = (id: string, fullName: string): Educator =>
  ({
    id,
    full_name: fullName,
    is_active: true,
    school: null,
    schoolAssignments: [{ school: { id: SCHOOL_ID } as Schools, is_primary: true }],
    userRole: { status: CommonStatus.ACTIVE, user: { email: `${id}@test.com` } },
  }) as unknown as Educator;

const makeCandidate = (
  id: string,
  o: Partial<IClassTransferCandidate> = {},
): IClassTransferCandidate => ({
  id,
  className: `Class ${id.slice(-3)}`,
  educatorId: SOURCE_ID,
  schoolId: SCHOOL_ID,
  googleCourseId: null,
  isActive: true,
  deletedAt: null,
  status: CommonStatus.ACTIVE,
  ...o,
});

/**
 * `POST /api/class-transfers/bulk` through the real HTTP stack: the global auth guard, the global
 * `createValidationPipe()`, `ResponseInterceptor` and `HttpExceptionFilter` (i18n echoes keys).
 * Repositories and the notifications gateway are stubbed; the DB behaviour is covered by
 * `bulk-class-transfer.db.integration.spec.ts`.
 */
describe('POST /api/class-transfers/bulk (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const classRepo = { findTransferCandidates: jest.fn(), transferClassInBatch: jest.fn() };
  const educatorRepo = { findByIdForDistrictAdmin: jest.fn() };
  const auditRepo = { recordFailures: jest.fn() };
  const googleConnectionRepo = { findConnectedSchoolIds: jest.fn() };
  const notificationsGateway = {
    notifyClassesTransferredSource: jest.fn(),
    notifyClassesTransferredTarget: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ClassTransferController],
      providers: [
        ClassTransferService,
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_TRANSFER_AUDIT_REPOSITORY, useValue: auditRepo },
        { provide: GOOGLE_SCHOOL_CONNECTION_REPOSITORY, useValue: googleConnectionRepo },
        { provide: NotificationsGateway, useValue: notificationsGateway },
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
    classRepo.findTransferCandidates.mockResolvedValue([
      makeCandidate(CLASS_A),
      makeCandidate(CLASS_B),
    ]);
    classRepo.transferClassInBatch.mockImplementation((input: IBatchClassTransferInput) =>
      Promise.resolve({
        id: `audit-${input.classId.slice(-3)}`,
        classId: input.classId,
        status: ClassTransferStatus.SUCCESS,
        transferredAt: new Date('2026-10-09T08:00:00.000Z'),
      } as ClassTransferAudit),
    );
    auditRepo.recordFailures.mockResolvedValue(undefined);
    googleConnectionRepo.findConnectedSchoolIds.mockResolvedValue([]);
    notificationsGateway.notifyClassesTransferredSource.mockResolvedValue(undefined);
    notificationsGateway.notifyClassesTransferredTarget.mockResolvedValue(undefined);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  const post = (body: Record<string, unknown>, token: string | null = adminToken): request.Test => {
    const req = request(httpServer()).post(URL);
    return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body);
  };

  describe('refusals', () => {
    it('401s without a JWT', async () => {
      await post(validBody(), null).expect(401);
      expect(classRepo.transferClassInBatch).not.toHaveBeenCalled();
    });

    it('403s for an educator (district-admin-only route)', async () => {
      await post(validBody(), signToken(TEST_USERS.educator))
        .expect(403)
        .expect((res) => expectErrorEnvelope(res));
      expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
    });

    it('403s for a dual-role account acting as educator, and allows it acting as district admin', async () => {
      await post(validBody(), signToken(TEST_USERS.dualRole)).expect(403);
      await post(
        validBody(),
        signToken({ ...TEST_USERS.dualRole, type: UserTokenType.ADMIN }),
      ).expect(200);
    });

    it.each([
      ['classIds missing', { classIds: undefined }, 'classIds', 'validation.IS_NOT_EMPTY'],
      ['classIds a single uuid string', { classIds: CLASS_A }, 'classIds', 'validation.IS_ARRAY'],
      ['classIds empty', { classIds: [] }, 'classIds', 'validation.ARRAY_NOT_EMPTY'],
      [
        'classIds duplicated',
        { classIds: [CLASS_A, CLASS_A] },
        'classIds',
        'validation.ARRAY_UNIQUE',
      ],
      ['classIds holding a non-uuid', { classIds: ['nope'] }, 'classIds', 'validation.IS_UUID'],
      [
        'sourceEducatorId missing',
        { sourceEducatorId: undefined },
        'sourceEducatorId',
        'validation.IS_NOT_EMPTY',
      ],
      [
        'targetEducatorId malformed',
        { targetEducatorId: 'abc' },
        'targetEducatorId',
        'validation.IS_UUID',
      ],
    ])(
      '400s through the real validation pipe when %s',
      async (_label, override, field, message) => {
        const res = await post(validBody(override)).expect(400);
        expectErrorEnvelope(res);
        expect(parseErrorBody(res).error).toEqual({ [field]: message });
        expect(educatorRepo.findByIdForDistrictAdmin).not.toHaveBeenCalled();
      },
    );

    it(`400s for more than ${ClassConstants.TRANSFER.BULK_MAX_CLASSES} classes`, async () => {
      const ids = Array.from(
        { length: ClassConstants.TRANSFER.BULK_MAX_CLASSES + 1 },
        (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
      );
      const res = await post(validBody({ classIds: ids })).expect(400);
      expect(parseErrorBody(res).error).toEqual({ classIds: 'validation.ARRAY_MAX_SIZE' });
    });

    it('400s for an unknown body field', async () => {
      await post(validBody({ extra: true }))
        .expect(400)
        .expect((res) => expectErrorEnvelope(res));
    });

    it('400s for the same educator sent in different letter case, moving nothing', async () => {
      const res = await post(validBody({ targetEducatorId: SOURCE_ID.toUpperCase() })).expect(400);
      expectErrorEnvelope(res);
      expect(parseErrorBody(res).message).toBe('class.TRANSFER.SAME_EDUCATOR');
      expect(classRepo.transferClassInBatch).not.toHaveBeenCalled();
    });

    it('404s when an educator is not under the acting district admin', async () => {
      educatorRepo.findByIdForDistrictAdmin.mockResolvedValue(null);
      const res = await post(validBody()).expect(404);
      expectErrorEnvelope(res);
      expect(educatorRepo.findByIdForDistrictAdmin).toHaveBeenCalledWith(
        SOURCE_ID,
        TEST_USERS.districtAdmin.districtAdminId,
      );
    });
  });

  describe('success envelope', () => {
    it('200s with the ResponseResult envelope, translated message and per-class outcome', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([
        makeCandidate(CLASS_A),
        makeCandidate(CLASS_B, { isActive: false }),
      ]);

      const res = await post(validBody()).expect(200);

      expectSuccessEnvelope(res);
      const body = res.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['data', 'error', 'message', 'meta']);
      expect(body.message).toBe('class.TRANSFER.BULK_COMPLETED');
      expect(body.meta).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(Object.keys(data).sort()).toEqual(
        [
          'batchId',
          'failed',
          'failedCount',
          'requestedCount',
          'sourceEducator',
          'targetEducator',
          'transferred',
          'transferredAt',
          'transferredCount',
        ].sort(),
      );
      expect(data).toMatchObject({
        sourceEducator: { id: SOURCE_ID, name: 'Jhon Educator' },
        targetEducator: { id: TARGET_ID, name: 'Max Educator' },
        requestedCount: 2,
        transferredCount: 1,
        failedCount: 1,
        transferredAt: '2026-10-09T08:00:00.000Z',
        transferred: [
          {
            classId: CLASS_A,
            className: 'Class 701',
            auditId: 'audit-701',
            transferredAt: '2026-10-09T08:00:00.000Z',
            notice: null,
          },
        ],
        failed: [
          {
            classId: CLASS_B,
            className: 'Class 702',
            reasonCode: ClassTransferFailureReason.CLASS_INACTIVE,
            reason: 'class.TRANSFER.REASON.CLASS_INACTIVE',
          },
        ],
      });
    });

    it('still 200s when every class fails', async () => {
      classRepo.findTransferCandidates.mockResolvedValue([]);
      const res = await post(validBody()).expect(200);
      expect((res.body as { data: Record<string, unknown> }).data).toMatchObject({
        transferredCount: 0,
        failedCount: 2,
        transferredAt: null,
      });
    });
  });
});
