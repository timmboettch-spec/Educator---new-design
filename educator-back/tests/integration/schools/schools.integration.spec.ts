import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SchoolsController } from '../../../src/schools/schools.controller';
import { SchoolsService } from '../../../src/schools/schools.service';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { User } from '../../../src/users/entity/user.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { MailService } from '../../../src/mail/mail.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

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

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
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
    createQueryBuilder: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const classSimulationRepo = { update: jest.fn() };
  const inviteRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
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
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      update: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(managerQb),
    },
  };
  const dataSource = { query: jest.fn().mockResolvedValue([]), createQueryRunner: jest.fn() };

  beforeAll(async () => {
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    ({ app, signToken } = await buildTestApp({
      controllers: [SchoolsController],
      providers: [
        SchoolsService,
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(ClassSimulation), useValue: classSimulationRepo },
        { provide: getRepositoryToken(Invite), useValue: inviteRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: EducatorSessionService, useValue: { isTokenInvalidated: jest.fn().mockResolvedValue(false) } },
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
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 403 when District Admin user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/schools')
        .set('Authorization', `Bearer ${token}`)
        .send({ school_name: 'Test School' })
        .expect(403);
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
          expectStatus(res, 'FAILED');
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
          expect(body.status).toBe('SUCCESS');
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
  });

  describe('GET /api/schools/user', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/schools/user').expect(401);
    });

    it('INTEGRATION: returns 200 with school list', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([makeSchool()]),
      };
      schoolRepo.createQueryBuilder.mockReturnValue(qb);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .get('/api/schools/user')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
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
          expect(body.status).toBe('SUCCESS');
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
          expectStatus(res, 'FAILED');
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
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('DELETE /api/schools/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete(`/api/schools/${SCHOOL_ID}`).expect(401);
    });

    it('INTEGRATION: returns 200 when school deleted', async () => {
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      queryRunner.manager.find.mockResolvedValue([]);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .delete(`/api/schools/${SCHOOL_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
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
          expectStatus(res, 'FAILED');
        });
    });
  });
});



