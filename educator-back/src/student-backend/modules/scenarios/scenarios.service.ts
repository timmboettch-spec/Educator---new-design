import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { JsonDataService, type Scenario, type Unit } from '../../data/json-data.service';

type ScenarioWithProgress = Scenario & {
  unit?: Unit;
  completed?: boolean;
  progress?: number;
};

@Injectable()
export class ScenariosService {
  constructor(private jsonDataService: JsonDataService) {}

  async getDefaultScenario(scenarioId?: string): Promise<Scenario> {
    if (scenarioId) {
      // If a specific scenario ID is provided, return that scenario
      const scenario = await this.jsonDataService.getScenarioByIdFresh(scenarioId);
      if (!scenario) {
        throw new NotFoundException(`Scenario with ID ${scenarioId} not found`);
      }
      return scenario;
    }

    // Otherwise return the default scenario from default-scenarios.json
    const defaultScenario = this.jsonDataService.getDefaultScenario();

    if (!defaultScenario) {
      throw new NotFoundException('Default scenario not found');
    }

    return defaultScenario as Scenario;
  }

  async findAll(lang?: string): Promise<ScenarioWithProgress[]> {
    const scenarios = await this.jsonDataService.getAllScenariosLocalized(lang);
    // Filter out draft and archived scenarios — students must only see published scenarios.
    // Legacy scenarios without a status field are treated as published.
    return scenarios
      .filter((s) => (s.status ?? 'published') === 'published')
      .map((scenario) => ({
        ...scenario,
        unit: this.jsonDataService.getUnitById(scenario.unitId),
      }));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findByUnit(
    unitId: string,
    userId?: string,
    _lang?: string,
  ): Promise<ScenarioWithProgress[]> {
    // Filter out draft and archived scenarios — students must only see published scenarios.
    // Legacy scenarios without a status field are treated as published.
    const scenarios = this.jsonDataService
      .getScenariosByUnitId(unitId)
      .filter((s) => (s.status ?? 'published') === 'published');

    if (userId) {
      const transcripts = this.jsonDataService.getTranscriptsByUserId(userId);
      const completedScenarioIds = transcripts.filter((t) => t.endedAt).map((t) => t.scenarioId);

      return scenarios.map((scenario) => ({
        ...scenario,
        unit: this.jsonDataService.getUnitById(unitId),
        completed: completedScenarioIds.includes(scenario.id),
        progress: completedScenarioIds.includes(scenario.id) ? 100 : 0,
      }));
    }

    return scenarios.map((scenario) => ({
      ...scenario,
      unit: this.jsonDataService.getUnitById(unitId),
    }));
  }

  async findOne(id: string, userId?: string, lang?: string): Promise<ScenarioWithProgress> {
    const scenario = await this.jsonDataService.getScenarioByIdLocalized(id, lang);

    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    // Block student access to draft scenarios.
    if ((scenario.status ?? 'published') === 'draft') {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    const result: ScenarioWithProgress = {
      ...scenario,
      unit: this.jsonDataService.getUnitById(scenario.unitId),
    };

    if (userId) {
      const transcripts = this.jsonDataService.getTranscriptsByUserId(userId);
      const transcript = transcripts.find(
        (t) => t.userId === userId && t.scenarioId === id && t.endedAt,
      );
      result.completed = !!transcript;
      result.progress = transcript ? 100 : 0;
    }

    return result;
  }

  async createScenario(scenarioData: Scenario): Promise<Scenario> {
    if (
      scenarioData.requiresProductSetup &&
      (!scenarioData.productSetup?.title || scenarioData.productSetup.title.trim() === '')
    ) {
      throw new BadRequestException(
        'Product Name is required when physical product setup is enabled',
      );
    }

    // Add the scenario to scenarios.json
    await this.jsonDataService.addScenario(scenarioData);

    // Save as default scenario for future use
    this.jsonDataService.saveAsDefaultScenario(scenarioData);

    return scenarioData;
  }

  async updateScenario(id: string, updates: Partial<Scenario>): Promise<Scenario> {
    const scenario = this.jsonDataService.getScenarioById(id);

    if (!scenario) {
      throw new NotFoundException('Scenario not found');
    }

    const mergedScenario: Scenario = { ...scenario, ...updates };

    if (
      mergedScenario.requiresProductSetup &&
      (!mergedScenario.productSetup?.title || mergedScenario.productSetup.title.trim() === '')
    ) {
      throw new BadRequestException(
        'Product Name is required when physical product setup is enabled',
      );
    }

    const updatedScenario: Scenario = {
      ...scenario,
      ...updates,
    };

    await this.jsonDataService.updateScenario(id, updates);

    return updatedScenario;
  }
}
