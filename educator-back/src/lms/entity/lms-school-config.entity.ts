import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { LmsConfigStatus, LmsToolType, LmsType } from 'src/common/enums/lms.enum';
import { lmsSecretTransformer } from '../utils/lms-secret-crypto';

@Entity('lms_school_config')
@Index(['schoolId', 'toolType'], { unique: true })
export class LmsSchoolConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({
    name: 'tool_type',
    type: 'enum',
    enum: LmsToolType,
    enumName: 'lms_tool_type_enum',
    default: LmsToolType.EDUCATOR,
  })
  toolType!: LmsToolType;

  @Column({
    name: 'lms_type',
    type: 'enum',
    enum: LmsType,
    enumName: 'lms_type_enum',
    default: LmsType.MOODLE,
  })
  lmsType!: LmsType;

  @Column({ type: 'varchar' })
  issuer!: string;

  @Column({ name: 'client_id', type: 'varchar' })
  clientId!: string;

  @Column({ name: 'deployment_id', type: 'varchar', nullable: true })
  deploymentId!: string | null;

  @Column({ name: 'auth_endpoint', type: 'varchar' })
  authEndpoint!: string;

  @Column({ name: 'token_endpoint', type: 'varchar' })
  tokenEndpoint!: string;

  @Column({ name: 'jwks_url', type: 'varchar' })
  jwksUrl!: string;

  @Column({ name: 'platform_private_key_pem', type: 'text', transformer: lmsSecretTransformer })
  platformPrivateKeyPem!: string;

  @Column({ name: 'platform_key_id', type: 'varchar' })
  platformKeyId!: string;

  @Column({
    type: 'enum',
    enum: LmsConfigStatus,
    enumName: 'lms_config_status_enum',
    default: LmsConfigStatus.ACTIVE,
  })
  status!: LmsConfigStatus;

  @Column({ name: 'share_pii', type: 'boolean', default: true })
  sharePii!: boolean;

  @Column({ name: 'lms_base_url', type: 'varchar', nullable: true })
  lmsBaseUrl!: string | null;

  @Column({
    name: 'lms_api_token',
    type: 'varchar',
    nullable: true,
    transformer: lmsSecretTransformer,
  })
  lmsApiToken!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
