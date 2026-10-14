import { Schools } from './schools.entity';
import { UserRole } from './user-role.entity';
import { UserToken } from './user-token.entity';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { CommonStatus } from 'src/common/enums/status.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * The account's business identifier (email, student ID, username, etc.). Nullable for
   * pre-v2 legacy rows; unique only among non-deleted rows (partial index in the migration,
   * not a column-level `unique: true`), so a soft-deleted account's email can be reused.
   */
  @Column({ type: 'varchar', nullable: false })
  email!: string;

  @Column({ nullable: true, select: false })
  password?: string;

  @Column({
    type: 'enum',
    enum: CommonStatus,
    enumName: 'user_status_enum',
    default: CommonStatus.ACTIVE,
  })
  status!: CommonStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => Schools, (school) => school.user_id)
  schools!: Schools[];

  /**
   * All of this account's role assignments — each carrying its own `status`
   * (pending/active/in_active) and, where applicable, its own linked profile
   * (`userRole.educator`/`.student`/`.districtAdmin`). There is no direct
   * `User.educator`/`.student`/`.districtAdmin` relation: those profiles link to a specific
   * `user_roles` row, not to `users` directly, so a dual-role account keeps them distinct.
   */
  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles?: UserRole[];

  @OneToMany(() => UserToken, (userToken) => userToken.user)
  userTokens?: UserToken[];
}
