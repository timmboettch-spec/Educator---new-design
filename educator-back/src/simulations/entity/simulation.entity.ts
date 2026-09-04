import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('simulations')
export class Simulation {
  @PrimaryColumn('varchar')
  id!: string;

  @Column({ name: 'unit_id', type: 'varchar', nullable: true })
  unit_id?: string | null;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  difficulty?: string;

  @Column({ type: 'varchar', nullable: true })
  avatarId?: string;

  @Column({ type: 'varchar', nullable: true })
  contextId?: string;

  @Column({ type: 'varchar', nullable: true })
  learnerLevel?: string;

  @Column({ type: 'varchar', nullable: true })
  department?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  learningObjective?: string;

  @Column({ type: 'varchar', nullable: true })
  class?: string;

  @Column({ type: 'boolean', default: false })
  disabled?: boolean;

  @Column({ type: 'varchar', nullable: true })
  status?: string;

  @Column({ type: 'jsonb', nullable: true })
  actions?: object;

  @Column({ type: 'jsonb', nullable: true })
  patientData?: object;

  @Column({ type: 'jsonb', nullable: true })
  expectedActions?: object;

  @Column({ type: 'jsonb', nullable: true })
  historyPrompts?: object;

  @Column({ type: 'jsonb', nullable: true })
  assessmentGuidance?: object;

  @Column({ type: 'text', nullable: true })
  assessmentNarrativeExpected?: string;

  @Column({ type: 'text', nullable: true })
  learningObjectiveCard?: string;

  @Column({ type: 'jsonb', nullable: true })
  phases?: object;

  @Column({ type: 'jsonb', nullable: true })
  availableMedications?: object;

  @Column({ type: 'jsonb', nullable: true })
  grading?: object;

  @Column({ type: 'boolean', default: false })
  requiresProductSetup?: boolean;

  @Column({ type: 'jsonb', nullable: true })
  productSetup?: object;

  @Column({ type: 'jsonb', nullable: true })
  aiPatientData?: object;

  @Column({ type: 'varchar', nullable: true })
  preBriefPdf?: string;

  @Column({ type: 'boolean', default: false })
  enableStudentBriefing?: boolean;

  @Column({ type: 'boolean', default: false })
  avatarEnabled?: boolean;

  @Column({ type: 'jsonb', nullable: true })
  studentBriefing?: object;

  @Column({ type: 'jsonb', nullable: true })
  sbar?: object;

  @Column({ type: 'jsonb', nullable: true })
  orders?: object;

  @Column({ type: 'jsonb', nullable: true })
  actionCategories?: object;

  @Column({ type: 'varchar', nullable: true })
  language?: string;

  @Column({ type: 'varchar', nullable: true })
  voice?: string;

  @Column({ type: 'varchar', nullable: true })
  ethnicity?: string;

  @Column({ type: 'varchar', nullable: true })
  age?: string;

  @Column({ name: 'actionGroupName', type: 'varchar', nullable: true })
  actionGroupName?: string;

  @Column({ name: 'actionGroupDescription', type: 'text', nullable: true })
  actionGroupDescription?: string;

  @Column({ type: 'jsonb', nullable: true })
  timeline?: object;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
