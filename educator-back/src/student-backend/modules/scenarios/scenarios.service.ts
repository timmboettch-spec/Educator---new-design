import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';

import type { Unit } from 'src/common/interfaces/student-scenario.interface';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { SimulationV2, Unit as UnitEntity } from 'src/database/entities';
import {
  SimulationV2Repository,
  TranscriptRepository,
  UnitRepository,
} from 'src/database/repositories';
import {
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import { LmsAssignmentMappingRepository } from 'src/database/repositories';
import { RoleSlug } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';
import { LoggerService } from 'src/common/services';
import { throwAppError } from 'src/common/utils/app-error';
import { ErrorTypes, Messages } from 'src/common/utils/messages';
import { SimulationService } from 'src/simulation/simulation.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import type { IScenarioVoiceProfile } from 'src/common/interfaces/voice-profile.interface';

type ScenarioWithProgress = Omit<SimulationV2, 'voiceProfile'> & {
  unit?: Unit;
  completed?: boolean;
  progress?: number;
  /** C1's resolved effective voice — only set on the single-scenario read (findOne). */
  voiceProfile?: IScenarioVoiceProfile | null;
};

@Injectable()
export class ScenariosService {
  constructor(
    private readonly automationAccess: AutomationAccessService,
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: UnitRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcriptRepository: TranscriptRepository,
    @Inject(LMS_ASSIGNMENT_MAPPING_REPOSITORY)
    private readonly assignmentMappingRepository: LmsAssignmentMappingRepository,
    private readonly simulationService: SimulationService,
    private readonly voiceProfilesService: VoiceProfilesService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Throws 403 unless `currentUser` may open the scenario `scenarioId`. A no-op for anyone who
   * isn't a student (educators, district admins and scenario admins preview and author freely).
   * For a student, in priority order:
   *
   * 1. An LTI launch locked to a `simulationId` allows only that scenario.
   * 2. An LTI launch with a `resourceLinkId` + `classId` mapping allows only the mapped scenario.
   * 3. Otherwise the scenario must be in the student's assigned-simulation set — the same set
   *    `GET /api/students/simulations/:studentCode` returns.
   *
   * Call it on the record the service actually loaded, never on an id guessed from the request.
   */
  async assertScenarioAssigned(currentUser: ICurrentUser, scenarioId: string): Promise<void> {
    if (!currentUser.roles?.includes(RoleSlug.STUDENT)) return;

    const ltiLaunch = currentUser.ltiLaunch;
    if (ltiLaunch?.simulationId) {
      if (ltiLaunch.simulationId === scenarioId) return;
      this.logger.warn(
        `Denying scenario launch — LTI launch locked student to simulation=${ltiLaunch.simulationId}, attempted scenarioId=${scenarioId}`,
      );
      throwAppError(Messages.SCENARIO_LTI_LOCKED, ErrorTypes.FORBIDDEN);
    }

    if (ltiLaunch?.resourceLinkId && ltiLaunch.classId) {
      const mapping = await this.assignmentMappingRepository.findOne({
        where: { classId: ltiLaunch.classId, lmsResourceLinkId: ltiLaunch.resourceLinkId },
      });
      if (mapping?.simulationId === scenarioId) return;
      if (mapping?.simulationId) {
        this.logger.warn(
          `Denying scenario launch — LTI resourceLinkId ${ltiLaunch.resourceLinkId} is mapped to simulation=${mapping.simulationId}, attempted scenarioId=${scenarioId}`,
        );
        throwAppError(Messages.SCENARIO_LTI_LOCKED, ErrorTypes.FORBIDDEN);
      }
    }

    // A student token's `sub` (`userId`) is the login code, which is what the lookup expects.
    const studentCode = currentUser.student_id || currentUser.userId;
    if (!studentCode) {
      this.logger.warn('Student token carries no student code — denying scenario launch');
      throwAppError(Messages.SCENARIO_NOT_ASSIGNED, ErrorTypes.FORBIDDEN);
    }

    const assigned = await this.simulationService.getAssignedSimulationIds(studentCode);
    if (assigned.has(String(scenarioId))) return;

    this.logger.warn(
      `Denying scenario launch — student=${studentCode} attempted scenarioId=${scenarioId} which is not assigned`,
    );
    throwAppError(Messages.SCENARIO_NOT_ASSIGNED, ErrorTypes.FORBIDDEN);
  }

  private mapUnitEntityToUnit(entity: UnitEntity): Unit {
    return {
      id: entity.id,
      name: entity.name,
      imageUrl: entity.imageUrl ?? '',
      category: entity.category,
      actionGroupName: entity.actionGroupName,
      actionGroupDescription: entity.actionGroupDescription,
      actions: entity.actions as Unit['actions'],
    };
  }

  private async getUnitById(id?: string): Promise<Unit | undefined> {
    if (!id) return undefined;
    const unit = await this.unitRepository.findByBusinessId(id);
    return unit ? this.mapUnitEntityToUnit(unit) : undefined;
  }

  /** Batch-fetches units for several distinct ids in one query, for use inside a subsequent .map(). */
  private async getUnitsByIds(ids: string[]): Promise<Map<string, Unit>> {
    const distinctIds = [...new Set(ids.filter(Boolean))];
    if (distinctIds.length === 0) return new Map();

    const units = await this.unitRepository.find({ where: { id: In(distinctIds) } });
    return new Map(units.map((u) => [u.id, this.mapUnitEntityToUnit(u)]));
  }

  /**
   * `lang`-based localization is intentionally not supported here —
   * SimulationV2 has no locale dimension yet (see simulations.service.ts),
   * so this always returns the single (English) row per scenario.
   */
  async findAll() {
    const scenarios = await this.simulationV2Repository.findAllWithChildrenJoined();
    // Filter out draft and archived scenarios — students must only see published scenarios.
    // Legacy scenarios without a status field are treated as published.
    const published = this.automationAccess
      .filterRecords(scenarios)
      .filter((s) => (s.status ?? 'published') === 'published');
    const unitsById = await this.getUnitsByIds(published.map((s) => s.unitId ?? ''));
    return published.map(({ voiceProfile: _voiceProfile, ...scenario }) => ({
      ...scenario,
      unit: scenario.unitId ? unitsById.get(scenario.unitId) : undefined,
    }));
  }

  // Disabled — backs the disabled GET /scenarios/unit/:unitId route, not currently used by any client.
  async findByUnit(unitId: string, userId?: string): Promise<ScenarioWithProgress[]> {
    // Filter out draft and archived scenarios — students must only see published scenarios.
    // Legacy scenarios without a status field are treated as published.
    const rows = await this.simulationV2Repository.findByUnitId(unitId);
    const scenarios = this.automationAccess
      .filterRecords(rows)
      .filter((s) => (s.status ?? 'published') === 'published');
    const unit = await this.getUnitById(unitId);

    if (userId) {
      const transcripts = await this.transcriptRepository.findByUserId(userId);
      const completedScenarioIds = transcripts.filter((t) => t.endedAt).map((t) => t.scenarioId);

      return scenarios.map(({ voiceProfile: _voiceProfile, ...scenario }) => ({
        ...scenario,
        unit,
        completed: completedScenarioIds.includes(scenario.id),
        progress: completedScenarioIds.includes(scenario.id) ? 100 : 0,
      }));
    }

    return scenarios.map(({ voiceProfile: _voiceProfile, ...scenario }) => ({
      ...scenario,
      unit,
    }));
  }

  async findOne(currentUser: ICurrentUser, id: string): Promise<ScenarioWithProgress> {
    const scenario = await this.simulationV2Repository.findByBusinessIdWithChildrenJoined(id);

    if (!scenario || !this.automationAccess.canAccessRecord(scenario)) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    // Block student access to draft scenarios.
    if ((scenario.status ?? 'published') === 'draft') {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    await this.assertScenarioAssigned(currentUser, scenario.id);

    const userId = currentUser.userId;
    const result: Record<string, unknown> = {
      ...scenario,
      unit: await this.getUnitById(scenario.unitId ?? undefined),
      voiceProfile: await this.voiceProfilesService.resolveForScenario({
        voiceProfileId: scenario.voiceProfileId,
        patientData: scenario.patientData,
      }),
    };

    if (userId) {
      const transcripts = await this.transcriptRepository.findByUserId(userId);
      const transcript = transcripts.find(
        (t) => t.userId === userId && t.scenarioId === id && t.endedAt,
      );
      result.completed = !!transcript;
      result.progress = transcript ? 100 : 0;
    }

    return result as unknown as ScenarioWithProgress;
  }
}
