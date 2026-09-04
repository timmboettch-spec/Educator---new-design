import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Class } from 'src/class/entity/class.entity';

@Entity('class_simulations')
@Index('idx_class_simulations_class_active', ['class_id', 'is_active'])
export class ClassSimulation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  class_id!: string;

  @Column({ name: 'simulation_id', type: 'varchar' })
  simulation_id!: string;

  @Column({ name: 'start_date', type: 'varchar', nullable: true })
  start_date?: string;

  @Column({ name: 'due_date', type: 'varchar', nullable: true })
  due_date?: string;

  @Column({ name: 'end_date', type: 'varchar', nullable: true })
  end_date?: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class!: Class;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ name: 'is_ai', type: 'boolean', default: false })
  is_ai!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;
}
