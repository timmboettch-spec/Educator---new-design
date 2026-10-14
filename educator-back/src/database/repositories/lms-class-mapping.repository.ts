import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
import { LmsClassMapping } from 'src/database/entities';

@Injectable()
export class LmsClassMappingRepository {
  constructor(
    @InjectRepository(LmsClassMapping)
    private readonly repo: Repository<LmsClassMapping>,
  ) {}

  async create(data: DeepPartial<LmsClassMapping>): Promise<LmsClassMapping> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findOne(options: FindOneOptions<LmsClassMapping>): Promise<LmsClassMapping | null> {
    return this.repo.findOne(options);
  }

  async findByLmsCourseId(lmsCourseId: string): Promise<LmsClassMapping[]> {
    const normalized = String(lmsCourseId ?? '').trim();
    if (!normalized) {
      return [];
    }
    return this.repo.find({ where: { lmsCourseId: normalized } });
  }

  async delete(
    where: FindOptionsWhere<LmsClassMapping> | FindOptionsWhere<LmsClassMapping>[],
  ): Promise<number> {
    const result = await this.repo.delete(where ?? {});
    return result.affected ?? 0;
  }
}
