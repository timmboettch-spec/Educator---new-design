import { APP_GUARD } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ScenariosController } from 'src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { SimulationService } from 'src/simulation/simulation.service';
import { LoggerService } from 'src/common/services';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import type { Scenario } from 'src/common/interfaces/student-scenario.interface';
import {
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';

jest.setTimeout(60000);

describe('Scenarios API (Integration)', () => {
  let app: INestApplication;

  // In-memory scenario store backing the mocked SimulationV2Repository
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
    {
      id: 'scenario-u1-003',
      unitId: 'unit-1',
      title: 'Scenario 3',
      voiceProfileId: 'voice-profile-1',
      patientData: { gender: 'female' },
    } as unknown as Partial<Scenario>,
  ];

  const mockVoiceProfilesService = {
    resolveForScenario: jest.fn(async (input: { voiceProfileId?: string | null }) =>
      input.voiceProfileId === 'voice-profile-1'
        ? {
            id: 'voice-profile-1',
            displayName: 'Stock Female 1',
            source: 'scenario',
          }
        : null,
    ),
  };

  const mockSimulationV2Repository = {
    find: jest.fn(async () => store),
    findByUnitId: jest.fn(async (unitId: string) => store.filter((s) => s.unitId === unitId)),
    findByBusinessId: jest.fn(async (id: string) => store.find((s) => s.id === id) ?? null),
    findByBusinessIdWithChildrenJoined: jest.fn(
      async (id: string) => store.find((s) => s.id === id) ?? null,
    ),
    findAllWithChildrenJoined: jest.fn(async () => store),
  };

  const mockUnitRepository = {
    findByBusinessId: jest.fn(async (id: string) => ({ id, name: 'Unit' })),
    find: jest.fn(async () => []),
  };

  const mockTranscriptRepository = {
    findByUserId: jest.fn(async () => []),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [
        {
          provide: APP_GUARD,
          useValue: {
            canActivate: (ctx: ExecutionContext) => {
              ctx.switchToHttp().getRequest<{ user?: unknown }>().user = {
                userId: 'user-1',
                type: 'educator',
                roles: ['educator'],
              };
              return true;
            },
          },
        },
        ScenariosService,
        { provide: UNIT_REPOSITORY, useValue: mockUnitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: mockSimulationV2Repository },
        { provide: TRANSCRIPT_REPOSITORY, useValue: mockTranscriptRepository },
        { provide: LMS_ASSIGNMENT_MAPPING_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: SimulationService, useValue: { getAssignedSimulationIds: jest.fn() } },
        { provide: LoggerService, useValue: { warn: jest.fn(), log: jest.fn(), error: jest.fn() } },
        { provide: VoiceProfilesService, useValue: mockVoiceProfilesService },
        {
          provide: AutomationAccessService,
          useValue: {
            filterRecords: jest.fn((records) => records),
            canAccessRecord: jest.fn(() => true),
          },
        },
      ],
    }).compile();

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

    it('includes the resolved voiceProfile, shaped like the frozen contract fixture', async () => {
      const response = await request(app.getHttpServer())
        .get('/scenarios/scenario-u1-003')
        .expect(200);

      expect(response.body.voiceProfile).toEqual({
        id: 'voice-profile-1',
        displayName: 'Stock Female 1',
        source: 'scenario',
      });
      expect(mockVoiceProfilesService.resolveForScenario).toHaveBeenCalledWith(
        expect.objectContaining({ voiceProfileId: 'voice-profile-1' }),
      );
    });

    it('is null when the scenario has no effective voice', async () => {
      const response = await request(app.getHttpServer())
        .get('/scenarios/scenario-u1-002')
        .expect(200);
      expect(response.body.voiceProfile).toBeNull();
    });
  });
});
