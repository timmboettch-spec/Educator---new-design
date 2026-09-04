import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';

import {
  JsonDataService,
  type Action,
  type Permission,
  type Scenario,
  type Unit,
} from '../../data/json-data.service';

export interface StudentWithStats {
  id: string;
  name: string;
  email: string;
  role: string;
  key?: string;
  permission?: Permission;
  unitsCount: number;
  scenariosEnrolledCount: number;
  units: string[];
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private static readonly PRODUCT_NAME_MAX_LENGTH = 100;

  constructor(private jsonDataService: JsonDataService) {}

  getStudents() {
    return this.jsonDataService.getPermissionsData().permissions;
  }

  private static normalizeProductName(value: string): string {
    // Collapse any internal whitespace runs to a single space and trim ends.
    return value.replace(/\s+/g, ' ').trim();
  }

  private validateProductSetup(scenarioData: Partial<Scenario>, previousScenario?: Scenario): void {
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

  getAllStudentsWithStats(): StudentWithStats[] {
    const users = this.jsonDataService.getUsers();
    const permissions = this.jsonDataService.getPermissionsData();
    const transcripts = this.jsonDataService.getTranscripts();
    const scenarios = this.jsonDataService.getScenarios();

    // Start with permissions from username-units.json as the source of truth
    // Each permission entry represents a student
    const studentsFromPermissions = permissions.permissions.map((permission) => {
      // Try to find a matching user in users.json by name or email
      const matchedUser = users.find((u) => {
        // Match by name (case-insensitive)
        if (permission.name && u.name.toLowerCase() === permission.name.toLowerCase()) {
          return true;
        }
        // Match by email prefix (if key matches email prefix)
        if (u.email.split('@')[0].toLowerCase() === permission.key.toLowerCase()) {
          return true;
        }
        // Match by name partial match (first name)
        if (permission.name) {
          const permissionFirstName = permission.name.toLowerCase().split(' ')[0];
          const userNameFirst = u.name.toLowerCase().split(' ')[0];
          if (permissionFirstName === userNameFirst) {
            return true;
          }
        }
        return false;
      });

      // Calculate scenarios enrolled count
      // Count scenarios that are in the units this permission has access to
      const scenariosInUnits = scenarios.filter((s) => permission.units.includes(s.unitId)).length;

      // Count transcripts/scenarios the user has actually enrolled in
      let scenariosEnrolledCount = 0;
      if (matchedUser) {
        const userTranscripts = transcripts.filter((t) => t.userId === matchedUser.id);
        scenariosEnrolledCount = new Set(userTranscripts.map((t) => t.scenarioId)).size;
      }

      // Use the higher of the two counts (scenarios in units vs actually enrolled)
      const finalScenariosCount = Math.max(scenariosInUnits, scenariosEnrolledCount);

      return {
        id: matchedUser?.id ?? `permission-${permission.key}`,
        name: matchedUser?.name ?? permission.name ?? permission.key,
        email: matchedUser?.email ?? `${permission.key}@example.com`,
        role: matchedUser?.role ?? 'student',
        key: permission.key,
        permission,
        unitsCount: permission.units?.length ?? 0,
        scenariosEnrolledCount: finalScenariosCount,
        units: permission.units || [],
      };
    });

    return studentsFromPermissions;
  }

  getAllPermissions() {
    return this.jsonDataService.getPermissionsData();
  }

  createOrUpdatePermission(dto: {
    name?: string;
    key: string;
    units: string[];
    scenarios?: string[];
    avatars?: string[];
  }) {
    const permissionsData = this.jsonDataService.getPermissionsData();
    const existingIndex = permissionsData.permissions.findIndex(
      (p) => p.key.toLowerCase() === dto.key.toLowerCase(),
    );

    // Validate units exist
    const allUnits = this.jsonDataService.getUnits();
    const validUnitIds = allUnits.map((u) => u.id);
    const invalidUnits = dto.units.filter((unitId) => !validUnitIds.includes(unitId));

    if (invalidUnits.length > 0) {
      throw new NotFoundException(`Invalid unit IDs: ${invalidUnits.join(', ')}`);
    }

    const permission: Permission = {
      key: dto.key,
      units: dto.units,
      scenarios: dto.scenarios ?? [],
      avatars: dto.avatars ?? [],
    };

    if (dto.name) {
      permission.name = dto.name;
    }

    if (existingIndex !== -1) {
      permissionsData.permissions[existingIndex] = permission;
    } else {
      permissionsData.permissions.push(permission);
    }

    this.jsonDataService.updatePermissions(permissionsData.permissions);

    return permission;
  }

  assignUnitToPermission(key: string, unitId: string, name?: string) {
    if (!key?.trim()) {
      throw new BadRequestException('Key is required to assign a unit');
    }

    const unit = this.jsonDataService.getUnitById(unitId);

    if (!unit) {
      throw new NotFoundException(`Unit with ID ${unitId} not found`);
    }

    const permissionsData = this.jsonDataService.getPermissionsData();
    const normalizedKey = key.toLowerCase();

    let permission = permissionsData.permissions.find((p) => p.key.toLowerCase() === normalizedKey);

    if (!permission) {
      permission = {
        key,
        name,
        units: [],
        scenarios: [],
        avatars: [],
      };
      permissionsData.permissions.push(permission);
    }

    if (!permission.units.includes(unitId)) {
      permission.units.push(unitId);
    }

    if (name && !permission.name) {
      permission.name = name;
    }

    this.jsonDataService.updatePermissions(permissionsData.permissions);

    return permission;
  }

  createStudent(dto: { name: string; email: string; key: string; units?: string[] }) {
    const permissionsData = this.jsonDataService.getPermissionsData();

    // Check if key already exists
    const existingPermission = permissionsData.permissions.find(
      (p) => p.key.toLowerCase() === dto.key.toLowerCase(),
    );

    if (existingPermission) {
      throw new NotFoundException(`Student with key ${dto.key} already exists`);
    }

    // Validate units if provided
    if (dto.units && dto.units.length > 0) {
      const allUnits = this.jsonDataService.getUnits();
      const validUnitIds = allUnits.map((u) => u.id);
      const invalidUnits = dto.units.filter((unitId) => !validUnitIds.includes(unitId));

      if (invalidUnits.length > 0) {
        throw new NotFoundException(`Invalid unit IDs: ${invalidUnits.join(', ')}`);
      }
    }

    const permission: Permission = {
      key: dto.key,
      name: dto.name,
      units: dto.units ?? [],
      scenarios: [],
      avatars: [],
    };

    permissionsData.permissions.push(permission);
    this.jsonDataService.updatePermissions(permissionsData.permissions);

    return permission;
  }

  // Scenario Management
  getAllScenarios() {
    return this.jsonDataService.getScenarios();
  }

  async getScenarioById(id: string) {
    const scenario = await this.jsonDataService.getScenarioByIdEnOnly(id);
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }
    return scenario;
  }

