import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('lms_student_mapping')
@Index(['classId', 'studentCode'], { unique: true })
@Index(['classId', 'lmsUserId'], { unique: true })
export class LmsStudentMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'lms_user_id', type: 'varchar' })
  lmsUserId!: string;

  @Column({ name: 'student_code', type: 'varchar' })
  studentCode!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
