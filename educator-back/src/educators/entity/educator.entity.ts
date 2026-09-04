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
import { Schools } from '../../schools/entity/schools.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Role } from '../../roles/entity/role.entity';
import { EducatorSchool } from './educator-school.entity';

@Entity('educators')
export class Educator {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  password!: string | null;

  @Column({ type: 'varchar', nullable: true })
  full_name!: string | null;

  @Column({
    type: 'enum',
    enum: CommonStatus,
    enumName: 'user_status_enum',
    default: CommonStatus.ACTIVE,
  })
  status!: CommonStatus;

  @ManyToOne(() => Schools, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'school_id' })
  school!: Schools | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'admin_id' })
  admin!: User | null;

  @Column({ name: 'tokens', type: 'json', nullable: true })
  tokens!: number | null;

  @Column({ name: 'allocated_tokens', type: 'json', nullable: true })
  allocated_tokens!: number | null;

  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phone_number!: string | null;

  @ManyToOne(() => Role, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  role!: Role | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  profile_picture?: string;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  token_invalidated_at!: Date | null;

  @Column({ name: 'lms_enabled', type: 'boolean', default: false })
  lms_enabled!: boolean;

  /**
   * Multi-school junction records — the source of truth for all school assignments.
   * Loaded only when explicitly requested via `relations: { schoolAssignments: { school: true } }`.
   */
  @OneToMany(() => EducatorSchool, (es) => es.educator, { cascade: false })
  schoolAssignments?: EducatorSchool[];

  /**
   * Convenience getter: returns all Schools this educator is assigned to.
   * Requires `schoolAssignments` (with nested `school`) to be eagerly loaded.
   */
  get schools(): Schools[] {
    return this.schoolAssignments?.map((sa) => sa.school).filter(Boolean) ?? [];
  }

  /**
   * Returns the primary school for this educator.
   * Resolution order:
   *  1. The junction row flagged `is_primary = true`.
   *  2. The first junction row (when no primary is flagged).
   *  3. The legacy `school` FK (backward compatibility).
   *  4. `null` when no school is assigned.
   */
  get primarySchool(): Schools | null {
    if (this.schoolAssignments?.length) {
      const primary = this.schoolAssignments.find((sa) => sa.is_primary);
      return primary?.school ?? this.schoolAssignments[0]?.school ?? null;
    }
    return this.school ?? null;
  }
}
