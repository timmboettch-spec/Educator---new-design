import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { LmsAssignmentMapping } from 'src/database/entities';

@Injectable()
export class LmsAssignmentMappingRepository {
  constructor(
    @InjectRepository(LmsAssignmentMapping)
    private readonly repo: Repository<LmsAssignmentMapping>,
  ) {}

  create(data: DeepPartial<LmsAssignmentMapping>): LmsAssignmentMapping {
    return this.repo.create(data);
  }

  async save(entity: LmsAssignmentMapping): Promise<LmsAssignmentMapping> {
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<LmsAssignmentMapping> = {}): Promise<LmsAssignmentMapping[]> {
    return this.repo.find(options);
  }

  async findOne(
    options: FindOneOptions<LmsAssignmentMapping>,
  ): Promise<LmsAssignmentMapping | null> {
    return this.repo.findOne(options);
  }
}
