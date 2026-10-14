import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { Schools } from 'src/database/entities';

@Injectable()
export class SchoolsRepository {
  constructor(
    @InjectRepository(Schools)
    private readonly repo: Repository<Schools>,
  ) {}

  async create(data: DeepPartial<Schools>): Promise<Schools> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Schools> = {}): Promise<Schools[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Schools>): Promise<Schools | null> {
    return this.repo.findOne(options);
  }

  async findAllForAdmin(userId: string, status?: string): Promise<Schools[]> {
    const queryBuilder = this.repo
      .createQueryBuilder('school')
      .where('school.user_id = :userId', { userId })
      .andWhere('school.deleted_at IS NULL');

    if (status && status !== 'all') {
      const isActive = status === 'active';
      queryBuilder.andWhere('school.is_active = :isActive', { isActive });
    }

    return queryBuilder.orderBy('school.created_at', 'DESC').getMany();
  }

  async count(options: FindManyOptions<Schools> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async update(id: string, data: DeepPartial<Schools>): Promise<number> {
    const result = await this.repo.update(id, data);
    return result.affected ?? 0;
  }
}
