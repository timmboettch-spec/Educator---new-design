import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AvatarConstants, AvatarStatus } from 'src/common/constants';

/**
 * The avatar platform's Session Router reads this table directly, selecting
 * avatar_id, display_name, asset_path, voice_profile_id, gpu_sku, min_replicas,
 * max_replicas, scale_to_zero, status, unreal_map and pixel_streaming_version
 * by name. It swallows PostgresError, so renaming or dropping one of those
 * silently makes every avatar lookup return "not found" rather than erroring.
 * A test pins the contract.
 */
@Entity('avatars')
export class Avatar {
  @PrimaryGeneratedColumn('uuid', { name: 'avatar_uuid' })
  avatarUuid!: string;

  /** Business id (`avatar-10`) — also the pod label and blob path segment. */
  @Column({
    name: 'avatar_id',
    type: 'varchar',
    length: AvatarConstants.VALIDATION.AVATAR_ID_MAX_LENGTH,
    unique: true,
  })
  avatarId!: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: AvatarConstants.VALIDATION.DISPLAY_NAME_MAX_LENGTH,
  })
  displayName!: string;

  @Column({
    type: 'varchar',
    length: AvatarConstants.VALIDATION.APPEARANCE_MAX_LENGTH,
    nullable: true,
  })
  appearance?: string | null;

  /**
   * Packaged UE map, e.g. `/Game/Maps/Production/L_AVT_10`. One package holds
   * several maps and this is the only thing distinguishing them — a wrong value
   * gives a healthy-looking pod streaming the wrong patient.
   */
  @Column({
    name: 'unreal_map',
    type: 'varchar',
    length: AvatarConstants.VALIDATION.UNREAL_MAP_MAX_LENGTH,
    nullable: true,
  })
  unrealMap?: string | null;

  @Column({
    name: 'asset_path',
    type: 'varchar',
    length: AvatarConstants.VALIDATION.ASSET_PATH_MAX_LENGTH,
    nullable: true,
  })
  assetPath?: string | null;

  /** `retired` rather than deleted: scenarios may still reference the row. */
  @Column({
    type: 'enum',
    enum: AvatarStatus,
    enumName: 'avatar_status_enum',
    default: AvatarStatus.SYNCING,
  })
  status!: AvatarStatus;

  @Column({
    name: 'voice_profile_id',
    type: 'varchar',
    length: AvatarConstants.VALIDATION.VOICE_PROFILE_ID_MAX_LENGTH,
    nullable: true,
  })
  voiceProfileId?: string | null;

  @Column({
    name: 'gpu_sku',
    type: 'varchar',
    length: AvatarConstants.VALIDATION.GPU_SKU_MAX_LENGTH,
    default: AvatarConstants.DEFAULTS.GPU_SKU,
  })
  gpuSku!: string;

  @Column({ name: 'min_replicas', type: 'int', default: AvatarConstants.DEFAULTS.MIN_REPLICAS })
  minReplicas!: number;

  @Column({ name: 'max_replicas', type: 'int', default: AvatarConstants.DEFAULTS.MAX_REPLICAS })
  maxReplicas!: number;

  @Column({ name: 'scale_to_zero', type: 'boolean', default: AvatarConstants.DEFAULTS.SCALE_TO_ZERO })
  scaleToZero!: boolean;

  /** 1 or 2, from the build manifest — v1 args on a v2 build never stream. */
  @Column({
    name: 'pixel_streaming_version',
    type: 'int',
    default: AvatarConstants.DEFAULTS.PIXEL_STREAMING_VERSION,
  })
  pixelStreamingVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
