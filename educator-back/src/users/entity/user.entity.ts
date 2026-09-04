import { Role } from 'src/roles/entity/role.entity';
import { Schools } from 'src/schools/entity/schools.entity';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { CommonStatus } from 'src/common/enums/status.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  email!: string;

  @Column({ nullable: true })
  password!: string;

  @Column({
    type: 'enum',
    enum: CommonStatus,
    enumName: 'user_status_enum',
    default: CommonStatus.ACTIVE,
  })
  status!: CommonStatus;

  @Column({ name: 'full_name', nullable: true })
  full_name!: string;

  @Column({ name: 'is_license_active', default: false, nullable: true })
  is_license_active!: boolean;

  @Column({ name: 'subscriptions', type: 'jsonb', nullable: true })
  subscriptions?: object[];

  @Column({ type: 'varchar', nullable: true, default: null })
  profile_picture?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;

  @ManyToOne(() => Role, (role) => role.users, { eager: true, nullable: true })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @OneToMany(() => Schools, (school) => school.user_id)
  schools!: Schools[];
}
