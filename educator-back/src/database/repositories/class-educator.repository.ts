import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, Repository } from 'typeorm';
import { ClassEducator } from 'src/database/entities';

@Injectable()
export class ClassEducatorRepository {
  constructor(
    @InjectRepository(ClassEducator)
    private readonly repo: Repository<ClassEducator>,
  ) {}

  async create(data: DeepPartial<ClassEducator>): Promise<ClassEducator> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findOne(options: FindOneOptions<ClassEducator>): Promise<ClassEducator | null> {
    return this.repo.findOne(options);
  }
}
