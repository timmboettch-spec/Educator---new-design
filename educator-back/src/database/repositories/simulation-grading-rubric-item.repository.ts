import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { SimulationGradingRubricItem } from 'src/database/entities';

@Injectable()
export class SimulationGradingRubricItemRepository {
  constructor(
    @InjectRepository(SimulationGradingRubricItem)
    private readonly repo: Repository<SimulationGradingRubricItem>,
  ) {}

  async create(data: DeepPartial<SimulationGradingRubricItem>): Promise<SimulationGradingRubricItem> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(
    options: FindManyOptions<SimulationGradingRubricItem> = {},
  ): Promise<SimulationGradingRubricItem[]> {
    return this.repo.find(options);
  }

  async findOne(
    options: FindOneOptions<SimulationGradingRubricItem>,
  ): Promise<SimulationGradingRubricItem | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(
    options: FindManyOptions<SimulationGradingRubricItem> = {},
  ): Promise<[SimulationGradingRubricItem[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<SimulationGradingRubricItem> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<SimulationGradingRubricItem>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(rubricId: string): Promise<SimulationGradingRubricItem | null> {
    return this.repo.findOne({ where: { rubricId } });
  }

  /** Lookup by the original business identifier from source JSON, not the surrogate rubricId. */
  async findByBusinessId(id: string): Promise<SimulationGradingRubricItem | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** All rubric items for a simulation (by its surrogate simulationId). */
  async findBySimulationId(simulationId: string): Promise<SimulationGradingRubricItem[]> {
    return this.repo.find({ where: { simulationId } });
  }

  /** For cross-simulation rubric analytics, e.g. "average weight for PPE across every simulation". */
  async findBySubCategory(subCategory: string): Promise<SimulationGradingRubricItem[]> {
    return this.repo.find({ where: { subCategory } });
  }

  async updateById(
    rubricId: string,
    data: DeepPartial<SimulationGradingRubricItem>,
  ): Promise<SimulationGradingRubricItem | null> {
    await this.repo.update({ rubricId }, data);
    return this.findById(rubricId);
  }

  async update(
    where: FindOptionsWhere<SimulationGradingRubricItem>,
    data: DeepPartial<SimulationGradingRubricItem>,
  ): Promise<void> {
    await this.repo.update(where, data);
  }

  /** Triggers the history snapshot (see the CreateSimulationChildTables migration trigger). */
  async delete(rubricId: string): Promise<void> {
    await this.repo.delete({ rubricId });
  }
}
