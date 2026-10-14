/**
 * Factory helpers that create typed jest mock objects for common services.
 * Import these in unit tests instead of repeating mock definitions.
 */

/** Mock for UnitRepository (src/database/repositories/unit.repository.ts), injected via UNIT_REPOSITORY. */
export function createMockUnitRepository() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    findById: jest.fn().mockResolvedValue(null),
    findByBusinessId: jest.fn().mockResolvedValue(null),
    findUniqueByName: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    updateById: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    upsertByBusinessId: jest.fn().mockResolvedValue(undefined),
  };
}

/** Mock for ClassSimulationService (src/class-simulations/class-simulation.service.ts), a plain constructor-injected dependency of AdminService. */
export function createMockClassSimulationService() {
  return {
    recalculateSeatsForSimulationChange: jest.fn().mockResolvedValue(undefined),
    recalculateSeatsForUnitCategoryChange: jest.fn().mockResolvedValue(undefined),
  };
}

/** Mock for SimulationV2Repository (src/database/repositories/simulation-v2.repository.ts), injected via SIMULATION_V2_REPOSITORY. */
export function createMockSimulationRepository() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    findById: jest.fn().mockResolvedValue(null),
    findByBusinessId: jest.fn().mockResolvedValue(null),
    findByUnitId: jest.fn().mockResolvedValue([]),
    findUniqueByTitle: jest.fn().mockResolvedValue(null),
    findAllWithChildrenJoined: jest.fn().mockResolvedValue([]),
    findAllWithoutChildrenJoined: jest.fn().mockResolvedValue([]),
    findByBusinessIdWithChildrenJoined: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    updateById: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock for the simulation child-table repositories (SimulationActionRepository/
 * SimulationOrderRepository/SimulationGradingRubricItemRepository) — they all
 * expose the same shape, keyed by SIMULATION_ACTION_REPOSITORY/
 * SIMULATION_ORDER_REPOSITORY/SIMULATION_GRADING_RUBRIC_ITEM_REPOSITORY.
 */
export function createMockSimulationChildRepository() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    findById: jest.fn().mockResolvedValue(null),
    findByBusinessId: jest.fn().mockResolvedValue(null),
    findBySimulationId: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    updateById: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

