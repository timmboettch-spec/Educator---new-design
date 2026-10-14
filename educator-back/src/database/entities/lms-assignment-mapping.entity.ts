import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('lms_assignment_mapping')
@Index('idx_lms_assignment_class', ['classId'])
@Index('idx_lms_assignment_resource_link', ['classId', 'lmsResourceLinkId'], { unique: true })
export class LmsAssignmentMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'class_simulation_id', type: 'uuid', nullable: true })
  classSimulationId!: string | null;

  @Index('idx_lms_assignment_simulation')
  @Column({ name: 'simulation_id', type: 'varchar', nullable: true })
  simulationId!: string | null;

  @Column({ name: 'lms_line_item_url', type: 'varchar' })
  lmsLineItemUrl!: string;

  @Column({ name: 'lms_line_item_label', type: 'varchar', nullable: true })
  lmsLineItemLabel!: string | null;

  @Column({ name: 'lms_resource_link_id', type: 'varchar', nullable: true })
  lmsResourceLinkId!: string | null;

  /** Moodle LTI tool client ID from the launch that created the line item. */
  @Column({ name: 'lms_client_id', type: 'varchar', nullable: true })
  lmsClientId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
