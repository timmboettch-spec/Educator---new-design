import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  VoiceProfileConstants,
  VoiceProfileGender,
  VoiceProfileStatus,
} from 'src/common/constants';
import { SimulationV2 } from './simulation-v2.entity';

/**
 * A reference recording the TTS voice is cloned from. The wav itself lives in
 * blob storage at `blobPath`; this row is the catalog entry scenarios point at
 * (`simulations_v2.voice_profile_id`).
 *
 * Retired, never deleted: the FK from simulations_v2 is ON DELETE RESTRICT and
 * the service refuses to retire a profile any scenario still uses.
 *
 * The case-insensitive display-name uniqueness is an expression index
 * (`lower(display_name)`), which TypeORM cannot model — it is declared here with
 * `synchronize: false` so schema diffs leave it alone, and created by the
 * CreateVoiceProfiles migration.
 */
@Entity('voice_profiles')
@Index(VoiceProfileConstants.DB.UQ_DISPLAY_NAME_ACTIVE, { synchronize: false })
export class VoiceProfile {
  @PrimaryGeneratedColumn('uuid', {
    name: 'voice_profile_id',
    primaryKeyConstraintName: 'PK_voice_profiles',
  })
  voiceProfileId!: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: VoiceProfileConstants.VALIDATION.DISPLAY_NAME_MAX_LENGTH,
  })
  displayName!: string;

  @Column({
    type: 'enum',
    enum: VoiceProfileStatus,
    enumName: VoiceProfileConstants.DB.ENUM_STATUS,
    default: VoiceProfileStatus.ACTIVE,
  })
  status!: VoiceProfileStatus;

  /** `voices/<voiceProfileId>/voice.wav` inside the voice-profiles container. */
  @Column({
    name: 'blob_path',
    type: 'varchar',
    length: VoiceProfileConstants.VALIDATION.BLOB_PATH_MAX_LENGTH,
  })
  blobPath!: string;

  @Column({ name: 'duration_ms', type: 'int' })
  durationMs!: number;

  /**
   * Free-text demographic and performance tags, catalog metadata only — none
   * of these feed `resolveForScenario`'s auto-selection, which still keys off
   * `defaultForGender` alone. `gender` is deliberately separate from
   * `defaultForGender`: this is "what this voice sounds like", the other is
   * "which one to fall back to for a given patient gender", and the service
   * validates the two can't contradict each other.
   */
  @Column({
    name: 'gender',
    type: 'varchar',
    length: VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH,
    nullable: true,
  })
  gender?: string | null;

  @Column({ name: 'age', type: 'int', nullable: true })
  age?: number | null;

  @Column({
    name: 'ethnicity',
    type: 'varchar',
    length: VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH,
    nullable: true,
  })
  ethnicity?: string | null;

  /** How the voice sounds (e.g. calm, anxious, stern) — one label, not a Chatterbox generation parameter. */
  @Column({
    name: 'emotion',
    type: 'varchar',
    length: VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH,
    nullable: true,
  })
  emotion?: string | null;

  /** At most one ACTIVE profile per gender may be the stock default. */
  @Index(VoiceProfileConstants.DB.UQ_DEFAULT_FOR_GENDER_ACTIVE, {
    unique: true,
    where: `"status" = 'active' AND "default_for_gender" IS NOT NULL`,
  })
  @Column({
    name: 'default_for_gender',
    type: 'enum',
    enum: VoiceProfileGender,
    enumName: VoiceProfileConstants.DB.ENUM_GENDER,
    nullable: true,
  })
  defaultForGender?: VoiceProfileGender | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @Column({ name: 'retired_at', type: 'timestamptz', nullable: true })
  retiredAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => SimulationV2, (simulation) => simulation.voiceProfile)
  simulations?: SimulationV2[];
}
