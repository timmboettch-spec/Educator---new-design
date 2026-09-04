import { Test } from '@nestjs/testing';
import { ScenariosService } from '@/modules/scenarios/scenarios.service';
import { JsonDataService } from '@/data/json-data.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { Scenario, Unit } from '@/data/json-data.service';

describe('ScenariosService', () => {
  let service: ScenariosService;
  let jsonDataService: jest.Mocked<JsonDataService>;

  beforeEach(async () => {
    const getScenarioById = jest.fn();
    const getScenarios = jest.fn();
    const getScenariosByUnitId = jest.fn();
    jsonDataService = {
      getDefaultScenarioById: jest.fn(),
      getDefaultScenario: jest.fn(),
      getScenarios,
      getScenariosByUnitId,
      getScenarioById,
      getScenarioByIdFresh: getScenarioById,
      // Localized wrappers used by ScenariosService. Delegate to the plain
      // getters so existing tests that seed data via `.mockReturnValue(...)`
      // on the non-localized mocks continue to work without modification.
      getAllScenariosLocalized: jest
        .fn()
        .mockImplementation(async (_lang?: string) => getScenarios()),
      getScenariosByUnitIdLocalized: jest
        .fn()
        .mockImplementation(async (unitId: string, _lang?: string) => getScenariosByUnitId(unitId)),
      getScenarioByIdLocalized: jest
        .fn()
        .mockImplementation(async (id: string, _lang?: string) => getScenarioById(id)),
      getUnitById: jest.fn(),
      getTranscriptsByUserId: jest.fn(),
      addScenario: jest.fn(),
      saveAsDefaultScenario: jest.fn(),
      updateScenario: jest.fn(),
    } as unknown as jest.Mocked<JsonDataService>;

    const moduleRef = await Test.createTestingModule({
      providers: [ScenariosService, { provide: JsonDataService, useValue: jsonDataService }],
    }).compile();

    service = moduleRef.get(ScenariosService);
  });

  describe('getDefaultScenario', () => {
    it('should return default scenario when no id provided', async () => {
      jsonDataService.getDefaultScenario.mockReturnValue({ id: 's1' } as unknown as Scenario);

      const result = await service.getDefaultScenario();

      expect(result).toEqual({ id: 's1' });
    });

    it('should return scenario by id when id provided', async () => {
      (jsonDataService.getScenarioByIdFresh as jest.Mock).mockResolvedValue({
        id: 's2',
      } as unknown as Scenario);

      const result = await service.getDefaultScenario('s2');

      expect(result).toEqual({ id: 's2' });
      expect(jsonDataService.getScenarioByIdFresh).toHaveBeenCalledWith('s2');
    });

    it('should throw when scenario id not found', async () => {
      (jsonDataService.getScenarioByIdFresh as jest.Mock).mockResolvedValue(undefined);

      await expect(service.getDefaultScenario('missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw when default scenario not found', async () => {
      jsonDataService.getDefaultScenario.mockReturnValue(null);

      await expect(service.getDefaultScenario()).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return scenarios with unit mapped', async () => {
      jsonDataService.getScenarios.mockReturnValue([
        { id: 's1', unitId: 'u1' },
      ] as unknown as Scenario[]);
      jsonDataService.getUnitById.mockReturnValue({ id: 'u1' } as unknown as Unit);

      const result = await service.findAll();

      expect(result[0].unit).toEqual({ id: 'u1' });
    });
  });

  describe('findByUnit', () => {
    it('should return scenarios without completion info when userId not provided', async () => {
      jsonDataService.getScenariosByUnitId.mockReturnValue([
        { id: 's1', unitId: 'u1' },
      ] as unknown as Scenario[]);
      jsonDataService.getUnitById.mockReturnValue({ id: 'u1' } as unknown as Unit);

      const result = await service.findByUnit('u1');

      expect(result[0].completed).toBeUndefined();
      expect(result[0].progress).toBeUndefined();
    });

    it('should return completed and progress when transcript exists', async () => {
      jsonDataService.getScenariosByUnitId.mockReturnValue([
        { id: 's1', unitId: 'u1' },
        { id: 's2', unitId: 'u1' },
      ] as unknown as Scenario[]);

      jsonDataService.getUnitById.mockReturnValue({ id: 'u1' } as unknown as Unit);

      jsonDataService.getTranscriptsByUserId.mockReturnValue([
        { scenarioId: 's1', endedAt: '2024-01-01', userId: 'user1' },
      ] as unknown as ReturnType<JsonDataService['getTranscriptsByUserId']>);

      const result = await service.findByUnit('u1', 'user1');

      expect(result[0].completed).toBe(true);
      expect(result[0].progress).toBe(100);

      expect(result[1].completed).toBe(false);
      expect(result[1].progress).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return scenario with unit', async () => {
      jsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
      } as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'u1' } as unknown as Unit);

      const result = await service.findOne('s1');

      expect(result.unit).toEqual({ id: 'u1' });
    });

    it('should throw when scenario not found', async () => {
      jsonDataService.getScenarioById.mockReturnValue(undefined);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('should add completed and progress when user transcript exists', async () => {
      jsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        unitId: 'u1',
      } as unknown as Scenario);
      jsonDataService.getUnitById.mockReturnValue({ id: 'u1' } as unknown as Unit);
      jsonDataService.getTranscriptsByUserId.mockReturnValue([
        { scenarioId: 's1', userId: 'user1', endedAt: '2024-01-01' },
      ] as unknown as ReturnType<JsonDataService['getTranscriptsByUserId']>);

      const result = await service.findOne('s1', 'user1');

      expect(result.completed).toBe(true);
      expect(result.progress).toBe(100);
    });
  });

  describe('createScenario', () => {
    it('should add scenario and save as default', async () => {
      const scenario = { id: 's1' };

      const result = await service.createScenario(scenario as unknown as Scenario);

      expect(jsonDataService.addScenario).toHaveBeenCalledWith(scenario);
      expect(jsonDataService.saveAsDefaultScenario).toHaveBeenCalledWith(scenario);
      expect(result).toEqual(scenario);
    });

    it('should throw BadRequestException when physical product setup is enabled but no product name provided', async () => {
      const scenario = {
        requiresProductSetup: true,
        productSetup: { title: '' },
      };

      await expect(service.createScenario(scenario as unknown as Scenario)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateScenario', () => {
    it('should update scenario when found', async () => {
      jsonDataService.getScenarioById.mockReturnValue({
        id: 's1',
        title: 'Old',
      } as unknown as Scenario);

      const result = await service.updateScenario('s1', { title: 'New' });

      expect(jsonDataService.updateScenario).toHaveBeenCalledWith('s1', {
        title: 'New',
      });
      expect(result.title).toBe('New');
    });

    it('should throw when scenario not found', async () => {
      jsonDataService.getScenarioById.mockReturnValue(undefined);

      await expect(service.updateScenario('missing', { title: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when physical product setup is enabled but no product name provided', async () => {
      jsonDataService.getScenarioById.mockReturnValue({ id: 's1' } as unknown as Scenario);

      await expect(
        service.updateScenario('s1', {
          requiresProductSetup: true,
          productSetup: { title: '' },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
