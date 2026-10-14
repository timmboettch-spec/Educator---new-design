import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { SimulationAction } from 'src/database/entities';

@Injectable()
export class SimulationActionRepository {
  constructor(
    @InjectRepository(SimulationAction)
    private readonly repo: Repository<SimulationAction>,
  ) { }

  async create(data: DeepPartial<SimulationAction>): Promise<SimulationAction> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<SimulationAction> = {}): Promise<SimulationAction[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<SimulationAction>): Promise<SimulationAction | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(
    options: FindManyOptions<SimulationAction> = {},
  ): Promise<[SimulationAction[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<SimulationAction> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<SimulationAction>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(actionId: string): Promise<SimulationAction | null> {
    return this.repo.findOne({ where: { actionId } });
  }

  /** Lookup by the original business identifier from source JSON, not the surrogate actionId. */
  async findByBusinessId(id: string): Promise<SimulationAction | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** All actions for a simulation (by its surrogate simulationId), in authored order. */
  async findBySimulationId(simulationId: string): Promise<SimulationAction[]> {
    return this.repo.find({ where: { simulationId }, order: { order: 'ASC' } });
  }

  async updateById(
    actionId: string,
    data: DeepPartial<SimulationAction>,
  ): Promise<SimulationAction | null> {
    await this.repo.update({ actionId }, data);
    return this.findById(actionId);
  }

  async update(
    where: FindOptionsWhere<SimulationAction>,
    data: DeepPartial<SimulationAction>,
  ): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(actionId: string): Promise<void> {
    await this.repo.delete({ actionId });
  }
}
