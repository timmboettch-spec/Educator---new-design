import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('google_course_mappings')
@Index('idx_google_course_mappings_class_id', ['classId'], { unique: true })
@Index('idx_google_course_mappings_school_course', ['schoolId', 'googleCourseId'], { unique: true })
@Index('idx_google_course_mappings_school_id', ['schoolId'])
export class GoogleCourseMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'google_course_id', type: 'varchar' })
  googleCourseId!: string;

  @Column({ name: 'google_course_name', type: 'varchar', nullable: true })
  googleCourseName!: string | null;

  @Column({ name: 'linked_by_educator_id', type: 'uuid', nullable: true })
  linkedByEducatorId!: string | null;

  @Column({ name: 'last_roster_synced_at', type: 'timestamptz', nullable: true })
  lastRosterSyncedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
