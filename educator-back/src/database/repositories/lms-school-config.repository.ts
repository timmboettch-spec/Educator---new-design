import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { LmsConfigStatus } from 'src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/database/entities';

@Injectable()
export class LmsSchoolConfigRepository {
  constructor(
    @InjectRepository(LmsSchoolConfig)
    private readonly repo: Repository<LmsSchoolConfig>,
  ) {}

  async create(data: DeepPartial<LmsSchoolConfig>): Promise<LmsSchoolConfig> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  async find(options: FindManyOptions<LmsSchoolConfig> = {}): Promise<LmsSchoolConfig[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<LmsSchoolConfig>): Promise<LmsSchoolConfig | null> {
    return this.repo.findOne(options);
  }

  async findActiveByNormalizedIssuer(normalizedIssuer: string): Promise<LmsSchoolConfig | null> {
    return this.repo
      .createQueryBuilder('cfg')
      .where('cfg.status = :status', { status: LmsConfigStatus.ACTIVE })
      .andWhere(
        `(
          regexp_replace(lower(cfg.issuer), '/+$', '') = :normalizedIssuer
          OR regexp_replace(lower(coalesce(cfg.lmsBaseUrl, '')), '/+$', '') = :normalizedIssuer
        )`,
        { normalizedIssuer },
      )
      .getOne();
  }
}
