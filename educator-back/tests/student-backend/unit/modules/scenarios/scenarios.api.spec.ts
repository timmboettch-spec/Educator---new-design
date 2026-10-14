import { APP_GUARD } from '@nestjs/core';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ScenariosController } from 'src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from 'src/student-backend/modules/scenarios/scenarios.service';
import { SimulationService } from 'src/simulation/simulation.service';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { LoggerService } from 'src/common/services';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';
import {
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  createMockUnitRepository,
  createMockSimulationRepository,
} from '../../common/utils/mock-factory';

describe('Scenarios API (Integration)', () => {
  let app: INestApplication;
  let unitRepository: ReturnType<typeof createMockUnitRepository>;
  let simulationV2Repository: ReturnType<typeof createMockSimulationRepository>;

  const mockUnit = { id: 'unit-001', name: 'Nursing' };
  // ScenariosService maps the DB entity to the blob-shaped Unit interface, which
  // always includes imageUrl (defaulted to '' when the entity has none).
  const mappedUnit = { ...mockUnit, imageUrl: '' };

  const mockScenario = {
    id: 'scenario-001',
    title: 'Test Scenario',
    unitId: 'unit-001',
  };

  const mockScenarios = [
    { id: 'scenario-001', title: 'Scenario 1', unitId: 'unit-001' },
    { id: 'scenario-002', title: 'Scenario 2', unitId: 'unit-001' },
  ];

  const mockTranscriptRepository = {
    findByUserId: jest.fn(),
  };
  const mockAssignmentService = { getAssignedSimulationIds: jest.fn() };

  // Stands in for the JWT guard: the test picks the authenticated user via the `x-test-user`
  // header (JSON), exactly as the real guard would populate `req.user` from a cookie or bearer.
  const fakeAuthGuard = {
    canActivate: (ctx: ExecutionContext): boolean => {
      const req = ctx
        .switchToHttp()
        .getRequest<{ headers: Record<string, string>; user?: unknown }>();
      const header = req.headers['x-test-user'];
      if (header) req.user = JSON.parse(header);
      return true;
    },
  };
  const asUser = (user: Record<string, unknown>): [string, string] => [
    'x-test-user',
    JSON.stringify(user),
  ];
  const educator = { userId: 'user1', type: 'educator', roles: ['educator'] };
  const student = { userId: 'REP-1', student_id: 'REP-1', type: 'student', roles: ['student'] };

  beforeAll(async () => {
    unitRepository = createMockUnitRepository();
    simulationV2Repository = createMockSimulationRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [
        { provide: APP_GUARD, useValue: fakeAuthGuard },
        ScenariosService,
        {
          provide: VoiceProfilesService,
          useValue: { resolveForScenario: jest.fn().mockResolvedValue(null) },
        },
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
        { provide: TRANSCRIPT_REPOSITORY, useValue: mockTranscriptRepository },
        { provide: LMS_ASSIGNMENT_MAPPING_REPOSITORY, useValue: { findOne: jest.fn() } },
        { provide: SimulationService, useValue: mockAssignmentService },
        { provide: LoggerService, useValue: { warn: jest.fn(), log: jest.fn(), error: jest.fn() } },
        {
          provide: AutomationAccessService,
          useValue: {
            filterRecords: jest.fn((records) => records),
            canAccessRecord: jest.fn(() => true),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    unitRepository.findByBusinessId.mockResolvedValue(mockUnit as never);
    unitRepository.find.mockResolvedValue([mockUnit] as never);
    mockTranscriptRepository.findByUserId.mockReturnValue([]);
    mockAssignmentService.getAssignedSimulationIds.mockResolvedValue(new Set<string>());
  });

  afterAll(async () => {
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /scenarios/default and GET /scenarios/default/:id — disabled, routes commented out
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // GET /scenarios
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /scenarios', () => {
    it('returns 200 with an array of all scenarios', async () => {
      simulationV2Repository.findAllWithChildrenJoined.mockResolvedValue(mockScenarios as never);

      const res = await request(app.getHttpServer()).get('/scenarios').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('each scenario includes the unit object', async () => {
      simulationV2Repository.findAllWithChildrenJoined.mockResolvedValue(mockScenarios as never);

      const res = await request(app.getHttpServer()).get('/scenarios').expect(200);

      expect(res.body[0].unit).toEqual(mappedUnit);
    });

    it('returns empty array when no scenarios exist', async () => {
      simulationV2Repository.findAllWithChildrenJoined.mockResolvedValue([]);

      const res = await request(app.getHttpServer()).get('/scenarios').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /scenarios/:id', () => {
    it('returns 200 with the scenario and its unit', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(
        mockScenario as never,
      );

      const res = await request(app.getHttpServer())
        .get('/scenarios/scenario-001')
        .set(...asUser(educator))
        .expect(200);

      expect(res.body.id).toBe('scenario-001');
      expect(res.body.unit).toEqual(mappedUnit);
    });

    it('returns 404 when scenario does not exist', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/scenarios/non-existent')
        .set(...asUser(educator))
        .expect(404);
    });

    it('includes completed=true and progress=100 when user has a completed transcript', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(
        mockScenario as never,
      );
      mockTranscriptRepository.findByUserId.mockReturnValue([
        { scenarioId: 'scenario-001', userId: 'user1', endedAt: '2024-01-01' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/scenarios/scenario-001')
        .set(...asUser(educator))
        .expect(200);

      expect(res.body.completed).toBe(true);
      expect(res.body.progress).toBe(100);
    });

    it('includes completed=false and progress=0 when user has no matching transcript', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(
        mockScenario as never,
      );

      const res = await request(app.getHttpServer())
        .get('/scenarios/scenario-001')
        .set(...asUser(educator))
        .expect(200);

      expect(res.body.completed).toBe(false);
      expect(res.body.progress).toBe(0);
    });

    it('returns 403 to a student for an unassigned scenario', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(
        mockScenario as never,
      );

      await request(app.getHttpServer())
        .get('/scenarios/scenario-001')
        .set(...asUser(student))
        .expect(403);
    });

    it('returns 200 with progress to a student for an assigned scenario', async () => {
      simulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(
        mockScenario as never,
      );
      mockAssignmentService.getAssignedSimulationIds.mockResolvedValue(new Set(['scenario-001']));
      mockTranscriptRepository.findByUserId.mockReturnValue([
        { scenarioId: 'scenario-001', userId: 'REP-1', endedAt: '2024-01-01' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/scenarios/scenario-001')
        .set(...asUser(student))
        .expect(200);

      expect(res.body.completed).toBe(true);
      expect(mockAssignmentService.getAssignedSimulationIds).toHaveBeenCalledWith('REP-1');
    });
  });
});
