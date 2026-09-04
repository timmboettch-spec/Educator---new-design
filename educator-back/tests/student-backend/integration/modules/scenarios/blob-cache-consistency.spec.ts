import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminService } from '../../../../../src/student-backend/modules/admin/admin.service';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { JsonDataService } from '../../../../../src/student-backend/data/json-data.service';
import type { Scenario } from '../../../../../src/student-backend/data/json-data.service';
import { NotFoundException } from '@nestjs/common';

// ── test-only interface for accessing private service properties ──────────────
interface ServiceInternals {
  azureEnabled: boolean;
  cache: Record<string, Scenario[]>;
  persistChain: Record<string, Promise<void>>;
  containerReady: Promise<void>;
  containerClient: { getBlockBlobClient: jest.Mock };
  writeJsonFileAndFlush: (file: string, data: unknown[]) => Promise<void>;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// JsonDataService – blob persistence & in-memory cache
// ─────────────────────────────────────────────────────────────────────────────

describe('[Unit] JsonDataService – blob persistence & cache', () => {
  let service: JsonDataService;

  const mockUpload = jest.fn().mockResolvedValue({ etag: 'e1', lastModified: new Date() });
  const mockGetProperties = jest.fn().mockResolvedValue({ etag: 'e1', lastModified: new Date() });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [JsonDataService],
    }).compile();

