import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Educator, Notification, NotificationType, RecipientType } from 'src/database/entities';
import { NotificationPreference } from 'src/database/entities/notification-preference.entity';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { RedisService } from 'src/redis/redis.service';

describe('NotificationsService LMS grade sync failure notifications', () => {
  let service: NotificationsService;
  let notificationRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let preferenceRepo: { findOne: jest.Mock };

  const EDUCATOR_ID = 'edu-1';
  const CLASS_ID = 'class-1';

  const dto = (overrides: Record<string, unknown> = {}) => ({
    type: NotificationType.LMS_GRADE_SYNC_FAILED,
    title: 'ignored',
    message: 'ignored',
    recipientId: EDUCATOR_ID,
    recipientType: RecipientType.EDUCATOR,
    metadata: {
      classId: CLASS_ID,
      className: 'Nursing 101',
      studentName: 'Ada Lovelace',
      simulationId: 'sim-1',
      ...overrides,
    },
  });

  beforeEach(async () => {
    notificationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 'notif-1', ...data })),
    };
    preferenceRepo = { findOne: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: getRepositoryToken(NotificationPreference), useValue: preferenceRepo },
        { provide: getRepositoryToken(Educator), useValue: { findOne: jest.fn() } },
        { provide: RedisService, useValue: {} },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('names the student when a class has its first failure', async () => {
    const saved = await service.create(dto() as never);

    expect(saved?.message).toBe('Grade sync failed for Ada Lovelace — Nursing 101.');
    expect(saved?.metadata).toMatchObject({ classId: CLASS_ID, failureCount: 1 });
    expect(notificationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('is delivered without a preference row, unlike a configurable type', async () => {
    await service.create(dto() as never);

    expect(preferenceRepo.findOne).not.toHaveBeenCalled();
    expect(notificationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rolls a repeat failure into the open entry for that class instead of a second bell row', async () => {
    notificationRepo.findOne.mockResolvedValue({
      id: 'notif-1',
      isRead: false,
      message: 'Grade sync failed for Ada Lovelace — Nursing 101.',
      metadata: { classId: CLASS_ID, className: 'Nursing 101', failureCount: 2 },
    });

    const saved = await service.create(dto({ studentName: 'Grace Hopper' }) as never);

    expect(saved?.id).toBe('notif-1');
    expect(saved?.message).toBe('3 grade sync failures in Nursing 101.');
    expect(saved?.metadata).toMatchObject({ failureCount: 3 });
    expect(notificationRepo.create).not.toHaveBeenCalled();
  });

  it('scopes the lookup to one unread entry per class', async () => {
    await service.create(dto() as never);

    expect(notificationRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientId: EDUCATOR_ID,
          recipientType: RecipientType.EDUCATOR,
          type: NotificationType.LMS_GRADE_SYNC_FAILED,
          isRead: false,
        }),
      }),
    );
  });

  it('opens a separate entry for a second class', async () => {
    await service.create(dto() as never);
    await service.create(dto({ classId: 'class-2', className: 'Pharmacology' }) as never);

    expect(notificationRepo.create).toHaveBeenCalledTimes(2);
    const [, second] = notificationRepo.create.mock.calls;
    expect(second[0].message).toBe('Grade sync failed for Ada Lovelace — Pharmacology.');
  });

  it('skips the per-class lookup when no class is named', async () => {
    await service.create(dto({ classId: undefined }) as never);

    expect(notificationRepo.findOne).not.toHaveBeenCalled();
    expect(notificationRepo.create).toHaveBeenCalledTimes(1);
  });
});
