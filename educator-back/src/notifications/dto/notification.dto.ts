import { NotificationType, RecipientType } from 'src/database/entities';

export class CreateNotificationDto {
  type!: NotificationType;
  title!: string;
  message!: string;
  recipientId!: string;
  recipientType!: RecipientType;
  metadata?: Record<string, unknown>;
}
