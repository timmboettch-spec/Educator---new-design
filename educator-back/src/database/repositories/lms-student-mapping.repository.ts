import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
import { LmsStudentMapping } from 'src/database/entities';

@Injectable()
export class LmsStudentMappingRepository {
  constructor(
    @InjectRepository(LmsStudentMapping)
    private readonly repo: Repository<LmsStudentMapping>,
  ) { }

  async create(data: DeepPartial<LmsStudentMapping>): Promise<LmsStudentMapping> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /** Inserts all mappings in one `INSERT … ON CONFLICT DO NOTHING`; the table's unique indexes decide what is skipped. */
  async insertManyIgnoreConflicts(data: Partial<LmsStudentMapping>[]): Promise<void> {
    if (data.length === 0) return;
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(LmsStudentMapping)
      .values(data)
      .orIgnore()
      .execute();
  }

  async findOne(options: FindOneOptions<LmsStudentMapping>): Promise<LmsStudentMapping | null> {
    return this.repo.findOne(options);
  }

  async delete(
    where: FindOptionsWhere<LmsStudentMapping> | FindOptionsWhere<LmsStudentMapping>[],
  ): Promise<number> {
    const result = await this.repo.delete(where ?? {});
    return result.affected ?? 0;
  }

  async findLatestByLmsUserIdAndSchoolIds(
    lmsUserId: string,
    schoolIds: string[],
  ): Promise<LmsStudentMapping | null> {
    if (!schoolIds.length) return null;
    return this.repo
      .createQueryBuilder('m')
      .where('m.lms_user_id = :lmsUserId', { lmsUserId })
      .andWhere('m.school_id IN (:...schoolIds)', { schoolIds })
      .orderBy('m.updated_at', 'DESC')
      .getOne();
  }
}
