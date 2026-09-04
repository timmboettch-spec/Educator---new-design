import { NotificationType, RecipientType } from '../entity/notification.entity';

export class CreateNotificationDto {
  type!: NotificationType;
  title!: string;
  message!: string;
  recipientId!: string;
  recipientType!: RecipientType;
  metadata?: Record<string, unknown>;
}
