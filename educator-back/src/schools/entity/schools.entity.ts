import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entity/user.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { EducatorSchool } from '../../educators/entity/educator-school.entity';

@Entity('schools')
export class Schools {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_name' })
  school_name!: string;

  @Column({
    type: 'enum',
    enum: CommonStatus,
    enumName: 'schools_status_enum',
    default: CommonStatus.ACTIVE,
  })
  status!: CommonStatus;
  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updated_at!: Date;

  @Column({ name: 'lms_enabled', type: 'boolean', default: false })
  lms_enabled!: boolean;

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
