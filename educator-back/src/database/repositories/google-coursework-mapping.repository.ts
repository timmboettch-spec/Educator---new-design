import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, Repository } from 'typeorm';
import { GoogleCourseworkMapping } from 'src/database/entities';

@Injectable()
export class GoogleCourseworkMappingRepository {
  constructor(
    @InjectRepository(GoogleCourseworkMapping)
    private readonly repo: Repository<GoogleCourseworkMapping>,
  ) {}

  async create(data: DeepPartial<GoogleCourseworkMapping>): Promise<GoogleCourseworkMapping> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(entity: GoogleCourseworkMapping): Promise<GoogleCourseworkMapping> {
    return this.repo.save(entity);
  }

  async findOne(
    options: FindOneOptions<GoogleCourseworkMapping>,
  ): Promise<GoogleCourseworkMapping | null> {
    return this.repo.findOne(options);
  }

  async findByClassAndSimulation(
    classId: string,
    simulationId: string,
  ): Promise<GoogleCourseworkMapping | null> {
    return this.repo.findOne({ where: { classId, simulationId } });
  }

  async findByClassId(classId: string): Promise<GoogleCourseworkMapping[]> {
    return this.repo.find({ where: { classId } });
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return (result.affected ?? 0) > 0;
  }
}
