import { Inject, Injectable } from '@nestjs/common';
import { EDUCATOR_REPOSITORY } from 'src/database/tokens';
import { EducatorRepository } from 'src/database/repositories';
import { LoggerService } from 'src/common/services';

@Injectable()
export class EducatorSessionService {
  private readonly invalidationCache = new Map<string, number>();

  constructor(
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,
    private readonly logger: LoggerService,
  ) {}

  async invalidateBySchool(schoolId: string): Promise<string[]> {
    const now = new Date();

    const ids = await this.educatorRepo.findActiveIdsBySchool(schoolId);
    if (ids.length === 0) {
      this.logger.log(`[invalidateBySchool] No active educators found for school ${schoolId}`);
      return [];
    }

    await this.educatorRepo.updateTokenInvalidatedAt(ids, now);

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
