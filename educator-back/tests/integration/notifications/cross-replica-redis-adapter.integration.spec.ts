import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'net';

import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { TokenService } from '../../../src/common/services/token.service';
import { LoggerService } from '../../../src/common/services';
import { RedisService } from '../../../src/redis/redis.service';
import { SocketIoAdapter } from '../../../src/common/adapters';
import { AuthService } from '../../../src/auth/auth.service';
import { Educator, Notification } from 'src/database/entities';
import { NotificationPreference } from 'src/database/entities/notification-preference.entity';
import { STUDENT_REPOSITORY, USER_REPOSITORY, USER_ROLE_REPOSITORY } from 'src/database/tokens';
import { CommonStatus } from 'src/common/enums/status.enum';
import { RoleSlug } from 'src/common/constants';
import { FakeRedisPubSub } from '../setup/fake-redis-pubsub';

const JWT_SECRET = 'test-cross-replica-secret';
const EDUCATOR_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440901';
const EDUCATOR_ID = '550e8400-e29b-41d4-a716-446655440902';
const ADMIN_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440903';
const STUDENT_CODE = 'STU-XREPLICA';

/** In-process pub/sub shared by every replica's adapter connections — no Redis server needed. */
const asRedis = (client: FakeRedisPubSub): Redis => client as unknown as Redis;

/** Student sockets authenticate by token now; both replicas share `JWT_SECRET`. */
const studentTokenFor = (code: string): string =>
  new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }).sign({
    sub: code,
    user_id: code,
    student_id: code,
    type: 'student',
    purpose: 'access',
  });

const silentLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

interface Replica {
  app: INestApplication;
  gateway: NotificationsGateway;
  url: string;
  tokenService: TokenService;
}

