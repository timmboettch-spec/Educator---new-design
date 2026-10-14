import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { Educator } from './educator.entity';
import { Schools } from './schools.entity';

/**
 * Junction table for the many-to-many relationship between educators and schools.
 * An educator may belong to one or more schools; each row represents one assignment.
 * The `is_primary` flag identifies the school that is used as the default context
 * for LMS provisioning and backward-compatible single-school APIs.
 */
@Entity('educator_schools')
@Unique('UQ_educator_schools_pair', ['educator', 'school'])
export class EducatorSchool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_educator_schools_educator_id')
  @ManyToOne(() => Educator, (educator) => educator.schoolAssignments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'educator_id', foreignKeyConstraintName: 'FK_educator_schools_educator' })
  educator!: Educator;

  @Index('idx_educator_schools_school_id')
  @ManyToOne(() => Schools, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id', foreignKeyConstraintName: 'FK_educator_schools_school' })
  school!: Schools;

  /**
   * True for the school that acts as the educator's primary school.
   * Used by LMS provisioning and backward-compatible `educator.school` FK lookups.
   */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  is_primary!: boolean;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  assigned_at!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;
}
