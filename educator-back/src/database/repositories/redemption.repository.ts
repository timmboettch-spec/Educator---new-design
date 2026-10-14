import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { Redemption } from 'src/database/entities';

@Injectable()
export class RedemptionRepository {
  constructor(
    @InjectRepository(Redemption)
    private readonly repo: Repository<Redemption>,
  ) {}

  async create(data: DeepPartial<Redemption>): Promise<Redemption> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Redemption> = {}): Promise<Redemption[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Redemption>): Promise<Redemption | null> {
    return this.repo.findOne(options);
  }
}
