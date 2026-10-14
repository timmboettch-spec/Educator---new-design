import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('redemptions')
@Index('IDX_redemptions_user_id', ['user'])
@Index('UQ_redemptions_user_id_redeem_code', ['user', 'redeem_code'], { unique: true })
export class Redemption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_c59b27ed1a764e578add290572c' })
  user!: User;

  @Index('IDX_redemptions_redeem_code')
  @Column({ type: 'varchar', nullable: false })
  redeem_code!: string;

  @Column({ type: 'varchar', nullable: false })
  sales_order!: string;

  @Column({ type: 'varchar', nullable: false })
  customer!: string;

  @Column({ type: 'jsonb', nullable: false })
  line_items!: object[];

  @Column({ type: 'integer', nullable: false })
  ai_seats_granted!: number;

  @CreateDateColumn({
    name: 'redeemed_at',
    type: 'timestamptz',
  })
  redeemed_at!: Date;
}
