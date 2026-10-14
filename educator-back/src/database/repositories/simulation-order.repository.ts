import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { SimulationOrder } from 'src/database/entities';

@Injectable()
export class SimulationOrderRepository {
  constructor(
    @InjectRepository(SimulationOrder)
    private readonly repo: Repository<SimulationOrder>,
  ) { }

  async create(data: DeepPartial<SimulationOrder>): Promise<SimulationOrder> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<SimulationOrder> = {}): Promise<SimulationOrder[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<SimulationOrder>): Promise<SimulationOrder | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(
    options: FindManyOptions<SimulationOrder> = {},
  ): Promise<[SimulationOrder[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<SimulationOrder> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<SimulationOrder>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(orderId: string): Promise<SimulationOrder | null> {
    return this.repo.findOne({ where: { orderId } });
  }

  /** Lookup by the original business identifier from source JSON, not the surrogate orderId. */
  async findByBusinessId(id: string): Promise<SimulationOrder | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** All orders for a simulation (by its surrogate simulationId). */
  async findBySimulationId(simulationId: string): Promise<SimulationOrder[]> {
    return this.repo.find({ where: { simulationId } });
  }

  async updateById(
    orderId: string,
    data: DeepPartial<SimulationOrder>,
  ): Promise<SimulationOrder | null> {
    await this.repo.update({ orderId }, data);
    return this.findById(orderId);
  }

  async update(
    where: FindOptionsWhere<SimulationOrder>,
    data: DeepPartial<SimulationOrder>,
  ): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(orderId: string): Promise<void> {
    await this.repo.delete({ orderId });
  }
}
