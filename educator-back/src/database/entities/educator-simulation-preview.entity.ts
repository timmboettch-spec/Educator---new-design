import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Educator } from './educator.entity';

/**
 * Previews an educator has used for one simulation; `scenarioId` is a business id, not an FK.
 * Never soft-delete these rows: the unique index ignores deleted rows, so it would reset the allowance.
 */
@Entity('educator_simulation_previews')
@Index('UQ_educator_simulation_previews_educator_scenario_active', ['educatorId', 'scenarioId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('CHK_educator_simulation_previews_used_count_non_negative', '"used_count" >= 0')
export class EducatorSimulationPreview {
  @PrimaryGeneratedColumn('uuid', { name: 'educator_simulation_preview_id' })
  educatorSimulationPreviewId!: string;

  @Column({ name: 'educator_id', type: 'uuid' })
  educatorId!: string;

  @ManyToOne(() => Educator, (educator) => educator.simulationPreviews)
  @JoinColumn({ name: 'educator_id' })
  educator?: Educator;

  @Column({ name: 'scenario_id', type: 'varchar', length: 255 })
  scenarioId!: string;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
