import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdminService } from '../../../../../src/student-backend/modules/admin/admin.service';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { AutomationAccessService } from '../../../../../src/common/services/automation-access.service';
import type { Scenario } from '../../../../../src/common/interfaces/student-scenario.interface';
import { NotFoundException } from '@nestjs/common';
import { loggerServiceTestProvider } from '../../common/setup/logger.mock';
import { ClassSimulationService } from '../../../../../src/class-simulations/class-simulation.service';
import {
  SIMULATION_ACTION_REPOSITORY,
  SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
  SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
  SIMULATION_ORDER_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
  UNIT_REPOSITORY,
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
} from '../../../../../src/database/tokens';
import { SimulationService } from '../../../../../src/simulation/simulation.service';
import { VoiceProfilesService } from '../../../../../src/voice-profiles/voice-profiles.service';

const scenarioAssignmentProviders = [
  { provide: LMS_ASSIGNMENT_MAPPING_REPOSITORY, useValue: { findOne: jest.fn() } },
  { provide: SimulationService, useValue: { getAssignedSimulationIds: jest.fn() } },
  loggerServiceTestProvider,
];

const mockSimulationReportRepositoryProvider = {
  provide: SIMULATION_REPORT_REPOSITORY,
  useValue: { findDetailRowByReportId: jest.fn() },
};

const mockTranscriptRepositoryProvider = {
  provide: TRANSCRIPT_REPOSITORY,
  useValue: {
    find: jest.fn().mockResolvedValue([]),
    findByUserId: jest.fn().mockResolvedValue([]),
  },
};
import {
  createMockClassSimulationService,
  createMockSimulationChildRepository,
  createMockSimulationOrderLinkedActionRepository,
  createStatefulMockSimulationRepository,
} from '../../common/utils/simulation-mock-factory';
import type { ICurrentUser } from '../../../../../src/common/interfaces';

const anyUser = { userId: 'user-1', type: 'educator', roles: ['educator'] } as ICurrentUser;

const mockClassSimulationServiceProvider = {
  provide: ClassSimulationService,
  useValue: createMockClassSimulationService(),
};

const mockUnitRepositoryProvider = {
  provide: UNIT_REPOSITORY,
  useValue: {
    findByBusinessId: jest.fn(async (id: string) => ({ id, name: 'Unit' })),
    find: jest.fn(async () => []),
  },
};

// ── helper ────────────────────────────────────────────────────────────────────

function makeScenario(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    unitId: 'u1',
    title: 'Test Scenario',
    difficulty: 'Easy',
    learnerLevel: 'BSN',
    department: 'Outpatient',
    description: '',
    learningObjective: '',
    Status: '',
    patientData: { Weight: '', Height: '' },
    ...overrides,
  } as unknown as Scenario;
}

// =============================================================================
// UNIT TESTS
// =============================================================================

// AdminService – awaits simulation-repository mutations before returning
//
// Scenario CRUD moved off JSON blob storage onto the Postgres-backed
// SimulationRepository (see src/student-backend/modules/admin/admin.service.ts
// and src/database/repositories/simulation.repository.ts) — these tests now
// verify AdminService awaits that repository's async create/updateById/delete
// rather than the old blob-backed addScenario/updateScenario/deleteScenario.
// ─────────────────────────────────────────────────────────────────────────────

