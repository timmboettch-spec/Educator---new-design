import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { EducatorSchool } from './educator-school.entity';

@Entity('schools')
@Index('idx_schools_user_id', ['user_id'])
export class Schools {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_name' })
  school_name!: string;

  @Column({
    type: 'enum',
    enum: CommonStatus,
    default: CommonStatus.ACTIVE,
  })
  status!: CommonStatus;
  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  created_at!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
  })
  updated_at!: Date;

  @Column({ name: 'lms_enabled', type: 'boolean', default: false })
  lms_enabled!: boolean;

  /**
   * When false, educators at this school cannot use Google Classroom UI/APIs.
   * Migration default true for existing schools; new schools default false (opt-in).
   */
  @Column({ name: 'google_classroom_enabled', type: 'boolean', default: false })
  google_classroom_enabled!: boolean;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user_id!: User;

  /**
   * All educator-school assignment records for this school.
   * Loaded only when explicitly requested.
   */
  @OneToMany(() => EducatorSchool, (es) => es.school, { cascade: false })
  educatorAssignments?: EducatorSchool[];
}
