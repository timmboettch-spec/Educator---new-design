import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, EntityManager } from 'typeorm';
import { SchoolsController } from '../../../src/schools/schools.controller';
import { SchoolsService } from '../../../src/schools/schools.service';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';

import { MailService } from '../../../src/mail/mail.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import {
  expectErrorEnvelope,
  expectLegacySuccessBody,
  expectSuccessEnvelope,
} from '../setup/error-envelope.util';
import { Schools, User } from 'src/database/entities';
import {
  CLASS_SIMULATION_REPOSITORY,
  INVITE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_REPOSITORY,
} from 'src/database/tokens';
import { DatabaseService } from 'src/database/services/database.service';

type TestBody = {
  status?: string;
  data?: unknown;
  error?: unknown;
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

const makeUser = (o: Partial<User> = {}): User =>
  ({ id: TEST_USERS.districtAdmin.sub, status: CommonStatus.ACTIVE, ...o }) as User;

const makeSchool = (o: Partial<Schools> = {}): Schools => ({
  id: '550e8400-e29b-41d4-a716-446655440201',
  school_name: 'Test School',
  status: CommonStatus.ACTIVE,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  lms_enabled: false,
  user_id: makeUser(),
  ...o,
});

describe('Schools (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const SCHOOL_ID = '550e8400-e29b-41d4-a716-446655440201';
  const MISSING_SCHOOL_ID = '550e8400-e29b-41d4-a716-446655440299';

  const schoolRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    findAllForAdmin: jest.fn(),
  };
  // Base default satisfies `JwtStrategy.validate()`'s own account-existence check for any
  // `TEST_USERS` token this suite signs (districtAdmin/educator) — individual tests still
  // override `findOne` for their own business-lookup id (`SchoolsService.findUserById`), which
  // goes through this same `USER_REPOSITORY` mock.
  const userRepo = {
    findOne: jest.fn().mockImplementation((options: { where?: { id?: string } }) => {
      const id = options?.where?.id;
      if (id === TEST_USERS.districtAdmin.sub || id === TEST_USERS.educator.sub) {
        return Promise.resolve(makeUser({ id }));
      }
      return Promise.resolve(null);
    }),
  };
  const classSimulationRepo = { update: jest.fn() };
  const inviteRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteByEmail: jest.fn(),
  };
  const mailService = {
    sendInviteEmail: jest.fn().mockResolvedValue(undefined),
    sendMail: jest.fn().mockResolvedValue(undefined),
  };
  const managerQb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const manager = {
    update: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    query: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(managerQb),
  };
  const dataSource = { query: jest.fn().mockResolvedValue([]) };
  const databaseService = {
    pingCheck: jest.fn(),
    connection: dataSource,
    runInTransaction: jest.fn((work: (manager: EntityManager) => unknown) =>
      work(manager as unknown as EntityManager),
    ),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [SchoolsController],
      providers: [
        SchoolsService,
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
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: INVITE_REPOSITORY, useValue: inviteRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: DatabaseService, useValue: databaseService },
        {
          provide: EducatorSessionService,
          useValue: { isTokenInvalidated: jest.fn().mockResolvedValue(false) },
        },
        { provide: NotificationsGateway, useValue: { notifyEducatorSchoolDeactivated: jest.fn() } },
        { provide: MailService, useValue: mailService },
      ],
    }));
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('POST /api/schools', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .post('/api/schools')
        .send({ school_name: 'Test School' })
        .expect(401);
    });

    it('INTEGRATION: returns 403 when non-District Admin tries to create', async () => {
      const token = signToken(TEST_USERS.educator);

      return request(httpServer())
        .post('/api/schools')
        .set('Authorization', `Bearer ${token}`)
        .send({ school_name: 'Test School' })
        .expect(403)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 401 when the District Admin account no longer exists', async () => {
      // `SchoolsController.create`'s `findUserById(targetUserId)` check defaults `targetUserId`
      // to `req.user.userId` — the exact same id `JwtStrategy.validate()` already re-validated
      // via this same `USER_REPOSITORY` for this request. Once that account is gone, auth now
      // rejects with 401 before this controller-level check can ever run.
      userRepo.findOne.mockResolvedValue(null);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/schools')
        .set('Authorization', `Bearer ${token}`)
        .send({ school_name: 'Test School' })
        .expect(401);
    });

    it('INTEGRATION: returns 400 when school already exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/schools')
        .set('Authorization', `Bearer ${token}`)
        .send({ school_name: 'Test School' })
        .expect(400)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when school is created', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeSchool());
      schoolRepo.create.mockReturnValue(makeSchool());
      schoolRepo.save.mockResolvedValue(makeSchool());
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/schools')
        .set('Authorization', `Bearer ${token}`)
        .send({ school_name: 'Test School' })
        .expect(201)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
          expect(body.data).toBeDefined();
        });
    });

    it('INTEGRATION: returns 400 when school_name is missing', async () => {
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/schools')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('INTEGRATION: reports only the first violation per field when multiple fields are invalid', async () => {
      // `schools` never carried the per-controller `createValidationPipe()` opt-in — this
      // exercises the global cutover in `main.ts` (via `buildTestApp`'s matching global pipe).
      // `school_name` fails only `MinLength` (too short, but non-empty) and `status` fails only
      // `IsEnum`, so each field has exactly one violation despite two fields being invalid at once.
      const token = signToken(TEST_USERS.districtAdmin);

      const res = await request(httpServer())
        .post('/api/schools')
        .set('Authorization', `Bearer ${token}`)
        .send({ school_name: 'ab', status: 'bogus' })
        .expect(400);

      expectErrorEnvelope(res);
      const body = parseBody(res);
      const error = asRecord(body.error);
      const messages = Object.values(error);

      expect(messages).toHaveLength(2);
      expect(messages).toContain('School name is too short (min 3 characters)');
      expect(messages).toContain('Status must be ACTIVE or INACTIVE');
    });
  });

  describe('GET /api/schools/user', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/schools/user').expect(401);
    });

    it('INTEGRATION: returns 200 with school list', async () => {
      schoolRepo.findAllForAdmin.mockResolvedValue([makeSchool()]);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .get('/api/schools/user')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
          expect(Array.isArray(body.data)).toBe(true);
        });
    });
  });

  describe('GET /api/schools/:id', () => {
    it('INTEGRATION: returns 200 when school found', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .get(`/api/schools/${SCHOOL_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expectLegacySuccessBody(res);
          expect(data.id).toBe(SCHOOL_ID);
        });
    });

    it('INTEGRATION: returns 404 when school not found', async () => {
      schoolRepo.findOne.mockResolvedValue(null);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .get(`/api/schools/${MISSING_SCHOOL_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });
  });

  describe('PUT /api/schools/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .put(`/api/schools/${SCHOOL_ID}`)
        .send({ school_name: 'Updated' })
        .expect(401);
    });

    it('INTEGRATION: returns 200 when school updated', async () => {
      const updated = makeSchool({ school_name: 'Updated School' });
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      schoolRepo.save.mockResolvedValue(updated);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .put(`/api/schools/${SCHOOL_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ school_name: 'Updated School' })
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });

  describe('DELETE /api/schools/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete(`/api/schools/${SCHOOL_ID}`).expect(401);
    });

    it('INTEGRATION: returns 200 when school deleted', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      manager.find.mockResolvedValue([]);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .delete(`/api/schools/${SCHOOL_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expectSuccessEnvelope(res);
        });
    });

    it('INTEGRATION: returns 403 when the requesting user account is inactive', async () => {
      // Mock the user lookup to return an inactive account
      userRepo.findOne.mockResolvedValue(makeUser({ status: CommonStatus.INACTIVE }));
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .delete(`/api/schools/${SCHOOL_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });
  });
});
