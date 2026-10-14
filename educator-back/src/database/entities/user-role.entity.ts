import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Role } from './role.entity';
import { DistrictAdmin } from './district-admin.entity';
import { Educator } from './educator.entity';
import { Student } from './students.entity';
import { CommonStatus } from 'src/common/enums/status.enum';

/** Junction table for the many-to-many relationship between users (v2 accounts) and roles. */
@Entity('user_roles')
export class UserRole {
  @PrimaryGeneratedColumn('uuid', { name: 'user_role_id' })
  userRoleId!: string;

  @Index('idx_user_roles_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('idx_user_roles_role_id')
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt!: Date;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CommonStatus,
    enumName: 'user_role_status_enum',
    default: CommonStatus.PENDING,
  })
  status!: CommonStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @OneToOne(() => DistrictAdmin, (districtAdmin) => districtAdmin.userRole)
  districtAdmin?: DistrictAdmin;

  @OneToOne(() => Educator, (educator) => educator.userRole)
  educator?: Educator;

  @OneToOne(() => Student, (student) => student.userRole)
  student?: Student;
}
