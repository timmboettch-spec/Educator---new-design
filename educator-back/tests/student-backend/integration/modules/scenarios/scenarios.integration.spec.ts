import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ScenariosController } from '@/modules/scenarios/scenarios.controller';
import { ScenariosService } from '@/modules/scenarios/scenarios.service';
import { JsonDataService } from '@/data/json-data.service';
import { ScenarioAuthGuard } from '@/guards/scenario-auth.guard';
import { ScenarioAssignmentGuard } from '@/modules/scenarios/guards/scenario-assignment.guard';
import type { Scenario } from '@/data/json-data.service';

jest.setTimeout(60000);

describe('Scenarios API (Integration)', () => {
  let app: INestApplication;

  // In-memory scenario store backing the mocked JsonDataService
  const store: Partial<Scenario>[] = [
    {
      id: 'scenario-u1-001',
      unitId: 'unit-1',
      title: 'Scenario 1',
    },
    {
      id: 'scenario-u1-002',
      unitId: 'unit-1',
      title: 'Scenario 2',
      grading: { maxScore: 50, rubric: [] },
    },
  ];

  const mockJsonDataService = {
    getScenarios: jest.fn(() => store),
    getScenarioById: jest.fn((id: string) => store.find((s) => s.id === id)),
    getScenarioByIdFresh: jest.fn(async (id: string) => store.find((s) => s.id === id)),
    getScenarioByIdLocalized: jest.fn(async (id: string) => store.find((s) => s.id === id)),
    getScenariosByUnitId: jest.fn((unitId: string) => store.filter((s) => s.unitId === unitId)),
    getScenariosByUnitIdLocalized: jest.fn(async (unitId: string) =>
      store.filter((s) => s.unitId === unitId),
    ),
    getAllScenariosLocalized: jest.fn(async () => store),
    getUnitById: jest.fn((unitId: string) => ({ id: unitId, name: 'Unit' })),
    getTranscriptsByUserId: jest.fn(() => []),
    getDefaultScenario: jest.fn(() => undefined),
    updateScenario: jest.fn(async (id: string, updates: Partial<Scenario>) => {
      const idx = store.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new Error(`Scenario with id ${id} not found`);
      }
      store[idx] = { ...store[idx], ...updates };
    }),
    addScenario: jest.fn(async () => {}),
    saveAsDefaultScenario: jest.fn(() => {}),
  } as unknown as jest.Mocked<JsonDataService>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [ScenariosService, { provide: JsonDataService, useValue: mockJsonDataService }],
    })
      .overrideGuard(ScenarioAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ScenarioAssignmentGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 60000);

  describe('GET /scenarios', () => {
    it('should return all scenarios', async () => {
      const response = await request(app.getHttpServer()).get('/scenarios').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].id).toBeDefined();
    });
  });

  describe('GET /scenarios/:id', () => {
    it('should return a specific scenario by id', async () => {
      const scenarioId = 'scenario-u1-002';
      const response = await request(app.getHttpServer())
        .get(`/scenarios/${scenarioId}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(scenarioId);
    });

    it('should return 404 for a non-existent scenario', async () => {
      const scenarioId = 'non_existent_123';
      await request(app.getHttpServer()).get(`/scenarios/${scenarioId}`).expect(404);
    });
  });
});
