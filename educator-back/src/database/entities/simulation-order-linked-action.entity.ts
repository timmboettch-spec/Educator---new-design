import { Entity, JoinColumn, ManyToOne, PrimaryColumn, Index } from 'typeorm';
import { SimulationOrder } from './simulation-order.entity';
import { SimulationAction } from './simulation-action.entity';

@Entity('simulation_order_linked_actions')
export class SimulationOrderLinkedAction {
  @PrimaryColumn({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Index('IDX_simulation_order_linked_actions_action_id')
  @PrimaryColumn({ name: 'action_id', type: 'uuid' })
  actionId!: string;

  @ManyToOne(() => SimulationOrder, (simulation) => simulation.linkedActions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'FK_simulation_order_linked_actions_order',
  })
  simulationOrder?: SimulationOrder;

  @ManyToOne(() => SimulationAction, (simulation) => simulation.linkedOrders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'action_id',
    foreignKeyConstraintName: 'FK_simulation_order_linked_actions_action',
  })
  simulationAction?: SimulationAction;
}
