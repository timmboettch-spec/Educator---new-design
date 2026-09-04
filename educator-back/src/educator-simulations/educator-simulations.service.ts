import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EducatorSimulation } from './entity/educator-simulation.entity';
import { BlobScenario, BlobUnit, ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { EducatorSimulationsConstants } from './educator-simulations.constants';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';

@Injectable()
export class EducatorSimulationsService {
  constructor(
    @InjectRepository(EducatorSimulation)
    private readonly repo: Repository<EducatorSimulation>,
    private readonly tutorPatientService: TutorPatientService,
  ) {}

  async addToLibrary(
    scenarioId: string,
    educatorId: string,
  ): Promise<ServiceResponse<EducatorSimulation>> {
    try {
      const scenarios = (await this.tutorPatientService.getScenarios()) as BlobScenario[];
      const scenario = scenarios.find((s) => s.id === scenarioId);
      if (!scenario) {
        return {
          success: false,
          message: EducatorSimulationsConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      // Already active in library
      const existing = await this.repo.findOne({
        where: { educator_id: educatorId, scenario_id: scenarioId, deleted_at: IsNull() },
      });
      if (existing) {
        return {
          success: false,
          message: EducatorSimulationsConstants.MESSAGES.ALREADY_IN_LIBRARY,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      // Previously soft-deleted — restore
      const deleted = await this.repo.findOne({
        where: { educator_id: educatorId, scenario_id: scenarioId },
      });
      if (deleted) {
        deleted.deleted_at = null;
        deleted.unit_id = scenario.unitId;
        const restored = await this.repo.save(deleted);
        return {
          success: true,
          message: EducatorSimulationsConstants.MESSAGES.ADDED,
          data: restored,
        };
      }

      // New row
      const row = this.repo.create({
        educator_id: educatorId,
        unit_id: scenario.unitId,
        scenario_id: scenarioId,
      });
      const saved = await this.repo.save(row);
      return { success: true, message: EducatorSimulationsConstants.MESSAGES.ADDED, data: saved };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async addToLibraryBulk(
    scenarioIds: string[],
    educatorId: string,
  ): Promise<ServiceResponse<EducatorSimulation[]>> {
    try {
      const existingRows = await this.repo.find({
        where: {
          educator_id: educatorId,
          deleted_at: IsNull(),
        },
      });

      const existingIds = new Set(existingRows.map((r) => r.scenario_id));

      const scenarios = (await this.tutorPatientService.getScenarios()) as BlobScenario[];

      const rowsToInsert = scenarioIds
        .filter((id) => !existingIds.has(id))
        .map((id) => {
          const scenario = scenarios.find((s) => s.id === id);

          return this.repo.create({
            educator_id: educatorId,
            scenario_id: id,
            unit_id: scenario?.unitId,
          });
        });

      if (rowsToInsert.length) {
        await this.repo.save(rowsToInsert);
      }

      return {
        success: true,
        message: 'Simulations added successfully',
        data: rowsToInsert,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async removeFromLibrary(scenarioId: string, educatorId: string): Promise<ServiceResponse<null>> {
    try {
      const row = await this.repo.findOne({
        where: { educator_id: educatorId, scenario_id: scenarioId, deleted_at: IsNull() },
      });
      if (!row) {
        return {
          success: false,
          message: EducatorSimulationsConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      row.deleted_at = new Date();
      await this.repo.save(row);
      return { success: true, message: EducatorSimulationsConstants.MESSAGES.REMOVED, data: null };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async getMyLibrary(educatorId: string, ls?: string): Promise<ServiceResponse<object[]>> {
    try {
      const fetchLocalized =
        ls && ls !== 'en'
          ? (this.tutorPatientService.getScenarios(ls) as Promise<BlobScenario[]>)
          : Promise.resolve([] as BlobScenario[]);

      const [savedRows, units, enScenarios, localizedScenarios] = await Promise.all([
        this.repo.find({
          where: { educator_id: educatorId, deleted_at: IsNull() },
          order: { created_at: 'ASC' },
        }),
        this.tutorPatientService.getUnits() as Promise<BlobUnit[]>,
        this.tutorPatientService.getScenarios() as Promise<BlobScenario[]>,
        fetchLocalized,
      ]);

      // Build localized lookup — falls back to English for any untranslated scenario
      const localizedById = new Map<string, BlobScenario>(localizedScenarios.map((s) => [s.id, s]));

      const activeScenarios = enScenarios.filter((s) => {
        const status = String(s.status ?? '')
          .toLowerCase()
          .trim();
        return status !== 'draft' && status !== 'archived';
      });

      const data = savedRows
        .filter((row) => activeScenarios.some((s) => s.id === row.scenario_id))
        .map((row) => {
          const unit = units.find((u) => u.id === row.unit_id);
          const enScenario = activeScenarios.find((s) => s.id === row.scenario_id);
          // Use translated scenario when available, otherwise English
          const scenario = localizedById.get(row.scenario_id) ?? enScenario ?? null;
          return {
            id: row.id,
            educator_id: row.educator_id,
            unit_id: row.unit_id,
            scenario_id: row.scenario_id,
            unit: unit ?? null,
            scenario,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        });

      return {
        success: true,
        message: EducatorSimulationsConstants.MESSAGES.MY_LIBRARY_FETCHED,
        data,
      };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async getInLibraryIds(educatorId: string): Promise<Set<string>> {
    const rows = await this.repo.find({
      where: { educator_id: educatorId, deleted_at: IsNull() },
      select: ['scenario_id'],
    });
    return new Set(rows.map((r) => r.scenario_id));
  }
}
