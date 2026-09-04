import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Notification, NotificationType, RecipientType } from './entity/notification.entity';
import { CreateNotificationDto } from './dto/notification.dto';
import { NotificationsConstants } from './notifications.constants';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class NotificationsService {
  private readonly allowedTypes: NotificationType[] = [
    NotificationType.EDUCATOR_REGISTERED,
    NotificationType.TOKENS_ALLOCATED,
    NotificationType.CLASS_CREATED,
    NotificationType.CLASS_TRANSFERRED,
    NotificationType.SIMULATION_ASSIGNED,
    NotificationType.EDUCATOR_LOW_SEAT_WARNING,
    NotificationType.SCHOOL_LOW_SEAT_WARNING,
    NotificationType.EDUCATOR_SEAT_REQUEST,
    NotificationType.STUDENT_REPORT_AVAILABLE,
    NotificationType.SIMULATION_DUE_DATE_REMINDER,
    NotificationType.GENERAL,
  ];

  private readonly DISMISS_TTL_SECONDS = 365 * 24 * 3600; // 1 year

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly redisService: RedisService,
  ) {}

  private dismissedKey(recipientId: string, studentId: string, scenarioId: string): string {
    return `notif:dismissed:${recipientId}:${studentId}:${scenarioId}`;
  }

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create(dto);
    return this.notificationRepo.save(notification);
  }

  async findAllForRecipient(
    recipientId: string,
    recipientType: RecipientType,
  ): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { recipientId, recipientType, type: In(this.allowedTypes) },
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
}
