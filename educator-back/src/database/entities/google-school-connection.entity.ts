import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { lmsSecretTransformer } from 'src/lms/utils/lms-secret-crypto';
import { GoogleConnectionStatus } from 'src/google/google.constants';

@Entity('google_school_connections')
@Index('idx_google_school_connections_school_id', ['schoolId'])
@Index('UQ_google_school_connections_school_educator', ['schoolId', 'connectedByEducatorId'], {
  unique: true,
})
export class GoogleSchoolConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({ name: 'connected_by_educator_id', type: 'uuid' })
  connectedByEducatorId!: string;

  @Column({ name: 'google_account_email', type: 'varchar', nullable: true })
  googleAccountEmail!: string | null;

  @Column({ name: 'google_account_id', type: 'varchar', nullable: true })
  googleAccountId!: string | null;

  @Column({ name: 'access_token', type: 'text', transformer: lmsSecretTransformer })
  accessToken!: string;

  @Column({
    name: 'refresh_token',
    type: 'text',
    nullable: true,
    transformer: lmsSecretTransformer,
  })
  refreshToken!: string | null;

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt!: Date | null;

  @Column({ type: 'text' })
  scopes!: string;

  @Column({
    type: 'enum',
    enum: GoogleConnectionStatus,
    enumName: 'google_connection_status_enum',
    default: GoogleConnectionStatus.ACTIVE,
  })
  status!: GoogleConnectionStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
