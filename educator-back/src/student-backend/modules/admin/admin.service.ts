import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { LoggerService } from '../../../common/services';
import type { Action, Unit } from 'src/common/interfaces/student-scenario.interface';
import {
  SimulationV2,
  SimulationAction,
  SimulationGradingRubricItem,
  SimulationOrder,
  Unit as UnitEntity,
} from 'src/database/entities';
import {
  SimulationReportRepository,
  SimulationV2Repository,
  SimulationV2WithOrderDefinitions,
  TranscriptRepository,
  UnitRepository,
} from 'src/database/repositories';
import {
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import { UnitCategory, SimulationStatus } from 'src/common/constants';
import type { DeepPartial } from 'typeorm';
import { ISimulationGrading, ReportDetail } from 'src/common/interfaces';
import { mapRowToReportDetail } from 'src/common/utils/simulation-report.util';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import type { IScenarioVoiceProfile } from 'src/common/interfaces/voice-profile.interface';

const VALID_UNIT_CATEGORIES: string[] = Object.values(UnitCategory);

@Injectable()
export class AdminService {
  private static readonly PRODUCT_NAME_MAX_LENGTH = 100;

  constructor(
    private readonly logger: LoggerService,
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: UnitRepository,
    @Inject(SIMULATION_V2_REPOSITORY) private readonly simulationRepository: SimulationV2Repository,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcriptRepository: TranscriptRepository,
    private readonly classSimulationService: ClassSimulationService,
    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly simulationReportRepository: SimulationReportRepository,
    private readonly voiceProfilesService: VoiceProfilesService,
  ) {}

  private mapUnitEntityToUnit(entity: UnitEntity): Unit {
    return {
      id: entity.id,
      name: entity.name,
      imageUrl: entity.imageUrl ?? '',
      category: entity.category,
      categories: entity.category ? [entity.category] : undefined,
      actionGroupName: entity.actionGroupName,
      actionGroupDescription: entity.actionGroupDescription,
      actions: (entity.actions as Action[] | undefined) ?? undefined,
    };
  }

  private static normalizeProductName(value: string): string {
    // Collapse any internal whitespace runs to a single space and trim ends.
    return value.replace(/\s+/g, ' ').trim();
  }

  private validateProductSetup(
    scenarioData: Partial<SimulationV2>,
    previousScenario?: SimulationV2 | SimulationV2WithOrderDefinitions,
  ): void {
    // Normalize incoming Product Name in-place so persisted value is clean
    // for both create and update flows.
    if (scenarioData.productSetup && typeof scenarioData.productSetup.title === 'string') {
      scenarioData.productSetup.title = AdminService.normalizeProductName(
        scenarioData.productSetup.title,
      );
    }

    const requiresProductSetup =
      scenarioData.requiresProductSetup ?? previousScenario?.requiresProductSetup ?? false;
    const productTitle = scenarioData.productSetup?.title ?? previousScenario?.productSetup?.title;

    if (requiresProductSetup && !productTitle?.trim()) {
      throw new BadRequestException(
        'Product Name is required when physical product setup is enabled',
      );
    }

    const isProductTitleUpdated =
      scenarioData.productSetup?.title !== undefined &&
      scenarioData.productSetup?.title !== previousScenario?.productSetup?.title;

    if (
      isProductTitleUpdated &&
      scenarioData.productSetup?.title &&
      scenarioData.productSetup.title.length > AdminService.PRODUCT_NAME_MAX_LENGTH
    ) {
      throw new BadRequestException(
        `Product Name must be ${AdminService.PRODUCT_NAME_MAX_LENGTH} characters or less`,
      );
    }
  }

  /**
   * Deliberately bypasses assembleScenarios/simulationToScenario (used by
   * every other scenario read/write below) — returns real `SimulationV2`
   * entities straight from SimulationV2Repository.findAllWithChildrenJoined,
   * not the flat blob-shaped `Scenario` object those build. Each entity's
   * `actions`/`orders`/`gradingRubricItems` are populated via TypeORM
   * relations rather than reconstructed from `detail` jsonb, so this is not
   * a drop-in replacement for a caller expecting the old `Scenario[]` shape.
   */
  getAllScenarios(): Promise<SimulationV2WithOrderDefinitions[]> {
    return this.simulationRepository.findAllWithoutChildrenJoined();
  }

  async getScenarioById(id: string): Promise<SimulationV2WithOrderDefinitions> {
    // Single joined query (same relations-based pattern as
    // findAllWithChildrenJoined) instead of separate action/order/rubric
    // lookups — order links stay a second query since the join table
    // (SimulationOrderLinkedAction) deliberately carries no relation.
    const sim = await this.simulationRepository.findByBusinessIdWithChildrenJoined(id);
    if (!sim) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }
    return sim;
  }

  /**
   * The controller-facing read (`GET /admin/scenarios/:id`) — adds C1's
   * resolved effective voice. `getScenarioById` itself stays undecorated:
   * it is also called internally by `updateScenario`/`createDraftVersion`/
   * `publishDraftVersion` as a plain data fetch, where resolving a voice
   * on every intermediate read would be pure waste.
   */
  async getScenarioByIdForController(
    id: string,
  ): Promise<
    Omit<SimulationV2WithOrderDefinitions, 'voiceProfile'> & {
      voiceProfile: IScenarioVoiceProfile | null;
    }
  > {
    const sim = await this.getScenarioById(id);
    const voiceProfile = await this.voiceProfilesService.resolveForScenario({
      voiceProfileId: sim.voiceProfileId,
      patientData: sim.patientData,
    });
    return { ...sim, voiceProfile };
  }

  async createScenario(scenarioData: Partial<SimulationV2>) {
    // Validate required scenario ID
    if (typeof scenarioData.id !== 'string' || scenarioData.id === '' || !scenarioData.id.trim()) {
      this.logger.warn(`Invalid scenario ID: ${String(scenarioData.id)}`);
      throw new BadRequestException('Scenario ID is required');
    }

    // Check if scenario ID already exists
    const existingScenario = await this.simulationRepository.findByBusinessId(scenarioData.id);
    if (existingScenario) {
      throw new BadRequestException(
        `Scenario with ID ${scenarioData.id} already exists. Scenario ID must be unique.`,
      );
    }

    // Validate scenario title — required only when publishing (not for drafts)
    const isDraft = scenarioData.status === SimulationStatus.DRAFT;
    if (!isDraft) {
      if (typeof scenarioData.title !== 'string' || !scenarioData.title.trim()) {
        throw new BadRequestException('Scenario Title is required');
      }
    }

    this.validateProductSetup(scenarioData);
    await this.voiceProfilesService.assertValidForScenarioWrite(scenarioData.voiceProfileId);

    if (scenarioData.title) {
      const existingScenarioWithTitle = await this.simulationRepository.findUniqueByTitle(
        scenarioData.title,
      );
      if (existingScenarioWithTitle) {
        throw new BadRequestException(
          `Scenario with title "${scenarioData.title}" already exists. Scenario title must be unique.`,
        );
      }
    }

    // Validate unit exists
    if (scenarioData.unitId) {
      const unit = await this.unitRepository.findByBusinessId(scenarioData.unitId);
      if (!unit) {
        throw new NotFoundException(`Unit with ID ${scenarioData.unitId} not found`);
      }
    }

    const scenario: Partial<SimulationV2> = {
      id: scenarioData.id,
      unitId: scenarioData.unitId ?? '',
      title: scenarioData.title ?? '',
      difficulty: scenarioData.difficulty ?? 'Medium',
      avatarEnabled: scenarioData.avatarEnabled ?? false,
      // NULL, not '' — "no avatar" is the absence of a value, and
      // simulations.avatarId now has a foreign key to avatars.avatar_id.
      // An empty string is not NULL, so Postgres would look for an avatar
      // literally named '' and reject the write: saving any scenario without
      // an avatar would fail. The migration clears the historical '' rows;
      // this stops new ones being created.
      avatarId: scenarioData.avatarId?.trim() || null,
      voiceProfileId: scenarioData.voiceProfileId ?? null,
      contextId: scenarioData.contextId ?? '',
      learnerLevel: scenarioData.learnerLevel ?? '',
      department: scenarioData.department ?? '',
      description: scenarioData.description ?? '',
      learningObjective: scenarioData.learningObjective ?? '',
      language: scenarioData.language,
      voice: scenarioData.voice,
      actionGroupName: scenarioData.actionGroupName,
      actionGroupDescription: scenarioData.actionGroupDescription,
      actions: scenarioData.actions ?? [],
      patientData: scenarioData.patientData ?? {
        name: '',
        gender: '',
        age: 0,
        race: '',
        Weight: '',
        Height: '',
        vitals: {
          heartRate: '',
          bloodPressure: '',
          respiratoryRate: '',
          spO2: '',
          temperature: '',
        },
        chiefComplaint: '',
        medicalHistory: '',
        allergies: '',
      },
      expectedActions: scenarioData.expectedActions ?? {
        labs: [],
        imaging: [],
        physicalExam: [],
        medications: [],
      },
      learningObjectiveCard: scenarioData.learningObjectiveCard ?? '',
      phases: scenarioData.phases,
      availableMedications: scenarioData.availableMedications ?? [],
      conversationResponses: scenarioData.conversationResponses,
      grading: scenarioData.grading,
      gradingRubricItems: scenarioData.grading?.rubric as unknown as SimulationGradingRubricItem[],
      metadata: scenarioData.metadata,
      requiresProductSetup: scenarioData.requiresProductSetup ?? false,
      productSetup: scenarioData.productSetup,
      orthopedicWorksheet: scenarioData.orthopedicWorksheet,
      aiPatientData: scenarioData.aiPatientData,
      enableStudentBriefing: scenarioData.enableStudentBriefing,
      studentBriefing: scenarioData.studentBriefing,
      sbar: scenarioData.sbar,
      orders: scenarioData.orders ?? [],
      timeline: scenarioData.timeline,
      simulationStartTime: scenarioData.simulationStartTime,
      additionalEquipment: scenarioData.additionalEquipment,
      optionalEquipment: scenarioData.optionalEquipment,
      setupNotes: scenarioData.setupNotes,
      topicsAddressed: scenarioData.topicsAddressed,
      estimatedDuration: scenarioData.estimatedDuration,
      prebriefScriptPdf: scenarioData.prebriefScriptPdf,
      debriefPointsPdf: scenarioData.debriefPointsPdf,
      setupNotesPdf: scenarioData.setupNotesPdf,
      facilitationNotesPdf: scenarioData.facilitationNotesPdf,
      printableSbarPdf: scenarioData.printableSbarPdf,
      printablePatientChartPdf: scenarioData.printablePatientChartPdf,
      scenarioImage: scenarioData.scenarioImage,
      // Persist draft/publish status. Default to 'draft' for new scenarios
      // so they are hidden from students until explicitly published.
      status: scenarioData.status ?? SimulationStatus.DRAFT,
    };

    this.logger.log(`Creating scenario: ${scenario.id}`);

    await this.simulationRepository.create(scenario, {
      lockVoiceProfileId: scenario.voiceProfileId,
    });

    return this.getScenarioById(scenario.id as string);
  }

  async updateScenario(id: string, updates: Partial<SimulationV2>) {
    const sim = await this.simulationRepository.findByBusinessId(id);
    if (!sim) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }
    const existingScenario = await this.getScenarioById(id);

    this.validateProductSetup(updates, existingScenario);
    if (updates.voiceProfileId !== undefined) {
      await this.voiceProfilesService.assertValidForScenarioWrite(updates.voiceProfileId);
    }

    // DEBUG: Log incoming actions to verify typeRequirement field
    if (updates.actions) {
      this.logger.debug('=== UPDATE SCENARIO ACTIONS DEBUG ===');
      updates.actions.forEach((action: SimulationAction, idx: number) => {
        this.logger.debug(
          `Incoming action ${idx}: title="${action.title}", typeRequirement="${action.typeRequirement}", isOptional=${action.isOptional}`,
        );
      });
      this.logger.debug('=== END UPDATE SCENARIO ACTIONS DEBUG ===');
    }

    const isDraftSave =
      ((existingScenario.status as SimulationStatus) ?? SimulationStatus.PUBLISHED) ===
        SimulationStatus.DRAFT || updates.status === SimulationStatus.DRAFT;

    if (!isDraftSave && updates.title !== undefined) {
      if (typeof updates.title !== 'string' || !updates.title.trim()) {
        throw new BadRequestException('Scenario Title is required');
      }

      const normalizedTitle = updates.title.trim().toLowerCase();
      const allSimulations = await this.simulationRepository.find();

      const duplicateTitleScenario = allSimulations.find(
        (s) =>
          s.id !== id &&
          s.id !== existingScenario.parentScenarioId &&
          s.title?.trim().toLowerCase() === normalizedTitle,
      );

      if (duplicateTitleScenario) {
        throw new BadRequestException(
          `Scenario with title "${updates.title}" already exists. Scenario title must be unique.`,
        );
      }
    }

    if (!isDraftSave && existingScenario.unitId) {
      const unit = await this.unitRepository.findByBusinessId(existingScenario.unitId);
      if (!unit) {
        throw new NotFoundException(`Unit with ID ${existingScenario.unitId} not found`);
      }
    }

    // Deep merge for nested objects — preserves the original blob-era updateScenario semantics.
    const mergedUpdates: Partial<SimulationV2> = {
      ...updates,
      studentBriefing: updates.studentBriefing
        ? { ...existingScenario.studentBriefing, ...updates.studentBriefing }
        : updates.studentBriefing,
      sbar: updates.sbar ? { ...existingScenario.sbar, ...updates.sbar } : updates.sbar,
      patientData: updates.patientData
        ? {
            ...existingScenario.patientData,
            ...updates.patientData,
            vitals: updates.patientData.vitals
              ? { ...existingScenario.patientData?.vitals, ...updates.patientData.vitals }
              : existingScenario.patientData?.vitals,
            socialHistory: updates.patientData.socialHistory
              ? {
                  ...existingScenario.patientData?.socialHistory,
                  ...updates.patientData.socialHistory,
                }
              : existingScenario.patientData?.socialHistory,
          }
        : updates.patientData,
      aiPatientData: updates.aiPatientData
        ? { ...existingScenario.aiPatientData, ...updates.aiPatientData }
        : updates.aiPatientData,
      grading: updates.grading
        ? {
            ...existingScenario.grading,
            ...updates.grading,
            components: updates.grading.components
              ? { ...existingScenario.grading?.components, ...updates.grading.components }
              : existingScenario.grading?.components,
          }
        : updates.grading,
      productSetup: updates.productSetup
        ? { ...existingScenario.productSetup, ...updates.productSetup }
        : updates.productSetup,
      expectedActions: updates.expectedActions
        ? { ...existingScenario.expectedActions, ...updates.expectedActions }
        : updates.expectedActions,
    };

    await this.simulationRepository.updateById(sim.simulationId, mergedUpdates, {
      lockVoiceProfileId: mergedUpdates.voiceProfileId,
    });

    const savedScenario = await this.getScenarioById(id);
    if (savedScenario) {
      const aiRelevantChanged =
        existingScenario.avatarEnabled !== savedScenario.avatarEnabled ||
        existingScenario.department !== savedScenario.department ||
        existingScenario.unitId !== savedScenario.unitId;

      if (aiRelevantChanged && this.classSimulationService) {
        try {
          await this.classSimulationService.recalculateSeatsForSimulationChange(id);
        } catch (err) {
          this.logger.error(
            `[updateScenario] seat recalc failed for scenario ${id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    // DEBUG: Log saved actions to verify typeRequirement field was persisted
    if (savedScenario.actions) {
      this.logger.debug('=== SAVED SCENARIO ACTIONS DEBUG ===');
      savedScenario.actions.forEach((action: SimulationAction, idx: number) => {
        this.logger.debug(
          `Saved action ${idx}: title="${action.title}", typeRequirement="${action.typeRequirement}", isOptional=${action.isOptional}`,
        );
      });
      this.logger.debug('=== END SAVED SCENARIO ACTIONS DEBUG ===');
    }

    return savedScenario;
  }

  async deleteScenario(id: string) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Scenario ID is required');
    }
    const sim = await this.simulationRepository.findByBusinessId(id);
    if (!sim) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    // Hard delete — child tables (actions/orders/order links/rubric items)
    // CASCADE off simulation_id, matching the old blob delete's semantics
    // (fully and immediately gone), rather than a soft delete.
    await this.simulationRepository.delete(sim.simulationId);
    return { message: `Scenario with ID ${id} deleted successfully` };
  }

  /**
   * Forks an existing published scenario into a new draft version.
   * The parent published scenario is NOT modified — it stays live for students.
   * Enforces a single active draft per parent: if a draft already exists for
   * this parent it is updated in place rather than creating a duplicate.
   *
   * Draft ID format: `${parentId}-draft`
   */
  async createDraftVersion(parentId: string, data: Partial<SimulationV2>) {
    const parentSim = await this.simulationRepository.findByBusinessId(parentId);
    if (!parentSim) {
      throw new NotFoundException(`Scenario with ID ${parentId} not found`);
    }
    const parent = await this.getScenarioById(parentId);
    if (
      ((parent.status as SimulationStatus) ?? SimulationStatus.PUBLISHED) !==
      SimulationStatus.PUBLISHED
    ) {
      throw new BadRequestException(
        `Only published scenarios can be forked into a draft version (scenario ${parentId} has status "${parent.status ?? SimulationStatus.PUBLISHED}")`,
      );
    }

    const draftId = `${parentId}-draft`;
    const existingDraftSim =
      await this.simulationRepository.findByBusinessIdWithChildrenJoined(draftId);

    if (existingDraftSim) {
      // Reuse the existing draft — update it in place.
      const existingDraft = await this.getScenarioById(draftId);
      const updates: Partial<SimulationV2> = {
        ...data,
        id: draftId,
        status: SimulationStatus.DRAFT,
        parentScenarioId: parentId,
        versionNumber: existingDraft.versionNumber ?? (parent.versionNumber ?? 1) + 1,
      };
      await this.updateScenario(draftId, updates);
      return this.getScenarioById(draftId);
    }

    // Create a fresh draft version linked to the parent.
    // Strip the original id from `data` so we use the derived draftId.

    const { id: _ignored, ...dataWithoutId } = data as Partial<SimulationV2> & { id?: string };

    // `parent.orders` is the frontend-facing OrderDefinition[] shape (see
    // getScenarioById) — SimulationV2Repository.create() normalizes it back
    // to real SimulationOrder fields before persisting (see
    // fromOrderDefinitions in order-definition.util.ts), so it's safe to
    // pass through as-is.
    const draft: Partial<SimulationV2> = {
      ...parent,
      ...dataWithoutId,
      grading: (dataWithoutId.grading
        ? { ...data.grading, rubric: undefined }
        : undefined) as unknown as ISimulationGrading,
      id: draftId,
      status: SimulationStatus.DRAFT,
      parentScenarioId: parentId,
      versionNumber: (parent.versionNumber ?? 1) + 1,
      gradingRubricItems: dataWithoutId.grading?.rubric as unknown as SimulationGradingRubricItem[],
      orders: dataWithoutId.orders ?? (parent.orders as unknown as SimulationOrder[] | undefined),
      simulationId: undefined,
    };

    // Same check createScenario/updateScenario run: the body can carry any voiceProfileId.
    await this.voiceProfilesService.assertValidForScenarioWrite(draft.voiceProfileId);

    this.logger.log(`Creating draft version "${draftId}" forked from published "${parentId}"`);

    await this.simulationRepository.create(draft, { lockVoiceProfileId: draft.voiceProfileId });
    return this.getScenarioById(draftId);
  }

  /**
   * Promotes a draft version to published.
   * - Merges the draft's content into the original parent scenario (keeps the original ID).
   * - Deletes the draft row entirely — no orphaned records.
   */
  async publishDraftVersion(draftId: string, data: Partial<SimulationV2>) {
    const draftSim = await this.simulationRepository.findByBusinessId(draftId);
    if (!draftSim) {
      throw new NotFoundException(`Draft scenario with ID "${draftId}" not found`);
    }
    const draft = await this.getScenarioById(draftId);
    if (draft.status !== SimulationStatus.DRAFT) {
      throw new BadRequestException(
        `Scenario "${draftId}" is not a draft (status: "${draft.status ?? SimulationStatus.PUBLISHED}")`,
      );
    }
    if (!draft.parentScenarioId) {
      throw new BadRequestException(
        `Scenario "${draftId}" has no parent_scenario_id — use the standard publish flow instead`,
      );
    }

    const parentId = draft.parentScenarioId;
    const parentSim = await this.simulationRepository.findByBusinessIdWithChildrenJoined(parentId);
    if (!parentSim) {
      throw new NotFoundException(`Parent scenario "${parentId}" not found`);
    }

    // Validate title — drafts bypass title validation; publishing requires it.
    const incomingTitle = data.title ?? draft.title;
    if (typeof incomingTitle !== 'string' || !incomingTitle.trim()) {
      throw new BadRequestException('Scenario Title is required before publishing');
    }

    this.validateProductSetup(data, draft);

    // `draft.orders` is the frontend-facing OrderDefinition[] shape (see
    // getScenarioById) — SimulationV2Repository.updateById() normalizes it
    // back to real SimulationOrder fields before persisting (see
    // fromOrderDefinitions in order-definition.util.ts), so it's safe to
    // pass through as-is when merged onto the parent below.

    // Merge draft content (plus any last-minute edits from `data`) onto the
    // parent record, keeping the original ID and setting status = 'published'.
    // Strip versioning meta fields so the parent stays clean.
    const {
      id: _id,
      parentScenarioId: _pid,
      versionNumber: _vn,
      status: _st,
      ...draftContent
    } = {
      ...draft,
      ...data,
    } as SimulationV2 & { id: string };

    await this.updateScenario(parentId, {
      ...draftContent,
      parentScenarioId: null,
      versionNumber: undefined,
      status: SimulationStatus.PUBLISHED,
    });
    this.logger.log(`Deleting draft "${draftId}" after promoting to parent "${parentId}"`);
    await this.simulationRepository.delete(draftSim.simulationId);

    this.logger.log(`Draft "${draftId}" content merged into "${parentId}" and published`);
    return this.getScenarioById(parentId);
  }

  // Unit Management
  // NOTE: the `units` table (src/database/entities/unit.entity.ts) only has a single
  // `category` column, not the `categories: string[]` array this admin editor was built
  // against. Only the first resolved category is persisted; `categories` below is derived
  // by wrapping that single value back into an array for API-shape compatibility. Real
  // multi-category support would need a schema change (e.g. a `categories jsonb` column).
  async getAllUnits() {
    const entities = await this.unitRepository.find({
      order: { name: 'ASC' },
    });
    return Promise.all(
      entities.map(async (entity) => {
        const unit = this.mapUnitEntityToUnit(entity);
        const simulations = await this.simulationRepository.findByUnitId(unit.id);
        const legacyCategory = unit.category;
        const resolvedCategories =
          unit.categories && unit.categories.length > 0
            ? unit.categories
            : legacyCategory
              ? [legacyCategory]
              : [UnitCategory.AI_ONLY];
        const resolvedCategory = legacyCategory ?? resolvedCategories[0];
        return {
          ...unit,
          category: resolvedCategory,
          categories: resolvedCategories,
          scenarioCount: simulations.length,
          completedCount: unit.completedCount ?? 0,
        };
      }),
    );
  }

  async getUnitById(id: string) {
    const entity = await this.unitRepository.findByBusinessId(id);
    if (!entity) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }
    const unit = this.mapUnitEntityToUnit(entity);
    const simulations = await this.simulationRepository.findByUnitId(id);
    const legacyCategory = unit.category;
    const resolvedCategories =
      unit.categories && unit.categories.length > 0
        ? unit.categories
        : legacyCategory
          ? [legacyCategory]
          : [UnitCategory.AI_ONLY];
    const resolvedCategory = legacyCategory ?? resolvedCategories[0];
    return {
      ...unit,
      category: resolvedCategory,
      categories: resolvedCategories,
      scenarioCount: simulations.length,
    };
  }

  async createUnit(unitData: Partial<Unit>) {
    // Validate required ID
    if (!unitData.id?.trim()) {
      throw new BadRequestException('Unit ID is required');
    }

    // Validate Unit ID length
    if (unitData.id.trim().length > 32) {
      throw new BadRequestException('Unit ID must not exceed 32 characters.');
    }

    // Check if ID already exists
    const existingUnit = await this.unitRepository.findByBusinessId(unitData.id);
    if (existingUnit) {
      throw new BadRequestException(`Unit with ID ${unitData.id} already exists`);
    }

    // Validate Unit ID allowed characters: alphabets, numbers, hyphens, underscores and spaces
    const idRegex = /^[a-zA-Z0-9-_\s]+$/;
    if (!idRegex.test(unitData.id.trim())) {
      throw new BadRequestException(
        'Unit ID can only contain letters, numbers, hyphens, underscores, and spaces.',
      );
    }

    // Validate required name
    if (!unitData.name?.trim()) {
      throw new BadRequestException('Unit name is required');
    }

    // Validate name length
    if (unitData.name.trim().length > 48) {
      throw new BadRequestException('Unit name must not exceed 48 characters.');
    }

    // Validate allowed characters: alphabets, numbers, and spaces
    const nameRegex = /^[a-zA-Z0-9\s]+$/;
    if (!nameRegex.test(unitData.name.trim())) {
      throw new BadRequestException('Unit name can only contain letters, numbers, and spaces.');
    }

    // Check if name already exists (case-insensitive)
    const unitWithSameName = await this.unitRepository.findUniqueByName(unitData.name);
    if (unitWithSameName) {
      throw new BadRequestException(
        `Unit with name "${unitData.name}" already exists. Unit name must be unique.`,
      );
    }

    // Validate and resolve categories (default to [UnitCategory.AI_ONLY] if not provided)
    const resolvedCategories: string[] =
      unitData.categories && unitData.categories.length > 0
        ? unitData.categories
        : [UnitCategory.AI_ONLY];

    const invalidCats = resolvedCategories.filter((c) => !VALID_UNIT_CATEGORIES.includes(c));
    if (invalidCats.length > 0) {
      throw new BadRequestException(
        `Invalid categories: ${invalidCats.join(', ')}. Valid options are: ${VALID_UNIT_CATEGORIES.join(', ')}.`,
      );
    }

    const unit: Unit = {
      id: String(unitData.id),
      name: unitData.name ?? '',
      imageUrl: unitData.imageUrl ?? '',
      categories: resolvedCategories,
      category: resolvedCategories[0],
      actions: unitData.actions ?? [],
      actionGroupName: unitData.actionGroupName ?? '',
      actionGroupDescription: unitData.actionGroupDescription ?? '',
    };

    await this.unitRepository.create({
      id: unit.id,
      name: unit.name,
      imageUrl: unit.imageUrl,
      category: resolvedCategories[0] as UnitCategory,
      actions: unit.actions,
      actionGroupName: unit.actionGroupName,
      actionGroupDescription: unit.actionGroupDescription,
    });

    return unit;
  }

  async updateUnit(id: string, updates: Partial<Unit>) {
    const existingUnit = await this.unitRepository.findByBusinessId(id);
    if (!existingUnit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }

    // Check for duplicate name if name is being updated
    if (updates.name !== undefined) {
      if (!updates.name?.trim()) {
        throw new BadRequestException('Unit name is required');
      }

      // Validate name length
      if (updates.name.trim().length > 48) {
        throw new BadRequestException('Unit name must not exceed 48 characters.');
      }

      // Validate allowed characters: alphabets, numbers, and spaces
      const nameRegex = /^[a-zA-Z0-9\s]+$/;
      if (!nameRegex.test(updates.name.trim())) {
        throw new BadRequestException('Unit name can only contain letters, numbers, and spaces.');
      }

      // Check if name already exists (case-insensitive)
      const unitWithSameName = await this.unitRepository.findUniqueByName(updates.name);
      if (unitWithSameName && unitWithSameName.id !== id) {
        throw new BadRequestException(
          `Unit with name "${updates.name}" already exists. Unit name must be unique.`,
        );
      }
    }

    // Handle categories update
    if (updates.categories !== undefined) {
      if (updates.categories.length === 0) {
        throw new BadRequestException('At least one category is required');
      }
      const invalidCats = updates.categories.filter((c) => !VALID_UNIT_CATEGORIES.includes(c));
      if (invalidCats.length > 0) {
        throw new BadRequestException(
          `Invalid categories: ${invalidCats.join(', ')}. Valid options are: ${VALID_UNIT_CATEGORIES.join(', ')}.`,
        );
      }
    }

    const dbUpdates: DeepPartial<UnitEntity> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.imageUrl !== undefined) dbUpdates.imageUrl = updates.imageUrl;
    if (updates.actionGroupName !== undefined) dbUpdates.actionGroupName = updates.actionGroupName;
    if (updates.actionGroupDescription !== undefined)
      dbUpdates.actionGroupDescription = updates.actionGroupDescription;
    if (updates.actions !== undefined) dbUpdates.actions = updates.actions;
    if (updates.categories !== undefined)
      dbUpdates.category = updates.categories[0] as UnitCategory;
    else if (updates.category !== undefined) dbUpdates.category = updates.category as UnitCategory;

    await this.unitRepository.update({ id }, dbUpdates);

    const savedEntity = await this.unitRepository.findByBusinessId(id);
    if (!savedEntity) {
      throw new NotFoundException(`Unit with ID ${id} not found after update`);
    }

    if (existingUnit.category !== savedEntity.category && this.classSimulationService) {
      try {
        await this.classSimulationService.recalculateSeatsForUnitCategoryChange(id);
      } catch (err) {
        this.logger.error(
          `[updateUnit] seat recalc failed for unit ${id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const saved = this.mapUnitEntityToUnit(savedEntity);
    return { ...saved, categories: saved.categories ?? [UnitCategory.AI_ONLY] };
  }

  async deleteUnit(id: string) {
    const unit = await this.unitRepository.findByBusinessId(id);
    if (!unit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }

    // Check if unit has scenarios
    const simulations = await this.simulationRepository.findByUnitId(id);
    if (simulations.length > 0) {
      throw new BadRequestException(
        `Cannot delete unit ${id}. It has ${simulations.length} scenario(s) associated with it. Please delete or reassign scenarios first.`,
      );
    }

    await this.unitRepository.softDelete(unit.unitId);
    return { message: `Unit with ID ${id} deleted successfully` };
  }

  async getReportById(id: string): Promise<ReportDetail> {
    const row = await this.simulationReportRepository.findDetailRowByReportId(id);

    if (!row) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    return mapRowToReportDetail(row);
  }

  // -----------------------------------------------------------------------
  // Action Category Management — read-only. Categories are read from the simulation row's
  // `actionCategories`; there is no dedicated table, and create/update/delete were retired.
  // -----------------------------------------------------------------------
  async getScenarioCategories(scenarioId: string) {
    const scenario = await this.simulationRepository.findOne({ where: { id: scenarioId } });
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${scenarioId} not found`);
    }
    return (scenario?.['actionCategories'] ?? []) as unknown as string[];
  }
}
