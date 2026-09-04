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
} from 'typeorm';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Student } from 'src/students/entity/students.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { Schools } from 'src/schools/entity/schools.entity';
import { Simulation } from 'src/simulations/entity/simulation.entity';
import { ClassEducator } from './class-educator.entity';

@Entity('classes')
@Index('idx_classes_educator_active', ['educator_id', 'is_active'])
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id?: string;

  @Column({ name: 'lms_class_id', nullable: true })
  lms_class_id?: string;

  @Column({ name: 'lms_class_reference', nullable: true })
  lms_class_reference?: string;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  created_at?: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updated_at?: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @ManyToOne(() => Educator)
  @JoinColumn({ name: 'educator_id' })
  educator?: Educator;

  @ManyToOne(() => Schools, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school?: Schools | null;

  @OneToMany(() => Student, (student) => student.class, { cascade: true })
  students?: Student[];

  @OneToMany(() => Simulation, (simulation) => simulation.class, { cascade: true })
  sims?: Simulation[];

  @OneToMany(() => ClassEducator, (classEducator) => classEducator.class)
  classEducators?: ClassEducator[];
}
