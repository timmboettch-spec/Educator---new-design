import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, Repository } from 'typeorm';
import { Simulation } from 'src/database/entities';

@Injectable()
export class SimulationRepository {
  constructor(
    @InjectRepository(Simulation)
    private readonly repo: Repository<Simulation>,
  ) {}

  async create(data: DeepPartial<Simulation>): Promise<Simulation> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: DeepPartial<Simulation>): Promise<void> {
    await this.repo.update({ id }, data);
  }

  async findOne(options: FindOneOptions<Simulation>): Promise<Simulation | null> {
    return this.repo.findOne(options);
  }
}
