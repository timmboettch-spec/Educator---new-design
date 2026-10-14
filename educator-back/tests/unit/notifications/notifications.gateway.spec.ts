import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { AuthService } from '../../../src/auth/auth.service';
import { LoggerService } from '../../../src/common/services';
import { NotificationType, RecipientType } from '../../../src/database/entities';
import { UserTokenType, TokenPurposeType } from '../../../src/common/constants';

describe('NotificationsGateway - school status/removed (real-time only, no persistence)', () => {
    let gateway: NotificationsGateway;
    let notificationsService: { create: jest.Mock };
    let emitMock: jest.Mock;
    let toMock: jest.Mock;

    const makeSavedNotification = (type: NotificationType) => ({
        id: 'notif-1',
        type,
        title: 'title',
        message: 'message',
        recipientId: 'educator-1',
        recipientType: RecipientType.EDUCATOR,
        isRead: false,
        metadata: {},
        createdAt: new Date(),
    });

    beforeEach(() => {
        notificationsService = { create: jest.fn() };
        const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as LoggerService;

        gateway = new NotificationsGateway(
            notificationsService as unknown as NotificationsService,
            logger,
            {} as AuthService,
        );

        emitMock = jest.fn();
        toMock = jest.fn().mockReturnValue({ emit: emitMock });
        (gateway as unknown as { server: { to: jest.Mock } }).server = { to: toMock };
    });

    describe('notifyEducatorSchoolStatusChanged', () => {
        it('does not persist a notification row', () => {

            gateway.notifyEducatorSchoolStatusChanged('educator-1');

            expect(notificationsService.create).not.toHaveBeenCalled();
        });

        it('emits in real time when the educator is connected', () => {

            gateway.notifyEducatorSchoolStatusChanged('educator-1');

            expect(emitMock).toHaveBeenCalledWith('school-status-changed', {});
        });

        it('does not throw when nobody is in the recipient room', () => {
            expect(() => gateway.notifyEducatorSchoolStatusChanged('educator-1')).not.toThrow();
        });
    });

    describe('notifyEducatorSchoolRemoved', () => {
        it('does not persist a notification row', () => {

            gateway.notifyEducatorSchoolRemoved('educator-1');

            expect(notificationsService.create).not.toHaveBeenCalled();
        });

        it('emits exactly once to the educator recipient room', () => {

            gateway.notifyEducatorSchoolRemoved('educator-1');

            expect(toMock).toHaveBeenCalledWith('educator:educator-1');
            expect(emitMock).toHaveBeenCalledTimes(1);
            expect(emitMock).toHaveBeenCalledWith('educator-school-removed', {});
        });

        it('does not throw when nobody is in the recipient room', () => {
            expect(() => gateway.notifyEducatorSchoolRemoved('educator-1')).not.toThrow();
        });
    });

    it('persists and emits an admin notification to the admin recipient room', async () => {
        notificationsService.create.mockResolvedValue(makeSavedNotification(NotificationType.GENERAL));

        await gateway.notifyAdminEducatorStatusUpdated('admin-1', 'educator-1', 'Jane Doe', 'INACTIVE');

        expect(notificationsService.create).toHaveBeenCalledTimes(1);
        expect(notificationsService.create).toHaveBeenCalledWith(
            expect.objectContaining({ recipientId: 'admin-1', recipientType: RecipientType.ADMIN }),
        );
        expect(toMock).toHaveBeenCalledWith('admin:admin-1');
        expect(emitMock).toHaveBeenCalledTimes(1);
    });

    it('emits simulations-updated to the student recipient room', () => {
        gateway.notifyStudentSimulationsUpdated('STU-0001', 'scenario-1');

        expect(toMock).toHaveBeenCalledWith('student:STU-0001');
        expect(emitMock).toHaveBeenCalledWith('simulations-updated', {
            scenarioId: 'scenario-1',
            status: 'Assessment completed',
        });
    });

    describe('notifyAccountDeleted', () => {
        it('persists a GENERAL notification for the educator', async () => {
            notificationsService.create.mockResolvedValue(makeSavedNotification(NotificationType.GENERAL));

            await gateway.notifyAccountDeleted('educator-1');

            expect(notificationsService.create).toHaveBeenCalledTimes(1);
            expect(notificationsService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: NotificationType.GENERAL,
                    recipientId: 'educator-1',
                    recipientType: RecipientType.EDUCATOR,
                }),
            );
        });

        it('emits in real time to the educator recipient room', async () => {
            notificationsService.create.mockResolvedValue(makeSavedNotification(NotificationType.GENERAL));

            await gateway.notifyAccountDeleted('educator-1');

            expect(emitMock).toHaveBeenCalledWith(
                'account-deleted',
                expect.objectContaining({ type: NotificationType.GENERAL }),
            );
        });

        it('does not emit when persistence fails, avoiding an unpersisted duplicate', async () => {
            notificationsService.create.mockResolvedValue(null);

            await gateway.notifyAccountDeleted('educator-1');

            expect(emitMock).not.toHaveBeenCalled();
        });
    });
});

