import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { lmsSecretTransformer } from '../utils/lms-secret-crypto';

@Entity('lms_class_mapping')
@Index(['classId'], { unique: true })
@Index(['schoolId', 'lmsCourseId'], { unique: true })
export class LmsClassMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'lms_course_id', type: 'varchar' })
  lmsCourseId!: string;

  @Column({ name: 'lms_context_id', type: 'varchar', nullable: true })
  lmsContextId!: string | null;

  @Column({ name: 'nrps_url', type: 'varchar' })
  nrpsUrl!: string;

  @Column({ name: 'lms_base_url', type: 'varchar', nullable: true })
  lmsBaseUrl!: string | null;

  @Column({
    name: 'lms_api_token',
    type: 'varchar',
    nullable: true,
    transformer: lmsSecretTransformer,
  })
  lmsApiToken!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