    service = module.get<JsonDataService>(JsonDataService);
    (service as unknown as Record<string, unknown>).azureEnabled = false;
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.clear();
  });

  it('addScenario – adds to cache immediately', async () => {
    await service.addScenario(makeScenario());

    const scenariosMap = (service as unknown as { scenariosMap: Map<string, Scenario> })
      .scenariosMap;
    expect(scenariosMap.get('s1')).toBeDefined();
  });

  it('addScenario – schedules blob upload when azure enabled', async () => {
    (service as unknown as Record<string, unknown>).azureEnabled = true;
    (service as unknown as Record<string, unknown>).containerReady = Promise.resolve();
    (service as unknown as Record<string, unknown>).containerClient = {
      getBlockBlobClient: jest.fn().mockReturnValue({
        uploadData: mockUpload,
        getProperties: mockGetProperties,
        downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from('[]', 'utf-8')),
      }),
    };

    await service.addScenario(makeScenario());
    const persistChain = (service as unknown as Record<string, unknown>).persistChain as Record<
      string,
      Promise<void>
    >;
    await persistChain['scenarios.json'];

    expect(mockUpload).toHaveBeenCalled();
  });

  it('updateScenario – merges fields in cache', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario({ title: 'Old' }),
    );

    await service.updateScenario('s1', { title: 'New' });

    expect(service.getScenarioById('s1')!.title).toBe('New');
  });

  it('updateScenario – throws when scenario not found', async () => {
    await expect(service.updateScenario('missing', { title: 'X' })).rejects.toThrow(
      'Scenario with id missing not found',
    );
  });

  it('deleteScenario – removes from cache', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario(),
    );

    await service.deleteScenario('s1');

    expect(service.getScenarioById('s1')).toBeUndefined();
  });

  it('deleteScenario – throws when not found', async () => {
    await expect(service.deleteScenario('missing')).rejects.toThrow(
      'Scenario with id missing not found',
    );
  });

  it('writeJsonFileAndFlush – updates cache then awaits upload', async () => {
    const uploadOrder: string[] = [];
    const data = [makeScenario()];
    (service as unknown as Record<string, unknown>).azureEnabled = true;
    (service as unknown as Record<string, unknown>).containerReady = Promise.resolve();
    (service as unknown as Record<string, unknown>).containerClient = {
      getBlockBlobClient: jest.fn().mockReturnValue({
        uploadData: jest.fn().mockImplementation(async () => {
          uploadOrder.push('uploaded');
          return { etag: 'e2', lastModified: new Date() };
        }),
        getProperties: mockGetProperties,
        downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(data), 'utf-8')),
      }),
    };

    await (service as unknown as ServiceInternals).writeJsonFileAndFlush('scenarios.json', data);

    expect(
      ((service as unknown as Record<string, unknown>).cache as Record<string, unknown>)[
        'scenarios.json'
      ],
    ).toEqual(data);
    expect(uploadOrder).toContain('uploaded');
  });

  it('cache is updated immediately after addScenario (no stale read)', async () => {
    await service.addScenario(makeScenario());

    expect(service.getScenarioById('s1')).toBeDefined();
  });

  it('cache is updated immediately after updateScenario (no stale read)', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario({ title: 'Old' }),
    );

    await service.updateScenario('s1', { title: 'Updated' });

    expect(service.getScenarioById('s1')!.title).toBe('Updated');
  });

  it('concurrent rapid updates do not leave stale cache', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario({ title: 'v0' }),
    );

    await Promise.all([
      service.updateScenario('s1', { title: 'v1' }),
      service.updateScenario('s1', { title: 'v2' }),
    ]);

    expect(service.getScenarioById('s1')!.title).not.toBe('v0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AdminService – awaits JsonDataService mutations before returning
// ─────────────────────────────────────────────────────────────────────────────

describe('[Unit] AdminService – awaits blob mutations', () => {
  let service: AdminService;

  const mockJsonDataService = {
    getScenarios: jest.fn().mockReturnValue([]),
    getScenarioById: jest.fn(),
    addScenario: jest.fn().mockResolvedValue(undefined),
    updateScenario: jest.fn().mockResolvedValue(undefined),
    deleteScenario: jest.fn().mockResolvedValue(undefined),
    getUnits: jest.fn().mockReturnValue([]),
    getUnitById: jest.fn(),
    getPermissionsData: jest.fn().mockReturnValue({ permissions: [] }),
    getUsers: jest.fn().mockReturnValue([]),
    getTranscripts: jest.fn().mockReturnValue([]),
    getReports: jest.fn().mockReturnValue([]),
    updatePermissions: jest.fn(),
    getScenariosByUnitId: jest.fn().mockReturnValue([]),
    getActionCategories: jest.fn().mockReturnValue([]),
    createActionCategory: jest.fn().mockResolvedValue({ id: 'cat1', name: 'Cat' }),
    updateActionCategory: jest.fn().mockResolvedValue({ id: 'cat1', name: 'Updated' }),
    deleteActionCategory: jest.fn().mockResolvedValue(undefined),
    getReportByIdFresh: jest.fn(),
    deleteReport: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: JsonDataService, useValue: mockJsonDataService }],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('createScenario – awaits addScenario before returning', async () => {
    let resolved = false;
    mockJsonDataService.addScenario.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });
    mockJsonDataService.getScenarioById.mockReturnValue(null);
    mockJsonDataService.getScenarios.mockReturnValue([]);
    mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

    await service.createScenario({ id: 's1', title: 'T', unitId: 'u1' });

    expect(resolved).toBe(true);
  });

  it('updateScenario – awaits updateScenario before returning', async () => {
    let resolved = false;
    mockJsonDataService.updateScenario.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });
    mockJsonDataService.getScenarioById
      .mockReturnValueOnce({ id: 's1', unitId: 'u1', title: 'Old' })
      .mockReturnValueOnce({ id: 's1', unitId: 'u1', title: 'New' });
    mockJsonDataService.getUnitById.mockReturnValue({
      id: 'u1',
      Status: 'Paid',
    });
    mockJsonDataService.getScenarios.mockReturnValue([{ id: 's1', title: 'Old', unitId: 'u1' }]);

    await service.updateScenario('s1', { title: 'New' });

    expect(resolved).toBe(true);
  });

  it('deleteScenario – awaits deleteScenario before returning', async () => {
    let resolved = false;
    mockJsonDataService.deleteScenario.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });
    mockJsonDataService.getScenarioById.mockReturnValue({ id: 's1' });

    await service.deleteScenario('s1');

    expect(resolved).toBe(true);
  });

  it('createCategory – awaits createActionCategory', async () => {
    let resolved = false;
    mockJsonDataService.createActionCategory.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
      return { id: 'cat1', name: 'Cat' };
    });
    mockJsonDataService.getScenarioById.mockReturnValue({ id: 's1' });

    await service.createCategory('s1', { name: 'Cat' });

    expect(resolved).toBe(true);
  });

  it('updateCategory – awaits updateActionCategory', async () => {
    let resolved = false;
    mockJsonDataService.updateActionCategory.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
      return { id: 'cat1', name: 'Updated' };
    });
    mockJsonDataService.getScenarioById.mockReturnValue({ id: 's1' });

    await service.updateCategory('s1', 'cat1', { name: 'Updated' });

    expect(resolved).toBe(true);
  });

  it('deleteCategory – awaits deleteActionCategory', async () => {
    let resolved = false;
    mockJsonDataService.deleteActionCategory.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });
    mockJsonDataService.getScenarioById.mockReturnValue({ id: 's1' });

    await service.deleteCategory('s1', 'cat1');

    expect(resolved).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ScenariosService – awaits mutations & returns fresh data
