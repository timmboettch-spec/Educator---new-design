import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  UpdateDateColumn,
  DeleteDateColumn,
  Check,
  Unique,
} from 'typeorm';
import { ReportModeType } from 'src/common/constants/simulation-report.constants';
import { SimulationAttemptConstants } from 'src/common/constants/simulation-progress.constants';
import type {
  ReportCommonActionTracker,
  ReportCommunicationAssessment,
  ReportScoreJson,
  ReportSummaryByCategory,
  ReportSummaryEntry,
} from 'src/common/interfaces';

/**
 * One row per Attempt — see docs/adr/0009-attempts-in-simulation-reports-blob-retired.md.
 *
 * Every top-level field of a `reports.json` entry has its own column (scalars typed, nested
 * objects/arrays as jsonb).
 *
 * `report_data` is a retired column kept in the database for backward compatibility only. It is
 * deliberately not mapped here: it is never selected, inserted or updated, and new rows get `{}`
 * from the database default. Don't drop the column without a new ADR (see ADR-0010).
 */
@Entity('simulation_reports')
@Unique('UQ_simulation_reports_student_scenario_mode_attempt', [
  'studentId',
  'scenarioId',
  'mode',
  'attemptNumber',
])
// The Max Attempts value is hard-coded by the migration that created this CHECK (ADR-0010).
@Check(
  'CHK_simulation_reports_assessment_attempt_number_range',
  `"mode" <> '${ReportModeType.ASSESSMENT}' OR "attempt_number" IS NULL OR "attempt_number" BETWEEN 1 AND ${SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS}`,
)
@Index('idx_simulation_reports_student_scenario_created', [
  'studentId',
  'scenarioId',
  'createdAt',
  'id',
])
// The migration creates this with `created_at DESC`; `@Index` can't express the direction, which
// TypeORM doesn't diff, so the columns and `where` here must just match the migration.
@Index('idx_simulation_reports_student_created_live', ['studentId', 'createdAt'], {
  where: '"report_id" IS NOT NULL AND "deleted_at" IS NULL',
})
export class SimulationReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_simulation_reports_student_id')
  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'student_name', type: 'varchar', nullable: true, default: null })
  studentName!: string | null;

  @Column({ name: 'scenario_id', type: 'varchar', nullable: true, default: null })
  scenarioId!: string | null;

  @Index('UQ_simulation_reports_transcript_id', { unique: true })
  @Column({ name: 'transcript_id', type: 'varchar', nullable: true, default: null })
  transcriptId!: string | null;

  @Index('idx_simulation_reports_viewed_at')
  @Column({ name: 'viewed_at', type: 'timestamp with time zone', nullable: true, default: null })
  viewedAt!: Date | null;

  @Column({ name: 'viewed_by', type: 'uuid', nullable: true, default: null })
  viewedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // ── reports.json entry fields ──────────────────────────────────────────────

  /** The blob entry's own `id` (e.g. `report-1787129912644`), distinct from the uuid PK. */
  @Index('idx_simulation_reports_report_id')
  @Column({ name: 'report_id', type: 'varchar', nullable: true, default: null })
  reportId!: string | null;

  @Column({ name: 'key', type: 'varchar', nullable: true, default: null })
  key!: string | null;

  /** Student Code as sent by the client (`userId`). */
  @Column({ name: 'user_id', type: 'varchar', nullable: true, default: null })
  userId!: string | null;

  /** The entry's `student_id` — a Student Code, not the `students.id` uuid in `student_id`. */
  @Column({ name: 'student_code', type: 'varchar', nullable: true, default: null })
  studentCode!: string | null;

  @Column({ name: 'student_class', type: 'varchar', nullable: true, default: null })
  studentClass!: string | null;

  @Column({ name: 'scenario_title', type: 'varchar', nullable: true, default: null })
  scenarioTitle!: string | null;

  @Column({ name: 'scenario_start_time', type: 'timestamptz', nullable: true, default: null })
  scenarioStartTime!: Date | null;

  @Column({ name: 'scenario_end_time', type: 'timestamptz', nullable: true, default: null })
  scenarioEndTime!: Date | null;

  @Column({ name: 'total_time_seconds', type: 'double precision', nullable: true, default: null })
  totalTimeSeconds!: number | null;

  @Column({ name: 'mode', type: 'varchar', nullable: true, default: null })
  mode!: ReportModeType | null;

  /** 1-based, per `(student, scenario, mode)`. Null on rows written before Simulation Progress existed. */
  @Column({ name: 'attempt_number', type: 'int', nullable: true, default: null })
  attemptNumber!: number | null;

  @Column({ name: 'score', type: 'double precision', nullable: true, default: null })
  score!: number | null;

  @Column({ name: 'performance_label', type: 'varchar', nullable: true, default: null })
  performanceLabel!: string | null;

  @Column({ name: 'score_json', type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  scoreJson!: ReportScoreJson | null;

  @Column({ name: 'summary', type: 'text', nullable: true, default: null })
  summary!: string | null;

  @Column({ name: 'summary_entries', type: 'jsonb', nullable: true, default: () => "'[]'::jsonb" })
  summaryEntries!: ReportSummaryEntry[] | null;

  @Column({
    name: 'summary_by_category',
    type: 'jsonb',
    nullable: true,
    default: () => "'{}'::jsonb",
  })
  summaryByCategory!: ReportSummaryByCategory | null;

  @Column({ name: 'feedback', type: 'text', nullable: true, default: null })
  feedback!: string | null;

  @Column({
    name: 'common_action_tracker',
    type: 'jsonb',
    nullable: true,
    default: () => "'{}'::jsonb",
  })
  commonActionTracker!: ReportCommonActionTracker | null;

  @Column({
    name: 'communication_assessment',
    type: 'jsonb',
    nullable: true,
    default: () => "'{}'::jsonb",
  })
  communicationAssessment!: ReportCommunicationAssessment | null;

  @Column({ name: 'rubrics_summary', type: 'text', nullable: true, default: null })
  rubricsSummary!: string | null;

  @Column({ name: 'rubrics_total', type: 'double precision', nullable: true, default: null })
  rubricsTotal!: number | null;

  @Column({ name: 'debrief_reflection', type: 'text', nullable: true, default: null })
  debriefReflection!: string | null;

  @Column({ name: 'action_scores', type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  actionScores!: object | null;

  @Column({ name: 'action_summary', type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  actionSummary!: object | null;

  @Column({
    name: 'mandatory_actions',
    type: 'jsonb',
    nullable: true,
    default: () => "'[]'::jsonb",
  })
  mandatoryActions!: object[] | null;

  @Column({ name: 'optional_actions', type: 'jsonb', nullable: true, default: () => "'[]'::jsonb" })
  optionalActions!: object[] | null;

  @Column({
    name: 'distractor_actions',
    type: 'jsonb',
    nullable: true,
    default: () => "'[]'::jsonb",
  })
  distractorActions!: object[] | null;
}
