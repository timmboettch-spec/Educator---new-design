import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('educator_simulations')
export class EducatorSimulation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'educator_id', type: 'uuid' })
  educator_id!: string;

  @Column({ name: 'unit_id', type: 'varchar' })
  unit_id!: string;

  @Column({ name: 'scenario_id', type: 'varchar' })
  scenario_id!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true, default: null })
  deleted_at!: Date | null;
}
