import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GuidedPathController } from '../../../src/guided-path/guided-path.controller';
import { GuidedPathService } from '../../../src/guided-path/guided-path.service';
import { GuidedPath } from 'src/database/entities';
import { GUIDED_PATH_REPOSITORY } from 'src/database/tokens';
import { RoleSlug, UserTokenType } from 'src/common/constants';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

type TestBody = {
  status?: string;
  message?: string;
  data?: {
    guidedPathId?: string;
    userId?: string;
    roleType?: string;
    state?: unknown;
    completed?: boolean;
  };
  error?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body as TestBody;
  }
  throw new Error('Expected response body to be an object');
};

const key = (userId: string, roleType: RoleSlug): string => `${userId}:${roleType}`;

const EDUCATOR_KEY = key(TEST_USERS.educator.sub, RoleSlug.EDUCATOR);
const ADMIN_KEY = key(TEST_USERS.districtAdmin.sub, RoleSlug.DISTRICT_ADMIN);
const DUAL_EDUCATOR_KEY = key(TEST_USERS.dualRole.sub, RoleSlug.EDUCATOR);
const DUAL_ADMIN_KEY = key(TEST_USERS.dualRole.sub, RoleSlug.DISTRICT_ADMIN);

describe('GuidedPath (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;
  let adminToken: string;
  let dualRoleEducatorToken: string;
  let dualRoleAdminToken: string;
  let scenarioAdminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  // In-memory store keyed by `${userId}:${roleType}`, standing in for the `guided_paths` table so
  // the controller/guard/validation pipeline is exercised end-to-end without a live DB connection.
  let store: Map<string, GuidedPath>;

  const makeRow = (
    userId: string,
    roleType: RoleSlug,
    overrides: Partial<GuidedPath> = {},
  ): GuidedPath => ({
    guidedPathId: `gp-${key(userId, roleType)}`,
    userId,
    roleType,
    state: {},
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const guidedPathRepository = {
    findByUserAndRole: jest.fn((userId: string, roleType: RoleSlug) =>
      Promise.resolve(store.get(key(userId, roleType)) ?? null),
    ),
    findOrCreateByUserAndRole: jest.fn((userId: string, roleType: RoleSlug) => {
      let row = store.get(key(userId, roleType));
      if (!row) {
        row = makeRow(userId, roleType);
        store.set(key(userId, roleType), row);
      }
      return Promise.resolve(row);
    }),
    upsertByUserAndRole: jest.fn(
      (userId: string, roleType: RoleSlug, data: Partial<GuidedPath>) => {
        const existing = store.get(key(userId, roleType));
        const merged = makeRow(userId, roleType, {
          ...(existing ?? {}),
          ...(data.state !== undefined ? { state: data.state } : {}),
          ...(data.completed !== undefined ? { completed: data.completed } : {}),
        });
        store.set(key(userId, roleType), merged);
        return Promise.resolve(merged);
      },
    ),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [GuidedPathController],
      providers: [
        GuidedPathService,
        { provide: GUIDED_PATH_REPOSITORY, useValue: guidedPathRepository },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
    adminToken = signToken(TEST_USERS.districtAdmin);
    dualRoleEducatorToken = signToken(TEST_USERS.dualRole);
    dualRoleAdminToken = signToken({ ...TEST_USERS.dualRole, type: UserTokenType.ADMIN });
    scenarioAdminToken = signToken(TEST_USERS.scenarioAdmin);
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    store = new Map();
    jest.clearAllMocks();
  });

  describe('GET /api/guided-path', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      await request(httpServer()).get('/api/guided-path').expect(401);
    });

    it('INTEGRATION: first-ever fetch returns 200 with default state:{} / completed:false, not 404', async () => {
      const res = await request(httpServer())
        .get('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const body = parseBody(res);
      expect(body.data?.userId).toBe(TEST_USERS.educator.sub);
      expect(body.data?.roleType).toBe(RoleSlug.EDUCATOR);
      expect(body.data?.state).toEqual({});
      expect(body.data?.completed).toBe(false);
    });

    it('INTEGRATION: a district admin gets their own guided path, created on first fetch', async () => {
      const res = await request(httpServer())
        .get('/api/guided-path')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = parseBody(res);
      expect(body.data?.userId).toBe(TEST_USERS.districtAdmin.sub);
      expect(body.data?.roleType).toBe(RoleSlug.DISTRICT_ADMIN);
      expect(body.data?.state).toEqual({});
      expect(body.data?.completed).toBe(false);
    });

    it('INTEGRATION: a caller outside the Educator and District Admin roles is refused with 403', async () => {
      // AuthGuard (src/common/guards/auth.guard.ts) enforces `@RequiredRoles(...)` globally
      // (ADR-0005) against the selected role (ADR-0006) — a role mismatch throws FORBIDDEN.
      await request(httpServer())
        .get('/api/guided-path')
        .set('Authorization', `Bearer ${scenarioAdminToken}`)
        .expect(403);
    });
  });

  describe('PUT /api/guided-path', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      await request(httpServer()).put('/api/guided-path').send({ completed: true }).expect(401);
    });

    it('INTEGRATION: a caller outside the Educator and District Admin roles is refused with 403', async () => {
      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${scenarioAdminToken}`)
        .send({ completed: true })
        .expect(403);
    });

    it('INTEGRATION: a district admin can update their own guided path', async () => {
      const res = await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ state: { step1: true, step2: true, step3: false, step4: false }, completed: false })
        .expect(200);

      const body = parseBody(res);
      expect(body.data?.roleType).toBe(RoleSlug.DISTRICT_ADMIN);
      expect(body.data?.state).toEqual({ step1: true, step2: true, step3: false, step4: false });
      expect(store.get(ADMIN_KEY)?.completed).toBe(false);
      expect(store.has(EDUCATOR_KEY)).toBe(false);
    });

    it('INTEGRATION: rejects a non-object state with a validation error', async () => {
      const res = await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ state: 'not-an-object' })
        .expect(400);

      const body = parseBody(res);
      expect(body.error ?? body.message).toBeTruthy();
    });

    it.each([
      ['state', { state: null }],
      ['completed', { completed: null }],
      ['both fields', { state: null, completed: null }],
    ])(
      'INTEGRATION: rejects an explicit null for %s with 400, not a server error',
      async (_name, body) => {
        const res = await request(httpServer())
          .put('/api/guided-path')
          .set('Authorization', `Bearer ${educatorToken}`)
          .send(body)
          .expect(400);

        expect(parseBody(res).error ?? parseBody(res).message).toBeTruthy();
        expect(store.size).toBe(0);
      },
    );

    it('INTEGRATION: rejects an empty body (neither state nor completed)', async () => {
      const res = await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({})
        .expect(400);

      const body = parseBody(res);
      expect(body.error ?? body.message).toBeTruthy();
    });

    it('INTEGRATION: repeated writes for a role with no existing row converge to one row (upsert idempotency)', async () => {
      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ completed: true })
        .expect(200);

      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ completed: true })
        .expect(200);

      expect(store.size).toBe(1);
      expect(store.get(EDUCATOR_KEY)?.completed).toBe(true);
    });

    it('INTEGRATION: a completed-only write leaves a previously-written state blob byte-for-byte unchanged', async () => {
      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ state: { step1: true, step2: false } })
        .expect(200);

      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ completed: true })
        .expect(200);

      const res = await request(httpServer())
        .get('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const body = parseBody(res);
      expect(body.data?.state).toEqual({ step1: true, step2: false });
      expect(body.data?.completed).toBe(true);
    });

    it('INTEGRATION: a state-only write leaves a previously-set completed value unchanged', async () => {
      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ completed: true })
        .expect(200);

      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ state: { step1: true } })
        .expect(200);

      const res = await request(httpServer())
        .get('/api/guided-path')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const body = parseBody(res);
      expect(body.data?.state).toEqual({ step1: true });
      expect(body.data?.completed).toBe(true);
    });

    it('INTEGRATION: an account holding both roles keeps separate progress for each selected role', async () => {
      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${dualRoleEducatorToken}`)
        .send({ state: { step1: true }, completed: false })
        .expect(200);

      await request(httpServer())
        .put('/api/guided-path')
        .set('Authorization', `Bearer ${dualRoleAdminToken}`)
        .send({ state: { step1: true, step2: true }, completed: true })
        .expect(200);

      expect(store.size).toBe(2);
      expect(store.get(DUAL_EDUCATOR_KEY)).toMatchObject({
        state: { step1: true },
        completed: false,
      });
      expect(store.get(DUAL_ADMIN_KEY)).toMatchObject({
        state: { step1: true, step2: true },
        completed: true,
      });

      const educatorRes = await request(httpServer())
        .get('/api/guided-path')
        .set('Authorization', `Bearer ${dualRoleEducatorToken}`)
        .expect(200);
      const adminRes = await request(httpServer())
        .get('/api/guided-path')
        .set('Authorization', `Bearer ${dualRoleAdminToken}`)
        .expect(200);

      expect(parseBody(educatorRes).data?.roleType).toBe(RoleSlug.EDUCATOR);
      expect(parseBody(educatorRes).data?.completed).toBe(false);
      expect(parseBody(adminRes).data?.roleType).toBe(RoleSlug.DISTRICT_ADMIN);
      expect(parseBody(adminRes).data?.completed).toBe(true);
    });
  });
});
