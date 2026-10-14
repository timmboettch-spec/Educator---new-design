import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { Schools } from './schools.entity';
import { EducatorSchool } from './educator-school.entity';
import { EducatorSeatRequest } from './educator-seat-request.entity';
import { EducatorSimulationPreview } from './educator-simulation-preview.entity';
import { UserRole } from './user-role.entity';
import { DistrictAdmin } from './district-admin.entity';

@Entity('educators')
@Index('idx_educators_school_id', ['school'])
@Index('idx_educators_district_admin_id', ['admin'])
export class Educator {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  full_name!: string | null;

  @ManyToOne(() => Schools, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'school_id' })
  school!: Schools | null;

  /**
   * The District Admin who owns this educator. Named `admin` (not `districtAdmin`) for backend
   * compatibility with call sites that read `educator.admin.<field>` from before this account
   * type was `DistrictAdmin` (see district-admin-plan.md). The legacy `admin_id -> users` FK
   * this superseded is no longer mapped here, but the column itself is deliberately retained in
   * Postgres for backward compatibility with readers that still reference it.
   */
  @Column({ name: 'district_admin_id', type: 'uuid', nullable: true })
  districtAdminId?: string | null;

  @ManyToOne(() => DistrictAdmin, (districtAdmin) => districtAdmin.educators, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'district_admin_id' })
  admin?: DistrictAdmin | null;

  @Column({ name: 'tokens', type: 'json', nullable: true })
  tokens!: number | null;

  @Column({ name: 'allocated_tokens', type: 'json', nullable: true })
  allocated_tokens!: number | null;

  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phone_number!: string | null;

  // @ManyToOne(() => Role, { nullable: true, onDelete: 'SET NULL' })
  // @JoinColumn({ name: 'role_id' })
  // role!: Role | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
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
   * Links to the specific `user_roles` row for this account's Educator role assignment (not
   * directly to `users`) — so a dual-role account's Educator profile is tied to its Educator
   * role specifically, distinct from e.g. its District Admin role. Lifecycle (pending/active/
   * in_active) is tracked on that `user_roles` row's `status`, not on `users.status`.
   */
  @Column({ name: 'user_role_id', type: 'uuid', nullable: true })
  userRoleId?: string | null;

  @OneToOne(() => UserRole, (userRole) => userRole.educator, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'user_role_id' })
  userRole?: UserRole | null;

  /**
   * Multi-school junction records — the source of truth for all school assignments.
   * Loaded only when explicitly requested via `relations: { schoolAssignments: { school: true } }`.
   */
  @OneToMany(() => EducatorSchool, (es) => es.educator, { cascade: false })
  schoolAssignments?: EducatorSchool[];

  @OneToMany(() => EducatorSimulationPreview, (preview) => preview.educator)
  simulationPreviews?: EducatorSimulationPreview[];

  @OneToMany(() => EducatorSeatRequest, (seatRequest) => seatRequest.educator)
  seatRequests?: EducatorSeatRequest[];

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
