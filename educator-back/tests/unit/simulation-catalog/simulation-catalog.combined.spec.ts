import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationCatalogController } from '../../../src/simulation-catalog/simulation-catalog.controller';
import { SimulationCatalogService } from '../../../src/simulation-catalog/simulation-catalog.service';
import { SimulationCatalog } from 'src/simulation-catalog/entity/simulation-catalog.entity';
import { EducatorSimulation } from 'src/educator-simulations/entity/educator-simulation.entity';
import { AzureBlobService } from 'src/common/utils/azure-blob.service';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { EducatorsService } from 'src/educators/educators.service';
import { StudentsService } from 'src/students/students.service';
import { AppStatus } from 'src/common/utils/messages';
import type { JwtRequest } from 'src/common/types';
import type { SimulationCatalogItem } from 'src/simulation-catalog/dto/simulation-catalog.types';

const mockCatalogRow: Partial<SimulationCatalog> = {
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

const blobUnit = {
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

const mockScenarioItem: SimulationCatalogItem = {
  id: 0,
  scenario_id: 'sim-1',
  scenarioId: 'sim-1',
  title: 'Stroke Evaluation',
  unit: 'Emergency',
  unit_id: 'unit-1',
  unit_image: 'https://img.example/unit.jpg',
  scenario_count: 1,
  category: 'Cardiology',
  target_audience: 'Doctors',
  difficulty_level: 'Advanced',
  estimated_duration: '20m',
  language: 'English',
  purpose: 'Practice decision making',
  description: 'A high-fidelity simulation.',
  learning_objectives: ['Improve diagnosis'],
  rating: 0,
  total_ratings: 0,
  usage: undefined,
  scenarioImage: 'https://img.example/scenario.jpg',
  image_url: 'https://img.example/scenario.jpg',
  images: ['https://img.example/scenario.jpg'],
  rating_breakdown: [],
  reviews: [],
  whats_new: undefined,
  simulation_privacy: undefined,
  developer: undefined,
  institution: undefined,
  last_update: undefined,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

describe('SimulationCatalog (Controller + Service)', () => {
  let controller: SimulationCatalogController;
  let service: SimulationCatalogService;

  const catalogRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const educatorSimRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  const tutorPatientService = {
    getScenarios: jest.fn(),
    getFreshScenarios: jest.fn(),
    getAllScenariosDirect: jest.fn(),
    clearCache: jest.fn().mockResolvedValue(undefined),
    getUnits: jest.fn(),
    getSimulationSourceLabel: jest.fn().mockReturnValue('file'),
    getReports: jest.fn(),
    getReportsByStudentIds: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulationCatalogController],
      providers: [
        SimulationCatalogService,
        { provide: getRepositoryToken(SimulationCatalog), useValue: catalogRepo },
        { provide: getRepositoryToken(EducatorSimulation), useValue: educatorSimRepo },
        { provide: AzureBlobService, useValue: { uploadFile: jest.fn() } },
        { provide: TutorPatientService, useValue: tutorPatientService },
        {
          provide: EducatorsService,
          useValue: {
            findById: jest.fn().mockResolvedValue({ success: true, data: { id: 'edu-uuid' } }),
            findAll: jest.fn().mockResolvedValue({ success: true, data: [] }),
          },
        },
        {
          provide: StudentsService,
          useValue: {
            findAllByEducator: jest.fn().mockResolvedValue({ success: true, data: [] }),
          },
        },
      ],
    }).compile();

    controller = module.get(SimulationCatalogController);
    service = module.get(SimulationCatalogService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getCatalog', () => {
    it('UNIT: returns blob catalog when blob scenarios exist (even if DB has rows)', async () => {
      catalogRepo.find.mockResolvedValue([mockCatalogRow]);
      tutorPatientService.getUnits.mockResolvedValue([blobUnit]);
      tutorPatientService.getAllScenariosDirect.mockResolvedValue([blobScenario]);

      const result = await service.getCatalog();
      expect(result.success).toBe(true);
      expect(result.data?.[0].scenario_id).toBe('sim-1');
      expect(result.data?.[0].id).toBe(0);
    });

    it('UNIT: falls back to blob scenarios when DB empty', async () => {
      catalogRepo.find.mockResolvedValue([]);
      tutorPatientService.getUnits.mockResolvedValue([blobUnit]);
      tutorPatientService.getAllScenariosDirect.mockResolvedValue([blobScenario]);

      const result = await service.getCatalog();
      expect(result.success).toBe(true);
      expect(result.data?.[0].scenario_id).toBe('sim-1');
    });

    it('UNIT: falls back to DB catalog when blob scenarios are unavailable', async () => {
      catalogRepo.find.mockResolvedValue([mockCatalogRow]);
      tutorPatientService.getUnits.mockResolvedValue([blobUnit]);
      tutorPatientService.getAllScenariosDirect.mockResolvedValue([]);

      const result = await service.getCatalog();
      expect(result.success).toBe(true);
      expect(result.data?.[0].id).toBe(101);
      expect(result.data?.[0].scenario_id).toBeNull();
    });

    it('INTEGRATION: GET /simulation-catalog returns SUCCESS', async () => {
      jest.spyOn(service, 'getCatalog').mockResolvedValue({
        success: true,
        message: 'Fetched',
        data: [],
      });
      const result = await controller.getCatalog();
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('getByScenarioId', () => {
    it('UNIT: returns scenario details', async () => {
      tutorPatientService.getUnits.mockResolvedValue([blobUnit]);
      tutorPatientService.getFreshScenarios.mockResolvedValue([blobScenario]);

      const result = await service.getByScenarioId('sim-1');
      expect(result.success).toBe(true);
      expect(result.data?.scenario_id).toBe('sim-1');
    });

    it('UNIT: returns not found when scenario missing', async () => {
      tutorPatientService.getUnits.mockResolvedValue([blobUnit]);
      tutorPatientService.getFreshScenarios.mockResolvedValue([]);

      const result = await service.getByScenarioId('missing');
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: GET /simulation-catalog/scenario/:id returns item', async () => {
      jest.spyOn(service, 'getByScenarioId').mockResolvedValue({
        success: true,
        message: 'Fetched',
        data: mockScenarioItem,
      });
      const result = await controller.getByScenarioId('sim-1');
      expect(result.status).toBe(AppStatus.SUCCESS);
      expect((result.data as SimulationCatalogItem).scenario_id).toBe('sim-1');
    });
  });

  describe('getSimulationsByUnitId', () => {
    it('UNIT: filters scenarios by unit_id', async () => {
      tutorPatientService.getFreshScenarios.mockResolvedValue([blobScenario, { ...blobScenario, id: 'sim-2', unitId: 'unit-2' }]);
      const result = await service.getSimulationsByUnitId('unit-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getAllScenarios', () => {
    it('INTEGRATION: throws when user missing', async () => {
      await expect(
        controller.getAllScenarios({ user: undefined } as unknown as JwtRequest),
      ).rejects.toThrow();
    });

    it('INTEGRATION: returns scenarios when user exists', async () => {
      jest.spyOn(service, 'getAllScenarios').mockResolvedValue({
        success: true,
        message: 'Fetched',
        data: [],
      });
      const req = { user: { userId: 'edu-1', roles: ['Educator'] } } as JwtRequest;
      const result = await controller.getAllScenarios(req);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('remove', () => {
    it('UNIT: removes catalog item', async () => {
      catalogRepo.findOne.mockResolvedValue(mockCatalogRow);
      catalogRepo.delete.mockResolvedValue({});
      const result = await service.remove(101);
      expect(result.success).toBe(true);
    });

    it('UNIT: returns not found for missing item', async () => {
      catalogRepo.findOne.mockResolvedValue(null);
      const result = await service.remove(999);
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: DELETE /simulation-catalog/:id returns SUCCESS', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({ success: true, message: 'Deleted', data: null });
      const result = await controller.remove(101);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });
});
