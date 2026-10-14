import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  ValueTransformer,
  Index,
} from 'typeorm';
import { SimulationV2 } from './simulation-v2.entity';
import { TranscriptMessage } from 'src/common/interfaces';
import { TranscriptScenarioType } from 'src/common/constants';

// Keeps the TS property typed as an ISO-8601 string (matching the existing
// JSON Transcript.startedAt/.endedAt contract every consumer already expects)
// while the DB column is still a real `timestamptz` for indexing/sorting.
// Without this, TypeORM hydrates the column as a `Date`, which silently
// breaks any `typeof x === 'string'` check downstream (confirmed real bug:
// simulation-reports.service.ts's extractScenarioStartMs()).
const isoStringTransformer: ValueTransformer = {
  to: (value?: string | null) => value,
  from: (value?: Date | null) => (value ? value.toISOString() : value),
};

@Entity('transcripts')
export class Transcript {
  @PrimaryGeneratedColumn('uuid', { name: 'transcript_id' })
  transcriptId!: string;

  @Index('UQ_transcripts_id_active', { unique: true, where: 'deleted_at IS NULL' })
  @Column({ type: 'varchar', length: 255 })
  id!: string;

  @Index('IDX_transcripts_user_id')
  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId!: string;

  // Raw scenarioId from source, and the join key for `simulation` below.
  // Plain, unconstrained column — no DB-level FK: simulations_v2.id is only
  // backed by a partial unique index (WHERE deleted_at IS NULL), which
  // Postgres cannot target with a FOREIGN KEY constraint.
  @Index('IDX_transcripts_scenario_id')
  @Column({ name: 'scenario_id', type: 'varchar', length: 255, nullable: true })
  scenarioId?: string;

  // Query-time-only relation (no DB constraint backs it). Still satisfies
  // database-entities-rules.md's "paired with an actual TypeORM relation
  // decorator" requirement, and still makes relations: ['simulation'] /
  // leftJoinAndSelect work.
  @ManyToOne(() => SimulationV2, (simulation) => simulation.transcripts, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'scenario_id', referencedColumnName: 'id' })
  simulation?: SimulationV2;

  @Column({ name: 'student_name', type: 'varchar', length: 255, nullable: true })
  studentName?: string;

  @Column({ name: 'student_key', type: 'varchar', length: 255, nullable: true })
  studentKey?: string;

  @Column({ name: 'student_class', type: 'varchar', length: 255, nullable: true })
  studentClass?: string;

  @Column({ name: 'login_session_id', type: 'varchar', length: 255, nullable: true })
  loginSessionId?: string;

  @Column({
    name: 'scenario_type',
    type: 'enum',
    enum: TranscriptScenarioType,
    enumName: 'transcript_scenario_type_enum',
    nullable: true,
  })
  scenarioType?: TranscriptScenarioType;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId?: string;

  @Column({ name: 'scenario_instance_id', type: 'varchar', length: 255, nullable: true })
  scenarioInstanceId?: string;

  // Single jsonb cell holding one JSON array — same pattern as Unit.actions /
  // SimulationV2.grading elsewhere in this codebase. NOT a native Postgres
  // jsonb[] array: TypeORM's `array: true` + `type: 'jsonb'` combination has
  // no precedent anywhere in this repo and is known-unreliable in the
  // TypeORM Postgres driver.
  @Column({ type: 'jsonb', nullable: true })
  messages?: TranscriptMessage[];

  @Index('IDX_transcripts_started_at')
  @Column({ name: 'started_at', type: 'timestamptz', transformer: isoStringTransformer })
  startedAt!: string;

  @Column({
    name: 'ended_at',
    type: 'timestamptz',
    nullable: true,
    transformer: isoStringTransformer,
  })
  endedAt?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Index('IDX_transcripts_deleted_at', { where: 'deleted_at IS NOT NULL' })
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
