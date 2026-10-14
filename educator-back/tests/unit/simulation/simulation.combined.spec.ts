import { Test, TestingModule } from '@nestjs/testing';
import { StudentsService } from '../../../src/students/students.service';
import { I18nService } from 'nestjs-i18n';
import { SimulationController } from '../../../src/simulation/simulation.controller';
import { SimulationService } from '../../../src/simulation/simulation.service';

import { ResponseResult } from 'src/common/class/response.class';
import { RoleSlug } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';
import { SimulationCatalog, SimulationV2 } from 'src/database/entities';
import { LoggerService } from 'src/common/services';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_CATALOG_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';

const mockSimulationRow: Partial<SimulationCatalog> = {
  id: 101,
  title: 'Stroke Evaluation',
  unit: 'Emergency',
  category: 'Cardiology',
  target_audience: 'Doctors',
  difficulty_level: 'Advanced',
  estimated_duration: '20m',
  language: 'English',
  description: 'A high-fidelity simulation.',
  learning_objectives: 'Improve diagnosis||Improve decisions',
  rating: 4.8,
  total_ratings: 247,
  image_url: 'https://img.example/sim.jpg',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

// DB-shaped equivalent of blobUnit (src/database/entities/unit.entity.ts) — this is what
// the mock UnitRepository returns; SimulationService.getUnits() maps it into the blobUnit
// shape above.
const dbUnit = {
  id: 'unit-1',
  name: 'Emergency',
  category: 'Cardiology',
  imageUrl: 'https://img.example/unit.jpg',
};

const blobScenario = {
  id: 'sim-1',
  title: 'Stroke Evaluation',
  unitId: 'unit-1',
  difficulty: 'Advanced',
  learnerLevel: 'Doctors',
  description: 'A high-fidelity simulation.',
  scenarioImage: 'https://img.example/scenario.jpg',
};

const mockSim: SimulationV2 = {
  simulationId: 'row-1',
  id: 'sim-1',
  title: 'Cardiac Arrest',
  unitId: 'unit-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as SimulationV2;

const mockCurrentUser: ICurrentUser = {
  userId: 'edu-1',
  roles: [RoleSlug.EDUCATOR],
};

describe('Simulation (Controller + Service)', () => {
  let controller: SimulationController;
  let service: SimulationService;

  const simulationRepo = {
    find: jest.fn(),
  };

  const educatorSimRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  const unitRepository = {
    find: jest.fn().mockResolvedValue([]),
  };

  const simulationV2Repository = {
    find: jest.fn().mockResolvedValue([]),
    findByUnitId: jest.fn().mockResolvedValue([]),
    findByBusinessId: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulationController],
      providers: [
        SimulationService,
        // Required by ResponseInterceptor/HttpExceptionFilter (I18nService) — not by
        // SimulationService itself.
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
        { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
        { provide: SIMULATION_CATALOG_REPOSITORY, useValue: simulationRepo },
        { provide: EDUCATOR_SIMULATION_REPOSITORY, useValue: educatorSimRepo },
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
        { provide: StudentsService, useValue: { getSimulationsByCode: jest.fn() } },
        {
          provide: VoiceProfilesService,
          useValue: { resolveForScenario: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    controller = module.get(SimulationController);
    service = module.get(SimulationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getSimulations', () => {
    it('UNIT: returns catalog from SimulationV2 when scenarios exist (even if legacy DB catalog has rows)', async () => {
      simulationRepo.find.mockResolvedValue([mockSimulationRow]);
      unitRepository.find.mockResolvedValue([dbUnit]);
      simulationV2Repository.find.mockResolvedValue([blobScenario]);

      const result = await service.getSimulations();
      expect(result.data?.[0].scenario_id).toBe('sim-1');
      expect(result.data?.[0].id).toBe(0);
    });

    it('UNIT: falls back to the legacy DB catalog when SimulationV2 has no rows', async () => {
      simulationRepo.find.mockResolvedValue([mockSimulationRow]);
      unitRepository.find.mockResolvedValue([dbUnit]);
      simulationV2Repository.find.mockResolvedValue([]);

      const result = await service.getSimulations();
      expect(result.data?.[0].id).toBe(101);
      expect(result.data?.[0].scenario_id).toBeNull();
    });

    it('INTEGRATION: GET /simulations (public route) returns a ResponseResult', async () => {
      jest
        .spyOn(service, 'getSimulations')
        .mockResolvedValue(new ResponseResult({ message: 'Fetched', data: [] }));
      const result = await controller.getSimulations();
      expect(result).toBeInstanceOf(ResponseResult);
      expect(result.data).toEqual([]);
    });
  });

  describe('getAllScenarios', () => {
    it('UNIT: throws when the current user has no userId', async () => {
      await expect(service.getAllScenarios({} as unknown as ICurrentUser)).rejects.toThrow();
    });

    it('INTEGRATION: GET /simulations/educators returns a ResponseResult for an authenticated educator', async () => {
      jest
        .spyOn(service, 'getAllScenarios')
        .mockResolvedValue(new ResponseResult({ message: 'Fetched', data: [] }));
      const result = await controller.getAllScenarios(mockCurrentUser);
      expect(result).toBeInstanceOf(ResponseResult);
      expect(service.getAllScenarios).toHaveBeenCalledWith(mockCurrentUser);
    });
  });

  describe('findByUnitId', () => {
    it('UNIT: returns simulations by unit, backfilling default action categories', async () => {
      simulationV2Repository.findByUnitId.mockResolvedValue([mockSim]);
      const result = await service.findByUnitId(mockCurrentUser, 'unit-1');
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].actionCategories).toEqual([
        { id: 'cat_actions', name: 'ACTIONS', scenarioId: 'sim-1' },
        { id: 'cat_assessments', name: 'ASSESSMENTS', scenarioId: 'sim-1' },
        { id: 'cat_care', name: 'CARE', scenarioId: 'sim-1' },
        { id: 'cat_interventions', name: 'INTERVENTIONS', scenarioId: 'sim-1' },
        { id: 'cat_tasks', name: 'TASKS', scenarioId: 'sim-1' },
      ]);
      expect(simulationV2Repository.findByUnitId).toHaveBeenCalledWith('unit-1');
    });

    it('INTEGRATION: GET /simulations/by-unit/:id — returns a ResponseResult', async () => {
      jest
        .spyOn(service, 'findByUnitId')
        .mockResolvedValue(new ResponseResult({ message: 'Fetched', data: [mockSim] }));
      const result = await controller.findByUnitId(mockCurrentUser, 'unit-1');
      expect(result).toBeInstanceOf(ResponseResult);
      expect(result.data).toEqual([mockSim]);
    });
  });
});
