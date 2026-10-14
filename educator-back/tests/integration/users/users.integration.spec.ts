import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UsersController } from '../../../src/users/users.controller';
import { UsersService } from '../../../src/users/users.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { InvitesService } from '../../../src/invites/invites.service';

import { AzureBlobService } from '../../../src/common/services';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { expectErrorEnvelope, expectLegacySuccessBody } from '../setup/error-envelope.util';
import { User, Role } from 'src/database/entities';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  ROLE_REPOSITORY,
  USER_REPOSITORY,
} from 'src/database/tokens';
import { DatabaseService } from 'src/database/services/database.service';

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

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: TEST_USERS.districtAdmin.sub,
    email: 'admin@test.com',
    password: 'hash',
    status: CommonStatus.ACTIVE,
    role: { id: 'role-1', role_name: 'District Admin' } as Role,
    ...o,
  }) as User;

describe('Users (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  jest.setTimeout(20_000);

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  // `findOne`'s default resolves the authenticated admin's own JWT-auth lookup (any test that
  // doesn't care about `userRepo.findOne` still needs `JwtStrategy.validate()` to succeed) —
  // individual tests override this via `mockResolvedValue`/`mockImplementation` for their own
  // business-lookup id, same instance as the auth call since both go through `USER_REPOSITORY`.
  const defaultUserRepoFindOne = (options: { where?: { id?: string } }): Promise<User | null> =>
    Promise.resolve(options?.where?.id === TEST_USERS.districtAdmin.sub ? makeUser() : null);

  const userRepo = {
    find: jest.fn(),
    findOne: jest.fn().mockImplementation(defaultUserRepoFindOne),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const roleRepo = { findOne: jest.fn() };
  const educatorRepo = { findOne: jest.fn(), save: jest.fn() };
  const educatorsService = { updateProfile: jest.fn() };
  const invitesService = { findInviteById: jest.fn(), markInviteAccepted: jest.fn() };
  const azureBlobService = {
    uploadFile: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(false),
  };
  const databaseService = { pingCheck: jest.fn(), connection: { createQueryBuilder: jest.fn() } };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: EducatorsService, useValue: educatorsService },
        { provide: InvitesService, useValue: invitesService },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ROLE_REPOSITORY, useValue: roleRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        {
          provide: DISTRICT_ADMIN_REPOSITORY,
          useValue: { findByUserRoleId: jest.fn(), updateByUserRoleId: jest.fn() },
        },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DatabaseService, useValue: databaseService },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/users', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      await request(httpServer()).get('/api/users').expect(401);
    });

    it('INTEGRATION: returns 200 with user list', async () => {
      userRepo.find.mockResolvedValue([makeUser()]);

      await request(httpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
          const body = parseBody(res);
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no users', async () => {
      userRepo.find.mockResolvedValue([]);

      await request(httpServer())
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
      await request(httpServer()).get(`/api/users/${TEST_USERS.districtAdmin.sub}`).expect(401);
    });

    it('INTEGRATION: returns 200 when user found', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      await request(httpServer())
        .get(`/api/users/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
          const body = parseBody(res);
          expect(body.data).toBeDefined();
        });
    });

    it('INTEGRATION: returns 404 when user not found', async () => {
      // Target a *different* id than the authenticated admin's own `sub` — `JwtStrategy` re-reads
      // the admin's own account via this same `USER_REPOSITORY` on every request, so a blanket
      // `mockResolvedValue(null)` here would also fail auth (401) rather than reach the
      // controller's own 404 for a missing *target* user.
      const missingUserId = '550e8400-e29b-41d4-a716-446655449999';
      userRepo.findOne.mockImplementation((options: { where?: { id?: string } }) =>
        Promise.resolve(options?.where?.id === TEST_USERS.districtAdmin.sub ? makeUser() : null),
      );

      await request(httpServer())
        .get(`/api/users/${missingUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });
  });
});
