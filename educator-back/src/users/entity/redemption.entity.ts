import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('redemptions')
export class Redemption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

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

  @CreateDateColumn({ name: 'redeemed_at', type: 'timestamptz' })
  redeemed_at!: Date;
}
