import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Schools } from './schools.entity';

export enum InviteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
}

@Entity('invites')
@Index('idx_invites_school_id', ['school'])
@Index('idx_invites_created_by', ['createdBy'])
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  full_name?: string | null;

  @Column({ type: 'varchar', nullable: false })
  email!: string;

  @Column({
    type: 'enum',
    enum: InviteStatus,
    enumName: 'invite_status_enum',
    default: InviteStatus.PENDING,
  })
  status!: InviteStatus;

  @ManyToOne(() => Schools, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'school_id', foreignKeyConstraintName: 'FK_7f2f179b9f5940e0f8f41847cfa' })
  school!: Schools;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy', foreignKeyConstraintName: 'FK_39935db8d0070ca313e387d95e2' })
  createdBy!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expires_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;
}
