import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindManyOptions, FindOneOptions, InsertResult, Repository } from 'typeorm';
import { EducatorSchool } from 'src/database/entities';

@Injectable()
export class EducatorSchoolRepository {
  constructor(
    @InjectRepository(EducatorSchool)
    private readonly repo: Repository<EducatorSchool>,
  ) {}

  async create(data: DeepPartial<EducatorSchool>): Promise<EducatorSchool> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findOne(options: FindOneOptions<EducatorSchool>): Promise<EducatorSchool | null> {
    return this.repo.findOne(options);
  }

  async isEducatorAssignedToSchool(educatorId: string, schoolId: string): Promise<boolean> {
    return this.repo.exists({
      where: { educator: { id: educatorId }, school: { id: schoolId } },
    });
  }

  async count(options: FindManyOptions<EducatorSchool> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async upsert(
    data: DeepPartial<EducatorSchool>[],
    conflictPaths: string[],
  ): Promise<InsertResult> {
    return this.repo.upsert(data, {
      conflictPaths,
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
