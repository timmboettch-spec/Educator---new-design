/**
 * Shared mocks for AdminModule's Postgres-backed scenario repositories
 * (SIMULATION_V2_REPOSITORY and its child-table repositories), mirroring
 * tests/student-backend/unit/common/utils/mock-factory.ts's equivalents.
 * AdminModule now requires these tokens even when a test only cares about
 * unit/permission/report behaviour, so every integration spec that builds
 * AdminModule directly (without the real DatabaseModule) needs them wired in.
 */

/**
 * Stateful mock for SimulationRepository — keeps a tiny in-memory store keyed
 * by business id, so a create()/updateById() a test performs is visible to a
 * later findByBusinessId()/find() in the same test, mirroring how
 * AdminService's scenario CRUD (create -> re-fetch via getScenarioById)
 * actually round-trips against Postgres.
 */
export function createStatefulMockSimulationRepository() {
  const rows = new Map<string, Record<string, unknown>>();
  let counter = 0;
  return {
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
    findUniqueByTitle: jest.fn((title: string) => {
      const normalized = (title || '').trim().toLowerCase();
      const match = Array.from(rows.values()).find(
        (r) => typeof r.title === 'string' && r.title.trim().toLowerCase() === normalized,
      );
      return Promise.resolve(match ?? null);
    }),
    findAllWithChildrenJoined: jest.fn(() => Promise.resolve(Array.from(rows.values()))),
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

/** Actions/orders/rubric-item repositories — never populated by these tests, so plain empty stubs. */
export function createMockSimulationChildRepository() {
  return {
    findBySimulationId: jest.fn().mockResolvedValue([]),
    findByBusinessId: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    updateById: jest.fn(),
    delete: jest.fn(),
  };
}

export function createMockSimulationOrderLinkedActionRepository() {
  return {
    findByOrderIds: jest.fn().mockResolvedValue([]),
    findActionIdsByOrderId: jest.fn().mockResolvedValue([]),
    linkActions: jest.fn(),
    replaceLinksForOrder: jest.fn(),
    deleteByOrderId: jest.fn(),
  };
}

/**
 * Mock for ClassSimulationService (src/class-simulations/class-simulation.service.ts),
 * a plain constructor-injected dependency of AdminService — not provided by the real
 * DatabaseModule, so every integration spec that builds AdminModule directly needs it
 * wired in the same way as the repositories above.
 */
export function createMockClassSimulationService() {
  return {
    recalculateSeatsForSimulationChange: jest.fn().mockResolvedValue(undefined),
    recalculateSeatsForUnitCategoryChange: jest.fn().mockResolvedValue(undefined),
  };
}
