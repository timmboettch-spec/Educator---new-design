import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, Repository } from 'typeorm';
import { GoogleCourseMapping } from 'src/database/entities';

@Injectable()
export class GoogleCourseMappingRepository {
  constructor(
    @InjectRepository(GoogleCourseMapping)
    private readonly repo: Repository<GoogleCourseMapping>,
  ) {}

  async create(data: DeepPartial<GoogleCourseMapping>): Promise<GoogleCourseMapping> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(entity: GoogleCourseMapping): Promise<GoogleCourseMapping> {
    return this.repo.save(entity);
  }

  async findOne(
    options: FindOneOptions<GoogleCourseMapping>,
  ): Promise<GoogleCourseMapping | null> {
    return this.repo.findOne(options);
  }

  async findBySchoolId(schoolId: string): Promise<GoogleCourseMapping[]> {
    return this.repo.find({
      where: { schoolId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findByClassId(classId: string): Promise<GoogleCourseMapping | null> {
    return this.repo.findOne({ where: { classId } });
  }

  async findBySchoolAndGoogleCourseId(
    schoolId: string,
    googleCourseId: string,
  ): Promise<GoogleCourseMapping | null> {
    return this.repo.findOne({ where: { schoolId, googleCourseId } });
  }

  async findByGoogleCourseId(googleCourseId: string): Promise<GoogleCourseMapping | null> {
    const trimmed = googleCourseId.trim();
    if (!trimmed) {
      return null;
    }
    return this.repo.findOne({
      where: { googleCourseId: trimmed },
      order: { updatedAt: 'DESC' },
    });
  }

  async deleteByIdAndSchoolId(id: string, schoolId: string): Promise<boolean> {
    const result = await this.repo.delete({ id, schoolId });
    return (result.affected ?? 0) > 0;
  }

  async deleteBySchoolAndGoogleCourseId(
    schoolId: string,
    googleCourseId: string,
  ): Promise<boolean> {
    const result = await this.repo.delete({ schoolId, googleCourseId });
    return (result.affected ?? 0) > 0;
  }

  async deleteByClassId(classId: string): Promise<number> {
    const result = await this.repo.delete({ classId });
    return result.affected ?? 0;
  }
}
