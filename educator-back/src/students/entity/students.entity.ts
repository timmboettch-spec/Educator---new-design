import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Class } from '../../class/entity/class.entity';
import { Educator } from '../../educators/entity/educator.entity';
import { Schools } from '../../schools/entity/schools.entity';

@Entity('students')
@Index('idx_students_educator_active', ['educator_id', 'is_active'])
@Index('idx_students_class_id', ['class_id'])
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id?: string;

  @Column()
  student_id?: string;

  /** LMS roster data, enriched at read time; not persisted in the students table. */
  student_name?: string;

  /** LMS roster data, enriched at read time; not persisted in the students table. */
  email?: string;

  @Column({
    type: 'enum',
    enum: CommonStatus,
    default: CommonStatus.ACTIVE,
  })
  status?: CommonStatus;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class?: Class;

  @Column({ name: 'class_id', nullable: true })
  class_id?: string;

  @ManyToOne(() => Educator, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'educator_id' })
  educator?: Educator;

  @ManyToOne(() => Schools, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school?: Schools | null;
  @Index('idx_students_educator_id')
  @Column({ name: 'educator_id', nullable: true })
  educator_id?: string;

  @Column({ nullable: true })
  submission_date?: string;

  @Column({ nullable: true })
  sims_completed?: string;

  @Column({ nullable: true })
  time_spent?: string;

  @Column({ nullable: true })
  time_remaining?: string;

  @Column({ type: 'int', default: 0 })
  attempt?: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score?: number;

  @CreateDateColumn()
  created_at?: Date;

  @UpdateDateColumn()
  updated_at?: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;
}
