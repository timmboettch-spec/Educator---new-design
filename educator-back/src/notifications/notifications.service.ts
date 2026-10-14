import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Raw, Repository } from 'typeorm';
import { Educator, Notification, NotificationType, RecipientType } from 'src/database/entities';
import {
  NotificationChannel,
  NotificationFrequency,
  NotificationPreference,
} from '../database/entities/notification-preference.entity';
import { CreateNotificationDto } from './dto/notification.dto';
import { NotificationsConstants } from './notifications.constants';
import { RedisService } from 'src/redis/redis.service';
import { resolveEducatorEmail } from 'src/common/utils/educator-identity.util';
import { resolveAdminEmail, resolveAdminUserId } from 'src/common/utils/district-admin-profile.util';

export interface UpsertPreferenceDto {
  notificationType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
  frequency?: NotificationFrequency;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** Types displayed in the notification center (SIMULATION_ASSIGNED removed per spec). */
  private readonly allowedTypes: NotificationType[] = [
    NotificationType.EDUCATOR_REGISTERED,
    NotificationType.TOKENS_ALLOCATED,
    NotificationType.CLASS_CREATED,
    NotificationType.CLASS_TRANSFERRED,
    NotificationType.EDUCATOR_LOW_SEAT_WARNING,
    NotificationType.SCHOOL_LOW_SEAT_WARNING,
    NotificationType.EDUCATOR_SEAT_REQUEST,
    NotificationType.STUDENT_REPORT_AVAILABLE,
    NotificationType.LMS_GRADE_SYNC_FAILED,
    NotificationType.SIMULATION_DUE_DATE_REMINDER,
    NotificationType.SIMULATION_START_DATE_REMINDER,
    NotificationType.SIMULATION_END_DATE_REMINDER,
    NotificationType.CLASS_START_DATE_REMINDER,
    NotificationType.CLASS_END_DATE_REMINDER,
    NotificationType.SCHOOL_STATUS_CHANGED,
    NotificationType.SCHOOL_REMOVED,
    NotificationType.GENERAL,
  ];

  /** Not exposed in the Settings/Configure UI, so they're always sent regardless of preference rows. */
  private readonly nonConfigurableTypes: NotificationType[] = [
    NotificationType.SCHOOL_STATUS_CHANGED,
    NotificationType.SCHOOL_REMOVED,
    NotificationType.LMS_GRADE_SYNC_FAILED,
  ];

  /** System-triggered, transactional email types — never user-configurable in Settings/Configure. */
  private readonly unconfigurableTypes: NotificationType[] = [
    NotificationType.FORGOT_PASSWORD,
    NotificationType.ACCOUNT_REACTIVATED,
    NotificationType.INVITE,
    NotificationType.ASSESSMENT_REPORT,
    NotificationType.BATCH_EMAIL,
    NotificationType.SEND_STUDENT_CODE,
  ];

