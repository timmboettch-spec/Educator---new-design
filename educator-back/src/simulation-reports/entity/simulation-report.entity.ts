import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity('simulation_reports')
@Unique(['student_id', 'scenario_id'])
export class SimulationReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_simulation_reports_student_id')
  @Column({ name: 'student_id', type: 'uuid' })
  student_id!: string;

  @Column({ name: 'student_name', type: 'varchar' })
  student_name!: string;

  @Column({ name: 'scenario_id', type: 'varchar' })
  scenario_id!: string;

  @Column({ name: 'report_data', type: 'jsonb' })
  report_data!: object;

  @Column({ name: 'viewed_at', type: 'timestamp with time zone', nullable: true, default: null })
  viewed_at!: Date | null;

  @Column({ name: 'viewed_by', type: 'uuid', nullable: true, default: null })
  viewed_by!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;
}
