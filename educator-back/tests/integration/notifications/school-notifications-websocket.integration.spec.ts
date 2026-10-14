import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'net';

import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { TokenService } from '../../../src/common/services/token.service';
import { LoggerService } from '../../../src/common/services';
import { RedisService } from '../../../src/redis/redis.service';
import { Notification, RecipientType } from 'src/database/entities';
import { Educator } from 'src/database/entities';
import { NotificationPreference } from 'src/database/entities/notification-preference.entity';
import { STUDENT_REPOSITORY, USER_REPOSITORY, USER_ROLE_REPOSITORY } from 'src/database/tokens';
import { AuthService } from '../../../src/auth/auth.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { RoleSlug } from 'src/common/constants';

const TEST_JWT_SECRET = 'test-ws-notifications-secret';
/** The account's `users.id` — what the token's `sub` carries. */
const ACCOUNT_USER_ID = '550e8400-e29b-41d4-a716-446655440777';
/** The linked profile's `educators.id` — what the recipient room and every emitter are keyed by. */
const EDUCATOR_ID = '550e8400-e29b-41d4-a716-446655440778';

/** Minimal in-memory stand-in for the TypeORM `Repository<Notification>`. */
function makeFakeNotificationRepo() {
    const store: Notification[] = [];
    let nextId = 1;

    return {
        store,
        create: jest.fn((dto: Partial<Notification>) => ({ ...dto }) as Notification),
        save: jest.fn(async (entity: Partial<Notification>) => {
            const saved: Notification = {
                id: `notif-${nextId++}`,
                isRead: false,
                createdAt: new Date(),
                ...entity,
            } as Notification;
            store.push(saved);
            return saved;
        }),
        find: jest.fn(async ({ where }: { where: { recipientId: string; recipientType: RecipientType } }) =>
            store.filter(
                (n) => n.recipientId === where.recipientId && n.recipientType === where.recipientType,
            ),
        ),
        findOne: jest.fn(async () => null),
        count: jest.fn(async () => store.length),
        update: jest.fn(async () => ({ affected: 0 })),
        delete: jest.fn(async () => ({ affected: 0 })),
    };
}

async function waitFor(socket: Socket, event: string): Promise<void> {
    await new Promise<void>((resolve) => socket.once(event, () => resolve()));
}

