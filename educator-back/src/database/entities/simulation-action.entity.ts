import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Check,
  Index,
} from 'typeorm';
import { SimulationV2 } from './simulation-v2.entity';
import { SimulationOrderLinkedAction } from './simulation-order-linked-action.entity';

@Entity('simulation_actions')
@Index('IDX_simulation_actions_simulation_type', ['simulationId', 'type'])
@Index('simulation_actions_id_simulation_id_unique_active', ['id', 'simulationId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Check(
  'simulation_actions_action_type_check',
  `"action_type" IN ('single', 'ordering', 'vital', 'question')`,
)
@Check(
  'simulation_actions_type_requirement_check',
  `"type_requirement" IS NULL OR "type_requirement" IN ('Mandatory', 'Optional', 'Distractor')`,
)
@Check('simulation_actions_max_attempts_check', `"max_attempts" IS NULL OR "max_attempts" > 0`)
@Check(
  'simulation_actions_result_media_type_check',
  `"result_media_type" IS NULL OR "result_media_type" IN ('text', 'image', 'pdf', 'mixed')`,
)
@Check(
  'simulation_actions_limit_type_check',
  `"limit_type" IS NULL OR "limit_type" IN ('unlimited', 'limited')`,
)
export class SimulationAction {
  @PrimaryGeneratedColumn('uuid', { name: 'action_id' })
  actionId!: string;

  @Column({ type: 'text' })
  id!: string;

  // FK to simulations_v2.simulation_id (the UUID surrogate PK), not the business `id`.
  @Index('IDX_simulation_actions_simulation_id')
  @Column({ name: 'simulation_id', type: 'uuid' })
  simulationId!: string;

  @ManyToOne(() => SimulationV2, (simulation) => simulation.actions, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'simulation_id',
    foreignKeyConstraintName: 'FK_simulation_actions_simulation',
  })
  simulation?: SimulationV2;

  @Column({ name: 'action_order', type: 'int' })
  order!: number;

  @Column({ type: 'text' })
  title!: string;

  @Column({ name: 'action_type', type: 'varchar' })
  type!: string;

  @Column({ name: 'type_requirement', type: 'varchar', nullable: true })
  typeRequirement?: string;

  @Column({ name: 'is_distractor', type: 'boolean', default: false })
  isDistractor!: boolean;

  @Column({ name: 'is_excluded', type: 'boolean', default: false })
  isExcluded!: boolean;

  @Column({ name: 'is_optional', type: 'boolean', default: false })
  isOptional!: boolean;

  @Column({ name: 'max_attempts', type: 'int', nullable: true })
  maxAttempts?: number;

  @Column({ type: 'text', nullable: true })
  prompt?: string;

  @Column({ type: 'jsonb', nullable: true })
  items?: string[];

  @Column({ type: 'jsonb', nullable: true })
  concepts?: Array<{ id: string; description: string; type: string }>;

  @Column({ type: 'jsonb', nullable: true })
  correct?: string | string[];

  @Column({ name: 'category_id', type: 'varchar', nullable: true })
  categoryId?: string;

  @Column({ type: 'jsonb', nullable: true })
  vitals?: Record<string, string[] | boolean | undefined>;

  @Column({ name: 'vital_requirements', type: 'jsonb', nullable: true })
  vitalRequirements?: Record<string, 'Mandatory' | 'Optional'>;

  @Column({ name: 'vital_requirement_entries', type: 'jsonb', nullable: true })
  vitalRequirementEntries?: Record<string, Array<'Mandatory' | 'Optional'>>;

  @Column({ name: 'result_media_type', type: 'varchar', nullable: true })
  resultMediaType?: string;

  @Column({ name: 'result_name', type: 'varchar', nullable: true })
  resultName?: string;

  @Column({ name: 'result_content', type: 'text', nullable: true })
  resultContent?: string;

  @Column({ name: 'result_media_url', type: 'text', nullable: true })
  resultMediaUrl?: string;

  @Column({ name: 'result_media_name', type: 'varchar', nullable: true })
  resultMediaName?: string;

  @Column({ name: 'limit_type', type: 'varchar', nullable: true })
  limitType?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'ideal_response', type: 'text', nullable: true })
  idealResponse?: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Index('IDX_simulation_actions_deleted_at', { where: 'deleted_at IS NOT NULL' })
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => SimulationOrderLinkedAction, (order) => order.simulationAction, {
    cascade: ['insert', 'update'],
    orphanedRowAction: 'delete',
  })
  linkedOrders?: SimulationOrderLinkedAction[];
}
