import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Check } from 'typeorm';

/**
 * Append-only audit trail for simulation_grading_rubric_items, populated by a DB
 * trigger (see the CreateSimulationChildTables migration) on every UPDATE/DELETE —
 * never written to directly. Lets a report's scoring be explained even after the
 * rubric it was graded against has since changed.
 */
@Entity('simulation_grading_rubric_item_history')
@Check(
  'simulation_grading_rubric_item_history_operation_check',
  `"operation" IN ('UPDATE', 'DELETE')`,
)
export class SimulationGradingRubricItemHistory {
  @PrimaryGeneratedColumn('uuid', { name: 'history_id' })
  historyId!: string;

  // Intentionally not a FK to simulation_grading_rubric_items — must survive
  // the row it describes being deleted.
  @Index('IDX_simulation_grading_rubric_item_history_rubric_item_id')
  @Column({ name: 'rubric_item_id', type: 'uuid' })
  rubricItemId!: string;

  // FK to simulations.simulation_id (the UUID surrogate PK), not the business `id`.
  @Index('IDX_simulation_grading_rubric_item_history_simulation_id')
  @Column({ name: 'simulation_id', type: 'uuid' })
  simulationId!: string;

  @Column({ type: 'jsonb' })
  snapshot!: object;

  @Column({ type: 'text' })
  operation!: string;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy?: string;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt!: Date;
}
