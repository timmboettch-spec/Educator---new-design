import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { UnitCategory } from 'src/common/constants';

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid', { name: 'unit_id' })
  unitId!: string;

  @Index('UQ_units_id_active', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 255 })
  id!: string;

  @Index('UQ_units_name_active', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'image_url', type: 'varchar', length: 2048, nullable: true })
  imageUrl?: string;

  @Column({ type: 'enum', enum: UnitCategory, enumName: 'unit_category_enum', nullable: true })
  category?: UnitCategory;

  @Column({ name: 'action_group_name', type: 'varchar', length: 255, nullable: true })
  actionGroupName?: string;

  @Column({ name: 'action_group_description', type: 'text', nullable: true })
  actionGroupDescription?: string;

  @Column({ type: 'jsonb', nullable: true })
  actions?: object;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Index('IDX_units_deleted_at', { where: 'deleted_at IS NOT NULL' })
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
