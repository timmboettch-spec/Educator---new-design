import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { UserTokenPurpose } from 'src/common/constants';
import { User } from './user.entity';

/**
 * A single, purpose-tagged place to hold an OTP or a verification token (`token` holds either,
 * depending on `purpose`) — e.g. the forgot-password OTP + its reset/verified JWTs, keyed to the
 * users account it was issued for. Single-use is enforced by deleting the row once it's
 * consumed, not by a status column — a row existing at all means it's still live.
 */
@Entity('user_tokens')
@Index('idx_user_tokens_user_id', ['userId'])
export class UserToken {
  @PrimaryGeneratedColumn('uuid', { name: 'user_token_id' })
  userTokenId!: string;

  @Column({
    type: 'enum',
    enum: UserTokenPurpose,
    enumName: 'user_token_purpose_enum',
  })
  purpose!: UserTokenPurpose;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.userTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'text' })
  token!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
