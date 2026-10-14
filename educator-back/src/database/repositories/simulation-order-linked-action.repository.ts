import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SimulationOrderLinkedAction } from 'src/database/entities';

@Injectable()
export class SimulationOrderLinkedActionRepository {
  constructor(
    @InjectRepository(SimulationOrderLinkedAction)
    private readonly repo: Repository<SimulationOrderLinkedAction>,
  ) {}

  /** Bulk lookup across many orders at once — avoids N+1 when assembling a whole list of scenarios. */
  async findByOrderIds(orderIds: string[]): Promise<SimulationOrderLinkedAction[]> {
    if (orderIds.length === 0) return [];
    return this.repo.find({ where: { orderId: In(orderIds) } });
  }

  async linkActions(orderId: string, actionIds: string[]): Promise<void> {
    if (actionIds.length === 0) return;
    await this.repo.upsert(
      actionIds.map((actionId) => ({ orderId, actionId })),
      { conflictPaths: ['orderId', 'actionId'] },
    );
  }

  async findActionIdsByOrderId(orderId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { orderId } });
    return rows.map((r) => r.actionId);
  }

  async replaceLinksForOrder(orderId: string, actionIds: string[]): Promise<void> {
    await this.repo.delete({ orderId });
    await this.linkActions(orderId, actionIds);
  }

  async deleteByOrderId(orderId: string): Promise<void> {
    await this.repo.delete({ orderId });
  }
}
