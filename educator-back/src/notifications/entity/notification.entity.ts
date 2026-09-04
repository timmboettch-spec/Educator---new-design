import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum NotificationType {
  EDUCATOR_REGISTERED = 'EDUCATOR_REGISTERED',
  TOKENS_ALLOCATED = 'TOKENS_ALLOCATED',
  CLASS_CREATED = 'CLASS_CREATED',
  CLASS_TRANSFERRED = 'CLASS_TRANSFERRED',
  SIMULATION_ASSIGNED = 'SIMULATION_ASSIGNED',
  STUDENT_REPORT_AVAILABLE = 'STUDENT_REPORT_AVAILABLE',
  SIMULATION_DUE_DATE_REMINDER = 'SIMULATION_DUE_DATE_REMINDER',
  EDUCATOR_LOW_SEAT_WARNING = 'EDUCATOR_LOW_SEAT_WARNING',
  SCHOOL_LOW_SEAT_WARNING = 'SCHOOL_LOW_SEAT_WARNING',
  EDUCATOR_SEAT_REQUEST = 'EDUCATOR_SEAT_REQUEST',
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

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.GENERAL })
  type!: NotificationType;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Index()
  @Column({ name: 'recipient_id', type: 'varchar' })
  recipientId!: string;

  @Column({ name: 'recipient_type', type: 'enum', enum: RecipientType })
  recipientType!: RecipientType;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
