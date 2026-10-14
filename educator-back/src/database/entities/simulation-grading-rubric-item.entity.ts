import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { SimulationV2 } from './simulation-v2.entity';

@Entity('simulation_grading_rubric_items')
@Check('simulation_grading_rubric_items_weight_check', `"weight" IS NULL OR "weight" >= 0`)
@Check(
  'simulation_grading_rubric_items_scoring_model_check',
  `"scoring_model" IS NULL OR "scoring_model" IN ('Graded', 'Binary')`,
)
@Check(
  'simulation_grading_rubric_items_evaluation_source_check',
  `"evaluation_source" IS NULL OR "evaluation_source" IN ('AI', 'System Check')`,
)
@Index('IDX_simulation_grading_rubric_items_simulation_subcategory', [
  'simulationId',
  'subCategory',
])
@Index('simulation_grading_rubric_items_id_simulation_id_unique', ['id', 'simulationId'], {
  unique: true,
})
export class SimulationGradingRubricItem {
  @PrimaryGeneratedColumn('uuid', { name: 'rubric_id' })
  rubricId!: string;

  // Business identifier from the source scenario JSON — no longer the primary
  // key (see rubricId above), unique per simulation only (see the
  // simulation_grading_rubric_items_id_simulation_id_unique index in
  // CreateSimulationV2Schema).
  @Column({ type: 'text' })
  id!: string;

  @Index('IDX_simulation_grading_rubric_items_simulation_id')
  @Column({ name: 'simulation_id', type: 'uuid' })
  simulationId!: string;

  @ManyToOne(() => SimulationV2, (simulation) => simulation.gradingRubricItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'simulation_id',
    foreignKeyConstraintName: 'FK_simulation_grading_rubric_items_simulation',
  })
  simulation?: SimulationV2;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'category_type', type: 'text', nullable: true })
  categoryType?: string;

  // Join key for the future report-side rubric-results table. Rubric keys in legacy report
  // payloads (e.g. "rubric_actions") do not match this table's `id` column, only its category naming.
  @Index('IDX_simulation_grading_rubric_items_sub_category')
  @Column({ name: 'sub_category', type: 'text' })
  subCategory!: string;

  @Column({ type: 'numeric', nullable: true })
  weight?: number;

  @Column({ name: 'scoring_model', type: 'text', nullable: true })
  scoringModel?: string;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @Column({ name: 'evaluation_source', type: 'text', nullable: true })
  evaluationSource?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'checklist_items', type: 'jsonb', nullable: true })
  checklistItems?: object;

  @Column({ name: 'ai_mapping', type: 'jsonb', nullable: true })
  aiMapping?: { aiCheckId?: string; aiDescription?: string; aiPromptParameter?: string };

  @Column({ name: 'communication_criteria', type: 'jsonb', nullable: true })
  communicationCriteria?: Array<{
    id: string;
    title: string;
    prompt: string;
    enabled?: boolean;
    order?: number;
  }>;

  @Column({ name: 'learning_objective_id', type: 'text', nullable: true })
  learningObjectiveId?: string;

  @Column({ name: 'patient_data_fields', type: 'jsonb', nullable: true })
  patientDataFields?: object;

  @Column({ name: 'vitals_fields', type: 'jsonb', nullable: true })
  vitalsFields?: object;

  @Column({ name: 'expected_actions', type: 'jsonb', nullable: true })
  expectedActions?: object;

  @Column({ type: 'jsonb', nullable: true })
  medications?: object;

  @Column({ name: 'communication_summary_prompt', type: 'text', nullable: true })
  communicationSummaryPrompt?: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