  async createScenario(scenarioData: Partial<Scenario>) {
    // Validate required scenario ID
    if (typeof scenarioData.id !== 'string' || scenarioData.id === '' || !scenarioData.id.trim()) {
      this.logger.warn(`Invalid scenario ID: ${String(scenarioData.id)}`);
      throw new BadRequestException('Scenario ID is required');
    }

    // Check if scenario ID already exists
    const existingScenario = this.jsonDataService.getScenarioById(scenarioData.id);
    if (existingScenario) {
      throw new BadRequestException(
        `Scenario with ID ${scenarioData.id} already exists. Scenario ID must be unique.`,
      );
    }

    // Validate scenario title — required only when publishing (not for drafts)
    const isDraft = scenarioData.status === 'draft';
    if (!isDraft) {
      if (typeof scenarioData.title !== 'string' || !scenarioData.title.trim()) {
        throw new BadRequestException('Scenario Title is required');
      }
    }

    this.validateProductSetup(scenarioData);

    // Only check for duplicate titles when a title is actually provided
    const normalizedTitle = scenarioData.title?.trim().toLowerCase() ?? '';

    const scenarios = this.jsonDataService.getScenarios();

    if (normalizedTitle) {
      const existingScenarioWithTitle = scenarios.find(
        (scenario) => scenario.title?.trim().toLowerCase() === normalizedTitle,
      );

      if (existingScenarioWithTitle) {
        throw new BadRequestException(
          `Scenario with title "${scenarioData.title}" already exists. Scenario title must be unique.`,
        );
      }
    }

    // Validate unit exists
    if (scenarioData.unitId) {
      const unit = this.jsonDataService.getUnitById(scenarioData.unitId);
      if (!unit) {
        throw new NotFoundException(`Unit with ID ${scenarioData.unitId} not found`);
      }
    }

    const scenario: Scenario = {
      id: scenarioData.id,
      unitId: scenarioData.unitId ?? '',
      title: scenarioData.title ?? '',
      difficulty: scenarioData.difficulty ?? 'Medium',
      avatarEnabled: scenarioData.avatarEnabled ?? false,
      avatarId: scenarioData.avatarId ?? '',
      contextId: scenarioData.contextId ?? '',
      learnerLevel: scenarioData.learnerLevel ?? '',
      department: scenarioData.department ?? '',
      description: scenarioData.description ?? '',
      learningObjective: scenarioData.learningObjective ?? '',
      language: scenarioData.language,
      voice: scenarioData.voice,
      disabled: scenarioData.disabled ?? false,
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
      historyPrompts: scenarioData.historyPrompts ?? [],
      assessmentGuidance: scenarioData.assessmentGuidance,
      learningObjectiveCard: scenarioData.learningObjectiveCard ?? '',
      phases: scenarioData.phases ?? [],
      availableMedications: scenarioData.availableMedications ?? [],
      conversationResponses: scenarioData.conversationResponses,
      grading: scenarioData.grading,
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
      actionCategories: scenarioData.actionCategories ?? [],
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
      realClinical: scenarioData.realClinical,
      hsRealClinical: scenarioData.hsRealClinical,
      psRealClinical: scenarioData.psRealClinical,
      // Persist draft/publish status. Default to 'draft' for new scenarios
      // so they are hidden from students until explicitly published.
      status: scenarioData.status ?? 'draft',
    };

    this.logger.log(`Creating scenario: ${scenario.id}`);

    await this.jsonDataService.addScenario(scenario);
    return scenario;
  }

