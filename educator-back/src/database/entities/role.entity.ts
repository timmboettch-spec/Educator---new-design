import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './user-role.entity';

@Entity()
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  role_name!: string;

  /**
   * The v2 business identifier (e.g. 'educator', 'district_admin') — nullable/unpopulated for
   * pre-v2 legacy rows that have never been assigned one. Unique where populated; a plain
   * unique index (not partial) since this table has no soft-delete concept.
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  slug?: string | null;

  @OneToMany(() => UserRole, (userRole) => userRole.role)
  userRoles?: UserRole[];

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at!: Date;
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updated_at!: Date;
}