describe('[Unit] AdminService – awaits blob mutations', () => {
  let service: AdminService;

  const mockSimulationRepository = createStatefulMockSimulationRepository();
  const mockSimulationActionRepository = createMockSimulationChildRepository();
  const mockSimulationOrderRepository = createMockSimulationChildRepository();
  const mockSimulationOrderLinkedActionRepository =
    createMockSimulationOrderLinkedActionRepository();
  const mockSimulationGradingRubricItemRepository = createMockSimulationChildRepository();

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSimulationRepository.__reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: VoiceProfilesService,
          useValue: {
            resolveForScenario: jest.fn().mockResolvedValue(null),
            assertValidForScenarioWrite: jest.fn().mockResolvedValue(undefined),
          },
        },
        loggerServiceTestProvider,
        mockUnitRepositoryProvider,
        mockClassSimulationServiceProvider,
        { provide: SIMULATION_V2_REPOSITORY, useValue: mockSimulationRepository },
        { provide: SIMULATION_ACTION_REPOSITORY, useValue: mockSimulationActionRepository },
        { provide: SIMULATION_ORDER_REPOSITORY, useValue: mockSimulationOrderRepository },
        {
          provide: SIMULATION_ORDER_LINKED_ACTION_REPOSITORY,
          useValue: mockSimulationOrderLinkedActionRepository,
        },
        {
          provide: SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY,
          useValue: mockSimulationGradingRubricItemRepository,
        },
        mockTranscriptRepositoryProvider,
        mockSimulationReportRepositoryProvider,
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('createScenario – awaits simulationRepository.create before returning', async () => {
    let resolved = false;
    const originalCreate = mockSimulationRepository.create.getMockImplementation()!;
    mockSimulationRepository.create.mockImplementationOnce(async (data) => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
      return originalCreate(data);
    });
    mockUnitRepositoryProvider.useValue.findByBusinessId.mockResolvedValueOnce({
      id: 'u1',
      name: 'Unit',
    });

    await service.createScenario({ id: 's1', title: 'T', unitId: 'u1' });

    expect(resolved).toBe(true);
  });

  it('updateScenario – awaits simulationRepository.updateById before returning', async () => {
    mockSimulationRepository.__seed({ id: 's1', unitId: 'u1', title: 'Old' });
    let resolved = false;
    const originalUpdateById = mockSimulationRepository.updateById.getMockImplementation()!;
    mockSimulationRepository.updateById.mockImplementationOnce(async (simulationId, data) => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
      return originalUpdateById(simulationId, data);
    });

    await service.updateScenario('s1', { title: 'New' });

    expect(resolved).toBe(true);
  });

  it('deleteScenario – awaits simulationRepository.delete before returning', async () => {
    mockSimulationRepository.__seed({ id: 's1' });
    let resolved = false;
    const originalDelete = mockSimulationRepository.delete.getMockImplementation()!;
    mockSimulationRepository.delete.mockImplementationOnce(async (simulationId) => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
      return originalDelete(simulationId);
    });

    await service.deleteScenario('s1');

    expect(resolved).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ScenariosService – awaits mutations & returns fresh data
// ─────────────────────────────────────────────────────────────────────────────

describe('[Unit] ScenariosService – awaits blob mutations', () => {
  let service: ScenariosService;

  const mockSimulationV2Repository = createStatefulMockSimulationRepository();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScenariosService,
        {
          provide: VoiceProfilesService,
          useValue: { resolveForScenario: jest.fn().mockResolvedValue(null) },
        },
        mockUnitRepositoryProvider,
        { provide: SIMULATION_V2_REPOSITORY, useValue: mockSimulationV2Repository },
        mockTranscriptRepositoryProvider,
        mockSimulationReportRepositoryProvider,
        ...scenarioAssignmentProviders,
        {
          provide: AutomationAccessService,
          useValue: {
            filterRecords: jest.fn((records) => records),
            canAccessRecord: jest.fn(() => true),
          },
        },
      ],
    }).compile();

    service = module.get<ScenariosService>(ScenariosService);
  });

  it('findOne – reads the catalog scenario from SimulationV2Repository', async () => {
    mockSimulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue({
      id: 's1',
      unitId: 'u1',
      title: 'Fresh',
    } as never);

    const result = await service.findOne(anyUser, 's1');

    expect(mockSimulationV2Repository.findByBusinessIdWithChildrenJoined).toHaveBeenCalledWith(
      's1',
    );
    expect(result.title).toBe('Fresh');
  });

  it('findOne – throws NotFoundException when scenario not found', async () => {
    mockSimulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(null);

    await expect(service.findOne(anyUser, 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ModeSelectionModal – strict-mode double-mount guard (pure logic)
// ─────────────────────────────────────────────────────────────────────────────

describe('[Unit] ScenarioPage – strict-mode double-mount guard', () => {
  it('cancelled flag prevents state update after unmount', async () => {
    let cancelled = false;
    const setShowModeModal = jest.fn();
    const setScenario = jest.fn();

    const loadScenario = async () => {
      const scenario = await Promise.resolve({ id: 's1' });
      if (cancelled) {
        return;
      }
      setScenario(scenario);
      setShowModeModal(true);
    };

    const promise = loadScenario();
    cancelled = true;
    await promise;

    expect(setScenario).not.toHaveBeenCalled();
    expect(setShowModeModal).not.toHaveBeenCalled();
  });

  it('second mount after strict-mode remount only shows modal once', async () => {
    const setShowModeModal = jest.fn();
    let callCount = 0;

    const runEffect = () => {
      let cancelled = false;
      const load = async () => {
        await Promise.resolve();
        if (cancelled) {
          return;
        }
        callCount++;
        setShowModeModal(true);
      };
      load();
      return () => {
        cancelled = true;
      };
    };

    const cleanup = runEffect();
    cleanup();
    runEffect();
    await Promise.resolve();

    expect(setShowModeModal).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(1);
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// ScenariosService – write then read consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('[Integration] ScenariosService – write then read consistency', () => {
  let scenariosService: ScenariosService;

  const mockSimulationV2Repository = createStatefulMockSimulationRepository();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScenariosService,
        {
          provide: VoiceProfilesService,
          useValue: { resolveForScenario: jest.fn().mockResolvedValue(null) },
        },
        mockUnitRepositoryProvider,
        { provide: SIMULATION_V2_REPOSITORY, useValue: mockSimulationV2Repository },
        mockTranscriptRepositoryProvider,
        mockSimulationReportRepositoryProvider,
        ...scenarioAssignmentProviders,
        {
          provide: AutomationAccessService,
          useValue: {
            filterRecords: jest.fn((records) => records),
            canAccessRecord: jest.fn(() => true),
          },
        },
      ],
    }).compile();

    scenariosService = module.get<ScenariosService>(ScenariosService);
  });

  it('findOne reads the current catalog row – never returns a stale value', async () => {
    // Catalog read has the latest title
    mockSimulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue({
      id: 's1',
      unitId: 'u1',
      title: 'FromCatalog',
    } as never);

    const result = await scenariosService.findOne(anyUser, 's1');

    expect(result.title).toBe('FromCatalog');
    expect(mockSimulationV2Repository.findByBusinessIdWithChildrenJoined).toHaveBeenCalledWith(
      's1',
    );
  });

  it('findOne throws NotFoundException when scenario deleted', async () => {
    mockSimulationV2Repository.findByBusinessIdWithChildrenJoined.mockResolvedValue(null);

    await expect(scenariosService.findOne(anyUser, 'deleted-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