describe('NotificationsGateway - handleConnection (delegates to AuthService.validateUserToken)', () => {
    let gateway: NotificationsGateway;
    let validateUserToken: jest.Mock;
    let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

    const makeClient = (overrides: {
        auth?: Record<string, unknown>;
        headers?: Record<string, unknown>;
    } = {}) => {
        const disconnect = jest.fn();
        const join = jest.fn().mockResolvedValue(undefined);
        return {
            id: 'socket-1',
            join,
            rooms: new Set<string>(),
            onAnyOutgoing: jest.fn(),
            handshake: {
                auth: overrides.auth ?? {},
                headers: overrides.headers ?? {},
            },
            disconnect,
        } as unknown as import('socket.io').Socket & { disconnect: jest.Mock; join: jest.Mock };
    };

    beforeEach(() => {
        validateUserToken = jest.fn();
        logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

        gateway = new NotificationsGateway(
            {} as unknown as NotificationsService,
            logger as unknown as LoggerService,
            { validateUserToken } as unknown as AuthService,
        );
    });

    it('disconnects when validateUserToken rejects the token (revoked/inactive role, bad signature, blacklisted)', async () => {
        const client = makeClient({ auth: { token: 'valid-jwt' } });
        validateUserToken.mockRejectedValue(new Error('Unauthorized'));

        await gateway.handleConnection(client);

        expect(validateUserToken).toHaveBeenCalledWith('valid-jwt');
        expect(client.disconnect).toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    // `userId` is the account's `users.id`, but the educator room is keyed by the `educators.id`
    // every `emitToRecipient(EDUCATOR, ...)` call site addresses — so these must be distinct
    // values here, or a regression that keys the room by `userId` would still pass.
    it('joins the educator room keyed by educators.id, not the user id', async () => {
        const client = makeClient({ auth: { token: 'valid-jwt' } });
        validateUserToken.mockResolvedValue({
            userId: 'user-1',
            roles: [],
            purpose: TokenPurposeType.ACCESS,
            type: UserTokenType.EDUCATOR,
            educatorId: 'edu-1',
        });

        await gateway.handleConnection(client);

        expect(client.disconnect).not.toHaveBeenCalled();
        expect(client.join).toHaveBeenCalledTimes(1);
        expect(client.join).toHaveBeenCalledWith('educator:edu-1');
    });

    it('disconnects an educator token with no linked educator profile', async () => {
        const client = makeClient({ auth: { token: 'valid-jwt' } });
        validateUserToken.mockResolvedValue({
            userId: 'user-1',
            roles: [],
            purpose: TokenPurposeType.ACCESS,
            type: UserTokenType.EDUCATOR,
        });

        await gateway.handleConnection(client);

        expect(client.disconnect).toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    it('joins the admin room keyed by the account users.id, matching the admin emitters', async () => {
        const client = makeClient({ auth: { token: 'valid-jwt' } });
        validateUserToken.mockResolvedValue({
            userId: 'admin-user-1',
            roles: [],
            purpose: TokenPurposeType.ACCESS,
            type: UserTokenType.ADMIN,
            adminId: 'district-admin-1',
        });

        await gateway.handleConnection(client);

        expect(client.disconnect).not.toHaveBeenCalled();
        expect(client.join).toHaveBeenCalledTimes(1);
        expect(client.join).toHaveBeenCalledWith('admin:admin-user-1');
    });

    it('disconnects when no token is present on the handshake', async () => {
        const client = makeClient();

        await gateway.handleConnection(client);

        expect(client.disconnect).toHaveBeenCalled();
        expect(validateUserToken).not.toHaveBeenCalled();
    });

    it('disconnects a token whose type has no notification room', async () => {
        const client = makeClient({ auth: { token: 'valid-jwt' } });
        validateUserToken.mockResolvedValue({
            userId: 'scenario-admin-1',
            roles: [],
            purpose: TokenPurposeType.ACCESS,
            type: UserTokenType.SCENARIO_ADMIN,
        });

        await gateway.handleConnection(client);

        expect(client.disconnect).toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    it('joins the student room keyed by the validated student code', async () => {
        const client = makeClient({ auth: { token: 'valid-jwt' } });
        validateUserToken.mockResolvedValue({
            userId: 'STU-0001',
            roles: [],
            purpose: TokenPurposeType.ACCESS,
            type: UserTokenType.STUDENT,
            student_id: 'STU-0001',
        });

        await gateway.handleConnection(client);

        expect(client.disconnect).not.toHaveBeenCalled();
        expect(client.join).toHaveBeenCalledWith('student:STU-0001');
    });

    it('disconnects a student token with no student code', async () => {
        const client = makeClient({ auth: { token: 'valid-jwt' } });
        validateUserToken.mockResolvedValue({
            userId: 'student-1',
            roles: [],
            purpose: TokenPurposeType.ACCESS,
            type: UserTokenType.STUDENT,
        });

        await gateway.handleConnection(client);

        expect(client.disconnect).toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    it('does not trust a bare studentCode handshake without a token', async () => {
        const client = makeClient({ auth: { studentCode: 'STU-0001' } });

        await gateway.handleConnection(client);

        expect(client.disconnect).toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
        expect(validateUserToken).not.toHaveBeenCalled();
    });

    it.each(['', '   ', 'bad code!', 'x'.repeat(65)])(
        'disconnects a bare student code %j handshake without joining a room',
        async (studentCode) => {
            const client = makeClient({ auth: { studentCode } });

            await gateway.handleConnection(client);

            expect(client.disconnect).toHaveBeenCalled();
            expect(client.join).not.toHaveBeenCalled();
        },
    );
});
