import { Injectable, NotFoundException } from '@nestjs/common';

import { JsonDataService } from '../../data/json-data.service';

@Injectable()
export class UnitsService {
  constructor(private jsonDataService: JsonDataService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async findAll(userId?: string) {
    // Get all units (do not enforce permission checks here)
    const allUnits = this.jsonDataService.getUnits();

    // Return units including existing `Status` so frontend decides locked/unlocked
    return allUnits
      .map((unit) => {
        const scenarios = this.jsonDataService.getScenariosByUnitId(unit.id);
        const scenarioCount = scenarios.length;

        let completedCount = 0;
        if (userId) {
          const transcripts = this.jsonDataService.getTranscriptsByUserId(userId);
          const completedScenarioIds = transcripts
            .filter((t) => t.endedAt)
            .map((t) => t.scenarioId);

          completedCount = scenarios.filter((s) => completedScenarioIds.includes(s.id)).length;
        }
        return {
          id: unit.id,
          name: unit.name,
          imageUrl: unit.imageUrl,
          scenarioCount,
          completedCount,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findOne(id: string, userId?: string) {
    const unit = this.jsonDataService.getUnitById(id);

    if (!unit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }

    const scenarios = this.jsonDataService.getScenariosByUnitId(id);
    const scenarioCount = scenarios.length

    let completedCount = 0;
    if (userId) {
      const transcripts = this.jsonDataService.getTranscriptsByUserId(userId);
      const completedScenarioIds = transcripts.filter((t) => t.endedAt).map((t) => t.scenarioId);

      completedCount = scenarios.filter((s) => completedScenarioIds.includes(s.id)).length;
    }

    return {
      id: unit.id,
      name: unit.name,
      imageUrl: unit.imageUrl,
      scenarioCount,
      completedCount,
    };
  }
}
