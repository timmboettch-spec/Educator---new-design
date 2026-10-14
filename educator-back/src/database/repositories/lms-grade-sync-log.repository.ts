import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { LmsGradeSyncLog } from 'src/database/entities';

@Injectable()
export class LmsGradeSyncLogRepository {
  constructor(
    @InjectRepository(LmsGradeSyncLog)
    private readonly repo: Repository<LmsGradeSyncLog>,
  ) { }

  create(data: DeepPartial<LmsGradeSyncLog>): LmsGradeSyncLog {
    return this.repo.create(data);
  }

  async save(entity: LmsGradeSyncLog): Promise<LmsGradeSyncLog> {
    return this.repo.save(entity);
  }

  async update(id: string, data: DeepPartial<LmsGradeSyncLog>): Promise<void> {
    await this.repo.update(id, data);
  }

  /**
   * Highest-priority guard for LMS passback: last score we successfully sent
   * for this assignment mapping + student (newest successful attempt wins).
   */
  async findLatestSentForMappingAndLmsUser(
    mappingId: string,
    lmsUserId: string,
  ): Promise<LmsGradeSyncLog | null> {
    return this.repo.findOne({
      where: { mappingId, lmsUserId, status: 'sent' },
      order: { attemptedAt: 'DESC' },
    });
  }

  async findLastSuccessfulScore(mappingId: string, studentId: string): Promise<number | null> {
    const row = await this.repo.findOne({
      where: { mappingId, studentId, status: 'sent' },
      order: { attemptedAt: 'DESC' },
    });
    if (!row) {
      return null;
    }
    const score = Number(row.scoreGiven);
    return Number.isFinite(score) ? score : null;
  }

  async findLatestCompletedByMappingIds(mappingIds: string[]): Promise<LmsGradeSyncLog[]> {
    if (mappingIds.length === 0) {
      return [];
    }
    return this.repo
      .createQueryBuilder('log')
      .distinctOn(['log.mappingId', 'log.studentId'])
      .where('log.mappingId IN (:...mappingIds)', { mappingIds })
      .andWhere('log.status IN (:...statuses)', { statuses: ['sent', 'failed'] })
      .orderBy('log.mappingId')
      .addOrderBy('log.studentId')
      .addOrderBy('log.attemptedAt', 'DESC')
      .getMany();
  }
}