/** Mock for SimulationOrderLinkedActionRepository, injected via SIMULATION_ORDER_LINKED_ACTION_REPOSITORY. */
export function createMockSimulationOrderLinkedActionRepository() {
  return {
    findByOrderIds: jest.fn().mockResolvedValue([]),
    findActionIdsByOrderId: jest.fn().mockResolvedValue([]),
    linkActions: jest.fn().mockResolvedValue(undefined),
    replaceLinksForOrder: jest.fn().mockResolvedValue(undefined),
    deleteByOrderId: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Stateful mock for SimulationRepository — keeps a tiny in-memory store keyed
 * by business id, so a create()/updateById() a test performs is visible to a
 * later findByBusinessId()/find() in the same test, mirroring how AdminService's
 * scenario CRUD (create -> re-fetch via getScenarioById) actually round-trips
 * against Postgres. Prefer this over createMockSimulationRepository() for any
 * test that creates/updates a scenario and then reads it back.
 */
export function createStatefulMockSimulationRepository() {
  const rows = new Map<string, Record<string, unknown>>();
  let counter = 0;
  return {
    /** Clears all seeded/created rows — call in beforeEach/afterEach. */
    __reset: () => rows.clear(),
    /** Seeds an existing row directly, bypassing create() — data is entity-shaped (camelCase). */
    __seed: (data: Record<string, unknown>) => {
      const row = { simulationId: `sim-seed-${data.id as string}`, ...data };
      rows.set(data.id as string, row);
      return row;
    },
    findByBusinessId: jest.fn((id: string) => Promise.resolve(rows.get(id) ?? null)),
    find: jest.fn(() => Promise.resolve(Array.from(rows.values()))),
    findByUnitId: jest.fn((unitId: string) =>
      Promise.resolve(Array.from(rows.values()).filter((r) => r.unitId === unitId)),
    ),
    /** Mirrors the real repo's case-insensitive/trimmed title lookup (SimulationRepository.findUniqueByTitle). */
    findUniqueByTitle: jest.fn((title: string) => {
      const normalized = (title || '').trim().toLowerCase();
      const match = Array.from(rows.values()).find(
        (r) => typeof r.title === 'string' && r.title.trim().toLowerCase() === normalized,
      );
      return Promise.resolve(match ?? null);
    }),
    /** Mock for the raw-join bulk read (SimulationRepository.findAllWithChildrenJoined) — no grouping, so just echoes the seeded rows as-is by default. */
    findAllWithChildrenJoined: jest.fn(() => Promise.resolve(Array.from(rows.values()))),
    /** Admin list path — same seeded rows, no children joined. */
    /** Mock for the childless bulk read (SimulationRepository.findAllWithoutChildrenJoined) used by AdminService.getAllScenarios. */
    findAllWithoutChildrenJoined: jest.fn(() => Promise.resolve(Array.from(rows.values()))),
    /** Mock for the single-row joined read (SimulationRepository.findByBusinessIdWithChildrenJoined) used by getScenarioById — defaults empty children arrays onto the seeded/created row. */
    findByBusinessIdWithChildrenJoined: jest.fn((id: string) => {
      const row = rows.get(id);
      return Promise.resolve(
        row ? { actions: [], orders: [], gradingRubricItems: [], ...row } : null,
      );
    }),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: Record<string, unknown>) => {
      const row = { simulationId: `sim-${++counter}`, ...data };
      rows.set(data.id as string, row);
      return Promise.resolve(row);
    }),
    updateById: jest.fn((simulationId: string, data: Record<string, unknown>) => {
      for (const [businessId, row] of rows) {
        if (row.simulationId === simulationId) rows.set(businessId, { ...row, ...data });
      }
      return Promise.resolve(rows.get(simulationId) ?? null);
    }),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn((simulationId: string) => {
      for (const [businessId, row] of rows) {
        if (row.simulationId === simulationId) rows.delete(businessId);
      }
      return Promise.resolve();
    }),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock for TypeORM's `DataSource`, covering only `transaction()` — the one
 * method AdminService.createScenario uses (it runs the simulation + child
 * table inserts through `manager.create`/`manager.save` instead of the
 * repositories, so a real transaction can span all of them, matching the
 * transaction pattern already used elsewhere in this codebase). The callback
 * passed to `transaction()` is invoked immediately (no real DB) against a
 * `manager` whose `create` echoes back its input.
 *
 * When `manager.save` is called for the `Simulation` entity and a
 * `simulationRepository` (from `createStatefulMockSimulationRepository()`) is
 * passed in, the row is seeded into that repository's own store via
 * `__seed()` — so a later `getScenarioById` (which reads through
 * `simulationRepository`, not the transaction manager) can find it, mirroring
 * how the real create-then-reread round trip behaves against Postgres. Every
 * other entity just gets a fake surrogate `id` (or `actionId` for
 * `SimulationAction`, which keeps a separate business `id`) assigned.
 * `manager.create`/`manager.save` are jest.fn()s so call args can be asserted
 * on directly (e.g. `mockDataSource.__manager.save`).
 */
export function createMockDataSource(options?: {
  simulationRepository?: ReturnType<typeof createStatefulMockSimulationRepository>;
}) {
  let counter = 0;
  const manager = {
    create: jest.fn((_entityClass: unknown, data: unknown) => data),
    save: jest.fn((entityClassOrEntities: unknown, maybeEntities?: unknown) => {
      const passedEntityClass = maybeEntities !== undefined;
      const entityClass = passedEntityClass ? entityClassOrEntities : undefined;
      const entities = passedEntityClass ? maybeEntities : entityClassOrEntities;
      const asArray = Array.isArray(entities) ? entities : [entities];
      const entityName = (entityClass as { name?: string } | undefined)?.name;

      if (entityName === 'Simulation' && options?.simulationRepository) {
        const seeded = asArray.map((row: Record<string, unknown>) =>
          options.simulationRepository!.__seed(row),
        );
        return Promise.resolve(Array.isArray(entities) ? seeded : seeded[0]);
      }

      const withIds = asArray.map((entity: Record<string, unknown>) => ({
        simulationId: `sim-${++counter}`,
        actionId: `action-${++counter}`,
        id: `id-${++counter}`,
        ...entity,
      }));
      return Promise.resolve(Array.isArray(entities) ? withIds : withIds[0]);
    }),
  };
  return {
    transaction: jest.fn((work: (txManager: typeof manager) => Promise<unknown>) => work(manager)),
    __manager: manager,
  };
}

export function createMockConfigService() {
  return { get: jest.fn() };
}

export function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock.jwt.token'),
    verify: jest.fn(),
  };
}

export function createMockRedisService() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

/** Simulation report repository mock: no stored Attempt, and every insert succeeds with the row as given. */
export function createMockSimulationReportRepository() {
  return {
    findByTranscriptId: jest.fn().mockResolvedValue(null),
    insertAttemptIfAbsent: jest
      .fn()
      .mockImplementation((row: Record<string, unknown>) =>
        Promise.resolve({ id: 'row-1', ...row }),
      ),
    findAssessmentAttemptsByStudentAndScenario: jest.fn().mockResolvedValue([]),
    findLatestAttemptByStudentAndScenario: jest.fn().mockResolvedValue(null),
    findListRowsByStudentId: jest.fn().mockResolvedValue([]),
    findDetailRowByReportIdForStudent: jest.fn().mockResolvedValue(null),
    findDetailRowByTranscriptIdForStudent: jest.fn().mockResolvedValue(null),
  };
}

/**
 * Simulation Progress repository mock: the student hasn't started the Simulation, and every
 * submitted Attempt is recorded as given.
 */
export function createMockStudentSimulationProgressRepository() {
  return {
    findByStudentAndScenarioId: jest.fn().mockResolvedValue(null),
    recordSubmittedAttempt: jest
      .fn()
      .mockImplementation(({ attempt }: { attempt: Record<string, unknown> }) =>
        Promise.resolve({ report: { id: 'row-1', ...attempt }, recorded: true }),
      ),
  };
}

/** Student repository mock resolving every Student Code to one `students.id`. */
export function createMockStudentRepository() {
  return {
    findIdByStudentCode: jest.fn().mockResolvedValue('student-uuid-1'),
  };
}