describe('School notifications — real WebSocket connect/disconnect/reconnect flow', () => {
    let app: INestApplication;
    let module: TestingModule;
    let gateway: NotificationsGateway;
    let notificationsService: NotificationsService;
    let fakeRepo: ReturnType<typeof makeFakeNotificationRepo>;
    let baseUrl: string;
    let educatorToken: string;

    async function waitForRoomSize(room: string, size: number): Promise<void> {
        for (let attempt = 0; attempt < 50; attempt++) {
            if (gateway.server.sockets.adapter.rooms.get(room)?.size === size) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(`room ${room} never reached size ${size}`);
    }

    beforeAll(async () => {
        fakeRepo = makeFakeNotificationRepo();

        module = await Test.createTestingModule({
            imports: [JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } })],
            providers: [
                NotificationsGateway,
                NotificationsService,
                TokenService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string) => {
                            if (key === 'jwt.accessSecret') return TEST_JWT_SECRET;
                            if (key === 'jwt.accessExpiresIn') return 3600;
                            if (key === 'app.nodeEnv') return 'local';
                            return null;
                        },
                        getOrThrow: (key: string) => (key === 'app.nodeEnv' ? 'local' : undefined),
                    },
                },
                { provide: getRepositoryToken(Notification), useValue: fakeRepo },
                {
                    provide: getRepositoryToken(NotificationPreference),
                    useValue: { findOne: jest.fn().mockResolvedValue(null) },
                },
                {
                    provide: getRepositoryToken(Educator),
                    useValue: { findOne: jest.fn().mockResolvedValue(null) },
                },
                { provide: RedisService, useValue: { set: jest.fn(), get: jest.fn().mockResolvedValue(null) } },
                {
                    // Backs `NotificationsGateway.isValidUserForType` (mirrors `AuthService.validateUserToken()`)
                    // — the educator connecting over the socket must resolve to an active account.
                    provide: USER_REPOSITORY,
                    useValue: {
                        findOne: jest.fn().mockImplementation((options: { where?: { id?: string } }) =>
                            Promise.resolve(
                                options?.where?.id === ACCOUNT_USER_ID
                                    ? { id: ACCOUNT_USER_ID }
                                    : null,
                            ),
                        ),
                    },
                },
                {
                    provide: USER_ROLE_REPOSITORY,
                    useValue: {
                        findByUserId: jest.fn().mockImplementation((userId: string) =>
                            Promise.resolve(
                                userId === ACCOUNT_USER_ID
                                    ? [
                                        {
                                            userRoleId: `${ACCOUNT_USER_ID}-educator`,
                                            userId: ACCOUNT_USER_ID,
                                            status: CommonStatus.ACTIVE,
                                            role: { slug: RoleSlug.EDUCATOR },
                                            educator: { id: EDUCATOR_ID },
                                        },
                                    ]
                                    : [],
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
              { provide: STUDENT_REPOSITORY, useValue: { findOne: jest.fn().mockResolvedValue({
                    id: 'student-id',
                    is_active: true,
                    deleted_at: null,
                    status: CommonStatus.ACTIVE,
                    class: { is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
                    educator: { is_active: true, deleted_at: null, status: CommonStatus.ACTIVE },
        }) } },
                {
                    provide: LoggerService,
                    useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
                },
            ],
        }).compile();

        app = module.createNestApplication();
        await app.listen(0);

        const address = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;

        gateway = module.get(NotificationsGateway);
        notificationsService = module.get(NotificationsService);

        const tokenService = module.get(TokenService);
        educatorToken = tokenService.generateTokens({
            sub: ACCOUNT_USER_ID,
            type: 'educator',
            purpose: 'access',
        }).access_token;
    });

    afterAll(async () => {
        await app.close();
    });

    it('emits school-status-changed and educator-school-removed live to a connected educator, and is a no-op when disconnected', async () => {
        // 1. Educator logs in / connects.
        const socket1 = io(baseUrl, { auth: { token: educatorToken }, transports: ['websocket'] });
        await waitFor(socket1, 'connect');

        // 2. Educator disconnects/closes their session.
        socket1.disconnect();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const roomName = `educator:${EDUCATOR_ID}`;
        expect(gateway.server.sockets.adapter.rooms.has(roomName)).toBe(false);

        // 3. Admin deactivates the school while the educator is disconnected — these events
        //    are real-time only (no persistence), so this is a no-op with nobody to receive it.
        expect(() => gateway.notifyEducatorSchoolStatusChanged(EDUCATOR_ID)).not.toThrow();
        expect(fakeRepo.save).not.toHaveBeenCalled();

        // 4. Educator logs back in — a new socket connection is established.
        const socket2 = io(baseUrl, { auth: { token: educatorToken }, transports: ['websocket'] });
        await waitFor(socket2, 'connect');

        // 5. Nothing was persisted while disconnected, so there's nothing to retrieve on reconnect.
        const afterReconnect = await notificationsService.findAllForRecipient(
            EDUCATOR_ID,
            RecipientType.EDUCATOR,
        );
        expect(afterReconnect).toHaveLength(0);

        // 6. While connected, the live socket events still fire immediately.
        const statusEventPromise = new Promise<void>((resolve) => {
            socket2.once('school-status-changed', () => resolve());
        });
        gateway.notifyEducatorSchoolStatusChanged(EDUCATOR_ID);
        await statusEventPromise;

        const removedEventPromise = new Promise<void>((resolve) => {
            socket2.once('educator-school-removed', () => resolve());
        });
        gateway.notifyEducatorSchoolRemoved(EDUCATOR_ID);
        await removedEventPromise;

        // 7. Still no persisted rows — these events are real-time only, never stored.
        expect(fakeRepo.save).not.toHaveBeenCalled();

        socket2.disconnect();
    });

    it('delivers a push to every open tab of the same educator', async () => {
        const tabA = io(baseUrl, { auth: { token: educatorToken }, transports: ['websocket'] });
        const tabB = io(baseUrl, { auth: { token: educatorToken }, transports: ['websocket'] });
        await Promise.all([waitFor(tabA, 'connect'), waitFor(tabB, 'connect')]);
        // The room join happens after the async role check, so wait for both tabs to be in it.
        await waitForRoomSize(`educator:${EDUCATOR_ID}`, 2);

        const received = Promise.all([waitFor(tabA, 'account-deactivated'), waitFor(tabB, 'account-deactivated')]);
        gateway.notifyAccountDeactivated(EDUCATOR_ID);
        await received;

        tabA.disconnect();
        tabB.disconnect();
    });

    it('delivers a push to every open tab of the same student', async () => {
        const auth = {
            token: module.get(TokenService).generateTokens({
                sub: 'STU-0001',
                user_id: 'STU-0001',
                student_id: 'STU-0001',
                type: 'student',
                purpose: 'access',
            }).access_token,
        };
        const tabA = io(baseUrl, { auth, transports: ['websocket'] });
        const tabB = io(baseUrl, { auth, transports: ['websocket'] });
        await Promise.all([waitFor(tabA, 'connect'), waitFor(tabB, 'connect')]);
        await waitForRoomSize('student:STU-0001', 2);

        const received = Promise.all([waitFor(tabA, 'simulations-updated'), waitFor(tabB, 'simulations-updated')]);
        gateway.notifyStudentSimulationsUpdated('STU-0001', 'scenario-1');
        await received;

        tabA.disconnect();
        tabB.disconnect();
    });
});
