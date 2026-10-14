import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { GoogleGradeSyncLog } from 'src/database/entities';

@Injectable()
export class GoogleGradeSyncLogRepository {
  constructor(
    @InjectRepository(GoogleGradeSyncLog)
    private readonly repo: Repository<GoogleGradeSyncLog>,
  ) {}

  create(data: DeepPartial<GoogleGradeSyncLog>): GoogleGradeSyncLog {
    return this.repo.create(data);
  }

  async save(entity: GoogleGradeSyncLog): Promise<GoogleGradeSyncLog> {
    return this.repo.save(entity);
  }

  async update(id: string, data: DeepPartial<GoogleGradeSyncLog>): Promise<void> {
    await this.repo.update(id, data);
  }

  /**
   * Last score successfully sent for this coursework mapping + student
   * (newest successful attempt wins).
   */
  async findLastSuccessfulScore(
    courseworkMappingId: string,
    studentId: string,
  ): Promise<number | null> {
    const row = await this.repo.findOne({
      where: { courseworkMappingId, studentId, status: 'sent' },
      order: { attemptedAt: 'DESC' },
    });
    if (!row) {
      return null;
    }
    const score = Number(row.scoreGiven);
    return Number.isFinite(score) ? score : null;
  }
}
