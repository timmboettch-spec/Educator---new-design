import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { SimulationV2 } from './simulation-v2.entity';
import { SimulationOrderLinkedAction } from './simulation-order-linked-action.entity';

@Entity('simulation_orders')
@Index('IDX_simulation_orders_simulation_category_status', [
  'simulationId',
  'category',
  'orderStatus',
])
@Index('simulation_orders_id_simulation_id_unique', ['id', 'simulationId'], { unique: true })
export class SimulationOrder {
  @PrimaryGeneratedColumn('uuid', { name: 'order_id' })
  orderId!: string;

  // Business identifier from the source scenario JSON — no longer the primary
  // key (see orderId above), unique per simulation only (see the
  // simulation_orders_id_simulation_id_unique index in CreateSimulationV2Schema).
  @Column({ type: 'text' })
  id!: string;

  @Index('IDX_simulation_orders_simulation_id')
  @Column({ name: 'simulation_id', type: 'uuid' })
  simulationId!: string;

  @ManyToOne(() => SimulationV2, (simulation) => simulation.orders, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'simulation_id',
    foreignKeyConstraintName: 'FK_simulation_orders_simulation',
  })
  simulation?: SimulationV2;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  category!: string;

  @Column({ type: 'text' })
  priority!: string;

  @Column({ name: 'order_status', type: 'text' })
  orderStatus!: string;

  // Source data carries 4 distinct scheduling fields with different semantics —
  // kept separate rather than collapsed into one date, since expirationOffset is
  // a RELATIVE offset (e.g. "T + 15"), not an absolute date.
  @Column({ name: 'start_day', type: 'text', nullable: true })
  startDay?: string;

  @Column({ name: 'due_time', type: 'text', nullable: true })
  dueTime?: string;

  @Column({ name: 'expiration_offset', type: 'text', nullable: true })
  expirationOffset?: string;

  @Column({ name: 'due_date', type: 'text', nullable: true })
  dueDate?: string;

  @Column({ name: 'medication_config', type: 'jsonb', nullable: true })
  medicationConfig?: object;

  @Column({ name: 'scenario_id', type: 'text', nullable: true })
  scenarioId?: string;

  @Column({ name: 'system_visibility', type: 'text', nullable: true })
  systemVisibility?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column({ name: 'linked_action_ids', type: 'jsonb', nullable: true })
  linkedActionIds?: string[];

  @Column({ name: 'linked_actions', type: 'jsonb', nullable: true })
  linkedActionsDetail?: Array<{ id: string; title: string }>;

  @Column({ name: 'unlock_conditions', type: 'jsonb', nullable: true })
  unlockConditions?: object;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => SimulationOrderLinkedAction, (order) => order.simulationOrder, {
    cascade: ['insert', 'update'],
    orphanedRowAction: 'delete',
  })
  linkedActions?: SimulationOrderLinkedAction[];
}
