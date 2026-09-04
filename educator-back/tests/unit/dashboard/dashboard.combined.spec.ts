import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DashboardController } from '../../../src/dashboard/dashboard.controller';
import { DashboardService } from '../../../src/dashboard/dashboard.service';
import { AppStatus } from '../../../src/common/utils/messages';
import type { JwtRequest } from '../../../src/common/types';

import { Schools } from '../../../src/schools/entity/schools.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';

// ── Query-builder factory ────────────────────────────────────────────────────
// Each test gets a fresh builder so mocked return values don't bleed across.
type MockQb = Record<string, jest.Mock>;

const makeMockQueryBuilder = (): MockQb => {
  const qb: MockQb = {};
  const self = (): MockQb => qb;

  qb.innerJoin = jest.fn().mockReturnValue(self());
  qb.where = jest.fn().mockReturnValue(self());
  qb.andWhere = jest.fn().mockReturnValue(self());
  qb.take = jest.fn().mockReturnValue(self());
  qb.getMany = jest.fn();
  qb.getCount = jest.fn();

  return qb;
};

// ── Repository factory ───────────────────────────────────────────────────────
type MockRepo = { count: jest.Mock; find: jest.Mock; createQueryBuilder: jest.Mock };

const mockRepo = (): MockRepo => ({
  count: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const adminReq = { user: { userId: 'admin-id' } } as unknown as JwtRequest;

// ── Helper: wire a fresh query-builder into a repo mock ──────────────────────
function wireQueryBuilder(repo: MockRepo): MockQb {
  const qb = makeMockQueryBuilder();
  repo.createQueryBuilder.mockReturnValue(qb);
  return qb;
}

// ════════════════════════════════════════════════════════════════════════════
describe('DashboardController', () => {
  let controller: DashboardController;
  const mockService = { getOverview: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockService }],
    }).compile();

    controller = module.get(DashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return dashboard overview successfully', async () => {
    const mockData = {
      schools: { total: 1, data: [] },
      educators: { total: 1, data: [] },
      students: { total: 1, data: [] },
      classes: { total: 1, data: [] },
      classSimulations: { total: 1, data: [] },
    };
    mockService.getOverview.mockResolvedValue(mockData);

    const result = await controller.getOverview(adminReq);

    expect(mockService.getOverview).toHaveBeenCalledWith('admin-id');
    expect(result).toEqual({
      status: AppStatus.SUCCESS,
      message: 'Dashboard overview fetched',
      data: mockData,
    });
  });

  it('should propagate service errors', async () => {
    mockService.getOverview.mockRejectedValue(new Error('Service failed'));
    await expect(controller.getOverview(adminReq)).rejects.toThrow('Service failed');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('DashboardService', () => {
  let service: DashboardService;
  let schoolRepo: MockRepo;
  let educatorRepo: MockRepo;
  let classRepo: MockRepo;
  let studentRepo: MockRepo;
  let classSimRepo: MockRepo;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Schools), useFactory: mockRepo },
        { provide: getRepositoryToken(Educator), useFactory: mockRepo },
        { provide: getRepositoryToken(Class), useFactory: mockRepo },
        { provide: getRepositoryToken(Student), useFactory: mockRepo },
        { provide: getRepositoryToken(ClassSimulation), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(DashboardService);
    schoolRepo = module.get(getRepositoryToken(Schools));
    educatorRepo = module.get(getRepositoryToken(Educator));
    classRepo = module.get(getRepositoryToken(Class));
    studentRepo = module.get(getRepositoryToken(Student));
    classSimRepo = module.get(getRepositoryToken(ClassSimulation));
  });

  afterEach(() => jest.clearAllMocks());

  // ── Helper: set up all happy-path mocks ─────────────────────────────────
  function setupHappyPath(
    overrides: {
      schoolCount?: number;
      schoolData?: object[];
      educatorCount?: number;
      educatorData?: object[];
      studentCount?: number;
      studentData?: object[];
      classCount?: number;
      classData?: object[];
      classSimData?: object[];
    } = {},
  ): void {
    schoolRepo.count.mockResolvedValue(overrides.schoolCount ?? 2);
    schoolRepo.find.mockResolvedValue(overrides.schoolData ?? [{ id: 1 }]);

    educatorRepo.count.mockResolvedValue(overrides.educatorCount ?? 3);
    educatorRepo.find.mockResolvedValue(overrides.educatorData ?? [{ id: 2 }]);

    classRepo.count.mockResolvedValue(overrides.classCount ?? 5);
    classRepo.find.mockResolvedValue(overrides.classData ?? [{ id: 4 }]);

    // studentRepo uses createQueryBuilder for both count and find
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(overrides.studentCount ?? 4);
    studentQb.getMany.mockResolvedValue(overrides.studentData ?? [{ id: 3 }]);

    // classSimRepo uses createQueryBuilder for getMany only
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue(overrides.classSimData ?? [{ id: 5 }]);
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  it('should return aggregated dashboard data', async () => {
    setupHappyPath();

    const result = await service.getOverview('admin-id');

    expect(schoolRepo.count).toHaveBeenCalled();
    expect(educatorRepo.count).toHaveBeenCalled();
    expect(classRepo.count).toHaveBeenCalled();
    expect(studentRepo.createQueryBuilder).toHaveBeenCalledWith('s');
    expect(classSimRepo.createQueryBuilder).toHaveBeenCalledWith('cs');

    expect(result).toEqual({
      schools: { total: 2, data: [{ id: 1 }] },
      educators: { total: 3, data: [{ id: 2 }] },
      students: { total: 4, data: [{ id: 3 }] },
      classes: { total: 5, data: [{ id: 4 }] },
      classSimulations: { total: 1, data: [{ id: 5 }] },
    });
  });

  it('should return empty data when no records exist', async () => {
    setupHappyPath({
      schoolCount: 0,
      schoolData: [],
      educatorCount: 0,
      educatorData: [],
      studentCount: 0,
      studentData: [],
      classCount: 0,
      classData: [],
      classSimData: [],
    });

    const result = await service.getOverview('admin-id');

    expect(result.schools.total).toBe(0);
    expect(result.educators.total).toBe(0);
    expect(result.students.total).toBe(0);
    expect(result.classes.total).toBe(0);
    expect(result.classSimulations.total).toBe(0);
  });

  it('should throw if a repository call fails', async () => {
    // Set up all other repos so Promise.all doesn't fail on missing mocks
    setupHappyPath();
    // Override schoolRepo.count to reject after the rest are wired
    schoolRepo.count.mockRejectedValue(new Error('Database error'));

    await expect(service.getOverview('admin-id')).rejects.toThrow('Database error');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('Dashboard Integration', () => {
  let controller: DashboardController;
  const mockService = { getOverview: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockService }],
    }).compile();

    controller = module.get(DashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should wire controller → service correctly', async () => {
    const mockOverview = {
      schools: { total: 1, data: [] },
      educators: { total: 1, data: [] },
      students: { total: 1, data: [] },
      classes: { total: 1, data: [] },
      classSimulations: { total: 1, data: [] },
    };
    mockService.getOverview.mockResolvedValue(mockOverview);

    const response = await controller.getOverview(adminReq);

    expect(mockService.getOverview).toHaveBeenCalledWith('admin-id');
    expect(response.data).toEqual(mockOverview);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Dashboard Data States — Loading / Populated / Empty / Partial / Error
// ════════════════════════════════════════════════════════════════════════════
describe('Dashboard Data States', () => {
  let controller: DashboardController;
  let service: DashboardService;
  let schoolRepo: MockRepo;
  let educatorRepo: MockRepo;
  let classRepo: MockRepo;
  let studentRepo: MockRepo;
  let classSimRepo: MockRepo;
  const mockServiceStub = { getOverview: jest.fn() };

  beforeEach(async () => {
    // Controller module (for state-response tests)
    const ctrlModule: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockServiceStub }],
    }).compile();
    controller = ctrlModule.get(DashboardController);

    // Service module (for data-layer state tests)
    const svcModule: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Schools), useFactory: mockRepo },
        { provide: getRepositoryToken(Educator), useFactory: mockRepo },
        { provide: getRepositoryToken(Class), useFactory: mockRepo },
        { provide: getRepositoryToken(Student), useFactory: mockRepo },
        { provide: getRepositoryToken(ClassSimulation), useFactory: mockRepo },
      ],
    }).compile();
    service = svcModule.get(DashboardService);
    schoolRepo = svcModule.get(getRepositoryToken(Schools));
    educatorRepo = svcModule.get(getRepositoryToken(Educator));
    classRepo = svcModule.get(getRepositoryToken(Class));
    studentRepo = svcModule.get(getRepositoryToken(Student));
    classSimRepo = svcModule.get(getRepositoryToken(ClassSimulation));
  });

  afterEach(() => jest.clearAllMocks());

  // ── Loading state simulation ─────────────────────────────────────────────
  // The service suspends until all repo calls resolve — verified by awaiting.

  it('loading state: getOverview resolves after all async repo calls settle', async () => {
    let resolve!: (v: number) => void;
    const delayed = new Promise<number>((r) => {
      resolve = r;
    });

    schoolRepo.count.mockReturnValue(delayed);
    schoolRepo.find.mockResolvedValue([]);
    educatorRepo.count.mockResolvedValue(0);
    educatorRepo.find.mockResolvedValue([]);
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(0);
    studentQb.getMany.mockResolvedValue([]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([]);

    const promise = service.getOverview('admin-id');
    // Promise must still be pending while the repo call is unresolved
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve(); // flush microtask queue
    expect(settled).toBe(false);

    // Resolve the blocking call — now the overview should settle
    resolve(1);
    await promise;
    expect(settled).toBe(true);
  });

  // ── Populated state ──────────────────────────────────────────────────────

  it('populated state: all sections carry totals > 0 and non-empty data arrays', async () => {
    schoolRepo.count.mockResolvedValue(3);
    schoolRepo.find.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    educatorRepo.count.mockResolvedValue(2);
    educatorRepo.find.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    classRepo.count.mockResolvedValue(4);
    classRepo.find.mockResolvedValue([{ id: 'c1' }]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(5);
    studentQb.getMany.mockResolvedValue([{ id: 'st1' }]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([{ id: 'cs1' }]);

    const result = await service.getOverview('admin-id');

    expect(result.schools.total).toBeGreaterThan(0);
    expect(result.schools.data.length).toBeGreaterThan(0);
    expect(result.educators.total).toBeGreaterThan(0);
    expect(result.students.total).toBeGreaterThan(0);
    expect(result.classes.total).toBeGreaterThan(0);
  });

  it('populated state: controller wraps populated data with SUCCESS status', async () => {
    const populated = {
      schools: { total: 3, data: [{ id: 's1' }] },
      educators: { total: 2, data: [{ id: 'e1' }] },
      students: { total: 5, data: [{ id: 'st1' }] },
      classes: { total: 4, data: [{ id: 'c1' }] },
      classSimulations: { total: 1, data: [{ id: 'cs1' }] },
    };
    mockServiceStub.getOverview.mockResolvedValue(populated);

    const response = await controller.getOverview(adminReq);

    expect(response.status).toBe(AppStatus.SUCCESS);
    expect(response.data).toEqual(populated);
  });

  // ── Empty / no-data state ────────────────────────────────────────────────

  it('empty state: all section totals are 0 and data arrays are empty', async () => {
    schoolRepo.count.mockResolvedValue(0);
    schoolRepo.find.mockResolvedValue([]);
    educatorRepo.count.mockResolvedValue(0);
    educatorRepo.find.mockResolvedValue([]);
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(0);
    studentQb.getMany.mockResolvedValue([]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([]);

    const result = await service.getOverview('admin-id');

    for (const key of Object.keys(result) as (keyof typeof result)[]) {
      expect(result[key].total).toBe(0);
      expect(result[key].data).toHaveLength(0);
    }
  });

  it('empty state: controller wraps zero-data response with SUCCESS status', async () => {
    const empty = {
      schools: { total: 0, data: [] },
      educators: { total: 0, data: [] },
      students: { total: 0, data: [] },
      classes: { total: 0, data: [] },
      classSimulations: { total: 0, data: [] },
    };
    mockServiceStub.getOverview.mockResolvedValue(empty);

    const response = await controller.getOverview(adminReq);

    expect(response.status).toBe(AppStatus.SUCCESS);
    expect(response.data).toEqual(empty);
  });

  // ── Partial-data state ───────────────────────────────────────────────────

  it('partial state: sections with data have total > 0; sections without stay 0', async () => {
    // Schools exist, but no educators, students, classes, or simulations
    schoolRepo.count.mockResolvedValue(2);
    schoolRepo.find.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    educatorRepo.count.mockResolvedValue(0);
    educatorRepo.find.mockResolvedValue([]);
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(0);
    studentQb.getMany.mockResolvedValue([]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([]);

    const result = await service.getOverview('admin-id');

    expect(result.schools.total).toBe(2);
    expect(result.schools.data).toHaveLength(2);
    expect(result.educators.total).toBe(0);
    expect(result.educators.data).toHaveLength(0);
    expect(result.students.total).toBe(0);
    expect(result.classes.total).toBe(0);
    expect(result.classSimulations.total).toBe(0);
  });

  it('partial state: all five section keys are always present regardless of data volume', async () => {
    schoolRepo.count.mockResolvedValue(1);
    schoolRepo.find.mockResolvedValue([{ id: 's1' }]);
    educatorRepo.count.mockResolvedValue(0);
    educatorRepo.find.mockResolvedValue([]);
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(0);
    studentQb.getMany.mockResolvedValue([]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([]);

    const result = await service.getOverview('admin-id');

    expect(result).toHaveProperty('schools');
    expect(result).toHaveProperty('educators');
    expect(result).toHaveProperty('students');
    expect(result).toHaveProperty('classes');
    expect(result).toHaveProperty('classSimulations');
  });

  // ── Error state ──────────────────────────────────────────────────────────

  it('error state: rejects when schoolRepo.count throws', async () => {
    schoolRepo.count.mockRejectedValue(new Error('DB connection lost'));
    schoolRepo.find.mockResolvedValue([]);
    educatorRepo.count.mockResolvedValue(0);
    educatorRepo.find.mockResolvedValue([]);
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(0);
    studentQb.getMany.mockResolvedValue([]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([]);

    await expect(service.getOverview('admin-id')).rejects.toThrow('DB connection lost');
  });

  it('error state: rejects when educatorRepo.find throws', async () => {
    schoolRepo.count.mockResolvedValue(1);
    schoolRepo.find.mockResolvedValue([{ id: 's1' }]);
    educatorRepo.count.mockResolvedValue(1);
    educatorRepo.find.mockRejectedValue(new Error('Educator fetch failed'));
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockResolvedValue(0);
    studentQb.getMany.mockResolvedValue([]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([]);

    await expect(service.getOverview('admin-id')).rejects.toThrow('Educator fetch failed');
  });

  it('error state: rejects when student query-builder getCount throws', async () => {
    schoolRepo.count.mockResolvedValue(0);
    schoolRepo.find.mockResolvedValue([]);
    educatorRepo.count.mockResolvedValue(0);
    educatorRepo.find.mockResolvedValue([]);
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    const studentQb = wireQueryBuilder(studentRepo);
    studentQb.getCount.mockRejectedValue(new Error('Student count failed'));
    studentQb.getMany.mockResolvedValue([]);
    const classSimQb = wireQueryBuilder(classSimRepo);
    classSimQb.getMany.mockResolvedValue([]);

    await expect(service.getOverview('admin-id')).rejects.toThrow('Student count failed');
  });

  it('error state: controller propagates service errors without swallowing them', async () => {
    mockServiceStub.getOverview.mockRejectedValue(new Error('Upstream failure'));
    await expect(controller.getOverview(adminReq)).rejects.toThrow('Upstream failure');
  });

  // ── State isolation ──────────────────────────────────────────────────────

  it('state isolation: only the correct state is present — populated excludes error fields', async () => {
    const populated = {
      schools: { total: 1, data: [{ id: 's1' }] },
      educators: { total: 1, data: [{ id: 'e1' }] },
      students: { total: 1, data: [{ id: 'st1' }] },
      classes: { total: 1, data: [{ id: 'c1' }] },
      classSimulations: { total: 1, data: [{ id: 'cs1' }] },
    };
    mockServiceStub.getOverview.mockResolvedValue(populated);

    const response = await controller.getOverview(adminReq);

    // No error or loading indicators should bleed into a success response
    expect(response).not.toHaveProperty('error');
    expect(response).not.toHaveProperty('loading');
    expect(response.status).toBe(AppStatus.SUCCESS);
  });

  it('state isolation: repeated calls return independent results (no shared state leakage)', async () => {
    const call1Data = {
      schools: { total: 5, data: [{ id: 's1' }] },
      educators: { total: 0, data: [] },
      students: { total: 0, data: [] },
      classes: { total: 0, data: [] },
      classSimulations: { total: 0, data: [] },
    };
    const call2Data = {
      schools: { total: 0, data: [] },
      educators: { total: 3, data: [{ id: 'e1' }] },
      students: { total: 0, data: [] },
      classes: { total: 0, data: [] },
      classSimulations: { total: 0, data: [] },
    };
    mockServiceStub.getOverview.mockResolvedValueOnce(call1Data).mockResolvedValueOnce(call2Data);

    const res1 = await controller.getOverview(adminReq);
    const res2 = await controller.getOverview(adminReq);

    expect((res1.data as typeof call1Data).schools.total).toBe(5);
    expect((res2.data as typeof call2Data).educators.total).toBe(3);
    expect((res1.data as typeof call1Data).educators.total).toBe(0);
  });
});
