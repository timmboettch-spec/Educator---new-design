import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { UserRole } from './user-role.entity';
import { Educator } from './educator.entity';
import { EducatorSeatRequest } from './educator-seat-request.entity';

/**
 * 1:1 extension of a specific `user_roles` row (the account's District Admin role
 * assignment). Has its own generated `districtAdminId` PK (`AddDistrictAdminIdPrimaryKey`
 * migration) — `userRoleId` is now a plain (still-unique) FK column, not the PK.
 * `DistrictAdminRepository.findByUserRoleId`/`updateByUserRoleId` intentionally still key off
 * `userRoleId`, since every existing caller already has a `UserRole`'s id in hand, not a
 * `DistrictAdmin`'s. Lifecycle (pending/active/in_active) is tracked on that `user_roles` row's
 * `status`, not here and not on `users.status`.
 */
@Entity('district_admins')
export class DistrictAdmin {
  @PrimaryGeneratedColumn('uuid', { name: 'district_admin_id' })
  districtAdminId!: string;

  @Column({ name: 'user_role_id', type: 'uuid' })
  userRoleId!: string;

  @OneToOne(() => UserRole, (userRole) => userRole.districtAdmin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_role_id' })
  userRole?: UserRole;

  @Column({ name: 'full_name', type: 'varchar', nullable: true })
  fullName?: string;

  @Column({ name: 'is_license_active', type: 'boolean', default: false, nullable: true })
  isLicenseActive?: boolean;

  @Column({ name: 'subscriptions', type: 'jsonb', nullable: true })
  subscriptions?: object[];

  @Column({ name: 'profile_picture', type: 'varchar', nullable: true })
  profilePicture?: string | null;

  @OneToMany(() => Educator, (educator) => educator.admin)
  educators?: Educator[];

  @OneToMany(() => EducatorSeatRequest, (seatRequest) => seatRequest.districtAdmin)
  seatRequests?: EducatorSeatRequest[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
