import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entity/user.entity';
import { Schools } from '../../schools/entity/schools.entity';

export enum InviteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
}

@Entity('invites')
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: false })
  full_name!: string;

  @Column({ type: 'varchar', nullable: false })
  email!: string;

  @Column({ type: 'enum', enum: InviteStatus, default: InviteStatus.PENDING })
  status!: InviteStatus;

  @ManyToOne(() => Schools)
  @JoinColumn({ name: 'school_id' })
  school!: Schools;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
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
