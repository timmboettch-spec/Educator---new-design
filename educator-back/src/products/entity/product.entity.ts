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
import { CommonStatus } from '../../common/enums/status.enum';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id?: string;

  @Column({ name: 'title' })
  title?: string;

  @Column({ name: 'value', type: 'int', default: 0 })
  value?: number;

  @Column({ name: 'icon' })
  icon?: string;

  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: { label: string } | null;

  @Column({ type: 'enum', enum: CommonStatus, default: CommonStatus.ACTIVE })
  status?: CommonStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  created_at?: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updated_at?: Date;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user_id?: User;
}
