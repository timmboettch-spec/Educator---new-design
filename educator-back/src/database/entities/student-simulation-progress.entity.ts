import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
  Unique,
  Index,
} from 'typeorm';
import { SimulationAttemptConstants, SimulationProgressStatus } from 'src/common/constants';
import { Student } from './students.entity';
import { SimulationV2 } from './simulation-v2.entity';
import { ClassSimulation } from './class-simulation.entity';

/**
 * One row per `(student, simulation)`: the student's Practice/Assessment Attempt counts, whether the
 * Simulation is Completed, and Forfeit. The source of truth for the Assessment limit — see
 * docs/adr/0010-simulation-progress-owns-attempt-limits-and-forfeit.md. The Attempts themselves
 * stay in `simulation_reports`.
 *
 * The CHECKs hard-code the Max Attempts value of the migration that created them; changing
 * `SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS` needs a new migration that recreates them.
 */
@Entity('student_simulation_progress')
@Index('idx_student_simulation_progress_simulation_id', ['simulationId'])
@Index('idx_student_simulation_progress_class_simulation_id', ['classSimulationId'])
@Unique('UQ_student_simulation_progress_student_simulation', ['studentId', 'simulationId'])
@Check(
  'CHK_student_simulation_progress_assessment_attempts_range',
  `"assessment_attempts_count" BETWEEN 0 AND ${SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS}`,
)
@Check(
  'CHK_student_simulation_progress_forfeit_needs_attempt',
  '"forfeited_at" IS NULL OR "assessment_attempts_count" >= 1',
)
export class StudentSimulationProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @ManyToOne(() => Student, (student) => student.simulationProgress, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  /** `simulations_v2.simulation_id`. Varchar `scenario_id`/`simulation_id` columns elsewhere hold the same value. */
  @Column({ name: 'simulation_id', type: 'uuid' })
  simulationId!: string;

  @ManyToOne(() => SimulationV2, (simulation) => simulation.studentProgress)
  @JoinColumn({ name: 'simulation_id' })
  simulation?: SimulationV2;

  /** `class_simulations.id`: the assignment this was first recorded under; informational — limits never key on it. */
  @Column({ name: 'class_simulation_id', type: 'uuid' })
  classSimulationId!: string;

  @ManyToOne(() => ClassSimulation, (classSimulation) => classSimulation.studentProgress, {
    nullable: false,
  })
  @JoinColumn({ name: 'class_simulation_id' })
  classSimulation?: ClassSimulation;

  @Column({ name: 'practice_attempts_count', type: 'int', default: 0 })
  practiceAttemptsCount!: number;

  @Column({ name: 'assessment_attempts_count', type: 'smallint', default: 0 })
  assessmentAttemptsCount!: number;

  @Column({
    type: 'enum',
    enum: SimulationProgressStatus,
    enumName: 'simulation_progress_status_enum',
    default: SimulationProgressStatus.IN_PROGRESS,
  })
  status!: SimulationProgressStatus;

  @Column({ name: 'forfeited_at', type: 'timestamptz', nullable: true })
  forfeitedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
