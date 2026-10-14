import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum NotificationType {
  EDUCATOR_REGISTERED = 'EDUCATOR_REGISTERED',
  TOKENS_ALLOCATED = 'TOKENS_ALLOCATED',

  CLASS_CREATED = 'CLASS_CREATED',
  CLASS_TRANSFERRED = 'CLASS_TRANSFERRED',
  CLASS_START_DATE_REMINDER = 'CLASS_START_DATE_REMINDER',
  CLASS_END_DATE_REMINDER = 'CLASS_END_DATE_REMINDER',

  SIMULATION_ASSIGNED = 'SIMULATION_ASSIGNED',
  SIMULATION_START_DATE_REMINDER = 'SIMULATION_START_DATE_REMINDER',
  SIMULATION_DUE_DATE_REMINDER = 'SIMULATION_DUE_DATE_REMINDER',
  SIMULATION_END_DATE_REMINDER = 'SIMULATION_END_DATE_REMINDER',

  STUDENT_REPORT_AVAILABLE = 'STUDENT_REPORT_AVAILABLE',

  LMS_GRADE_SYNC_FAILED = 'LMS_GRADE_SYNC_FAILED',

  // Email-preference-only types (not shown in notification centre)
  EMAIL_REPORT = 'EMAIL_REPORT',
  ASSESSMENT_REPORT = 'ASSESSMENT_REPORT',
  BATCH_EMAIL = 'BATCH_EMAIL',
  SEND_STUDENT_CODE = 'SEND_STUDENT_CODE',
  ACCOUNT_REACTIVATED = 'ACCOUNT_REACTIVATED',
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
  INVITE = 'INVITE',

  EDUCATOR_LOW_SEAT_WARNING = 'EDUCATOR_LOW_SEAT_WARNING',
  SCHOOL_LOW_SEAT_WARNING = 'SCHOOL_LOW_SEAT_WARNING',
  EDUCATOR_SEAT_REQUEST = 'EDUCATOR_SEAT_REQUEST',

  SCHOOL_STATUS_CHANGED = 'SCHOOL_STATUS_CHANGED',
  SCHOOL_REMOVED = 'SCHOOL_REMOVED',

  GENERAL = 'GENERAL',
}

export enum RecipientType {
  ADMIN = 'admin',
  EDUCATOR = 'educator',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type_enum',
    default: NotificationType.GENERAL,
  })
  type!: NotificationType;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Index('IDX_notifications_recipient_id')
  @Column({ name: 'recipient_id', type: 'varchar' })
  recipientId!: string;

  @Column({
    name: 'recipient_type',
    type: 'enum',
    enum: RecipientType,
    enumName: 'notification_recipient_type_enum',
  })
  recipientType!: RecipientType;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
