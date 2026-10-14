import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EducatorSimulationPreview } from 'src/database/entities';

@Injectable()
export class EducatorSimulationPreviewRepository {
  constructor(
    @InjectRepository(EducatorSimulationPreview)
    private readonly repo: Repository<EducatorSimulationPreview>,
  ) {}

  async findByEducatorAndScenario(
    educatorId: string,
    scenarioId: string,
  ): Promise<EducatorSimulationPreview | null> {
    return this.repo.findOne({ where: { educatorId, scenarioId } });
  }

  /** Atomically uses one preview if under `max`; returns the new count, or null when exhausted. */
  async consumeIfAvailable(
    educatorId: string,
    scenarioId: string,
    max: number,
  ): Promise<number | null> {
    if (max < 1) {
      return null;
    }

    const rows = await this.repo.query<Array<{ used_count: number }>>(
      `INSERT INTO "educator_simulation_previews" ("educator_id", "scenario_id", "used_count")
       VALUES ($1, $2, 1)
       ON CONFLICT ("educator_id", "scenario_id") WHERE "deleted_at" IS NULL
       DO UPDATE SET "used_count" = "educator_simulation_previews"."used_count" + 1,
                     "updated_at" = now()
       WHERE "educator_simulation_previews"."used_count" < $3
       RETURNING "used_count"`,
      [educatorId, scenarioId, max],
    );

    return rows.length > 0 ? rows[0].used_count : null;
  }
}