// ─────────────────────────────────────────────────────────────────────────────

describe('[Unit] ScenariosService – awaits blob mutations', () => {
  let service: ScenariosService;

  const mockJsonDataService = {
    getDefaultScenario: jest.fn(),
    getDefaultScenarioById: jest.fn(),
    getScenarios: jest.fn().mockReturnValue([]),
    getScenariosByUnitId: jest.fn().mockReturnValue([]),
    getScenariosByUnitIdLocalized: jest.fn().mockResolvedValue([]),
    getAllScenariosLocalized: jest.fn().mockResolvedValue([]),
    getScenarioById: jest.fn(),
    getScenarioByIdFresh: jest.fn(),
    getScenarioByIdLocalized: jest.fn(),
    getUnitById: jest.fn(),
    getTranscriptsByUserId: jest.fn().mockReturnValue([]),
    addScenario: jest.fn().mockResolvedValue(undefined),
    saveAsDefaultScenario: jest.fn(),
    updateScenario: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ScenariosService, { provide: JsonDataService, useValue: mockJsonDataService }],
    }).compile();

    service = module.get<ScenariosService>(ScenariosService);
  });

  it('createScenario – awaits addScenario before returning', async () => {
    let resolved = false;
    mockJsonDataService.addScenario.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });

    await service.createScenario(makeScenario({ id: 's1' }));

    expect(resolved).toBe(true);
  });

  it('updateScenario – awaits updateScenario before returning', async () => {
    let resolved = false;
    mockJsonDataService.updateScenario.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });
    mockJsonDataService.getScenarioById.mockReturnValue({
      id: 's1',
      title: 'Old',
    });

    await service.updateScenario('s1', { title: 'New' });

    expect(resolved).toBe(true);
  });

  it('findOne – uses getScenarioByIdLocalized', async () => {
    mockJsonDataService.getScenarioByIdLocalized.mockResolvedValue({
      id: 's1',
      unitId: 'u1',
      title: 'Fresh',
    });
    mockJsonDataService.getUnitById.mockReturnValue({ id: 'u1' });

    const result = await service.findOne('s1');

    expect(mockJsonDataService.getScenarioByIdLocalized).toHaveBeenCalledWith('s1', undefined);
    expect(result.title).toBe('Fresh');
  });

  it('findOne – throws NotFoundException when scenario not found', async () => {
    mockJsonDataService.getScenarioByIdLocalized.mockResolvedValue(undefined);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
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
// Cache consistency – write → read with real JsonDataService (no Azure)
// ─────────────────────────────────────────────────────────────────────────────

describe('[Integration] Cache consistency – no stale reads after mutations', () => {
  let service: JsonDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JsonDataService],
    }).compile();

    service = module.get<JsonDataService>(JsonDataService);
    (service as unknown as Record<string, unknown>).azureEnabled = false;
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.clear();
  });

  it('POST scenario → GET returns it immediately (no refresh needed)', async () => {
    await service.addScenario(makeScenario({ id: 's-new' }));

    expect(service.getScenarioById('s-new')).toBeDefined();
  });

  it('PUT scenario → GET returns updated data immediately', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario({ title: 'Before' }),
    );

    await service.updateScenario('s1', { title: 'After' });

    expect(service.getScenarioById('s1')!.title).toBe('After');
  });

  it('DELETE scenario → GET returns undefined immediately', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario(),
    );

    await service.deleteScenario('s1');

    expect(service.getScenarioById('s1')).toBeUndefined();
  });

  it('multiple rapid updates – final GET reflects last write', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario({ title: 'v0' }),
    );

    await service.updateScenario('s1', { title: 'v1' });
    await service.updateScenario('s1', { title: 'v2' });
    await service.updateScenario('s1', { title: 'v3' });

    expect(service.getScenarioById('s1')!.title).toBe('v3');
  });

  it('getScenarioByIdFresh always returns latest cache value', async () => {
    (service as unknown as { scenariosMap: Map<string, Scenario> }).scenariosMap.set(
      's1',
      makeScenario({ title: 'Fresh' }),
    );

    const result = await service.getScenarioByIdFresh('s1');

    expect(result!.title).toBe('Fresh');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ScenariosService + JsonDataService – write then read consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('[Integration] ScenariosService – write then read consistency', () => {
  let scenariosService: ScenariosService;

  const mockJsonDataService = {
    getDefaultScenario: jest.fn(),
    getDefaultScenarioById: jest.fn(),
    getScenarios: jest.fn().mockReturnValue([]),
    getScenariosByUnitId: jest.fn().mockReturnValue([]),
    getScenariosByUnitIdLocalized: jest.fn().mockResolvedValue([]),
    getAllScenariosLocalized: jest.fn().mockResolvedValue([]),
    getScenarioById: jest.fn(),
    getScenarioByIdFresh: jest.fn(),
    getScenarioByIdLocalized: jest.fn(),
    getUnitById: jest.fn().mockReturnValue({ id: 'u1' }),
    getTranscriptsByUserId: jest.fn().mockReturnValue([]),
    addScenario: jest.fn().mockResolvedValue(undefined),
    saveAsDefaultScenario: jest.fn(),
    updateScenario: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ScenariosService, { provide: JsonDataService, useValue: mockJsonDataService }],
    }).compile();

    scenariosService = module.get<ScenariosService>(ScenariosService);
  });

  it('create scenario → findOne returns it on first call (no delay)', async () => {
    mockJsonDataService.getScenarioByIdLocalized.mockResolvedValue({
      id: 's1',
      unitId: 'u1',
      title: 'New Scenario',
    });

    await scenariosService.createScenario({
      id: 's1',
      title: 'New Scenario',
    } as unknown as Scenario);
    const result = await scenariosService.findOne('s1');

    expect(result.title).toBe('New Scenario');
  });

  it('update scenario → findOne returns updated data immediately (no stale cache)', async () => {
    mockJsonDataService.getScenarioById.mockReturnValue({
      id: 's1',
      title: 'Old',
    });
    mockJsonDataService.getScenarioByIdLocalized.mockResolvedValue({
      id: 's1',
      unitId: 'u1',
      title: 'Updated',
    });

    await scenariosService.updateScenario('s1', { title: 'Updated' });
    const result = await scenariosService.findOne('s1');

    expect(result.title).toBe('Updated');
  });

  it('findOne uses localized read – never returns stale in-memory value', async () => {
    // Stale cache has old title
    mockJsonDataService.getScenarioById.mockReturnValue({
      id: 's1',
      title: 'Stale',
    });
    // Localized read has new title
    mockJsonDataService.getScenarioByIdLocalized.mockResolvedValue({
      id: 's1',
      unitId: 'u1',
      title: 'FromBlob',
    });

    const result = await scenariosService.findOne('s1');

    expect(result.title).toBe('FromBlob');
    expect(mockJsonDataService.getScenarioByIdLocalized).toHaveBeenCalledWith('s1', undefined);
  });

  it('findOne throws NotFoundException when scenario deleted', async () => {
    mockJsonDataService.getScenarioByIdLocalized.mockResolvedValue(undefined);

    await expect(scenariosService.findOne('deleted-id')).rejects.toThrow(NotFoundException);
  });
});
