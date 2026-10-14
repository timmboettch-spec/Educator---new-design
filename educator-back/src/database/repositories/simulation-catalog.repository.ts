import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
import { SimulationCatalog } from 'src/database/entities';

@Injectable()
export class SimulationCatalogRepository {
  constructor(
    @InjectRepository(SimulationCatalog)
    private readonly repo: Repository<SimulationCatalog>,
  ) {}

  async find(options: FindManyOptions<SimulationCatalog> = {}): Promise<SimulationCatalog[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<SimulationCatalog>): Promise<SimulationCatalog | null> {
    return this.repo.findOne(options);
  }

  async delete(
    where: FindOptionsWhere<SimulationCatalog> | FindOptionsWhere<SimulationCatalog>[],
  ): Promise<number> {
    const result = await this.repo.delete(where ?? {});
    return result.affected ?? 0;
  }
}
