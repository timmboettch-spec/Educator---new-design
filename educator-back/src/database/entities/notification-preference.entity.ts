import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NotificationType } from './notification.entity';

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
}

export enum NotificationFrequency {
  IMMEDIATE = 'IMMEDIATE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  NEVER = 'NEVER',
}

@Entity('notification_preferences')
@Index(['userId', 'notificationType', 'channel'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'varchar' })
  userId!: string;

  @Column({ name: 'notification_type', type: 'enum', enum: NotificationType })
  notificationType!: NotificationType;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel!: NotificationChannel;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'enum', enum: NotificationFrequency, nullable: true })
  frequency!: NotificationFrequency | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
