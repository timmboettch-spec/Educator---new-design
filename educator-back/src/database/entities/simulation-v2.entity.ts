import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SimulationAction } from './simulation-action.entity';
import { SimulationOrder } from './simulation-order.entity';
import { SimulationGradingRubricItem } from './simulation-grading-rubric-item.entity';
import { Transcript } from './transcript.entity';
import { VoiceProfile } from './voice-profile.entity';
import { StudentSimulationProgress } from './student-simulation-progress.entity';
import {
  type ActionCategory,
  type ISimulationPhase,
  type IProductSetup,
  type ISimulationGrading,
  type ISimulationPatientData,
} from 'src/common/interfaces';

@Entity('simulations_v2')
export class SimulationV2 {
  @PrimaryGeneratedColumn('uuid', { name: 'simulation_id' })
  simulationId!: string;

  @Index('simulations_v2_id_unique_active', { unique: true, where: 'deleted_at IS NULL' })
  @Column({ type: 'varchar', length: 255 })
  id!: string;

  @Column({ name: 'unit_id', type: 'varchar', nullable: true })
  unitId?: string | null;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  difficulty?: string;

  @Column({ type: 'varchar', nullable: true })
  department?: string;

  @Column({ type: 'varchar', nullable: true })
  class?: string;

  @Column({ name: 'learner_level', type: 'varchar', nullable: true })
  learnerLevel?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'learning_objective', type: 'jsonb', nullable: true })
  learningObjective?: string | string[];

  @Column({ name: 'learning_objective_card', type: 'text', nullable: true })
  learningObjectiveCard?: string;

  @Column({ type: 'varchar', nullable: true })
  status?: string;

  // Draft/publish versioning — read by admin.service.ts's publish flow.
  @Column({ name: 'parent_scenario_id', type: 'varchar', nullable: true })
  parentScenarioId?: string | null;

  @Column({ name: 'version_number', type: 'int', nullable: true })
  versionNumber?: number;

  @Column({ name: 'avatar_enabled', type: 'boolean', default: false })
  avatarEnabled?: boolean;

  @Index('idx_simulations_v2_avatar_id')
  @Column({ name: 'avatar_id', type: 'varchar', nullable: true })
  /**
   * The avatar this simulation uses, or NULL for none.
   *
   * Typed `| null` because the column is nullable AND now carries a foreign
   * key to avatars.avatar_id: "no avatar" must be written as NULL, not '',
   * or the FK looks for an avatar named '' and rejects the write.
   */
  avatarId?: string | null;

  @Column({ name: 'context_id', type: 'varchar', nullable: true })
  contextId?: string;

  @Column({ type: 'varchar', nullable: true })
  language?: string;

  @Column({ type: 'varchar', nullable: true })
  voice?: string;

  /**
   * The TTS voice profile chosen for this scenario, or NULL to fall back to the
   * stock default for the patient's gender. Independent of the legacy `voice`
   * (Azure voice name) column above, which is left untouched.
   */
  @Index('IDX_simulations_v2_voice_profile_id')
  @Column({ name: 'voice_profile_id', type: 'uuid', nullable: true })
  voiceProfileId?: string | null;

  @ManyToOne(() => VoiceProfile, (voiceProfile) => voiceProfile.simulations, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'voice_profile_id',
    foreignKeyConstraintName: 'FK_simulations_v2_voice_profile',
  })
  voiceProfile?: VoiceProfile | null;

  @Column({ name: 'action_group_name', type: 'varchar', nullable: true })
  actionGroupName?: string;

  @Column({ name: 'action_group_description', type: 'text', nullable: true })
  actionGroupDescription?: string;

  @Column({ name: 'requires_product_setup', type: 'boolean', default: false })
  requiresProductSetup?: boolean;

  @Column({ name: 'scenario_image', type: 'varchar', length: 2048, nullable: true })
  scenarioImage?: string;

  @Column({ name: 'patient_chart_mode', type: 'varchar', nullable: true })
  patientChartMode?: string;

  @Column({ name: 'enable_student_briefing', type: 'boolean', default: false })
  enableStudentBriefing?: boolean;

  @Column({ name: 'simulation_start_time', type: 'varchar', nullable: true })
  simulationStartTime?: string;

  @Column({ name: 'estimated_duration', type: 'varchar', nullable: true })
  estimatedDuration?: string;

  @Column({ name: 'additional_equipment', type: 'text', nullable: true })
  additionalEquipment?: string;

  @Column({ name: 'optional_equipment', type: 'text', nullable: true })
  optionalEquipment?: string;

  @Column({ name: 'setup_notes', type: 'text', nullable: true })
  setupNotes?: string;

  @Column({ name: 'topics_addressed', type: 'text', nullable: true })
  topicsAddressed?: string;

  @Column({ name: 'prebrief_script_pdf', type: 'varchar', length: 2048, nullable: true })
  prebriefScriptPdf?: string;

  @Column({ name: 'debrief_points_pdf', type: 'varchar', length: 2048, nullable: true })
  debriefPointsPdf?: string;

  @Column({ name: 'setup_notes_pdf', type: 'varchar', length: 2048, nullable: true })
  setupNotesPdf?: string;

  @Column({ name: 'facilitation_notes_pdf', type: 'varchar', length: 2048, nullable: true })
  facilitationNotesPdf?: string;

  @Column({ name: 'printable_sbar_pdf', type: 'varchar', length: 2048, nullable: true })
  printableSbarPdf?: string;

  @Column({ name: 'printable_patient_chart_pdf', type: 'varchar', length: 2048, nullable: true })
  printablePatientChartPdf?: string;

  @Column({ name: 'sequence_groups_order_mode', type: 'varchar', nullable: true })
  sequenceGroupsOrderMode?: string;

  @Column({ name: 'conversation_responses', type: 'jsonb', nullable: true })
  conversationResponses?: object;

  @Column({ name: 'patient_data', type: 'jsonb', nullable: true })
  patientData?: ISimulationPatientData;

  @Column({ name: 'ai_patient_data', type: 'jsonb', nullable: true })
  aiPatientData?: object;

  @Column({ name: 'expected_actions', type: 'jsonb', nullable: true })
  expectedActions?: object;

  @Column({ name: 'action_categories', type: 'jsonb', nullable: true })
  actionCategories?: ActionCategory[];

  @Column({ type: 'jsonb', nullable: true })
  phases?: ISimulationPhase[];

  @Column({ name: 'available_medications', type: 'jsonb', nullable: true })
  availableMedications?: object;

  @Column({ name: 'student_briefing', type: 'jsonb', nullable: true })
  studentBriefing?: object;

  @Column({ type: 'jsonb', nullable: true })
  sbar?: object;

  @Column({ type: 'jsonb', nullable: true })
  grading?: ISimulationGrading;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: object;

  @Column({ name: 'product_setup', type: 'jsonb', nullable: true })
  productSetup?: IProductSetup;

  @Column({ name: 'orthopedic_worksheet', type: 'jsonb', nullable: true })
  orthopedicWorksheet?: object;

  @Column({ type: 'jsonb', nullable: true })
  timeline?: object;

  @Column({ type: 'jsonb', nullable: true })
  sequences?: object;

  @Column({ name: 'sequence_groups', type: 'jsonb', nullable: true })
  sequenceGroups?: object;

  @Column({ name: 'team_communication', type: 'jsonb', nullable: true })
  teamCommunication?: object;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Index('IDX_simulations_v2_deleted_at', { where: 'deleted_at IS NOT NULL' })
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => SimulationAction, (action) => action.simulation, {
    cascade: ['insert', 'update'],
    orphanedRowAction: 'delete',
  })
  actions?: SimulationAction[];

  @OneToMany(() => SimulationOrder, (order) => order.simulation, {
    cascade: ['insert', 'update'],
    orphanedRowAction: 'delete',
  })
  orders?: SimulationOrder[];

  @OneToMany(() => SimulationGradingRubricItem, (item) => item.simulation, {
    cascade: ['insert', 'update'],
    orphanedRowAction: 'delete',
  })
  gradingRubricItems?: SimulationGradingRubricItem[];

  @OneToMany(() => Transcript, (transcript) => transcript.simulation)
  transcripts?: Transcript[];

  @OneToMany(() => StudentSimulationProgress, (progress) => progress.simulation)
  studentProgress?: StudentSimulationProgress[];

  rubric?: SimulationGradingRubricItem[];
  parent_scenario_id?: string | null;
}