/** One replica = one Nest app with its own gateway; `redis: null` keeps the in-memory adapter. */
async function startReplica(redis: Redis | null): Promise<Replica> {
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } })],
    providers: [
      NotificationsGateway,
      NotificationsService,
      TokenService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'jwt.accessSecret') return JWT_SECRET;
            if (key === 'jwt.accessExpiresIn') return 3600;
            if (key === 'app.nodeEnv') return 'local';
            return null;
          },
          getOrThrow: (key: string) => (key === 'app.nodeEnv' ? 'local' : undefined),
        },
      },
      {
        provide: getRepositoryToken(Notification),
        useValue: {
          create: jest.fn((dto: Partial<Notification>) => ({ ...dto })),
          save: jest.fn((entity: Partial<Notification>) =>
            Promise.resolve({ id: 'n-1', isRead: false, createdAt: new Date(), ...entity }),
          ),
          find: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
          update: jest.fn().mockResolvedValue({ affected: 0 }),
          delete: jest.fn().mockResolvedValue({ affected: 0 }),
        },
      },
      {
        provide: getRepositoryToken(NotificationPreference),
        useValue: { findOne: jest.fn().mockResolvedValue({ enabled: true }) },
      },
      { provide: getRepositoryToken(Educator), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
      { provide: RedisService, useValue: { set: jest.fn(), get: jest.fn().mockResolvedValue(null) } },
      {
        provide: USER_REPOSITORY,
        useValue: {
          findOne: jest
            .fn()
            .mockImplementation((options: { where?: { id?: string } }) =>
              Promise.resolve(options?.where?.id ? { id: options.where.id } : null),
            ),
        },
      },
      {
        provide: USER_ROLE_REPOSITORY,
        useValue: {
          findByUserId: jest.fn().mockImplementation((userId: string) =>
            Promise.resolve(
              userId === EDUCATOR_ACCOUNT_ID
                ? [
                  {
                    userId,
                    status: CommonStatus.ACTIVE,
                    role: { slug: RoleSlug.EDUCATOR },
                    educator: { id: EDUCATOR_ID },
                  },
                ]
                : [
                  {
                    userId,
                    status: CommonStatus.ACTIVE,
                    role: { slug: RoleSlug.DISTRICT_ADMIN },
                    districtAdmin: { districtAdminId: 'district-admin-1' },
                  },
                ],
            ),
          ),
        },
      },
      {
        provide: AuthService,
        useFactory: (
          tokenService: TokenService,
          userRepo: unknown,
          userRoleRepo: unknown,
          studentRepo: unknown,
        ): AuthService =>
          Object.assign(Object.create(AuthService.prototype) as AuthService, {
            tokenService,
            userRepo,
            userRoleRepo,
            studentRepo,
          }),
        inject: [TokenService, USER_REPOSITORY, USER_ROLE_REPOSITORY, STUDENT_REPOSITORY],
      },
      {
        provide: STUDENT_REPOSITORY, useValue: {
          findOne: jest.fn().mockResolvedValue({
            id: 'student-id',
            is_active: true,
            deleted_at: null,
            status: CommonStatus.ACTIVE,
            class: { is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
            educator: { is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
          })
        }
      },
      { provide: LoggerService, useValue: silentLogger },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  if (redis) {
    app.useWebSocketAdapter(new SocketIoAdapter(app, redis, silentLogger));
  }
  await app.listen(0);

  return {
    app,
    gateway: moduleRef.get(NotificationsGateway),
    url: `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`,
    tokenService: moduleRef.get(TokenService),
  };
}

/** WebSocket-only by default; pass `['polling', 'websocket']` for the client's default upgrade path. */
function connect(
  url: string,
  auth: Record<string, string>,
  transports: string[] = ['websocket'],
): Socket {
  return io(url, { auth, transports, reconnection: false });
}

function once(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function waitForRoomOnAnyReplica(
  replicas: Replica[],
  room: string,
  totalSize: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const size = replicas.reduce(
      (sum, r) => sum + (r.gateway.server.sockets.adapter.rooms.get(room)?.size ?? 0),
      0,
    );
    if (size === totalSize) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`room ${room} never reached ${totalSize} member(s)`);
}

/** Resolves true if the event shows up within `ms`, false otherwise. */
function arrivesWithin(socket: Socket, event: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** Pub/sub subscribes asynchronously at boot; re-emit until `from`'s push reaches `to`'s client. */
async function waitForAdapterReady(from: Replica, to: Replica): Promise<void> {
  const probe = connect(to.url, { token: studentTokenFor('WARM-UP') });
  try {
    await once(probe, 'connect');
    await waitForRoomOnAnyReplica([to], 'student:WARM-UP', 1);
    let ready = false;
    probe.once('simulations-updated', () => {
      ready = true;
    });
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      from.gateway.notifyStudentSimulationsUpdated('WARM-UP', 'warm-up');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) throw new Error('Redis adapter never became ready');
  } finally {
    probe.disconnect();
  }
}

describe('Cross-replica delivery through the Redis Socket.IO adapter', () => {
  let redis: FakeRedisPubSub;
  let a: Replica;
  let b: Replica;
  let educatorToken: string;
  let adminToken: string;
  const sockets: Socket[] = [];

  const track = (socket: Socket): Socket => {
    sockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    redis = new FakeRedisPubSub();
    a = await startReplica(asRedis(redis));
    b = await startReplica(asRedis(redis));
    await waitForAdapterReady(a, b);
    await waitForAdapterReady(b, a);

    const { tokenService } = a;
    educatorToken = tokenService.generateTokens({ sub: EDUCATOR_ACCOUNT_ID, type: 'educator', purpose: 'access' }).access_token;
    adminToken = tokenService.generateTokens({ sub: ADMIN_ACCOUNT_ID, type: 'admin', purpose: 'access' }).access_token;
  });

  afterEach(() => {
    while (sockets.length) sockets.pop()?.disconnect();
  });

  afterAll(async () => {
    await a.app.close();
    await b.app.close();
  });

  it('delivers an educator push triggered on A to a WebSocket-only client on B', async () => {
    const client = track(connect(b.url, { token: educatorToken }));
    await once(client, 'connect');
    await waitForRoomOnAnyReplica([a, b], `educator:${EDUCATOR_ID}`, 1);

    const received = once(client, 'school-status-changed');
    a.gateway.notifyEducatorSchoolStatusChanged(EDUCATOR_ID);
    await received;
  });

  it('delivers an admin push triggered on A to a WebSocket-only client on B', async () => {
    const client = track(connect(b.url, { token: adminToken }));
    await once(client, 'connect');
    await waitForRoomOnAnyReplica([a, b], `admin:${ADMIN_ACCOUNT_ID}`, 1);

    const received = once(client, 'educator-status-updated');
    await a.gateway.notifyAdminEducatorStatusUpdated(ADMIN_ACCOUNT_ID, EDUCATOR_ID, 'Jane', 'active');
    await received;
  });

  it('delivers a student push triggered on A to a WebSocket-only client on B', async () => {
    const client = track(connect(b.url, { token: studentTokenFor(STUDENT_CODE) }));
    await once(client, 'connect');
    await waitForRoomOnAnyReplica([a, b], `student:${STUDENT_CODE}`, 1);

    const received = once(client, 'simulations-updated');
    a.gateway.notifyStudentSimulationsUpdated(STUDENT_CODE, 'scenario-1');
    await received;
  });

  it('reaches two connections of one recipient spread across both instances, incl. a forced logout', async () => {
    const onA = track(connect(a.url, { token: educatorToken }));
    const onB = track(connect(b.url, { token: educatorToken }));
    await Promise.all([once(onA, 'connect'), once(onB, 'connect')]);
    await waitForRoomOnAnyReplica([a, b], `educator:${EDUCATOR_ID}`, 2);

    const pushed = Promise.all([once(onA, 'school-status-changed'), once(onB, 'school-status-changed')]);
    b.gateway.notifyEducatorSchoolStatusChanged(EDUCATOR_ID);
    await pushed;

    const loggedOut = Promise.all([once(onA, 'account-deactivated'), once(onB, 'account-deactivated')]);
    a.gateway.notifyAccountDeactivated(EDUCATOR_ID);
    await loggedOut;
  });

  it('delivers an account-deleted forced logout triggered on A to a client on B', async () => {
    const client = track(connect(b.url, { token: educatorToken }));
    await once(client, 'connect');
    await waitForRoomOnAnyReplica([a, b], `educator:${EDUCATOR_ID}`, 1);

    const received = once(client, 'account-deleted');
    await a.gateway.notifyAccountDeleted(EDUCATOR_ID);
    await received;
  });

  it('delivers to a client on B that connected with polling allowed (default transports)', async () => {
    const client = track(connect(b.url, { token: educatorToken }, ['polling', 'websocket']));
    await once(client, 'connect');
    await waitForRoomOnAnyReplica([a, b], `educator:${EDUCATOR_ID}`, 1);

    const received = once(client, 'school-status-changed');
    a.gateway.notifyEducatorSchoolStatusChanged(EDUCATOR_ID);
    await received;
  });

  it('reaches two admin tabs spread across both instances', async () => {
    const onA = track(connect(a.url, { token: adminToken }));
    const onB = track(connect(b.url, { token: adminToken }));
    await Promise.all([once(onA, 'connect'), once(onB, 'connect')]);
    await waitForRoomOnAnyReplica([a, b], `admin:${ADMIN_ACCOUNT_ID}`, 2);

    const pushed = Promise.all([
      once(onA, 'educator-status-updated'),
      once(onB, 'educator-status-updated'),
    ]);
    await a.gateway.notifyAdminEducatorStatusUpdated(ADMIN_ACCOUNT_ID, EDUCATOR_ID, 'Jane', 'active');
    await pushed;
  });

  it('reaches two student tabs, both on the same instance and across instances', async () => {
    const token = studentTokenFor(STUDENT_CODE);
    const firstOnB = track(connect(b.url, { token }));
    const secondOnB = track(connect(b.url, { token }));
    const onA = track(connect(a.url, { token }));
    await Promise.all([once(firstOnB, 'connect'), once(secondOnB, 'connect'), once(onA, 'connect')]);
    await waitForRoomOnAnyReplica([a, b], `student:${STUDENT_CODE}`, 3);

    const pushed = Promise.all([
      once(firstOnB, 'simulations-updated'),
      once(secondOnB, 'simulations-updated'),
      once(onA, 'simulations-updated'),
    ]);
    a.gateway.notifyStudentSimulationsUpdated(STUDENT_CODE, 'scenario-1');
    await pushed;
  });

  it('delivers locally on a single instance with no Redis adapter (kill-switch off / no Redis)', async () => {
    const solo = await startReplica(null);
    try {
      const client = track(connect(solo.url, { token: educatorToken }));
      await once(client, 'connect');
      await waitForRoomOnAnyReplica([solo], `educator:${EDUCATOR_ID}`, 1);

      const received = once(client, 'school-status-changed');
      solo.gateway.notifyEducatorSchoolStatusChanged(EDUCATOR_ID);
      await received;

      // …and it is genuinely isolated: a push on the Redis-backed replicas never reaches it.
      const leaked = arrivesWithin(client, 'school-status-changed', 300);
      a.gateway.notifyEducatorSchoolStatusChanged(EDUCATOR_ID);
      expect(await leaked).toBe(false);
    } finally {
      await solo.app.close();
    }
  });

  it('closes the adapter Redis connections on app shutdown', async () => {
    const before = redis.duplicates.length;
    const extra = await startReplica(asRedis(redis));
    await waitForAdapterReady(extra, a);
    const adapterClients = redis.duplicates.slice(before);
    expect(adapterClients).toHaveLength(2);
    adapterClients.forEach((client) => expect(client.status).toBe('ready'));

    await extra.app.close();
    adapterClients.forEach((client) => expect(client.status).toBe('end'));
  });
});
