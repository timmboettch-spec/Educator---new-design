import { INestApplication, BadRequestException, ConflictException } from '@nestjs/common';
import request from 'supertest';
import { InvitesController } from '../../../src/invites/invites.controller';
import { InvitesService } from '../../../src/invites/invites.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';
import { UsersService } from '../../../src/users/users.service';

import { MailService } from '../../../src/mail/mail.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { LoggerService } from '../../../src/common/services';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { RoleSlug } from 'src/common/constants';
import {
  buildTestApp,
  TEST_USERS,
  defaultUserRoleRepositoryFindByUserId,
} from '../setup/test-app.factory';
import { expectErrorEnvelope } from '../setup/error-envelope.util';
import { Invite, InviteStatus, User, Schools } from 'src/database/entities';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  INVITE_REPOSITORY,
  ROLE_REPOSITORY,
  SCHOOLS_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';

type TestBody = {
  status?: string;
  success?: boolean;
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

const SCHOOL_ID = '550e8400-e29b-41d4-a716-446655440302';
const INVITE_ID = '550e8400-e29b-41d4-a716-446655440301';

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: TEST_USERS.districtAdmin.sub,
    email: 'admin@test.com',
    status: CommonStatus.ACTIVE,
    ...o,
  }) as User;

const makeSchool = (): Schools => ({ id: SCHOOL_ID, school_name: 'Test School' }) as Schools;

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

  const inviteRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteByEmail: jest.fn().mockResolvedValue(0),
    acceptInvite: jest.fn(),
    ensureColumns: jest.fn().mockResolvedValue(undefined),
  };
  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    findByEmailWithRoles: jest.fn().mockResolvedValue(null),
    createInvitedAccount: jest.fn(),
  };
  const schoolRepo = { findOne: jest.fn() };
  const educatorRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    upsertByEmail: jest.fn(),
    delete: jest.fn(),
  };
  const roleRepo = { findOne: jest.fn(), findBySlug: jest.fn() };
  const userRoleRepo = {
    activate: jest.fn().mockResolvedValue(undefined),
    findByUserId: jest.fn().mockImplementation(defaultUserRoleRepositoryFindByUserId),
    findByUserAndRoleSlug: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
  };
  const districtAdminRepo = {
    findByUserRoleId: jest.fn().mockResolvedValue(null),
    updateByUserRoleId: jest.fn(),
  };
  const mailService = { sendMail: jest.fn().mockResolvedValue({}) };
  const usersService = { findByEmail: jest.fn() };
  const inviteTokenService = {
    issue: jest.fn().mockReturnValue('mock-invite-token'),
    buildInviteUrl: jest.fn().mockReturnValue('http://localhost:5173/signup/mock-invite-token'),
    resolve: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [InvitesController],
      providers: [
        InvitesService,
        { provide: InviteTokenService, useValue: inviteTokenService },
        { provide: UsersService, useValue: usersService },
        { provide: INVITE_REPOSITORY, useValue: inviteRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        {
          provide: EDUCATOR_SCHOOL_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            upsert: jest.fn(),
          },
        },
        { provide: ROLE_REPOSITORY, useValue: roleRepo },
        { provide: USER_ROLE_REPOSITORY, useValue: userRoleRepo },
        { provide: DISTRICT_ADMIN_REPOSITORY, useValue: districtAdminRepo },
        { provide: MailService, useValue: mailService },
        {
          provide: NotificationsGateway,
          useValue: {
            notifyAdminEducatorInvitationAccepted: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
        {
          provide: LoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
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

    it('INTEGRATION: returns 401 when creator account no longer exists', async () => {
      // `InvitesController.createInvite` looks up the creator by `req.user.userId` — the exact
      // same id `JwtStrategy.validate()` already re-validated against `USER_REPOSITORY` for this
      // request. Once that account is gone, auth now rejects with 401 before the controller's
      // own `findCreatorById` 404 branch can ever run.
      userRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/invites/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'new@test.com', school_id: SCHOOL_ID })
        .expect(401);
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
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 400 when user email already exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      educatorRepo.findOne.mockResolvedValue({
        id: 'edu-existing',
        email: 'existing@test.com',
        is_active: true,
      });

      return request(httpServer())
        .post('/api/invites/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'existing@test.com', school_id: SCHOOL_ID })
        .expect(400)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when invite created', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      usersService.findByEmail.mockResolvedValue(null);
      schoolRepo.findOne.mockResolvedValue(makeSchool());
      inviteRepo.findOne.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue({ id: 'edu-uuid', email: 'new@test.com' });
      educatorRepo.upsertByEmail.mockResolvedValue('edu-uuid');
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', role_name: 'Educator' });
      roleRepo.findBySlug.mockResolvedValue({
        id: 'role-1',
        role_name: 'Educator',
        slug: RoleSlug.EDUCATOR,
      });
      userRepo.createInvitedAccount.mockResolvedValue({
        user: { id: 'new-user-uuid', email: 'new@test.com' },
        userRoleId: 'new-user-role-uuid',
      });
      educatorRepo.create.mockResolvedValue({ id: 'edu-uuid', email: 'new@test.com' });
      const savedInvite = makeInvite();
      inviteRepo.create.mockReturnValue(savedInvite);
      inviteRepo.save.mockResolvedValue(savedInvite);

      return request(httpServer())
        .post('/api/invites/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'new@test.com', school_id: SCHOOL_ID })
        .expect(201)
        .expect((res) => {
          // `createInvite` returns a `ResponseResult`, so `ResponseInterceptor` wraps it in the
          // unified `{ message, data, meta, error }` envelope.
          const body = parseBody(res) as unknown as {
            message?: unknown;
            data?: unknown;
            error?: unknown;
          };
          expect(typeof body.message).toBe('string');
          expect(body.data).toBeDefined();
          expect(body.error).toBeNull();
        });
    });
  });

  describe('POST /api/invites/verify-token', () => {
    it('INTEGRATION: returns 400 when token is missing', async () => {
      return request(httpServer()).post('/api/invites/verify-token').send({}).expect(400);
    });

    it('INTEGRATION: returns 400 when the token resolves to an invalid/expired invite', async () => {
      inviteTokenService.resolve.mockRejectedValue(
        new BadRequestException('Invalid or expired invite'),
      );

      return request(httpServer())
        .post('/api/invites/verify-token')
        .send({ token: 'bad-token' })
        .expect(400)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.data).toBeNull();
          expect(body.error).toBeNull();
        });
    });

    it('INTEGRATION: returns 201 when the token is valid', async () => {
      inviteTokenService.resolve.mockResolvedValue(makeInvite());
      userRepo.findByEmailWithRoles.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/invites/verify-token')
        .send({ token: 'good-token' })
        .expect(201)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.data).toBeDefined();
          expect(body.data).not.toBeNull();
        });
    });
  });

  describe('POST /api/invites/accept-invite', () => {
    const arrangeAcceptable = (): void => {
      inviteTokenService.resolve.mockResolvedValue(makeInvite());
      roleRepo.findBySlug.mockResolvedValue({ id: 'educator-role-uuid' });
      userRepo.findByEmailWithRoles.mockResolvedValue({
        id: 'user-uuid',
        userRoles: [
          { userRoleId: 'ur-uuid', roleId: 'educator-role-uuid', status: CommonStatus.PENDING },
        ],
      });
    };
    const body = { token: 'good-token', password: 'StrongP@ssw0rd1' };

    it('INTEGRATION: returns 201 and keeps the success body when the accept commits', async () => {
      arrangeAcceptable();
      inviteRepo.acceptInvite.mockResolvedValue(null);

      await request(httpServer()).post('/api/invites/accept-invite').send(body).expect(201);
      expect(inviteRepo.acceptInvite).toHaveBeenCalledTimes(1);
    });

    it('INTEGRATION: returns 409 when the invite was already accepted', async () => {
      arrangeAcceptable();
      inviteRepo.acceptInvite.mockRejectedValue(new ConflictException('Invite already accepted'));

      await request(httpServer()).post('/api/invites/accept-invite').send(body).expect(409);
    });
  });
});
