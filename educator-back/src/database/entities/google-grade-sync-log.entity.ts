import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { GoogleCourseworkMapping } from './google-coursework-mapping.entity';
import { Student } from './students.entity';

@Entity('google_grade_sync_log')
@Index('IDX_google_grade_sync_log_coursework_mapping_id', ['courseworkMappingId'])
@Index('IDX_google_grade_sync_log_student_id', ['studentId'])
@Index('IDX_google_grade_sync_log_status_attempted_at', ['status', 'attemptedAt'])
@Index('UQ_google_grade_sync_log_pending', ['courseworkMappingId', 'studentId'], {
  unique: true,
  where: `"status" = 'pending'`,
})
export class GoogleGradeSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'coursework_mapping_id', type: 'uuid' })
  courseworkMappingId!: string;

  @ManyToOne(() => GoogleCourseworkMapping, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'coursework_mapping_id',
    foreignKeyConstraintName: 'FK_google_grade_sync_log_coursework_mapping',
  })
  courseworkMapping?: GoogleCourseworkMapping;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id', foreignKeyConstraintName: 'FK_google_grade_sync_log_student' })
  student?: Student;

  @Column({ name: 'google_user_id', type: 'varchar' })
  googleUserId!: string;

  @Column({ name: 'score_given', type: 'numeric' })
  scoreGiven!: number;

  @Column({ name: 'score_maximum', type: 'numeric' })
  scoreMaximum!: number;

  @Column({ name: 'status', type: 'varchar' })
  status!: 'pending' | 'sent' | 'failed';

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
