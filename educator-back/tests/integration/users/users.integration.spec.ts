import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersController } from '../../../src/users/users.controller';
import { UsersService } from '../../../src/users/users.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { InvitesService } from '../../../src/invites/invites.service';
import { User } from '../../../src/users/entity/user.entity';
import { Role } from '../../../src/roles/entity/role.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { MailService } from '../../../src/mail/mail.service';
import { DataSource } from 'typeorm';
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

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: TEST_USERS.districtAdmin.sub,
    email: 'admin@test.com',
    password: 'hash',
    full_name: 'Test Admin',
    status: CommonStatus.ACTIVE,
    role: { id: 'role-1', role_name: 'District Admin' } as Role,
    ...o,
  }) as User;

describe('Users (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const userRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), update: jest.fn(), create: jest.fn() };
  const roleRepo = { findOne: jest.fn() };
  const educatorRepo = { findOne: jest.fn(), save: jest.fn() };
  const educatorsService = { updateProfile: jest.fn() };
  const invitesService = { findInviteById: jest.fn(), acceptInvite: jest.fn() };
  const azureBlobService = { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) };
  const notificationsGateway = { notifyAccountDeleted: jest.fn() };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: EducatorsService, useValue: educatorsService },
        { provide: InvitesService, useValue: invitesService },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(Schools), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Class), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(ClassSimulation), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(Invite), useValue: { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() } },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/users', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/users').expect(401);
    });

    it('INTEGRATION: returns 200 with user list', async () => {
      userRepo.find.mockResolvedValue([makeUser()]);

      return request(httpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no users', async () => {
      userRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(Array.isArray(body.data) ? body.data : []).toHaveLength(0);
        });
    });
  });

  describe('GET /api/users/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get(`/api/users/${TEST_USERS.districtAdmin.sub}`).expect(401);
    });

    it('INTEGRATION: returns 200 when user found', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      return request(httpServer())
        .get(`/api/users/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(body.data).toBeDefined();
        });
    });

    it('INTEGRATION: returns 404 when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .get('/api/users/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });
  });

  describe('PUT /api/users/change-password', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .put('/api/users/change-password')
        .send({ old_password: 'old', new_password: 'new' })
        .expect(401);
    });

    it('INTEGRATION: returns 400 when required fields missing', async () => {
      return request(httpServer())
        .put('/api/users/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });
  });
});
