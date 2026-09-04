import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationCatalogController } from '../../../src/simulation-catalog/simulation-catalog.controller';
import { SimulationCatalogService } from '../../../src/simulation-catalog/simulation-catalog.service';
import { SimulationCatalog } from '../../../src/simulation-catalog/entity/simulation-catalog.entity';
import { Simulation } from '../../../src/simulations/entity/simulation.entity';
import { EducatorSimulation } from '../../../src/educator-simulations/entity/educator-simulation.entity';
import { AzureBlobService } from '../../../src/common/utils/azure-blob.service';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { StudentsService } from '../../../src/students/students.service';
import { buildTestApp } from '../setup/test-app.factory';

type TestBody = {
  status?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

const mockCatalogItem = {
  id: 101,
  title: 'Stroke Evaluation',
  unit: 'Emergency',
  category: 'Cardiology',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('SimulationCatalog (Integration)', () => {
  let app: INestApplication;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const catalogRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const educatorSimRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
  const simulationRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
  const azureBlobService = { uploadFile: jest.fn() };
  const tutorPatientService = {
    getScenarios: jest.fn().mockResolvedValue([]),
    getFreshScenarios: jest.fn().mockResolvedValue([]),
    getAllScenariosDirect: jest.fn().mockResolvedValue([]),
    clearCache: jest.fn().mockResolvedValue(undefined),
    getUnits: jest.fn().mockResolvedValue([]),
    getReports: jest.fn().mockResolvedValue([]),
    getSimulationSourceLabel: jest.fn().mockReturnValue('file' as const),
  };
  const educatorsService = {
    findAll: jest.fn().mockResolvedValue({ success: true, data: [], message: '' }),
    findById: jest.fn().mockResolvedValue({ success: true, data: {}, message: '' }),
  };
  const studentsService = {
    findAllByEducator: jest.fn().mockResolvedValue({ data: [], success: true, message: '' }),
  };

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      controllers: [SimulationCatalogController],
      providers: [
        SimulationCatalogService,
        { provide: getRepositoryToken(SimulationCatalog), useValue: catalogRepo },
        { provide: getRepositoryToken(EducatorSimulation), useValue: educatorSimRepo },
        { provide: getRepositoryToken(Simulation), useValue: simulationRepo },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: EducatorsService, useValue: educatorsService },
        { provide: StudentsService, useValue: studentsService },
      ],
    }));
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/simulation-catalog', () => {
    it('INTEGRATION: returns 200 with catalog list (public route)', async () => {
      catalogRepo.find.mockResolvedValue([mockCatalogItem]);
      tutorPatientService.getAllScenariosDirect.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/simulation-catalog')
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no catalog items', async () => {
      catalogRepo.find.mockResolvedValue([]);
      tutorPatientService.getAllScenariosDirect.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/simulation-catalog')
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('GET /api/simulation-catalog/dashboard', () => {
    it('INTEGRATION: returns 200 with dashboard catalog', async () => {
      catalogRepo.find.mockResolvedValue([mockCatalogItem]);
      tutorPatientService.getAllScenariosDirect.mockResolvedValue([]);
      tutorPatientService.getUnits.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/simulation-catalog/dashboard')
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });
});
