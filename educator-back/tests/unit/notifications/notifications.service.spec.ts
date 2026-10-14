import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { Educator, Notification, NotificationType, RecipientType } from 'src/database/entities';
import {
    NotificationChannel,
    NotificationFrequency,
    NotificationPreference,
} from 'src/database/entities/notification-preference.entity';
import { RedisService } from 'src/redis/redis.service';

describe('NotificationsService - dual-role Report Available email preference sync', () => {
    let service: NotificationsService;
    let preferenceRepo: {
        findOne: jest.Mock;
        create: jest.Mock;
        save: jest.Mock;
    };
    let educatorRepo: { findOne: jest.Mock };

    const EDUCATOR_ID = 'educator-1';
    const ADMIN_ID = 'admin-1';
    const SHARED_EMAIL = 'dual@example.com';

    beforeEach(async () => {
        preferenceRepo = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((data) => data),
            save: jest.fn(async (data) => ({ id: 'pref-1', ...data })),
        };
        educatorRepo = { findOne: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotificationsService,
                { provide: getRepositoryToken(Notification), useValue: {} },
                { provide: getRepositoryToken(NotificationPreference), useValue: preferenceRepo },
                { provide: getRepositoryToken(Educator), useValue: educatorRepo },
                { provide: RedisService, useValue: {} },
            ],
        }).compile();

        service = module.get(NotificationsService);
    });

    const reportEmailItem = (enabled: boolean, frequency = NotificationFrequency.DAILY) => ({
        notificationType: NotificationType.STUDENT_REPORT_AVAILABLE,
        channel: NotificationChannel.EMAIL,
        enabled,
        frequency,
    });

    it('mirrors the Report Available email preference to the dual-role admin counterpart when an educator toggles it', async () => {
        educatorRepo.findOne.mockResolvedValue({
            id: EDUCATOR_ID,
            // v2-linked shape: identity/dual-role resolution reads `userRole.user`/
            // `admin.userRole.user` (see `educator-identity.util.ts` /
            // `district-admin-profile.util.ts`) — `Educator.email`/a flat `legacyAdmin` no longer exist.
            userRole: { userId: ADMIN_ID, user: { email: SHARED_EMAIL } },
            admin: { userRole: { userId: ADMIN_ID, user: { email: SHARED_EMAIL } } },
            school: null,
        });

        await service.upsertPreferences(
            EDUCATOR_ID,
            [reportEmailItem(false)],
            RecipientType.EDUCATOR,
            SHARED_EMAIL,
        );

        expect(preferenceRepo.save).toHaveBeenCalledTimes(2);
        expect(preferenceRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ userId: EDUCATOR_ID, enabled: false }),
        );
        expect(preferenceRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ userId: ADMIN_ID, enabled: false }),
        );
    });

    it('mirrors the preference from admin back to educator when the admin toggles it', async () => {
        educatorRepo.findOne.mockResolvedValue({ id: EDUCATOR_ID });

        await service.upsertPreferences(
            ADMIN_ID,
            [reportEmailItem(true, NotificationFrequency.WEEKLY)],
            RecipientType.ADMIN,
            SHARED_EMAIL,
        );

        expect(preferenceRepo.save).toHaveBeenCalledTimes(2);
        expect(preferenceRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ userId: ADMIN_ID, enabled: true, frequency: NotificationFrequency.WEEKLY }),
        );
        expect(preferenceRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ userId: EDUCATOR_ID, enabled: true, frequency: NotificationFrequency.WEEKLY }),
        );
    });

    it('does not mirror when the educator has no dual-role admin (different email)', async () => {
        educatorRepo.findOne.mockResolvedValue({
            id: EDUCATOR_ID,
            // No structural match (educator's own userRole.userId isn't the admin's), and the
            // fallback email check also fails since the two accounts use different emails.
            userRole: { userId: EDUCATOR_ID, user: { email: SHARED_EMAIL } },
            admin: { userRole: { userId: ADMIN_ID, user: { email: 'someone-else@example.com' } } },
            school: null,
        });

        await service.upsertPreferences(
            EDUCATOR_ID,
            [reportEmailItem(false)],
            RecipientType.EDUCATOR,
            SHARED_EMAIL,
        );

        expect(preferenceRepo.save).toHaveBeenCalledTimes(1);
        expect(preferenceRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ userId: EDUCATOR_ID }),
        );
    });

    it('does not mirror preferences for non-Report-Available / non-email types', async () => {
        educatorRepo.findOne.mockResolvedValue({
            id: EDUCATOR_ID,
            userRole: { userId: ADMIN_ID, user: { email: SHARED_EMAIL } },
            admin: { userRole: { userId: ADMIN_ID, user: { email: SHARED_EMAIL } } },
            school: null,
        });

        await service.upsertPreferences(
            EDUCATOR_ID,
            [
                {
                    notificationType: NotificationType.TOKENS_ALLOCATED,
                    channel: NotificationChannel.IN_APP,
                    enabled: false,
                },
            ],
            RecipientType.EDUCATOR,
            SHARED_EMAIL,
        );

        expect(educatorRepo.findOne).not.toHaveBeenCalled();
        expect(preferenceRepo.save).toHaveBeenCalledTimes(1);
    });

    it('does not attempt to mirror when recipientType is not provided (backward compatibility)', async () => {
        await service.upsertPreferences(EDUCATOR_ID, [reportEmailItem(true)]);

        expect(educatorRepo.findOne).not.toHaveBeenCalled();
        expect(preferenceRepo.save).toHaveBeenCalledTimes(1);
    });
});
