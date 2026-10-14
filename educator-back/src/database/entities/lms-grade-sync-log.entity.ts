import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { LmsAssignmentMapping } from './lms-assignment-mapping.entity';

@Entity('lms_grade_sync_log')
@Index('idx_lms_grade_sync_mapping', ['mappingId'])
@Index('idx_lms_grade_sync_student', ['studentId'])
@Index('idx_lms_grade_sync_status', ['status', 'attemptedAt'])
export class LmsGradeSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'mapping_id', type: 'uuid' })
  mappingId!: string;

  @ManyToOne(() => LmsAssignmentMapping, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mapping_id', foreignKeyConstraintName: 'fk_lms_grade_sync_log_mapping' })
  mapping?: LmsAssignmentMapping;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'lms_user_id', type: 'varchar' })
  lmsUserId!: string;

  @Column({ name: 'score_given', type: 'numeric' })
  scoreGiven!: number;

  @Column({ name: 'score_maximum', type: 'numeric' })
  scoreMaximum!: number;

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: 'pending' | 'sent' | 'failed';

  /** Blob report id (reports/{id}.json) posted with this grade sync, for LMS submission review. */
  @Column({ name: 'report_blob_id', type: 'varchar', nullable: true })
  reportBlobId!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({
    name: 'attempted_at',
    type: 'timestamptz',
  })
  attemptedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