  private readonly DISMISS_TTL_SECONDS = 365 * 24 * 3600; // 1 year

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepo: Repository<NotificationPreference>,
    @InjectRepository(Educator)
    private readonly educatorRepo: Repository<Educator>,
    private readonly redisService: RedisService,
  ) { }

  private dismissedKey(recipientId: string, studentId: string, scenarioId: string): string {
    return `notif:dismissed:${recipientId}:${studentId}:${scenarioId}`;
  }

  // ── Preference helpers ────────────────────────────────────────────────────

  /**
   * Returns false when no preference row exists (default off) unless the row is enabled.
   * `recipientId` is the per-recipient-type key (see `getPreferences`) — passing a `users.id`
   * for an educator finds no row and therefore silently reads as "disabled".
   */
  async isPreferenceEnabled(
    recipientId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const pref = await this.preferenceRepo.findOne({
      where: { userId: recipientId, notificationType: type, channel },
    });
    return pref ? pref.enabled : false;
  }

  /** `recipientId` is the per-recipient-type key — see `isPreferenceEnabled`. */
  async getEmailFrequency(
    recipientId: string,
    type: NotificationType,
  ): Promise<NotificationFrequency> {
    const pref = await this.preferenceRepo.findOne({
      where: { userId: recipientId, notificationType: type, channel: NotificationChannel.EMAIL },
    });
    return pref?.frequency ?? NotificationFrequency.IMMEDIATE;
  }

  // ── Create / consolidation ────────────────────────────────────────────────

  /**
   * Creates a notification after checking the recipient's in-app preference.
   * For STUDENT_REPORT_AVAILABLE, consolidates into a single unread entry per
   * recipient — returns the existing unread notification if one already exists.
   */
  async create(dto: CreateNotificationDto): Promise<Notification | null> {
    const enabled =
      this.nonConfigurableTypes.includes(dto.type) ||
      (await this.isPreferenceEnabled(dto.recipientId, dto.type, NotificationChannel.IN_APP));
    if (!enabled) return null;

    if (dto.type === NotificationType.STUDENT_REPORT_AVAILABLE) {
      return this.createOrConsolidateReportNotification(dto);
    }

    if (dto.type === NotificationType.LMS_GRADE_SYNC_FAILED) {
      return this.createOrConsolidateGradeSyncNotification(dto);
    }

    const notification = this.notificationRepo.create(dto);
    return this.notificationRepo.save(notification);
  }

  /** Returns existing unread report notification or creates a new consolidated one. */
  private async createOrConsolidateReportNotification(
    dto: CreateNotificationDto,
  ): Promise<Notification> {
    const existing = await this.notificationRepo.findOne({
      where: {
        recipientId: dto.recipientId,
        recipientType: dto.recipientType,
        type: NotificationType.STUDENT_REPORT_AVAILABLE,
        isRead: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      const newCount = ((existing.metadata?.['reportCount'] as number | undefined) ?? 1) + 1;
      existing.message = NotificationsConstants.MESSAGES.STUDENT_REPORT_AVAILABLE_COUNT(newCount);
      existing.metadata = {
        ...(existing.metadata ?? {}),
        ...(dto.metadata ?? {}),
        reportCount: newCount,
      };
      existing.createdAt = new Date();
      return this.notificationRepo.save(existing);
    }

    const notification = this.notificationRepo.create({
      ...dto,
      title: NotificationsConstants.TITLES.STUDENT_REPORT_AVAILABLE,
      message: NotificationsConstants.MESSAGES.STUDENT_REPORT_AVAILABLE_COUNT(1),
      metadata: { ...(dto.metadata ?? {}), reportCount: 1 },
    });
    return this.notificationRepo.save(notification);
  }

  private async createOrConsolidateGradeSyncNotification(
    dto: CreateNotificationDto,
  ): Promise<Notification> {
    const classId = typeof dto.metadata?.['classId'] === 'string' ? dto.metadata['classId'] : '';
    const className =
      typeof dto.metadata?.['className'] === 'string' ? dto.metadata['className'] : classId;
    const studentName =
      typeof dto.metadata?.['studentName'] === 'string' ? dto.metadata['studentName'] : 'a student';

    const existing = classId
      ? await this.notificationRepo.findOne({
          where: {
            recipientId: dto.recipientId,
            recipientType: dto.recipientType,
            type: NotificationType.LMS_GRADE_SYNC_FAILED,
            isRead: false,
            metadata: Raw((alias) => `${alias} ->> 'classId' = :classId`, { classId }),
          },
          order: { createdAt: 'DESC' },
        })
      : null;

    if (existing) {
      const newCount = ((existing.metadata?.['failureCount'] as number | undefined) ?? 1) + 1;
      existing.message = NotificationsConstants.MESSAGES.LMS_GRADE_SYNC_FAILED(
        newCount,
        className,
        studentName,
      );
      existing.metadata = {
        ...(existing.metadata ?? {}),
        ...(dto.metadata ?? {}),
        failureCount: newCount,
      };
      existing.createdAt = new Date();
      return this.notificationRepo.save(existing);
    }

    const notification = this.notificationRepo.create({
      ...dto,
      title: NotificationsConstants.TITLES.LMS_GRADE_SYNC_FAILED,
      message: NotificationsConstants.MESSAGES.LMS_GRADE_SYNC_FAILED(1, className, studentName),
      metadata: { ...(dto.metadata ?? {}), failureCount: 1 },
    });
    return this.notificationRepo.save(notification);
  }

  async findAllForRecipient(
    recipientId: string,
    recipientType: RecipientType,
  ): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: {
        recipientId, recipientType, type: In(this.allowedTypes)
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getUnreadCount(recipientId: string, recipientType: RecipientType): Promise<number> {
    return this.notificationRepo.count({
      where: { recipientId, recipientType, isRead: false, type: In(this.allowedTypes) },
    });
  }

  async markAsRead(
    id: string,
    recipientId: string,
    recipientType: RecipientType,
  ): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id, recipientId, recipientType },
    });
    if (!notification) throw new NotFoundException(NotificationsConstants.ERRORS.NOT_FOUND);
    notification.isRead = true;
    return this.notificationRepo.save(notification);
  }

  async markAsUnread(
    id: string,
    recipientId: string,
    recipientType: RecipientType,
  ): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id, recipientId, recipientType },
    });
    if (!notification) throw new NotFoundException(NotificationsConstants.ERRORS.NOT_FOUND);
    notification.isRead = false;
    return this.notificationRepo.save(notification);
  }

  async markAllAsRead(
    recipientId: string,
    recipientType: RecipientType,
  ): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      { recipientId, recipientType, isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }

  async markAllAsUnread(
    recipientId: string,
    recipientType: RecipientType,
  ): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      { recipientId, recipientType, isRead: true },
      { isRead: false },
    );
    return { updated: result.affected ?? 0 };
  }

  async deleteOne(
    id: string,
    recipientId: string,
    recipientType: RecipientType,
  ): Promise<{ deleted: boolean }> {
    const notification = await this.notificationRepo.findOne({
      where: { id, recipientId, recipientType },
    });
    if (!notification) throw new NotFoundException(NotificationsConstants.ERRORS.NOT_FOUND);
    if (notification.type === NotificationType.STUDENT_REPORT_AVAILABLE) {
      const studentId = notification.metadata?.['studentId'] as string | undefined;
      const scenarioId = notification.metadata?.['scenarioId'] as string | undefined;
      if (studentId && scenarioId) {
        await this.redisService.set(
          this.dismissedKey(recipientId, studentId, scenarioId),
          1,
          this.DISMISS_TTL_SECONDS,
        );
      }
    }
    await this.notificationRepo.delete({ id, recipientId, recipientType });
    return { deleted: true };
  }

  async deleteAll(recipientId: string, recipientType: RecipientType): Promise<{ deleted: number }> {
    const reportNotifs = await this.notificationRepo.find({
      where: { recipientId, recipientType, type: NotificationType.STUDENT_REPORT_AVAILABLE },
    });
    for (const notif of reportNotifs) {
      const studentId = notif.metadata?.['studentId'] as string | undefined;
      const scenarioId = notif.metadata?.['scenarioId'] as string | undefined;
      if (studentId && scenarioId) {
        await this.redisService.set(
          this.dismissedKey(recipientId, studentId, scenarioId),
          1,
          this.DISMISS_TTL_SECONDS,
        );
      }
    }
    const result = await this.notificationRepo.delete({ recipientId, recipientType });
    return { deleted: result.affected ?? 0 };
  }

  // ── Preferences CRUD ──────────────────────────────────────────────────────

  /**
   * `recipientId` is the per-recipient-type key `NotificationsController.getRecipientId` builds:
   * an `educators.id` for an educator, the admin's `users.id` for an admin — the same key the
   * report-email path reads with. It is NOT always a `users.id`, despite the column name.
   */
  async getPreferences(recipientId: string): Promise<NotificationPreference[]> {
    return this.preferenceRepo.find({ where: { userId: recipientId } });
  }

  /**
   * For a dual-role user (same email used for both an Educator and an Admin
   * login), the Report Available email preference is a single shared setting.
   * Resolves the *other* role's account id, or null if this user has no
   * dual-role counterpart.
   *
   * `recipientId` is the per-recipient-type key (see `getPreferences`), so the EDUCATOR branch
   * matches it against `educators.id` and the ADMIN branch against `user_roles.user_id`.
   */
  private async findReportEmailDualRoleCounterpart(
    recipientId: string,
    recipientType: RecipientType,
    email?: string,
  ): Promise<{ id: string } | null> {
    if (recipientType === RecipientType.EDUCATOR) {
      const educator = await this.educatorRepo.findOne({
        where: { id: recipientId },
        relations: {
          admin: { userRole: { user: true } },
          school: { user_id: true },
          userRole: { user: true },
        },
      });
      if (!educator) return null;
      const adminId = resolveAdminUserId(educator) ?? educator.school?.user_id?.id ?? null;
      if (!adminId) return null;

      // Structural: the educator's linked user_roles row and the admin are the same `users` row.
      if (educator.userRole?.userId === adminId) {
        return { id: adminId };
      }

      // Legacy fallback for an educator whose admin has no linked user_role yet.
      const adminEmail = resolveAdminEmail(educator) ?? educator.school?.user_id?.email ?? null;
      const identifier = resolveEducatorEmail(educator);
      if (adminEmail && identifier && adminEmail.toLowerCase() === identifier.toLowerCase()) {
        return { id: adminId };
      }
      return null;
    }

    if (recipientType === RecipientType.ADMIN && email) {
      const educator = await this.educatorRepo.findOne({
        where: [
          {
            userRole: { userId: recipientId },
            admin: { userRole: { userId: recipientId } },
          },
          {
            userRole: { userId: recipientId },
            school: { user_id: { id: recipientId } },
          },
        ],
      });
      return educator ? { id: educator.id } : null;
    }

    return null;
  }

  private async upsertOne(
    recipientId: string,
    item: UpsertPreferenceDto,
  ): Promise<NotificationPreference> {
    const existing = await this.preferenceRepo.findOne({
      where: { userId: recipientId, notificationType: item.notificationType, channel: item.channel },
    });

    if (existing) {
      existing.enabled = item.enabled;
      existing.frequency = item.frequency ?? existing.frequency;
      return this.preferenceRepo.save(existing);
    }

    const created = this.preferenceRepo.create({
      userId: recipientId,
      notificationType: item.notificationType,
      channel: item.channel,
      enabled: item.enabled,
      frequency: item.frequency ?? null,
    });
    return this.preferenceRepo.save(created);
  }

  /**
   * Upserts a batch of preference rows for the given user. When an item is the
   * Report Available email preference and the acting user has a dual-role
   * counterpart (same email, Educator + Admin), the same value is mirrored to
   * that counterpart's account so the setting behaves as one shared toggle.
   */
  async upsertPreferences(
    recipientId: string,
    items: UpsertPreferenceDto[],
    recipientType?: RecipientType,
    email?: string,
  ): Promise<NotificationPreference[]> {
    const results: NotificationPreference[] = [];
    const validTypes = new Set<string>(Object.values(NotificationType));
    this.unconfigurableTypes.forEach((type) => validTypes.delete(type));
    const validChannels = new Set<string>(Object.values(NotificationChannel));

    let counterpartId: string | null | undefined;

    for (const item of items) {
      // Skip items whose enum values aren't yet in the DB (e.g. pending migrations)
      if (!validTypes.has(item.notificationType) || !validChannels.has(item.channel)) {
        continue;
      }

      try {
        results.push(await this.upsertOne(recipientId, item));

        const isReportEmailPref =
          item.notificationType === NotificationType.STUDENT_REPORT_AVAILABLE &&
          item.channel === NotificationChannel.EMAIL;

        if (isReportEmailPref && recipientType) {
          if (counterpartId === undefined) {
            const counterpart = await this.findReportEmailDualRoleCounterpart(
              recipientId,
              recipientType,
              email,
            );
            counterpartId = counterpart?.id ?? null;
          }
          if (counterpartId) {
            await this.upsertOne(counterpartId, item);
          }
        }
      } catch (err) {
        // Log and continue so one bad row doesn't abort the entire batch
        this.logger.warn(
          `[upsertPreferences] skipping preference ${item.notificationType}/${item.channel}: ${err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return results;
  }
}
