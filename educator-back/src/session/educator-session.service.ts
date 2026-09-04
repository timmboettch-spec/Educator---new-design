import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Educator } from '../educators/entity/educator.entity';

@Injectable()
export class EducatorSessionService {
  private readonly logger = new Logger(EducatorSessionService.name);

  private readonly invalidationCache = new Map<string, number>();

  constructor(
    @InjectRepository(Educator)
    private readonly educatorRepo: Repository<Educator>,
  ) {}

  async invalidateBySchool(schoolId: string): Promise<string[]> {
    const now = new Date();

    const rows = await this.educatorRepo
      .createQueryBuilder('e')
      .innerJoin('educator_schools', 'es', 'es.educator_id = e.id')
      .where('es.school_id = :schoolId', { schoolId })
      .andWhere('e.is_active = true')
      .select('e.id', 'id')
      .getRawMany<{ id: string }>();

    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) {
      this.logger.log(`[invalidateBySchool] No active educators found for school ${schoolId}`);
      return [];
    }

    await this.educatorRepo
      .createQueryBuilder()
      .update(Educator)
      .set({ token_invalidated_at: now })
      .whereInIds(ids)
      .execute();

    const nowMs = now.getTime();
    for (const id of ids) {
      this.invalidationCache.set(id, nowMs);
    }

    this.logger.log(
      `[invalidateBySchool] Invalidated ${ids.length} educator(s) for school ${schoolId}`,
    );
    return ids;
  }

  async isTokenInvalidated(educatorId: string, iatSeconds: number): Promise<boolean> {
    const cached = this.invalidationCache.get(educatorId);
    if (cached !== undefined) {
      const invalid = cached > 0 && iatSeconds * 1000 < cached;

      return invalid;
    }

    const educator = await this.educatorRepo.findOne({
      where: { id: educatorId },
      select: ['id', 'token_invalidated_at'],
    });

    if (!educator?.token_invalidated_at) {
      this.invalidationCache.set(educatorId, 0);

      return false;
    }

    const invalidatedAtMs = new Date(educator.token_invalidated_at).getTime();
    this.invalidationCache.set(educatorId, invalidatedAtMs);
    const invalid = iatSeconds * 1000 < invalidatedAtMs;

    return invalid;
  }

  async invalidateEducator(educatorId: string): Promise<void> {
    const now = new Date();
    await this.educatorRepo.update(educatorId, { token_invalidated_at: now });
    this.invalidationCache.set(educatorId, now.getTime());
    this.logger.log(`[invalidateEducator] Invalidated session for educator ${educatorId}`);
  }

  evictCache(educatorId: string): void {
    this.invalidationCache.delete(educatorId);
  }
}
