import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvitesController } from '../../../src/invites/invites.controller';
import { InvitesService } from '../../../src/invites/invites.service';
import { UsersService } from '../../../src/users/users.service';
import { Invite, InviteStatus } from '../../../src/invites/entity/invite.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { Role } from '../../../src/roles/entity/role.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { MailService } from '../../../src/mail/mail.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

type TestBody = {
  status?: string;
  success?: boolean;
  data?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

const SCHOOL_ID = '550e8400-e29b-41d4-a716-446655440302';
const INVITE_ID = '550e8400-e29b-41d4-a716-446655440301';
const MISSING_INVITE_ID = '550e8400-e29b-41d4-a716-446655440399';

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: TEST_USERS.districtAdmin.sub,
    email: 'admin@test.com',
    full_name: 'Admin',
    status: CommonStatus.ACTIVE,
    subscriptions: [],
    ...o,
  }) as User;

const makeSchool = (): Schools => ({ id: SCHOOL_ID, school_name: 'Test School' } as Schools);

const makeInvite = (o: Partial<Invite> = {}): Invite => ({
  id: INVITE_ID,
  full_name: '',
  email: 'educator@test.com',
  status: InviteStatus.PENDING,
  expires_at: new Date(Date.now() + 3600000),
  school: makeSchool(),
  createdBy: makeUser(),
  created_at: new Date(),
  updated_at: new Date(),
  is_active: true,
  deleted_at: null,
  ...o,
});

describe('Invites (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const inviteRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn(), delete: jest.fn() };
  const userRepo = { findOne: jest.fn(), save: jest.fn() };
  const schoolRepo = { findOne: jest.fn() };
  const educatorRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ id: 'edu-uuid' }] }),
    }),
    delete: jest.fn(),
  };
  const roleRepo = { findOne: jest.fn() };
  const mailService = { sendMail: jest.fn().mockResolvedValue({}) };
  const usersService = { findByEmail: jest.fn() };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [InvitesController],
      providers: [
        InvitesService,
        { provide: UsersService, useValue: usersService },
        { provide: getRepositoryToken(Invite), useValue: inviteRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(EducatorSchool), useValue: { findOne: jest.fn(), count: jest.fn(), create: jest.fn(), save: jest.fn(), upsert: jest.fn() } },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: MailService, useValue: mailService },
        { provide: DataSource, useValue: { query: jest.fn() } },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => {
    jest.clearAllMocks();
    mailService.sendMail.mockResolvedValue({});
  });

  describe('POST /api/invites/create', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .post('/api/invites/create')
        .send({ email: 'new@test.com', school_id: SCHOOL_ID })
        .expect(401);
    });

    it('INTEGRATION: returns 404 when creator not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/invites/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'new@test.com', school_id: SCHOOL_ID })
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 404 when school not found', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/invites/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'new@test.com', school_id: SCHOOL_ID })
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when user email already exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      usersService.findByEmail.mockResolvedValue(makeUser({ email: 'existing@test.com' }));

      return request(httpServer())
        .post('/api/invites/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'existing@test.com', school_id: SCHOOL_ID })
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when invite created', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      usersService.findByEmail.mockResolvedValue(null);
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      inviteRepo.findOne.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue({ id: 'edu-uuid', email: 'new@test.com' });
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', role_name: 'Educator' });
      const savedInvite = makeInvite();
      inviteRepo.create.mockReturnValue(savedInvite);
      inviteRepo.save.mockResolvedValue(savedInvite);

      return request(httpServer())
        .post('/api/invites/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'new@test.com', school_id: SCHOOL_ID })
        .expect(201)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.success).toBe(true);
        });
    });
  });

  describe('POST /api/invites/verify', () => {
    it('INTEGRATION: returns 400 when invite_id is missing', async () => {
      return request(httpServer())
        .post('/api/invites/verify')
        .send({})
        .expect(400);
    });

    it('INTEGRATION: returns 400 when invite not found', async () => {
      inviteRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/invites/verify')
        .send({ invite_id: MISSING_INVITE_ID })
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 200 when invite is valid', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite());

      return request(httpServer())
        .post('/api/invites/verify')
        .send({ invite_id: INVITE_ID })
        .expect(201)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.success).toBe(true);
        });
    });
  });

  describe('GET /api/invites/:id', () => {
    it('INTEGRATION: returns 400 when id is not UUID', async () => {
      return request(httpServer()).get('/api/invites/not-a-uuid').expect(400);
    });

    it('INTEGRATION: returns 200 when invite details retrieved', async () => {
      inviteRepo.findOne.mockResolvedValue(makeInvite());

      return request(httpServer())
        .get(`/api/invites/${INVITE_ID}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.success).toBe(true);
          expect(body.data).toBeDefined();
        });
    });

    it('INTEGRATION: returns 400 when invite not found', async () => {
      inviteRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .get(`/api/invites/${MISSING_INVITE_ID}`)
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });
  });
});
