import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EducatorsController } from '../../../src/educators/educators.controller';
import { EducatorsService } from '../../../src/educators/educators.service';

import { AzureBlobService } from '../../../src/common/services';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { expectErrorEnvelope, expectLegacySuccessBody } from '../setup/error-envelope.util';
import { DistrictAdmin, Educator, Schools, UserRole } from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  EDUCATOR_SEAT_REQUEST_REPOSITORY,
  INVITE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
} from 'src/database/tokens';

type TestBody = {
  status?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected value to be an object');
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error('Expected value to be an array');
};

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({
    id: '550e8400-e29b-41d4-a716-446655440101',
    full_name: 'Test Educator',
    is_active: true,
    tokens: 10,
    created_at: new Date(),
    updated_at: new Date(),
    // `Educator.email`/`.status` no longer exist as columns — identity and lifecycle resolve
    // through the linked `user_roles` row (`userRole.user.email` / `userRole.status`).
    userRole: {
      userRoleId: 'ur-1',
      userId: 'user-1',
      status: CommonStatus.ACTIVE,
      user: { id: 'user-1', email: 'edu@test.com' },
    } as UserRole,
    // `admin` is a `DistrictAdmin` keyed by its own `districtAdminId` PK; the admin's
    // `users.id` hangs off its `userRole`, which is what admin-scoped lookups match on.
    districtAdminId: 'da-1',
    admin: {
      districtAdminId: 'da-1',
      userRoleId: 'da-ur-1',
      userRole: { userRoleId: 'da-ur-1', userId: TEST_USERS.districtAdmin.sub },
    } as DistrictAdmin,
    school: { id: 'school-1', school_name: 'Test School' } as Schools,
    ...o,
  }) as Educator;

describe('Educators (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const EDUCATOR_ID = '550e8400-e29b-41d4-a716-446655440101';
  const OTHER_ADMIN_ID = '550e8400-e29b-41d4-a716-446655440111';
  const ANY_ADMIN_ID = '550e8400-e29b-41d4-a716-446655440112';

  const educatorRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue(1),
  };
  const schoolRepo = { findOne: jest.fn() };
  const classRepo = { find: jest.fn(), findOne: jest.fn() };
  const classSimulationRepo = { find: jest.fn(), findOne: jest.fn() };
  const inviteRepo = {
    findOne: jest.fn(),
    delete: jest.fn(),
    deleteByEmail: jest.fn(),
    deletePendingByEmail: jest.fn(),
    create: jest.fn(),
  };
  const azureBlobService = {
    uploadFile: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(false),
  };
  const dataSource = { query: jest.fn(), transaction: jest.fn() };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const notificationsGateway = {
    notifyAccountDeleted: jest.fn(),
    notifyAdminEducatorStatusUpdated: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [EducatorsController],
      providers: [
        EducatorsService,
        {
          provide: InviteTokenService,
          useValue: {
            issue: jest.fn().mockReturnValue('mock-invite-token'),
            buildInviteUrl: jest
              .fn()
              .mockReturnValue('http://localhost:5173/signup/mock-invite-token'),
            resolve: jest.fn(),
          },
        },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        {
          provide: EDUCATOR_SCHOOL_REPOSITORY,
          useValue: { findOne: jest.fn(), count: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: EDUCATOR_SEAT_REQUEST_REPOSITORY,
          useValue: {
            createWithinCooldown: jest.fn(),
            hardDeleteById: jest.fn(),
          },
        },
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: INVITE_REPOSITORY, useValue: inviteRepo },
        {
          provide: DISTRICT_ADMIN_REPOSITORY,
          useValue: { findByUserRoleId: jest.fn(), updateByUserRoleId: jest.fn() },
        },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
        {
          provide: EducatorSessionService,
          useValue: {
            invalidateEducator: jest.fn().mockResolvedValue(undefined),
            isTokenInvalidated: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: SIMULATION_REPORT_REPOSITORY,
          useValue: {
            findStudentScenarioPairsWithAttempts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/educators', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/educators').expect(401);
    });

    it('INTEGRATION: returns 200 with educator list', async () => {
      educatorRepo.find.mockResolvedValue([makeEducator()]);

      return request(httpServer())
        .get('/api/educators')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no educators', async () => {
      educatorRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/educators')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(asArray(body.data)).toHaveLength(0);
        });
    });
  });

  describe('GET /api/educators/:id', () => {
    it('INTEGRATION: returns 200 when educator found', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());

      return request(httpServer())
        .get(`/api/educators/${EDUCATOR_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expectLegacySuccessBody(res);
          expect(data.id).toBe(EDUCATOR_ID);
        });
    });

    it('INTEGRATION: returns 404 when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .get('/api/educators/550e8400-e29b-41d4-a716-446655440199')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 400 when ID is not a valid UUID', async () => {
      return request(httpServer())
        .get('/api/educators/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('GET /api/educators/admin/:adminId', () => {
    it('INTEGRATION: returns 200 when admin fetches their own educators', async () => {
      educatorRepo.find.mockResolvedValue([makeEducator()]);

      return request(httpServer())
        .get(`/api/educators/admin/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });

    it('INTEGRATION: returns 401 when admin tries to fetch another admin educators', async () => {
      return request(httpServer())
        .get(`/api/educators/admin/${OTHER_ADMIN_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
    });

    it('INTEGRATION: returns 401 when a different district admin fetches another admin educators', async () => {
      // There is no "Super Admin" bypass in the v2 model (auth-guard-v2.md confirms the old
      // `'Super Admin'` string check was dead code, never seeded) — `findByAdmin`'s ownership
      // check (`req.user.userId !== adminId`) applies uniformly to every district admin,
      // including this second, otherwise-identical admin account.
      educatorRepo.find.mockResolvedValue([]);
      const superToken = signToken(TEST_USERS.superAdmin);

      return request(httpServer())
        .get(`/api/educators/admin/${ANY_ADMIN_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(401);
    });
  });

  describe('PUT /api/educators/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .put('/api/educators/edu-1')
        .send({ full_name: 'Updated' })
        .expect(401);
    });

    it('INTEGRATION: returns 404 when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .put(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ full_name: 'Updated' })
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 200 when educator updated successfully', async () => {
      const updated = makeEducator({ full_name: 'Updated Name' });
      educatorRepo.findOne.mockResolvedValue(updated);
      educatorRepo.create.mockResolvedValue(updated);

      return request(httpServer())
        .put(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ full_name: 'Updated Name' })
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });

  describe('DELETE /api/educators/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete('/api/educators/edu-1').expect(401);
    });

    it('INTEGRATION: returns 404 when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .delete(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('INTEGRATION: returns 200 when educator deleted', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      classRepo.find.mockResolvedValue([]);
      dataSource.query.mockResolvedValue([]);
      dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
        const manager = {
          findOne: jest.fn().mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(null),
          find: jest.fn().mockResolvedValue([]),
          save: jest.fn().mockResolvedValue({}),
          query: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        };
        await cb(manager);
      });

      return request(httpServer())
        .delete(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });
});