  async updateScenario(id: string, updates: Partial<Scenario>) {
    const existingScenario = this.jsonDataService.getScenarioById(id);

    if (!existingScenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    this.validateProductSetup(updates, existingScenario);

    // DEBUG: Log incoming actions to verify typeRequirement field
    if (updates.actions) {
      this.logger.debug('=== UPDATE SCENARIO ACTIONS DEBUG ===');
      updates.actions.forEach((action: Action, idx: number) => {
        this.logger.debug(
          `Incoming action ${idx}: title="${action.title}", typeRequirement="${action.typeRequirement}", isOptional=${action.isOptional}`,
        );
      });
      this.logger.debug('=== END UPDATE SCENARIO ACTIONS DEBUG ===');
    }

    const isDraftSave =
      (existingScenario.status ?? 'published') === 'draft' || updates.status === 'draft';

    if (!isDraftSave && updates.title !== undefined) {
      if (typeof updates.title !== 'string' || !updates.title.trim()) {
        throw new BadRequestException('Scenario Title is required');
      }

      const normalizedTitle = updates.title.trim().toLowerCase();
      const scenarios = this.jsonDataService.getScenarios();

      const duplicateTitleScenario = scenarios.find(
        (s) =>
          s.id !== id &&
          s.id !== existingScenario.parent_scenario_id &&
          s.title?.trim().toLowerCase() === normalizedTitle,
      );

      if (duplicateTitleScenario) {
        throw new BadRequestException(
          `Scenario with title "${updates.title}" already exists. Scenario title must be unique.`,
        );
      }
    }

    if (!isDraftSave && existingScenario.unitId) {
      const unit = this.jsonDataService.getUnitById(existingScenario.unitId);
      if (!unit) {
        throw new NotFoundException(`Unit with ID ${existingScenario.unitId} not found`);
      }
    }

    // Apply updates
    const updatedData = {
      ...updates,
      // disabled: false, // ✔ Always enable scenario after purchase
    };

    await this.jsonDataService.updateScenario(id, updatedData);

    const savedScenario = this.jsonDataService.getScenarioById(id);

    // DEBUG: Log saved actions to verify typeRequirement field was persisted
    if (savedScenario?.actions) {
      this.logger.debug('=== SAVED SCENARIO ACTIONS DEBUG ===');
      savedScenario.actions.forEach((action: Action, idx: number) => {
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
    const scenario = this.jsonDataService.getScenarioById(id);
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    await this.jsonDataService.deleteScenario(id);
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
  async createDraftVersion(parentId: string, data: Partial<Scenario>) {
    const parent = this.jsonDataService.getScenarioById(parentId);
    if (!parent) {
      throw new NotFoundException(`Scenario with ID ${parentId} not found`);
    }
    if ((parent.status ?? 'published') !== 'published') {
      throw new BadRequestException(
        `Only published scenarios can be forked into a draft version (scenario ${parentId} has status "${parent.status ?? 'published'}")`,
      );
    }

    const draftId = `${parentId}-draft`;
    const existingDraft = this.jsonDataService.getScenarioById(draftId);

    if (existingDraft) {
      // Reuse the existing draft — update it in place.
      const updates: Partial<Scenario> = {
        ...data,
        id: draftId,
        status: 'draft',
        parent_scenario_id: parentId,
        version_number: existingDraft.version_number ?? (parent.version_number ?? 1) + 1,
      };
      await this.jsonDataService.updateScenario(draftId, updates);
      return this.jsonDataService.getScenarioById(draftId);
    }

    // Create a fresh draft version linked to the parent.
    // Strip the original id from `data` so we use the derived draftId.

    const { id: _ignored, ...dataWithoutId } = data as Partial<Scenario> & { id?: string };

    const draft: Scenario = {
      ...parent,
      ...dataWithoutId,
      id: draftId,
      status: 'draft',
      parent_scenario_id: parentId,
      version_number: (parent.version_number ?? 1) + 1,
    };

    this.logger.log(`Creating draft version "${draftId}" forked from published "${parentId}"`);
    await this.jsonDataService.addScenario(draft);
    return draft;
  }

  /**
   * Promotes a draft version to published.
   * - Merges the draft's content into the original parent scenario (keeps the original ID).
   * - Deletes the draft blob entirely — no orphaned records.
   *
   * Result:
   *   en/scenario/{parentId}.json  → status: "published"  (updated with draft content)
   *   en/scenario/{draftId}.json   → DELETED
   */
  async publishDraftVersion(draftId: string, data: Partial<Scenario>) {
    const draft = this.jsonDataService.getScenarioById(draftId);
    if (!draft) {
      throw new NotFoundException(`Draft scenario with ID "${draftId}" not found`);
    }
    if (draft.status !== 'draft') {
      throw new BadRequestException(
        `Scenario "${draftId}" is not a draft (status: "${draft.status ?? 'published'}")`,
      );
    }
    if (!draft.parent_scenario_id) {
      throw new BadRequestException(
        `Scenario "${draftId}" has no parent_scenario_id — use the standard publish flow instead`,
      );
    }

    const parentId = draft.parent_scenario_id;
    const parent = this.jsonDataService.getScenarioById(parentId);
    if (!parent) {
      throw new NotFoundException(`Parent scenario "${parentId}" not found`);
    }

    // Validate title — drafts bypass title validation; publishing requires it.
    const incomingTitle = data.title ?? draft.title;
    if (typeof incomingTitle !== 'string' || !incomingTitle.trim()) {
      throw new BadRequestException('Scenario Title is required before publishing');
    }

    this.validateProductSetup(data, draft);

    // Merge draft content (plus any last-minute edits from `data`) onto the
    // parent record, keeping the original ID and setting status = 'published'.
    // Strip versioning meta fields so the parent stays clean.

    const {
      id: _id,
      parent_scenario_id: _pid,
      version_number: _vn,
      status: _st,
      ...draftContent
    } = {
      ...draft,
      ...data,
    } as Scenario & { id: string };

    await this.jsonDataService.updateScenario(parentId, {
      ...draftContent,
      id: parentId,
      status: 'published',
      parent_scenario_id: undefined,
      version_number: undefined,
    });

    // Delete the draft blob — no duplicate records remain.
    this.logger.log(`Deleting draft blob "${draftId}" after promoting to parent "${parentId}"`);
    await this.jsonDataService.deleteScenario(draftId);

    this.logger.log(`Draft "${draftId}" content merged into "${parentId}" and published`);
    return this.jsonDataService.getScenarioById(parentId);
  }

  // Unit Management
  getAllUnits() {
    const units = this.jsonDataService.getUnits();
    return units.map((unit) => {
      const scenarios = this.jsonDataService.getScenariosByUnitId(unit.id);
      const legacyCategory = unit.category;
      const resolvedCategories =
        unit.categories && unit.categories.length > 0
          ? unit.categories
          : legacyCategory
            ? [legacyCategory]
            : ['AI Only'];
      const resolvedCategory = legacyCategory ?? resolvedCategories[0];
      return {
        ...unit,
        category: resolvedCategory,
        categories: resolvedCategories,
        scenarioCount: scenarios.length,
        completedCount: unit.completedCount ?? 0,
      };
    });
  }

  getUnitById(id: string) {
    const unit = this.jsonDataService.getUnitById(id);
    if (!unit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }
    const scenarios = this.jsonDataService.getScenariosByUnitId(id);
    const legacyCategory = unit.category;
    const resolvedCategories =
      unit.categories && unit.categories.length > 0
        ? unit.categories
        : legacyCategory
          ? [legacyCategory]
          : ['AI Only'];
    const resolvedCategory = legacyCategory ?? resolvedCategories[0];
    return {
      ...unit,
      category: resolvedCategory,
      categories: resolvedCategories,
      scenarioCount: scenarios.length,
    };
  }

  createUnit(unitData: Partial<Unit>) {
    // Validate required ID
    if (!unitData.id?.trim()) {
      throw new BadRequestException('Unit ID is required');
    }

    // Validate Unit ID length
    if (unitData.id.trim().length > 32) {
      throw new BadRequestException('Unit ID must not exceed 32 characters.');
    }

    // Check if ID already exists
    const existingUnit = this.jsonDataService.getUnitById(unitData.id);
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
    const normalizedName = unitData.name.trim().toLowerCase();
    const allUnits = this.jsonDataService.getUnits();
    const unitWithSameName = allUnits.find((u) => u.name?.trim().toLowerCase() === normalizedName);
    if (unitWithSameName) {
      throw new BadRequestException(
        `Unit with name "${unitData.name}" already exists. Unit name must be unique.`,
      );
    }

    // Validate and resolve categories (default to ['AI Only'] if not provided)
    const resolvedCategories: string[] =
      unitData.categories && unitData.categories.length > 0 ? unitData.categories : ['AI Only'];

    const validCategoryOptions = ['AI Only', 'Manikins', 'Trainers'];
    const invalidCats = resolvedCategories.filter((c) => !validCategoryOptions.includes(c));
    if (invalidCats.length > 0) {
      throw new BadRequestException(
        `Invalid categories: ${invalidCats.join(', ')}. Valid options are: ${validCategoryOptions.join(', ')}.`,
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

    this.jsonDataService.addUnit(unit);
    return unit;
  }

  updateUnit(id: string, updates: Partial<Unit>) {
    const existingUnit = this.jsonDataService.getUnitById(id);
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

      const normalizedName = updates.name.trim().toLowerCase();
      const allUnits = this.jsonDataService.getUnits();
      const unitWithSameName = allUnits.find(
        (u) => u.id !== id && u.name?.trim().toLowerCase() === normalizedName,
      );
      if (unitWithSameName) {
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
      const validCategoryOptions = ['AI Only', 'Manikins', 'Trainers'];
      const invalidCats = updates.categories.filter((c) => !validCategoryOptions.includes(c));
      if (invalidCats.length > 0) {
        throw new BadRequestException(
          `Invalid categories: ${invalidCats.join(', ')}. Valid options are: ${validCategoryOptions.join(', ')}.`,
        );
      }
    }

    this.jsonDataService.updateUnit(id, updates);
    const saved = this.jsonDataService.getUnitById(id);
    if (!saved) {
      throw new NotFoundException(`Unit with ID ${id} not found after update`);
    }
    return { ...saved, categories: saved.categories ?? ['AI Only'] };
  }

  deleteUnit(id: string) {
    const unit = this.jsonDataService.getUnitById(id);
    if (!unit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }

    // Check if unit has scenarios
    const scenarios = this.jsonDataService.getScenariosByUnitId(id);
    if (scenarios.length > 0) {
      throw new BadRequestException(
        `Cannot delete unit ${id}. It has ${scenarios.length} scenario(s) associated with it. Please delete or reassign scenarios first.`,
      );
    }

    this.jsonDataService.deleteUnit(id);
    return { message: `Unit with ID ${id} deleted successfully` };
  }

  async getReportById(id: string) {
    const report = await this.jsonDataService.getReportByIdFresh(id);

    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    return report;
  }

  // Action Category Management
  getScenarioCategories(scenarioId: string) {
    const scenario = this.jsonDataService.getScenarioById(scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${scenarioId} not found`);
    }
    return this.jsonDataService.getActionCategories(scenarioId);
  }

  async createCategory(
    scenarioId: string,
    data: { name: string; description?: string; color?: string },
  ) {
    const scenario = this.jsonDataService.getScenarioById(scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${scenarioId} not found`);
    }

    if (!data.name?.trim()) {
      throw new BadRequestException('Category name is required');
    }

    try {
      return await this.jsonDataService.createActionCategory(scenarioId, data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already exists')) {
        throw new BadRequestException(message);
      }
      throw error;
    }
  }

  async updateCategory(
    scenarioId: string,
    categoryId: string,
    updates: { name?: string; description?: string; color?: string },
  ) {
    const scenario = this.jsonDataService.getScenarioById(scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${scenarioId} not found`);
    }

    if (updates.name !== undefined && !updates.name.trim()) {
      throw new BadRequestException('Category name cannot be empty');
    }

    try {
      return await this.jsonDataService.updateActionCategory(scenarioId, categoryId, updates);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already exists')) {
        throw new BadRequestException(message);
      }
      if (message.includes('not found')) {
        throw new NotFoundException(message);
      }
      if (message.includes('Cannot modify')) {
        throw new BadRequestException(message);
      }
      throw error;
    }
  }

  async deleteCategory(scenarioId: string, categoryId: string) {
    const scenario = this.jsonDataService.getScenarioById(scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${scenarioId} not found`);
    }

    try {
      await this.jsonDataService.deleteActionCategory(scenarioId, categoryId);
      return {
        message: `Category deleted successfully. Actions reassigned to Uncategorized.`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        throw new NotFoundException(message);
      }
      if (message.includes('Cannot delete')) {
        throw new BadRequestException(message);
      }
      throw error;
    }
  }
}
