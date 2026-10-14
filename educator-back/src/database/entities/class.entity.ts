import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Student } from './students.entity';
import { Educator } from './educator.entity';
import { Schools } from './schools.entity';
import { Simulation } from './simulation.entity';
import { ClassEducator } from './class-educator.entity';

@Entity('classes')
@Index('idx_classes_educator_active', ['educator_id', 'is_active'])
@Index('idx_classes_status_end_date', ['status', 'end_date'])
@Index('idx_classes_school_id', ['school_id'])
@Index('idx_classes_school_google_course_id', ['school_id', 'google_course_id'], {
  unique: true,
  where: '"google_course_id" IS NOT NULL',
})
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id?: string;

  @Column({ name: 'lms_class_id', nullable: true })
  lms_class_id?: string;

  @Column({ name: 'lms_class_reference', nullable: true })
  lms_class_reference?: string;

  /**
   * Where the class was created: `manual` (UI) or `google_classroom` (provisioned).
   * Provisioning in GoogleCourseMappingService.createGoogleClassroomClass always sets
   * origin to `google_classroom` (not the column default).
   */
  @Column({ name: 'origin', type: 'varchar', default: 'manual' })
  origin?: string;

  /**
   * Google Classroom course id when linked/provisioned (kept after unlink for relink).
   * Partial unique index idx_classes_school_google_course_id enforces at most one
   * non-null google_course_id per school — intentional so two classes cannot link
   * to the same Google course. Manual classes leave this NULL.
   */
  @Column({ name: 'google_course_id', type: 'varchar', nullable: true })
  google_course_id?: string | null;

  @Column({ name: 'class_name', nullable: false })
  class_name?: string;

  @Column({ name: 'educator_id', nullable: true })
  educator_id?: string;

  @Column({ name: 'school_id', nullable: true })
  school_id?: string;

  @Column({ name: 'term', nullable: true })
  term?: string;

  @Column({ name: 'year', nullable: true })
  year?: string;

  @Column({
    type: 'enum',
    enum: CommonStatus,
    default: CommonStatus.ACTIVE,
  })
  status?: CommonStatus;

  @Column({
    type: 'int',
    name: 'total_no_of_students',
    default: 0,
  })
  total_no_of_students?: number;

  @Column({ type: 'date', name: 'start_date', nullable: false })
  start_date?: string;

  @Column({ type: 'date', name: 'end_date', nullable: false })
  end_date?: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  created_at?: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
  })
  updated_at?: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @ManyToOne(() => Educator, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'educator_id', foreignKeyConstraintName: 'FK_50f10fd8c6572193ab156f4ae26' })
  educator?: Educator;

  @ManyToOne(() => Schools, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id', foreignKeyConstraintName: 'FK_classes_school' })
  school?: Schools | null;

  @OneToMany(() => Student, (student) => student.class, { cascade: true })
  students?: Student[];

  @OneToMany(() => Simulation, (simulation) => simulation.class, { cascade: true })
  sims?: Simulation[];

  @OneToMany(() => ClassEducator, (classEducator) => classEducator.class)
  classEducators?: ClassEducator[];
}
