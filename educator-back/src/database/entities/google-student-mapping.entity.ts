import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { Schools } from './schools.entity';
import { Class } from './class.entity';
import { Student } from './students.entity';

@Entity('google_student_mappings')
@Index('idx_google_student_mappings_student_id', ['studentId'])
@Index('idx_google_student_mappings_class_google_user', ['classId', 'googleUserId'], {
  unique: true,
})
@Index('idx_google_student_mappings_school_course', ['schoolId', 'googleCourseId'])
export class GoogleStudentMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @ManyToOne(() => Schools, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id', foreignKeyConstraintName: 'FK_google_student_mappings_school' })
  school?: Schools;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id', foreignKeyConstraintName: 'FK_google_student_mappings_class' })
  class?: Class;

  @Column({ name: 'google_course_id', type: 'varchar' })
  googleCourseId!: string;

  @Column({ name: 'google_user_id', type: 'varchar' })
  googleUserId!: string;

  @Column({ name: 'google_email', type: 'varchar', nullable: true })
  googleEmail!: string | null;

  @Column({ name: 'google_name', type: 'varchar', nullable: true })
  googleName!: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'student_id',
    foreignKeyConstraintName: 'FK_google_student_mappings_student',
  })
  student?: Student;

  @Column({ name: 'student_code', type: 'varchar' })
  studentCode!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
