import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('google_coursework_mappings')
@Index('idx_google_coursework_mappings_class_sim', ['classId', 'simulationId'], { unique: true })
@Index('idx_google_coursework_mappings_class_simulation_id', ['classSimulationId'])
@Index('idx_google_coursework_mappings_school_id', ['schoolId'])
export class GoogleCourseworkMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'class_simulation_id', type: 'uuid', nullable: true })
  classSimulationId!: string | null;

  @Column({ name: 'simulation_id', type: 'varchar' })
  simulationId!: string;

  @Column({ name: 'google_course_id', type: 'varchar' })
  googleCourseId!: string;

  @Column({ name: 'google_coursework_id', type: 'varchar' })
  googleCourseworkId!: string;

  @Column({ name: 'title', type: 'varchar', nullable: true })
  title!: string | null;

  @Column({ name: 'alternate_link', type: 'varchar', nullable: true })
  alternateLink!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
